-- Allow upserting driver_locations by rider_id (one live row per rider).
-- Also ensure order_id is set so the customer RLS policy can find it.
ALTER TABLE public.driver_locations
  ADD CONSTRAINT driver_locations_rider_id_unique UNIQUE (rider_id);
