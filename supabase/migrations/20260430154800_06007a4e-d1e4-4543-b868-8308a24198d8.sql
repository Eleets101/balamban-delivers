ALTER TABLE public.daily_finance_snapshots
ADD COLUMN IF NOT EXISTS rider_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS daily_finance_snapshots_day_key
ON public.daily_finance_snapshots (day);