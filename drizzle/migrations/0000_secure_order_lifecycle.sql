-- =============================================================================
-- HatodGo: secure order lifecycle, contact privacy, payout immutability
-- STATUS: Approved by owner pre-launch (2026-10-21) and applied to the shared database.
-- Rollback: supabase/pending/20261021_secure_order_lifecycle.rollback.sql
--
-- Summary
--   orders       : customers/riders lose direct INSERT/UPDATE; all writes go
--                  through SECURITY DEFINER RPCs below. Riders SELECT only
--                  orders assigned to them. Admin policies unchanged.
--   jobs board   : list_available_jobs() returns pending+unassigned orders
--                  WITHOUT customer id, phone, recipient, landmark or notes.
--   contacts     : get_order_contacts() returns name/phone only to the
--                  customer, the assigned rider (active trip) or admin.
--   payments     : no client path can set payment_status='paid'. GCash/Maya
--                  stay 'pending' + awaiting_manual_confirmation; only
--                  admin_confirm_payment() can mark paid.
--   settlements  : rider UPDATE policy removed; values immutable; rider may
--                  only cancel own pending request; decisions are final and
--                  stamped with admin_id/approved_at by a guarded RPC.
-- =============================================================================

-- ---------- orders: policies ----------
DROP POLICY IF EXISTS "Riders view assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Customers create orders" ON public.orders;
DROP POLICY IF EXISTS "Customers update own pending orders" ON public.orders;

CREATE POLICY "Riders view own assigned orders" ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = rider_id);
-- Kept: "Customers view own orders", "Admins view all orders", "Admins manage orders".

-- ---------- driver_locations: rider may only tag own assigned order ----------
DROP POLICY IF EXISTS "Riders upsert own location" ON public.driver_locations;
DROP POLICY IF EXISTS "Riders update own location" ON public.driver_locations;
CREATE POLICY "Riders upsert own location" ON public.driver_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = rider_id AND public.has_role(auth.uid(), 'rider')
    AND (order_id IS NULL OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.rider_id = auth.uid()))
  );
CREATE POLICY "Riders update own location" ON public.driver_locations
  FOR UPDATE TO authenticated
  USING (auth.uid() = rider_id)
  WITH CHECK (
    auth.uid() = rider_id
    AND (order_id IS NULL OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.rider_id = auth.uid()))
  );

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.hg_haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::numeric
$$;

-- Minimum delivery/ride fee (excluding goods) for a straight-line distance.
-- Mirrors src/lib/pricing.ts base/perKm/includedKm/min. Route distance is
-- always >= straight-line, so a legitimate client fare is never below this.
CREATE OR REPLACE FUNCTION public.hg_min_fee(_service service_type, _km numeric, _details jsonb)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE extra numeric := greatest(0, _km - 2);
BEGIN
  IF _service = 'ride' THEN
    IF coalesce(_details->>'ride_type', 'standard') = 'express' THEN
      RETURN greatest(55, 55 + ceil(extra * 15));
    END IF;
    RETURN greatest(40, 40 + ceil(extra * 10));
  ELSIF _service = 'padali' THEN
    RETURN greatest(40, 35 + ceil(extra * 8)) +
      CASE coalesce(_details->>'parcel_size', 'small') WHEN 'medium' THEN 15 WHEN 'large' THEN 35 ELSE 0 END;
  ELSIF _service = 'pabili' THEN
    RETURN greatest(40, 30 + ceil(extra * 8));
  ELSE -- manual food request
    RETURN greatest(25, 25 + ceil(extra * 7));
  END IF;
END $$;

