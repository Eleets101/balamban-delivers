ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_restaurants_tags ON public.restaurants USING GIN(tags);