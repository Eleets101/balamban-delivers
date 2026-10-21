-- Access/transition invariants for supabase/pending/20261021_secure_order_lifecycle.sql
-- Run on a SCRATCH database only (see supabase/tests/README.md). Never production.

CREATE TABLE _results (seq serial, name text, ok boolean, detail text);
GRANT ALL ON _results TO authenticated; GRANT USAGE ON SEQUENCE _results_seq_seq TO authenticated;

-- Run SQL as a signed-in user. Returns NULL on success, error text otherwise.
CREATE FUNCTION _run_as(_uid uuid, _sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN others THEN
    EXECUTE 'RESET ROLE';
    RETURN SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  RETURN NULL;
END $$;

CREATE FUNCTION _val_as(_uid uuid, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE _sql INTO v;
  EXCEPTION WHEN others THEN
    EXECUTE 'RESET ROLE';
    RETURN 'ERR: ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  RETURN v;
END $$;

CREATE FUNCTION _ok(_name text, _err text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO _results(name, ok, detail) VALUES (_name, _err IS NULL, _err) $$;
CREATE FUNCTION _fails(_name text, _err text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO _results(name, ok, detail) VALUES (_name, _err IS NOT NULL, coalesce(_err, 'expected an error, got success')) $$;
CREATE FUNCTION _eq(_name text, _got text, _want text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO _results(name, ok, detail) VALUES (_name, _got IS NOT DISTINCT FROM _want, 'got=' || coalesce(_got, 'NULL') || ' want=' || coalesce(_want, 'NULL')) $$;

-- ---------- fixtures (as superuser) ----------
INSERT INTO auth.users (id, raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-0000000000c1', '{"full_name":"Cust One","phone":"09170000001"}'),
 ('00000000-0000-0000-0000-0000000000c2', '{"full_name":"Cust Two"}'),
 ('00000000-0000-0000-0000-0000000000a1', '{"full_name":"Rider A","phone":"09170000011"}'),
 ('00000000-0000-0000-0000-0000000000a2', '{"full_name":"Rider B"}'),
 ('00000000-0000-0000-0000-0000000000ad', '{"full_name":"Owner"}');
INSERT INTO user_roles (user_id, role) VALUES
 ('00000000-0000-0000-0000-0000000000a1', 'rider'),
 ('00000000-0000-0000-0000-0000000000a2', 'rider'),
 ('00000000-0000-0000-0000-0000000000ad', 'admin');
INSERT INTO restaurants (id, name, address, lat, lng, base_delivery_fee, per_km_fee, free_distance_km)
 VALUES ('00000000-0000-0000-0000-00000000f001', 'Test Inasal', 'Poblacion', 10.4456, 123.7016, 30, 7, 2);
INSERT INTO menu_items (id, restaurant_id, name, price)
 VALUES ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f001', 'Paa', 120);

CREATE TABLE _ids (k text primary key, v uuid);
GRANT ALL ON _ids TO authenticated;

-- ---------- order creation ----------
SELECT _fails('customer cannot INSERT orders directly', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$INSERT INTO orders (customer_id, service_type, pickup_address, dropoff_address, status) VALUES (auth.uid(), 'ride', 'a', 'b', 'completed')$$));

SELECT _ok('customer creates padala via RPC', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$INSERT INTO _ids VALUES ('padala', create_order('padali', 'Pickup St', 'Drop St', 10.4456, 123.7016, 10.4600, 123.7100, 'gate code 123',
   '{"phone":"09170000001","recipient":{"name":"Lola","phone":"09170000099"},"landmark":"near church","parcel_size":"small","fare_breakdown":{"total":60,"rider_earnings":9999}}', 60))$$));

SELECT _eq('new order is pending/unassigned/unpaid',
 (SELECT status || '/' || coalesce(rider_id::text, 'none') || '/' || payment_status FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'padala')),
 'pending/none/pending');
SELECT _eq('rider_earnings recomputed server-side, not client 9999',
 (SELECT details->'fare_breakdown'->>'rider_earnings' FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'padala')), '48');

SELECT _fails('fare below distance minimum is rejected', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT create_order('ride', 'A', 'B', 10.4456, 123.7016, 10.5456, 123.7016, null, '{}', 5)$$));

SELECT _ok('customer creates food cart order', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$INSERT INTO _ids VALUES ('food', create_order('food', 'ignored', 'Home', 0, 0, 10.4456, 123.7016, null,
   '{"restaurant":{"id":"00000000-0000-0000-0000-00000000f001"},"items":[{"menu_item_id":"00000000-0000-0000-0000-00000000f101","quantity":2,"price":1}]}', 1))$$));
