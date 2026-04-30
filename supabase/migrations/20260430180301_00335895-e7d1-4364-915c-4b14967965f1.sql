-- Add fields needed for OSM/external import dedup and provenance
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS osm_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS website TEXT;

CREATE INDEX IF NOT EXISTS idx_restaurants_osm_id ON public.restaurants(osm_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_source ON public.restaurants(source);