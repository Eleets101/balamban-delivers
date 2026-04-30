ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS open_time time,
  ADD COLUMN IF NOT EXISTS close_time time;