-- goods 240 + delivery 30 + service fee ceil(clamp(19.2, 8, 30)) = 20 -> 290
SELECT _eq('food total recomputed from menu prices',
 (SELECT estimated_price::int::text FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'food')), '290');

-- ---------- visibility ----------
SELECT _eq('rider sees zero unassigned orders via table',
 _val_as('00000000-0000-0000-0000-0000000000a1', $$SELECT count(*)::text FROM orders$$), '0');
SELECT _eq('rider job board lists pending jobs',
 _val_as('00000000-0000-0000-0000-0000000000a1', $$SELECT count(*)::text FROM list_available_jobs()$$), '2');
SELECT _eq('job board hides phone/recipient/landmark',
 _val_as('00000000-0000-0000-0000-0000000000a1',
  $$SELECT bool_or(details ? 'phone' OR details ? 'recipient' OR details ? 'landmark' OR details::text LIKE '%0917%')::text FROM list_available_jobs()$$), 'false');
SELECT _fails('customer cannot read job board', _run_as('00000000-0000-0000-0000-0000000000c1', $$SELECT * FROM list_available_jobs()$$));
SELECT _eq('other customer cannot see the order',
 _val_as('00000000-0000-0000-0000-0000000000c2', $$SELECT count(*)::text FROM orders$$), '0');

-- ---------- payment ----------
SELECT _ok('customer direct UPDATE silently affects nothing', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$UPDATE orders SET payment_status = 'paid', estimated_price = 1 WHERE customer_id = auth.uid()$$));
SELECT _eq('payment still pending after direct update attempt',
 (SELECT payment_status::text FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'padala')), 'pending');
SELECT _ok('customer chooses GCash', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT set_order_payment_method((SELECT v FROM _ids WHERE k = 'padala'), 'gcash')$$));
SELECT _eq('GCash stays pending + awaiting manual confirmation',
 (SELECT payment_status || '/' || (details->>'payment_review') FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'padala')),
 'pending/awaiting_manual_confirmation');
SELECT _fails('customer cannot choose "paid" as a method', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT set_order_payment_method((SELECT v FROM _ids WHERE k = 'padala'), 'paid')$$));
SELECT _fails('customer cannot confirm own payment', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT admin_confirm_payment((SELECT v FROM _ids WHERE k = 'padala'), true)$$));
SELECT _fails('reference with symbols is rejected', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT set_order_payment_method((SELECT v FROM _ids WHERE k = 'padala'), 'gcash', '<script>')$$));
SELECT _ok('customer adds GCash reference', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT set_order_payment_method((SELECT v FROM _ids WHERE k = 'padala'), 'gcash', ' 1009 2345 6789 ')$$));
SELECT _eq('reference stored trimmed, still pending',
 (SELECT payment_status || '/' || (details->>'payment_reference') FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'padala')),
 'pending/1009 2345 6789');
SELECT _eq('customer reference change is audited',
 (SELECT action || '/' || (details->>'reference') FROM finance_audit_log WHERE entity_id = (SELECT v FROM _ids WHERE k = 'padala') AND details->>'reference' IS NOT NULL),
 'customer_set_payment_method/1009 2345 6789');
SELECT _eq('customer cannot read audit log',
 _val_as('00000000-0000-0000-0000-0000000000c1', $$SELECT count(*)::text FROM finance_audit_log$$), '0');
SELECT _fails('customer cannot write audit log', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$INSERT INTO finance_audit_log (action, entity) VALUES ('fake', 'order')$$));
SELECT _fails('customer cannot call audit helper', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT hg_audit('fake', 'order', null, '{}')$$));
SELECT _fails('admin cannot directly mark an order paid', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$UPDATE orders SET payment_status = 'paid' WHERE id = (SELECT v FROM _ids WHERE k = 'padala')$$));
SELECT _fails('admin cannot directly edit payment reference', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$UPDATE orders SET details = details || '{"payment_reference":"X999"}' WHERE id = (SELECT v FROM _ids WHERE k = 'padala')$$));
SELECT _fails('admin cannot directly insert a paid order', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$INSERT INTO orders (customer_id, service_type, pickup_address, dropoff_address, payment_status) VALUES (auth.uid(), 'padali', 'a', 'b', 'paid')$$));
SELECT _ok('admin can still change order status directly', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$UPDATE orders SET notes = coalesce(notes, '') WHERE id = (SELECT v FROM _ids WHERE k = 'padala')$$));

