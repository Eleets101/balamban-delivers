DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;

CREATE POLICY "Customers notify own order rider"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = notifications.order_id
        AND o.customer_id = auth.uid()
        AND o.rider_id = notifications.user_id
    )
  );