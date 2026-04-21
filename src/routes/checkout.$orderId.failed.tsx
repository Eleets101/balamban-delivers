import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  XCircle,
  Loader2,
  Wallet,
  Banknote,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { SERVICE_LABELS, type ServiceType } from "@/lib/orders";

interface FailedOrder {
  id: string;
  customer_id: string;
  service_type: ServiceType;
  estimated_price: number | null;
  payment_method: string;
  payment_status: "pending" | "paid" | "cod" | "failed";
}

const DELIVERY_FEE_BY_SERVICE: Record<ServiceType, number> = {
  ride: 0,
  food: 25,
  padali: 20,
  pabili: 20,
};

type FailReason =
  | "declined"
  | "timeout"
  | "insufficient"
  | "cancelled"
  | "unknown";

const REASON_COPY: Record<FailReason, { title: string; body: string }> = {
  declined: {
    title: "Your payment was declined",
    body: "The e-wallet provider declined this transaction. You can try again or switch to cash on delivery.",
  },
  timeout: {
    title: "Payment timed out",
    body: "We didn't receive a confirmation from the provider in time. No amount was charged.",
  },
  insufficient: {
    title: "Insufficient balance",
    body: "Your e-wallet doesn't have enough balance to cover this order. Top up or pay with cash on delivery.",
  },
  cancelled: {
    title: "Payment cancelled",
    body: "You cancelled the payment before it completed. You can retry or pay with cash instead.",
  },
  unknown: {
    title: "Payment failed",
    body: "Something went wrong while processing your payment. No amount was charged.",
  },
};

export const Route = createFileRoute("/checkout/$orderId/failed")({
  validateSearch: (search: Record<string, unknown>): { reason: FailReason } => {
    const raw = typeof search.reason === "string" ? search.reason : "";
    const valid: FailReason[] = ["declined", "timeout", "insufficient", "cancelled", "unknown"];
    return { reason: (valid as string[]).includes(raw) ? (raw as FailReason) : "unknown" };
  },
  head: () => ({
    meta: [
      { title: "Payment failed — HatodGo" },
      { name: "description", content: "Your HatodGo payment didn't go through. Retry or switch payment method." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FailedPage,
});

function FailedPage() {
  const { orderId } = Route.useParams();
  const { reason } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<FailedOrder | null>(null);
  const [busy, setBusy] = useState<null | "retry" | "cod">(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    supabase
      .from("orders")
      .select("id, customer_id, service_type, estimated_price, payment_method, payment_status")
      .eq("id", orderId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error("We couldn't load that order.");
          navigate({ to: "/orders" });
          return;
        }
        setOrder(data as FailedOrder);
      });
  }, [orderId, user, loading, navigate]);

  if (!order) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  const copy = REASON_COPY[reason] ?? REASON_COPY.unknown;
  const fare = Number(order.estimated_price ?? 0);
  const deliveryFee = DELIVERY_FEE_BY_SERVICE[order.service_type] ?? 0;
  const total = fare + deliveryFee;

  const retryEwallet = async () => {
    setBusy("retry");
    // Reset status to pending so the pay page treats it as a fresh attempt
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "pending" })
      .eq("id", order.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/checkout/$orderId/pay", params: { orderId } });
  };

  const switchToCOD = async () => {
    setBusy("cod");
    const { error } = await supabase
      .from("orders")
      .update({ payment_method: "cod", payment_status: "cod" })
      .eq("id", order.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Switched to cash on delivery. Please have cash ready.");
    navigate({ to: "/checkout/$orderId/success", params: { orderId } });
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/checkout/$orderId", params: { orderId } })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to summary
        </button>

        <div className="mt-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/15">
            <XCircle className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="mt-6 font-display text-2xl font-bold sm:text-3xl">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        </div>

        {/* Order recap */}
        <section
          className="mt-6 rounded-2xl border border-border/60 p-5 text-left"
          style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-start justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Order</span>
            <span className="text-right font-medium">{SERVICE_LABELS[order.service_type]}</span>
          </div>
          <div className="mt-2 flex items-start justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Order ID</span>
            <span className="break-all text-right font-mono text-xs font-semibold">
              {order.id}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
            <span className="font-display text-base font-semibold">Amount due</span>
            <span className="font-display text-xl font-bold text-primary-glow">
              ₱{total.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Actions */}
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={retryEwallet}
            className="group flex items-center justify-between gap-4 rounded-2xl border border-primary/40 p-5 text-left transition-all hover:border-primary hover:shadow-[var(--shadow-glow)] disabled:opacity-60"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-base font-semibold">Retry with GCash / Maya</p>
                <p className="text-xs text-muted-foreground">
                  Go back to the secure e-wallet checkout
                </p>
              </div>
            </div>
            {busy === "retry" ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <RefreshCw className="h-5 w-5 text-muted-foreground transition-transform group-hover:rotate-180" />
            )}
          </button>

          <button
            type="button"
            disabled={busy !== null}
            onClick={switchToCOD}
            className="group flex items-center justify-between gap-4 rounded-2xl border border-border/60 p-5 text-left transition-all hover:border-border disabled:opacity-60"
            style={{ background: "var(--gradient-card)" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                <Banknote className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-base font-semibold">Switch to Cash on Delivery</p>
                <p className="text-xs text-muted-foreground">Pay the rider in cash on arrival</p>
              </div>
            </div>
            {busy === "cod" ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : null}
          </button>
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          You were not charged. It's safe to try again.
        </p>

        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link to="/orders">View my orders</Link>
        </Button>
      </div>
    </PageShell>
  );
}
