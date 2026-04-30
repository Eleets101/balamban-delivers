-- ===== Enums =====
do $$ begin
  create type public.settlement_type as enum ('cash_remit', 'gcash_to_hatodgo', 'payout_to_rider');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.settlement_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gcash_recipient as enum ('hatodgo', 'rider');
exception when duplicate_object then null; end $$;

-- ===== wallet_ledger =====
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique,
  rider_id uuid not null,
  service_type service_type not null,
  payment_method text not null,
  gcash_to gcash_recipient,
  customer_paid numeric(10,2) not null default 0,
  rider_earning numeric(10,2) not null default 0,
  platform_commission numeric(10,2) not null default 0,
  -- "rider" if rider physically/digitally received the money (cash, gcash to rider) — they then owe HatodGo the commission.
  -- "hatodgo" if HatodGo received the money — HatodGo then owes the rider their earning.
  collected_by text not null check (collected_by in ('rider','hatodgo')),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists wallet_ledger_rider_idx on public.wallet_ledger (rider_id, created_at desc);

alter table public.wallet_ledger enable row level security;

create policy "Riders view own ledger" on public.wallet_ledger
  for select using (auth.uid() = rider_id);

create policy "Admins view all ledger" on public.wallet_ledger
  for select using (has_role(auth.uid(), 'admin'));

create policy "Admins manage ledger" on public.wallet_ledger
  for all using (has_role(auth.uid(), 'admin'));

-- ===== settlements =====
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  type settlement_type not null,
  amount numeric(10,2) not null check (amount > 0),
  status settlement_status not null default 'pending',
  reference text,
  receipt_url text,
  notes text,
  admin_id uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists settlements_rider_idx on public.settlements (rider_id, created_at desc);
create index if not exists settlements_status_idx on public.settlements (status, created_at desc);

create trigger settlements_set_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

alter table public.settlements enable row level security;

create policy "Riders view own settlements" on public.settlements
  for select using (auth.uid() = rider_id);

create policy "Riders create own settlements" on public.settlements
  for insert with check (
    auth.uid() = rider_id
    and has_role(auth.uid(), 'rider')
    and status = 'pending'
    and admin_id is null
  );

create policy "Riders update own pending settlements" on public.settlements
  for update using (
    auth.uid() = rider_id and status = 'pending'
  );

create policy "Admins view all settlements" on public.settlements
  for select using (has_role(auth.uid(), 'admin'));

create policy "Admins manage settlements" on public.settlements
  for all using (has_role(auth.uid(), 'admin'));

-- ===== Auto-create ledger row when order is completed =====
create or replace function public.create_ledger_for_completed_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if pay_method = 'gcash' then
    gcash_target := coalesce((NEW.details->>'gcash_to')::gcash_recipient, 'hatodgo');
    collector := case when gcash_target = 'hatodgo' then 'hatodgo' else 'rider' end;
  else
    gcash_target := null;
    collector := 'rider'; -- cash always collected by rider
  end if;

  insert into public.wallet_ledger (
    order_id, rider_id, service_type, payment_method, gcash_to,
    customer_paid, rider_earning, platform_commission, collected_by
  ) values (
    NEW.id, NEW.rider_id, NEW.service_type, pay_method, gcash_target,
    customer_paid_amt, rider_earning_amt, platform_cut_amt, collector
  )
  on conflict (order_id) do nothing;

  return NEW;
end;
$$;

drop trigger if exists orders_create_ledger on public.orders;
create trigger orders_create_ledger
  after update on public.orders
  for each row execute function public.create_ledger_for_completed_order();

-- ===== Storage bucket for receipts =====
insert into storage.buckets (id, name, public)
  values ('wallet-receipts', 'wallet-receipts', false)
  on conflict (id) do nothing;

create policy "Riders upload own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'wallet-receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Riders view own receipts"
  on storage.objects for select
  using (
    bucket_id = 'wallet-receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Riders update own receipts"
  on storage.objects for update
  using (
    bucket_id = 'wallet-receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Admins view all receipts"
  on storage.objects for select
  using (
    bucket_id = 'wallet-receipts'
    and has_role(auth.uid(), 'admin')
  );
