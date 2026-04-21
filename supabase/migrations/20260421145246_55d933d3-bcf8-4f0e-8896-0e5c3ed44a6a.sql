-- Add geolocation columns to orders for pickup and drop-off
ALTER TABLE public.orders
  ADD COLUMN pickup_lat double precision,
  ADD COLUMN pickup_lng double precision,
  ADD COLUMN dropoff_lat double precision,
  ADD COLUMN dropoff_lng double precision;

-- Live driver location tracking
CREATE TABLE public.driver_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rider_id uuid NOT NULL UNIQUE,
  order_id uuid,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  speed double precision,
  accuracy double precision,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_driver_locations_order ON public.driver_locations(order_id);
CREATE INDEX idx_driver_locations_rider ON public.driver_locations(rider_id);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Riders can insert / update their own location
CREATE POLICY "Riders upsert own location"
  ON public.driver_locations
  FOR INSERT
  WITH CHECK (auth.uid() = rider_id AND public.has_role(auth.uid(), 'rider'));

CREATE POLICY "Riders update own location"
  ON public.driver_locations
  FOR UPDATE
  USING (auth.uid() = rider_id);

CREATE POLICY "Riders delete own location"
  ON public.driver_locations
  FOR DELETE
  USING (auth.uid() = rider_id);

-- Riders see their own location
CREATE POLICY "Riders view own location"
  ON public.driver_locations
  FOR SELECT
  USING (auth.uid() = rider_id);

-- Admins see all driver locations
CREATE POLICY "Admins view all driver locations"
  ON public.driver_locations
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Customers can see the driver location for their own active orders
CREATE POLICY "Customers view driver location for own order"
  ON public.driver_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = driver_locations.order_id
        AND o.customer_id = auth.uid()
        AND o.status IN ('accepted', 'in_progress')
    )
  );

-- Auto-update timestamp on location updates
CREATE TRIGGER trg_driver_locations_updated_at
  BEFORE UPDATE ON public.driver_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable realtime for live driver tracking and order status updates
ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;