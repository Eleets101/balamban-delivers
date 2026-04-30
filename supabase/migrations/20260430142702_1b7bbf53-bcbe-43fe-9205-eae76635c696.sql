-- Manual ledger adjustments (admin-only)
create table if not exists public.ledger_adjustments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  amount numeric(10,2) not null,
  -- positive = HatodGo owes rider (e.g. bonus, refund); negative = rider owes HatodGo (e.g. fine, correction)
  note text not null,
  admin_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_adjustments_rider_idx
  on public.ledger_adjustments (rider_id, created_at desc);

alter table public.ledger_adjustments enable row level security;

create policy "Admins manage adjustments" on public.ledger_adjustments
  for all using (has_role(auth.uid(), 'admin'))
  with check (has_role(auth.uid(), 'admin') and admin_id = auth.uid());

create policy "Riders view own adjustments" on public.ledger_adjustments
  for select using (auth.uid() = rider_id);

-- End-of-day snapshots
create table if not exists public.daily_finance_snapshots (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  gross_sales numeric(12,2) not null default 0,
  total_orders integer not null default 0,
  company_revenue numeric(12,2) not null default 0,
  rider_earnings numeric(12,2) not null default 0,
  cash_collected numeric(12,2) not null default 0,
  gcash_received numeric(12,2) not null default 0,
  pending_settlements_count integer not null default 0,
  pending_settlements_amount numeric(12,2) not null default 0,
  notes text,
  generated_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists daily_finance_snapshots_day_idx
  on public.daily_finance_snapshots (day desc);

alter table public.daily_finance_snapshots enable row level security;

create policy "Admins manage snapshots" on public.daily_finance_snapshots
  for all using (has_role(auth.uid(), 'admin'))
  with check (has_role(auth.uid(), 'admin'));