-- Rollback for 20261021_secure_order_lifecycle.sql
-- Restores the previous (less secure) policies exactly as they existed before.
-- WARNING: re-opens the defects found in the audit (riders read all orders,
-- customers can self-mark paid). Run only to unblock an outage, and deploy the
-- previous app build at the same time (the new app calls the RPCs below).

DROP POLICY IF EXISTS "Riders view own assigned orders" ON public.orders;
CREATE POLICY "Riders view assigned orders" ON public.orders FOR SELECT
  USING ((auth.uid() = rider_id) OR has_role(auth.uid(), 'rider'::app_role));
CREATE POLICY "Customers create orders" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Customers update own pending orders" ON public.orders FOR UPDATE
  USING ((auth.uid() = customer_id) AND (status = 'pending'::order_status));

DROP POLICY IF EXISTS "Riders upsert own location" ON public.driver_locations;
DROP POLICY IF EXISTS "Riders update own location" ON public.driver_locations;
CREATE POLICY "Riders upsert own location" ON public.driver_locations FOR INSERT
  WITH CHECK ((auth.uid() = rider_id) AND has_role(auth.uid(), 'rider'::app_role));
CREATE POLICY "Riders update own location" ON public.driver_locations FOR UPDATE
  USING (auth.uid() = rider_id);

CREATE POLICY "Riders update own pending settlements" ON public.settlements FOR UPDATE
  USING ((auth.uid() = rider_id) AND (status = 'pending'::settlement_status));
DROP TRIGGER IF EXISTS settlements_guard ON public.settlements;

DROP FUNCTION IF EXISTS public.admin_record_settlement(uuid, settlement_type, numeric, text);
DROP FUNCTION IF EXISTS public.admin_decide_settlement(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.rider_cancel_settlement(uuid);
DROP FUNCTION IF EXISTS public.settlements_guard();
DROP FUNCTION IF EXISTS public.admin_confirm_payment(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_order_contacts(uuid);
DROP FUNCTION IF EXISTS public.advance_trip(uuid, text);
DROP FUNCTION IF EXISTS public.hg_next_trip_stage(text);
DROP FUNCTION IF EXISTS public.accept_order(uuid);
DROP FUNCTION IF EXISTS public.list_available_jobs();
DROP FUNCTION IF EXISTS public.cancel_my_order(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.set_order_payment_method(uuid, text);
DROP FUNCTION IF EXISTS public.create_order(service_type, text, text, double precision, double precision, double precision, double precision, text, jsonb, numeric);
DROP FUNCTION IF EXISTS public.hg_min_fee(service_type, numeric, jsonb);
DROP FUNCTION IF EXISTS public.hg_haversine_km(double precision, double precision, double precision, double precision);
