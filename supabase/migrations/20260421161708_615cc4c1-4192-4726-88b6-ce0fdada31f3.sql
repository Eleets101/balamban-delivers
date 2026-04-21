-- Payment status enum + column on orders
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'cod', 'failed');

ALTER TABLE public.orders
  ADD COLUMN payment_status public.payment_status NOT NULL DEFAULT 'pending';

-- Existing RLS "Customers update own pending orders" already allows the
-- customer to update payment_status on their pending orders — no policy change needed.