-- ---------- create_order ----------
CREATE OR REPLACE FUNCTION public.create_order(
  p_service_type service_type,
  p_pickup_address text,
  p_dropoff_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_notes text,
  p_details jsonb,
  p_estimated_price numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  d jsonb := coalesce(p_details, '{}'::jsonb);
  fb jsonb := coalesce(d->'fare_breakdown', '{}'::jsonb);
  km numeric;
  goods numeric := 0;
  svc_fee numeric := 0;
  delivery numeric;
  min_fee numeric;
  total numeric;
  r record;
  line jsonb;
  item record;
  qty int;
  items_out jsonb := '[]'::jsonb;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_dropoff_lat IS NULL OR p_dropoff_lng IS NULL THEN RAISE EXCEPTION 'Drop-off location required'; END IF;
  IF length(coalesce(p_pickup_address, '')) = 0 OR length(coalesce(p_dropoff_address, '')) = 0 THEN
    RAISE EXCEPTION 'Pickup and drop-off addresses required';
  END IF;

  -- Restaurant cart order: everything recomputed from the database.
  IF p_service_type = 'food' AND (d->'restaurant'->>'id') IS NOT NULL THEN
    SELECT * INTO r FROM restaurants WHERE id = (d->'restaurant'->>'id')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant unavailable'; END IF;
    IF r.lat IS NULL OR r.lng IS NULL THEN RAISE EXCEPTION 'Restaurant has no location'; END IF;
    IF jsonb_typeof(d->'items') <> 'array' OR jsonb_array_length(d->'items') = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
    FOR line IN SELECT * FROM jsonb_array_elements(d->'items') LOOP
      qty := (line->>'quantity')::int;
      IF qty IS NULL OR qty < 1 OR qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
      SELECT id, name, price INTO item FROM menu_items
        WHERE id = (line->>'menu_item_id')::uuid AND restaurant_id = r.id AND is_available;
      IF NOT FOUND THEN RAISE EXCEPTION 'A menu item is no longer available'; END IF;
      goods := goods + item.price * qty;
      items_out := items_out || jsonb_build_object(
        'menu_item_id', item.id, 'name', item.name, 'price', item.price,
        'quantity', qty, 'notes', left(line->>'notes', 200));
    END LOOP;
    km := hg_haversine_km(r.lat, r.lng, p_dropoff_lat, p_dropoff_lng);
    delivery := ceil(r.base_delivery_fee + greatest(0, km - r.free_distance_km) * r.per_km_fee);
    svc_fee := ceil(greatest(8, least(30, goods * 0.08)));
    total := ceil(goods + delivery + svc_fee);
    p_pickup_lat := r.lat; p_pickup_lng := r.lng; p_pickup_address := r.address;
    d := d || jsonb_build_object('items', items_out,
           'restaurant', jsonb_build_object('id', r.id, 'name', r.name, 'address', r.address, 'lat', r.lat, 'lng', r.lng));
  ELSE
    IF p_pickup_lat IS NULL OR p_pickup_lng IS NULL THEN RAISE EXCEPTION 'Pickup location required'; END IF;
    km := hg_haversine_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng);
    min_fee := hg_min_fee(p_service_type, km, d);
    IF p_service_type IN ('pabili', 'food') THEN
      goods := greatest(0, least(50000, coalesce((fb->>'goods_subtotal')::numeric, 0)));
      svc_fee := greatest(0, least(30, coalesce((fb->>'service_fee')::numeric, 0)));
    END IF;
    total := coalesce(p_estimated_price, min_fee + goods + svc_fee);
    delivery := total - goods - svc_fee;
    IF delivery < min_fee THEN RAISE EXCEPTION 'Fare below minimum for this distance (min ₱%)', min_fee; END IF;
    IF delivery > min_fee * 3 + 100 THEN RAISE EXCEPTION 'Fare looks wrong for this distance'; END IF;
    total := ceil(total);
  END IF;

  -- Server-authoritative fare split (20% commission on fees + service fee to platform).
  fb := fb || jsonb_build_object(
    'total', total,
    'goods_subtotal', goods,
    'service_fee', svc_fee,
    'distance_km', round(km, 2),
    'rider_earnings', ceil((total - goods - svc_fee) * 0.8),
    'platform_cut', ceil((total - goods - svc_fee) * 0.2 + svc_fee),
    'server_validated', true);
  d := (d - 'trip_stage' - 'payment_review' - 'cancellation') || jsonb_build_object('fare_breakdown', fb);

  INSERT INTO orders (customer_id, service_type, status, pickup_address, dropoff_address,
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, notes, details, estimated_price,
    payment_method, payment_status, rider_id)
  VALUES (uid, p_service_type, 'pending', left(p_pickup_address, 300), left(p_dropoff_address, 300),
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng, nullif(left(p_notes, 1000), ''), d, total,
    'pending', 'pending', NULL)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- ---------- finance audit log (written only by the RPCs below) ----------
CREATE TABLE IF NOT EXISTS public.finance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_audit_log TO authenticated;
GRANT ALL ON public.finance_audit_log TO service_role;
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view finance audit" ON public.finance_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS finance_audit_log_entity_idx ON public.finance_audit_log (entity, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.hg_audit(_action text, _entity text, _entity_id uuid, _details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO finance_audit_log (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), _action, _entity, _entity_id, coalesce(_details, '{}'::jsonb))
$$;

