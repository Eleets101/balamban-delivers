CREATE TYPE public.saved_location_kind AS ENUM ('home', 'work', 'favorite');

CREATE TABLE public.saved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.saved_location_kind NOT NULL DEFAULT 'favorite',
  label text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX saved_locations_user_idx ON public.saved_locations (user_id, kind);
CREATE UNIQUE INDEX saved_locations_user_unique_kind
  ON public.saved_locations (user_id, kind)
  WHERE kind IN ('home', 'work');

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own saved locations"
  ON public.saved_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved locations"
  ON public.saved_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own saved locations"
  ON public.saved_locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own saved locations"
  ON public.saved_locations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER saved_locations_set_updated_at
  BEFORE UPDATE ON public.saved_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();