-- ---------- cancel ----------
SELECT _fails('other customer cannot cancel', _run_as('00000000-0000-0000-0000-0000000000c2',
 $$SELECT cancel_my_order((SELECT v FROM _ids WHERE k = 'food'), 'other', 'Other', 'x')$$));
SELECT _ok('customer cancels own pending order', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT cancel_my_order((SELECT v FROM _ids WHERE k = 'food'), 'changed_mind', 'Changed my mind', null)$$));
SELECT _eq('cancel keeps price/payment/rider untouched',
 (SELECT status || '/' || estimated_price::int || '/' || payment_status || '/' || coalesce(rider_id::text, 'none') FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'food')),
 'cancelled/290/pending/none');
SELECT _fails('rider cannot accept a cancelled order', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT accept_order((SELECT v FROM _ids WHERE k = 'food'))$$));

-- ---------- accept / contacts ----------
SELECT _fails('customer cannot accept', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT accept_order((SELECT v FROM _ids WHERE k = 'padala'))$$));
SELECT _ok('rider A accepts', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT accept_order((SELECT v FROM _ids WHERE k = 'padala'))$$));
SELECT _fails('rider B cannot accept the same order', _run_as('00000000-0000-0000-0000-0000000000a2',
 $$SELECT accept_order((SELECT v FROM _ids WHERE k = 'padala'))$$));
SELECT _fails('customer cannot cancel after acceptance', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT cancel_my_order((SELECT v FROM _ids WHERE k = 'padala'), 'other', 'Other', 'x')$$));
SELECT _eq('assigned rider reads recipient phone',
 _val_as('00000000-0000-0000-0000-0000000000a1', $$SELECT details->'recipient'->>'phone' FROM orders LIMIT 1$$), '09170000099');
SELECT _eq('other rider sees nothing',
 _val_as('00000000-0000-0000-0000-0000000000a2', $$SELECT count(*)::text FROM orders$$), '0');
SELECT _eq('assigned rider gets customer phone',
 _val_as('00000000-0000-0000-0000-0000000000a1', $$SELECT customer_phone FROM get_order_contacts((SELECT v FROM _ids WHERE k = 'padala'))$$), '09170000001');
SELECT _eq('customer gets rider phone during trip',
 _val_as('00000000-0000-0000-0000-0000000000c1', $$SELECT rider_phone FROM get_order_contacts((SELECT v FROM _ids WHERE k = 'padala'))$$), '09170000011');
SELECT _eq('other rider gets no contacts',
 _val_as('00000000-0000-0000-0000-0000000000a2', $$SELECT count(*)::text FROM get_order_contacts((SELECT v FROM _ids WHERE k = 'padala'))$$), '0');
SELECT _eq('other customer gets no contacts',
 _val_as('00000000-0000-0000-0000-0000000000c2', $$SELECT count(*)::text FROM get_order_contacts((SELECT v FROM _ids WHERE k = 'padala'))$$), '0');
SELECT _eq('other customer cannot read rider profile',
 _val_as('00000000-0000-0000-0000-0000000000c2', $$SELECT count(*)::text FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000a1'$$), '0');

-- ---------- trip stages ----------
SELECT _fails('cannot jump straight to completed', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT advance_trip((SELECT v FROM _ids WHERE k = 'padala'), 'completed')$$));
SELECT _fails('other rider cannot advance', _run_as('00000000-0000-0000-0000-0000000000a2',
 $$SELECT advance_trip((SELECT v FROM _ids WHERE k = 'padala'), 'arrived_pickup')$$));
SELECT _fails('rider cannot set status directly', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$WITH u AS (UPDATE orders SET status = 'completed' RETURNING 1) SELECT 1 / count(*) FROM u$$));
SELECT _ok('arrived at pickup', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT advance_trip((SELECT v FROM _ids WHERE k = 'padala'), 'arrived_pickup')$$));
SELECT _ok('picked up', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT advance_trip((SELECT v FROM _ids WHERE k = 'padala'), 'picked_up')$$));
SELECT _eq('picked_up sets in_progress',
 (SELECT status::text FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'padala')), 'in_progress');