-- ---------- orders: payment fields writable only inside SECURITY DEFINER RPCs ----------
-- SECURITY INVOKER on purpose: inside an RPC current_user is the function owner,
-- so only direct API writes (anon/authenticated) are blocked. Status, rider and
-- other admin order operations are unaffected.
CREATE OR REPLACE FUNCTION public.orders_payment_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status <> 'pending' OR NEW.details ? 'payment_reference' OR NEW.details ? 'payment_confirmed_by' THEN
      RAISE EXCEPTION 'Payment fields can only be set through payment actions' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.estimated_price IS DISTINCT FROM OLD.estimated_price
     OR NEW.details->'payment_reference' IS DISTINCT FROM OLD.details->'payment_reference'
     OR NEW.details->'payment_review' IS DISTINCT FROM OLD.details->'payment_review'
     OR NEW.details->'payment_confirmed_by' IS DISTINCT FROM OLD.details->'payment_confirmed_by'
     OR NEW.details->'payment_confirmed_at' IS DISTINCT FROM OLD.details->'payment_confirmed_at'
     OR NEW.details->'fare_breakdown' IS DISTINCT FROM OLD.details->'fare_breakdown' THEN
    RAISE EXCEPTION 'Payment fields can only be changed through payment actions' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_payment_guard ON public.orders;
CREATE TRIGGER orders_payment_guard BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_payment_guard();

