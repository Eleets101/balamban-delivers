CREATE OR REPLACE FUNCTION public.create_ledger_for_completed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  fb jsonb;
  customer_paid_amt numeric;
  rider_earning_amt numeric;
  platform_cut_amt numeric;
  gcash_target gcash_recipient;
  collector text;
  pay_method text;
begin
  if NEW.status <> 'completed' or (OLD.status = 'completed') then
    return NEW;
  end if;

  if NEW.rider_id is null then
    return NEW;
  end if;

  fb := coalesce(NEW.details->'fare_breakdown', '{}'::jsonb);
  customer_paid_amt := coalesce((fb->>'total')::numeric, NEW.estimated_price, 0);
  rider_earning_amt := coalesce((fb->>'rider_earnings')::numeric, customer_paid_amt * 0.8);
  platform_cut_amt := coalesce((fb->>'platform_cut')::numeric, customer_paid_amt - rider_earning_amt);

  pay_method := lower(coalesce(NEW.payment_method, 'cash'));
  if pay_method in ('cod', 'cash_on_delivery', 'cash on delivery') then
    pay_method := 'cash';
  end if;

  if pay_method = 'gcash' then
    gcash_target := coalesce((NEW.details->>'gcash_to')::gcash_recipient, 'hatodgo');
    collector := case when gcash_target = 'hatodgo' then 'hatodgo' else 'rider' end;
  else
    gcash_target := null;
    collector := 'rider';
    pay_method := 'cash';
  end if;

  insert into public.wallet_ledger (
    order_id, rider_id, service_type, payment_method, gcash_to,
    customer_paid, rider_earning, platform_commission, collected_by,
    created_at
  ) values (
    NEW.id, NEW.rider_id, NEW.service_type, pay_method, gcash_target,
    customer_paid_amt, rider_earning_amt, platform_cut_amt, collector,
    NEW.updated_at
  )
  on conflict (order_id) do nothing;

  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS orders_create_ledger ON public.orders;
CREATE TRIGGER orders_create_ledger
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.create_ledger_for_completed_order();

INSERT INTO public.wallet_ledger (
  order_id, rider_id, service_type, payment_method, gcash_to,
  customer_paid, rider_earning, platform_commission, collected_by,
  created_at
)
SELECT
  o.id,
  o.rider_id,
  o.service_type,
  CASE
    WHEN lower(coalesce(o.payment_method, 'cash')) = 'gcash' THEN 'gcash'
    ELSE 'cash'
  END AS payment_method,
  CASE
    WHEN lower(coalesce(o.payment_method, 'cash')) = 'gcash' THEN coalesce((o.details->>'gcash_to')::gcash_recipient, 'hatodgo')
    ELSE NULL
  END AS gcash_to,
  coalesce((coalesce(o.details->'fare_breakdown', '{}'::jsonb)->>'total')::numeric, o.estimated_price, 0) AS customer_paid,
  coalesce((coalesce(o.details->'fare_breakdown', '{}'::jsonb)->>'rider_earnings')::numeric, coalesce((coalesce(o.details->'fare_breakdown', '{}'::jsonb)->>'total')::numeric, o.estimated_price, 0) * 0.8) AS rider_earning,
  coalesce((coalesce(o.details->'fare_breakdown', '{}'::jsonb)->>'platform_cut')::numeric, coalesce((coalesce(o.details->'fare_breakdown', '{}'::jsonb)->>'total')::numeric, o.estimated_price, 0) * 0.2) AS platform_commission,
  CASE
    WHEN lower(coalesce(o.payment_method, 'cash')) = 'gcash' AND coalesce((o.details->>'gcash_to')::gcash_recipient, 'hatodgo') = 'hatodgo' THEN 'hatodgo'
    ELSE 'rider'
  END AS collected_by,
  o.updated_at
FROM public.orders o
WHERE o.status = 'completed'
  AND o.rider_id IS NOT NULL
ON CONFLICT (order_id) DO NOTHING;