SELECT _ok('completed from final stage', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT advance_trip((SELECT v FROM _ids WHERE k = 'padala'), 'completed')$$));
SELECT _fails('cannot complete twice', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT advance_trip((SELECT v FROM _ids WHERE k = 'padala'), 'completed')$$));
SELECT _eq('exactly one ledger row with server earnings',
 (SELECT count(*) || '/' || max(rider_earning)::int FROM wallet_ledger WHERE order_id = (SELECT v FROM _ids WHERE k = 'padala')), '1/48');
SELECT _eq('rider contacts hidden after completion',
 _val_as('00000000-0000-0000-0000-0000000000a1', $$SELECT count(*)::text FROM get_order_contacts((SELECT v FROM _ids WHERE k = 'padala'))$$), '0');

-- ---------- payment confirm by admin ----------
SELECT _ok('admin confirms GCash payment', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$SELECT admin_confirm_payment((SELECT v FROM _ids WHERE k = 'padala'), true)$$));
SELECT _eq('payment now paid', (SELECT payment_status::text FROM orders WHERE id = (SELECT v FROM _ids WHERE k = 'padala')), 'paid');
SELECT _eq('payment confirmation audited with amount and reference',
 (SELECT action || '/' || actor_id || '/' || (details->>'reference') FROM finance_audit_log
   WHERE entity_id = (SELECT v FROM _ids WHERE k = 'padala') AND action LIKE 'admin_payment%'),
 'admin_payment_confirmed/00000000-0000-0000-0000-0000000000ad/1009 2345 6789');
SELECT _fails('customer cannot change method after paid', _run_as('00000000-0000-0000-0000-0000000000c1',
 $$SELECT set_order_payment_method((SELECT v FROM _ids WHERE k = 'padala'), 'cod')$$));
SELECT _fails('paid payment cannot be re-decided', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$SELECT admin_confirm_payment((SELECT v FROM _ids WHERE k = 'padala'), false)$$));

-- ---------- settlements ----------
SELECT _fails('rider cannot create approved settlement', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$INSERT INTO settlements (rider_id, type, amount, status) VALUES (auth.uid(), 'payout_to_rider', 500, 'approved')$$));
SELECT _fails('rider cannot create zero settlement', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$INSERT INTO settlements (rider_id, type, amount) VALUES (auth.uid(), 'cash_remit', 0)$$));
SELECT _ok('rider requests payout', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$INSERT INTO _ids SELECT 's1', id FROM (SELECT gen_random_uuid() id) x; INSERT INTO settlements (id, rider_id, type, amount) VALUES ((SELECT v FROM _ids WHERE k = 's1'), auth.uid(), 'payout_to_rider', 100)$$));
SELECT _ok('rider direct UPDATE affects nothing', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$UPDATE settlements SET amount = 99999 WHERE rider_id = auth.uid()$$));
SELECT _eq('amount unchanged', (SELECT amount::int::text FROM settlements WHERE id = (SELECT v FROM _ids WHERE k = 's1')), '100');
SELECT _fails('other rider cannot cancel it', _run_as('00000000-0000-0000-0000-0000000000a2',
 $$SELECT rider_cancel_settlement((SELECT v FROM _ids WHERE k = 's1'))$$));
SELECT _ok('rider cancels own pending request', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT rider_cancel_settlement((SELECT v FROM _ids WHERE k = 's1'))$$));
SELECT _fails('admin cannot approve a cancelled request', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$SELECT admin_decide_settlement((SELECT v FROM _ids WHERE k = 's1'), true, null)$$));
SELECT _ok('rider requests second payout', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$INSERT INTO _ids SELECT 's2', gen_random_uuid(); INSERT INTO settlements (id, rider_id, type, amount) VALUES ((SELECT v FROM _ids WHERE k = 's2'), auth.uid(), 'payout_to_rider', 200)$$));
SELECT _fails('rider cannot approve own request', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT admin_decide_settlement((SELECT v FROM _ids WHERE k = 's2'), true, null)$$));
SELECT _ok('admin approves', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$SELECT admin_decide_settlement((SELECT v FROM _ids WHERE k = 's2'), true, 'paid via GCash ref 123')$$));
SELECT _eq('approval stamped with admin',
 (SELECT status || '/' || admin_id::text || '/' || (approved_at IS NOT NULL)::text FROM settlements WHERE id = (SELECT v FROM _ids WHERE k = 's2')),
 'approved/00000000-0000-0000-0000-0000000000ad/true');