-- ---------- customer: payment method (+ optional e-wallet reference) ----------
CREATE OR REPLACE FUNCTION public.set_order_payment_method(p_order_id uuid, p_method text, p_reference text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders; ref text := nullif(btrim(coalesce(p_reference, '')), '');
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501'; END IF;
  IF o.status IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'Order is closed'; END IF;
  IF o.payment_status = 'paid' THEN RAISE EXCEPTION 'Payment already confirmed'; END IF;
  IF ref IS NOT NULL AND ref !~ '^[A-Za-z0-9 -]{4,40}$' THEN
    RAISE EXCEPTION 'Reference number should be 4-40 letters or numbers';
  END IF;
  IF p_method = 'cod' THEN
    UPDATE orders SET payment_method = 'cod', payment_status = 'cod',
      details = details - 'payment_review' - 'payment_reference' WHERE id = p_order_id;
    ref := NULL;
  ELSIF p_method IN ('gcash', 'maya') THEN
    UPDATE orders SET payment_method = p_method, payment_status = 'pending',
      details = (details - 'payment_reference') || jsonb_build_object('payment_review', 'awaiting_manual_confirmation')
        || CASE WHEN ref IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('payment_reference', ref) END
      WHERE id = p_order_id;
  ELSE
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;
  PERFORM hg_audit('customer_set_payment_method', 'order', p_order_id,
    jsonb_build_object('method', p_method, 'reference', ref, 'previous_method', o.payment_method));
END $$;

-- ---------- customer: cancel ----------
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id uuid, p_reason text, p_reason_label text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = '42501'; END IF;
  IF o.status <> 'pending' OR o.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'This order can no longer be cancelled because a rider already accepted it.';
  END IF;
  UPDATE orders SET status = 'cancelled',
    details = details || jsonb_build_object('cancellation', jsonb_build_object(
      'reason', left(p_reason, 50), 'reason_label', left(p_reason_label, 100),
      'note', left(p_note, 500), 'cancelled_at', now(), 'by', 'customer'))
  WHERE id = p_order_id;
END $$;

-- ---------- rider: sanitized job board ----------
CREATE OR REPLACE FUNCTION public.list_available_jobs()
RETURNS TABLE (
  id uuid, service_type service_type, status order_status,
  pickup_address text, dropoff_address text,
  pickup_lat double precision, pickup_lng double precision,
  dropoff_lat double precision, dropoff_lng double precision,
  estimated_price numeric, payment_method text, created_at timestamptz, details jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'rider') OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Riders only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT o.id, o.service_type, o.status, o.pickup_address, o.dropoff_address,
      o.pickup_lat, o.pickup_lng, o.dropoff_lat, o.dropoff_lng,
      o.estimated_price, o.payment_method, o.created_at,
      jsonb_strip_nulls(jsonb_build_object(
        'description', CASE WHEN o.service_type = 'ride' THEN o.details->>'description' END,
        'ride_type', o.details->>'ride_type',
        'parcel_size', o.details->>'parcel_size',
        'restaurant_name', o.details->'restaurant'->>'name',
        'item_count', CASE WHEN jsonb_typeof(o.details->'items') = 'array' THEN jsonb_array_length(o.details->'items') END,
        'fare_breakdown', jsonb_strip_nulls(jsonb_build_object(
          'total', o.details->'fare_breakdown'->'total',
          'distance_km', o.details->'fare_breakdown'->'distance_km',
          'rider_earnings', o.details->'fare_breakdown'->'rider_earnings'))
      ))
    FROM orders o
    WHERE o.status = 'pending' AND o.rider_id IS NULL
    ORDER BY o.created_at DESC
    LIMIT 50;
END $$;

-- ---------- rider: accept (atomic) ----------
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT has_role(auth.uid(), 'rider') THEN RAISE EXCEPTION 'Riders only' USING ERRCODE = '42501'; END IF;
  UPDATE orders SET status = 'accepted', rider_id = auth.uid(),
    details = details || jsonb_build_object('trip_stage', 'enroute_pickup', 'accepted_at', now())
  WHERE id = p_order_id AND status = 'pending' AND rider_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Order is no longer available'; END IF;
END $$;

-- ---------- rider: advance trip ----------
-- Allowed: enroute_pickup -> arrived_pickup -> picked_up (in_progress) -> completed
CREATE OR REPLACE FUNCTION public.hg_next_trip_stage(_current text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE coalesce(_current, 'enroute_pickup')
    WHEN 'enroute_pickup' THEN 'arrived_pickup'
    WHEN 'arrived_pickup' THEN 'picked_up'
    WHEN 'picked_up' THEN 'completed'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.advance_trip(p_order_id uuid, p_next_stage text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders; expected text;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.rider_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your trip' USING ERRCODE = '42501'; END IF;
  IF o.status NOT IN ('accepted', 'in_progress') THEN RAISE EXCEPTION 'Trip is not active'; END IF;
  expected := hg_next_trip_stage(o.details->>'trip_stage');
  IF expected IS NULL OR p_next_stage IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Invalid trip step: expected %', coalesce(expected, 'none');
  END IF;
  UPDATE orders SET
    details = details || jsonb_build_object('trip_stage', p_next_stage, p_next_stage || '_at', now()),
    status = CASE p_next_stage WHEN 'picked_up' THEN 'in_progress'::order_status
                               WHEN 'completed' THEN 'completed'::order_status
                               ELSE status END
  WHERE id = p_order_id;
  -- Ledger row is written by trigger orders_create_ledger (unique per order_id).
END $$;

-- ---------- contacts ----------
CREATE OR REPLACE FUNCTION public.get_order_contacts(p_order_id uuid)
RETURNS TABLE (customer_name text, customer_phone text, rider_name text, rider_phone text, rider_avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders; me uuid := auth.uid(); is_admin boolean;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  is_admin := has_role(me, 'admin');
  IF NOT (is_admin OR me = o.customer_id
          OR (me = o.rider_id AND o.status IN ('accepted', 'in_progress'))) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT cp.full_name, coalesce(o.details->>'phone', cp.phone),
      CASE WHEN o.rider_id IS NOT NULL AND (is_admin OR o.status IN ('accepted','in_progress')) THEN rp.full_name END,
      CASE WHEN o.rider_id IS NOT NULL AND (is_admin OR o.status IN ('accepted','in_progress')) THEN rp.phone END,
      CASE WHEN o.rider_id IS NOT NULL THEN rp.avatar_url END
    FROM (SELECT 1) x
    LEFT JOIN profiles cp ON cp.id = o.customer_id
    LEFT JOIN profiles rp ON rp.id = o.rider_id;
END $$;

-- ---------- admin: payment confirmation ----------
CREATE OR REPLACE FUNCTION public.admin_confirm_payment(p_order_id uuid, p_confirmed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o orders;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.payment_method NOT IN ('gcash', 'maya') OR o.payment_status NOT IN ('pending', 'failed')
     OR o.status = 'cancelled' THEN
    RAISE EXCEPTION 'No e-wallet payment awaiting confirmation';
  END IF;
  UPDATE orders SET
    payment_status = CASE WHEN p_confirmed THEN 'paid'::payment_status ELSE 'failed'::payment_status END,
    details = (details - 'payment_review') || jsonb_build_object('payment_confirmed_by', auth.uid(), 'payment_confirmed_at', now())
  WHERE id = p_order_id;
  PERFORM hg_audit(CASE WHEN p_confirmed THEN 'admin_payment_confirmed' ELSE 'admin_payment_not_received' END,
    'order', p_order_id, jsonb_build_object('method', o.payment_method, 'previous_status', o.payment_status,
      'amount', coalesce((o.details->'fare_breakdown'->>'total')::numeric, o.estimated_price),
      'reference', o.details->>'payment_reference'));
END $$;

-- ---------- settlements ----------
-- Riders keep INSERT of their own pending request; admins keep SELECT.
-- All updates/decisions go through the guarded RPCs below.
DROP POLICY IF EXISTS "Riders update own pending settlements" ON public.settlements;
DROP POLICY IF EXISTS "Admins manage settlements" ON public.settlements;

-- wallet_ledger rows are written only by the completion trigger; admins read.
DROP POLICY IF EXISTS "Admins manage ledger" ON public.wallet_ledger;

-- ledger_adjustments are append-only audit records (no edit/delete).
DROP POLICY IF EXISTS "Admins manage adjustments" ON public.ledger_adjustments;
CREATE POLICY "Admins view adjustments" ON public.ledger_adjustments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins add adjustments" ON public.ledger_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND admin_id = auth.uid() AND amount <> 0 AND length(btrim(note)) > 0);

CREATE OR REPLACE FUNCTION public.settlements_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.rider_id <> OLD.rider_id OR NEW.type <> OLD.type OR NEW.amount <> OLD.amount
     OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.receipt_url IS DISTINCT FROM OLD.receipt_url
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Settlement values are immutable';
  END IF;
  IF OLD.status <> 'pending' AND (NEW.status <> OLD.status OR NEW.admin_id IS DISTINCT FROM OLD.admin_id
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'Settlement already decided';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS settlements_guard ON public.settlements;
CREATE TRIGGER settlements_guard BEFORE INSERT OR UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.settlements_guard();

CREATE OR REPLACE FUNCTION public.rider_cancel_settlement(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE settlements SET status = 'rejected',
    notes = trim(coalesce(notes, '') || ' [Cancelled by rider]')
  WHERE id = p_id AND rider_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'No pending request to cancel'; END IF;
  PERFORM hg_audit('rider_cancel_settlement', 'settlement', p_id, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_settlement(p_id uuid, p_approve boolean, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s settlements;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  UPDATE settlements SET
    status = CASE WHEN p_approve THEN 'approved'::settlement_status ELSE 'rejected'::settlement_status END,
    admin_id = auth.uid(),
    approved_at = CASE WHEN p_approve THEN now() END,
    notes = CASE WHEN nullif(p_note, '') IS NULL THEN notes ELSE trim(coalesce(notes, '') || ' [Admin: ' || left(p_note, 300) || ']') END
  WHERE id = p_id AND status = 'pending'
  RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement is not pending'; END IF;
  PERFORM hg_audit(CASE WHEN p_approve THEN 'admin_settlement_approved' ELSE 'admin_settlement_rejected' END,
    'settlement', p_id, jsonb_build_object('rider_id', s.rider_id, 'type', s.type, 'amount', s.amount, 'note', left(p_note, 300)));
END $$;

CREATE OR REPLACE FUNCTION public.admin_record_settlement(p_rider_id uuid, p_type settlement_type, p_amount numeric, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  IF NOT has_role(p_rider_id, 'rider') THEN RAISE EXCEPTION 'Not a rider'; END IF;
  INSERT INTO settlements (rider_id, type, amount, status, admin_id, approved_at, notes)
  VALUES (p_rider_id, p_type, p_amount, 'approved', auth.uid(), now(), coalesce(nullif(p_note, ''), 'Logged by admin'))
  RETURNING id INTO new_id;
  PERFORM hg_audit('admin_record_settlement', 'settlement', new_id,
    jsonb_build_object('rider_id', p_rider_id, 'type', p_type, 'amount', p_amount, 'note', left(p_note, 300)));
  RETURN new_id;
END $$;

-- ---------- execute grants ----------
REVOKE ALL ON FUNCTION public.create_order(service_type, text, text, double precision, double precision, double precision, double precision, text, jsonb, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_order_payment_method(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_my_order(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_available_jobs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_trip(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_order_contacts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_confirm_payment(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rider_cancel_settlement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_decide_settlement(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_record_settlement(uuid, settlement_type, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settlements_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hg_audit(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order(service_type, text, text, double precision, double precision, double precision, double precision, text, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_payment_method(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_available_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_trip(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_contacts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_payment(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_cancel_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_settlement(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_settlement(uuid, settlement_type, numeric, text) TO authenticated;
