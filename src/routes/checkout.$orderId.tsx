import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Receipt,
} from "lucide-react";
import gcashIcon from "@/assets/pay-gcash.png";
import codIcon from "@/assets/pay-cod.png";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { SERVICE_LABELS, type ServiceType } from "@/lib/orders";
import { isFareBreakdown, type FareBreakdown } from "@/lib/pricing";

interface CheckoutOrder {
  id: string;
  customer_id: string;
  service_type: ServiceType;
  pickup_address: string;
  dropoff_address: string;
  estimated_price: number | null;
  payment_method: string;
  payment_status: "pending" | "paid" | "cod" | "failed";
  status: string;
  details: Record<string, unknown> | null;
}

export const Route = createFileRoute("/checkout/$orderId")({
  head: () => ({
    meta: [
      { title: "Checkout — HatodGo" },
      { name: "description", content: "Review your HatodGo order and pay securely with GCash, Maya, or cash on delivery." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { orderId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    const load = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_id, service_type, pickup_address, dropoff_address, estimated_price, payment_method, payment_status, status, details")
        .eq("id", orderId)
        .maybeSingle();
      if (error || !data) {
        toast.error("We couldn't find that order.");
        navigate({ to: "/orders" });
        return;
      }
      setOrder(data as CheckoutOrder);
      setFetching(false);
    };
    load();
  }, [orderId, user, loading, navigate]);

  if (loading || fetching || !order) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  // If already paid/COD confirmed, jump straight to success
  if (order.payment_status === "paid" || order.payment_status === "cod") {
    navigate({ to: "/checkout/$orderId/success", params: { orderId } });
    return null;
  }

  // Prefer the saved fare breakdown (new orders). Fall back to estimated_price
  // for legacy orders created before the pricing engine landed.
  const breakdown: FareBreakdown | null = isFareBreakdown(order.details?.fare_breakdown)
    ? (order.details!.fare_breakdown as FareBreakdown)
    : null;
  const total = breakdown?.total ?? Number(order.estimated_price ?? 0);

  const chooseCOD = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("orders")
      .update({ payment_method: "cod", payment_status: "cod" })
      .eq("id", order.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cash on delivery selected. Pay the rider upon arrival.");
    navigate({ to: "/checkout/$orderId/success", params: { orderId } });
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Order summary</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review your details and choose how to pay.</p>

        {/* Summary card */}
        <section
          className="mt-6 rounded-2xl border border-border/60 p-5"
          style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Service</span>
            <span className="font-display text-base font-semibold">{SERVICE_LABELS[order.service_type]}</span>
          </div>

          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
              <div>
                <p className="text-xs text-muted-foreground">Pickup</p>
                <p className="font-medium">{order.pickup_address}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Destination</p>
                <p className="font-medium">{order.dropoff_address}</p>
              </div>
            </div>
          </div>

          {/* Fare breakdown */}
          <div className="mt-5 border-t border-border/60 pt-4">
            <div className="mb-2 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary-glow" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fare breakdown
              </p>
            </div>
            <dl className="space-y-1.5 text-sm">
              {breakdown ? (
                breakdown.lines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{line.label}</dt>
                    <dd className="font-medium">₱{line.amount.toFixed(2)}</dd>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Estimated total</dt>
                  <dd className="font-medium">₱{total.toFixed(2)}</dd>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-3">
                <dt className="font-display text-base font-semibold">Total</dt>
                <dd className="font-display text-xl font-bold text-primary-glow">
                  ₱{total.toFixed(2)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Payment options */}
        <h2 className="mt-8 font-display text-lg font-semibold">Choose how to pay</h2>

        <div className="mt-3 grid gap-3">
          {/* GCash / Maya */}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              navigate({ to: "/checkout/$orderId/pay", params: { orderId } })
            }
            className="group flex items-center justify-between gap-4 rounded-2xl border border-primary/40 p-5 text-left transition-all hover:border-primary hover:shadow-[var(--shadow-glow)] disabled:opacity-60"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="flex items-center gap-4">
              <img
                src={gcashIcon}
                alt="GCash"
                width={48}
                height={48}
                loading="lazy"
                className="h-12 w-12 shrink-0 rounded-xl object-contain"
              />
              <div>
                <p className="font-display text-base font-semibold">Pay Now</p>
                <p className="text-xs text-muted-foreground">Secure payment via GCash or Maya</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </button>

          {/* COD */}
          <button
            type="button"
            disabled={busy}
            onClick={chooseCOD}
            className="group flex items-center justify-between gap-4 rounded-2xl border border-border/60 p-5 text-left transition-all hover:border-border disabled:opacity-60"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="flex items-center gap-4">
              <img
                src={codIcon}
                alt="Cash on Delivery"
                width={48}
                height={48}
                loading="lazy"
                className="h-12 w-12 shrink-0 rounded-xl object-contain"
              />
              <div>
                <p className="font-display text-base font-semibold">Pay with Cash</p>
                <p className="text-xs text-muted-foreground">Pay driver upon arrival</p>
              </div>
            </div>
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
            )}
          </button>
        </div>

        {/* Trust */}
        <div className="mt-6 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success" />
            Secure payments powered by trusted providers
          </p>
          <p className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-glow" />
            No hidden fees
          </p>
        </div>

        <Button asChild variant="ghost" className="mt-6 w-full">
          <Link to="/orders">Skip for now — view my orders</Link>
        </Button>
      </div>
    </PageShell>
  );
}