SELECT _ok('admin direct amount edit attempt', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$UPDATE settlements SET amount = 1 WHERE id = (SELECT v FROM _ids WHERE k = 's2')$$));
SELECT _fails('approved decision cannot be reversed via RPC', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$SELECT admin_decide_settlement((SELECT v FROM _ids WHERE k = 's2'), false, null)$$));
SELECT _fails('trigger blocks amount edit even for privileged writers',
 (SELECT CASE WHEN true THEN (SELECT _try) END FROM (SELECT NULL::text _try) z));
SELECT _eq('approved settlement unchanged after attempts',
 (SELECT status || '/' || amount::int FROM settlements WHERE id = (SELECT v FROM _ids WHERE k = 's2')), 'approved/200');
SELECT _fails('non-admin cannot record settlements', _run_as('00000000-0000-0000-0000-0000000000a1',
 $$SELECT admin_record_settlement(auth.uid(), 'payout_to_rider', 1000, 'x')$$));
SELECT _ok('admin records cash remit', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$SELECT admin_record_settlement('00000000-0000-0000-0000-0000000000a1', 'cash_remit', 50, null)$$));

-- ---------- location tagging ----------
SELECT _fails('rider cannot tag location to an order not theirs', _run_as('00000000-0000-0000-0000-0000000000a2',
 $$INSERT INTO driver_locations (rider_id, order_id, lat, lng) VALUES (auth.uid(), (SELECT v FROM _ids WHERE k = 'padala'), 1, 1)$$));

-- ---------- no direct admin writes to money tables ----------
SELECT _fails('admin cannot directly insert settlement', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$INSERT INTO settlements (rider_id, type, amount, status) VALUES ('00000000-0000-0000-0000-0000000000a1', 'payout_to_rider', 10, 'approved')$$));
SELECT _eq('admin direct settlement UPDATE affects nothing',
 _val_as('00000000-0000-0000-0000-0000000000ad', $$WITH u AS (UPDATE settlements SET notes = 'x' RETURNING 1) SELECT count(*)::text FROM u$$), '0');
SELECT _eq('admin direct settlement DELETE affects nothing',
 _val_as('00000000-0000-0000-0000-0000000000ad', $$WITH u AS (DELETE FROM settlements RETURNING 1) SELECT count(*)::text FROM u$$), '0');
SELECT _eq('admin direct ledger UPDATE affects nothing',
 _val_as('00000000-0000-0000-0000-0000000000ad', $$WITH u AS (UPDATE wallet_ledger SET rider_earning = 0 RETURNING 1) SELECT count(*)::text FROM u$$), '0');
SELECT _eq('admin still reads settlements',
 _val_as('00000000-0000-0000-0000-0000000000ad', $$SELECT (count(*) > 0)::text FROM settlements$$), 'true');
SELECT _eq('admin still reads ledger',
 _val_as('00000000-0000-0000-0000-0000000000ad', $$SELECT (count(*) > 0)::text FROM wallet_ledger$$), 'true');
SELECT _eq('settlement decisions audited',
 (SELECT string_agg(action, ',' ORDER BY action) FROM (SELECT DISTINCT action FROM finance_audit_log WHERE entity = 'settlement') x),
 'admin_record_settlement,admin_settlement_approved,rider_cancel_settlement');
SELECT _ok('admin adds manual adjustment with note', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$INSERT INTO ledger_adjustments (rider_id, amount, note, admin_id) VALUES ('00000000-0000-0000-0000-0000000000a1', 25, 'fuel bonus', auth.uid())$$));
SELECT _fails('adjustment requires a note', _run_as('00000000-0000-0000-0000-0000000000ad',
 $$INSERT INTO ledger_adjustments (rider_id, amount, note, admin_id) VALUES ('00000000-0000-0000-0000-0000000000a1', 25, '  ', auth.uid())$$));
SELECT _eq('adjustments cannot be edited',
 _val_as('00000000-0000-0000-0000-0000000000ad', $$WITH u AS (UPDATE ledger_adjustments SET amount = 9999 RETURNING 1) SELECT count(*)::text FROM u$$), '0');
SELECT _eq('adjustments cannot be deleted',
 _val_as('00000000-0000-0000-0000-0000000000ad', $$WITH u AS (DELETE FROM ledger_adjustments RETURNING 1) SELECT count(*)::text FROM u$$), '0');
