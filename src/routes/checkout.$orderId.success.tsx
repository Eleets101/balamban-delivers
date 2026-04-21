import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Bike, Loader2, ArrowRight, Receipt, Wallet, Banknote, Download } from "lucide-react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { SERVICE_LABELS, type ServiceType } from "@/lib/orders";

interface SuccessOrder {
  id: string;
  payment_status: "pending" | "paid" | "cod" | "failed";
  payment_method: string;
  service_type: ServiceType;
  estimated_price: number | null;
  updated_at: string;
  created_at: string;
}

const DELIVERY_FEE_BY_SERVICE: Record<ServiceType, number> = {
  ride: 0,
  food: 25,
  padali: 20,
  pabili: 20,
};

export const Route = createFileRoute("/checkout/$orderId/success")({
  head: () => ({
    meta: [
      { title: "Payment successful — HatodGo" },
      { name: "description", content: "Your HatodGo order has been confirmed." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuccessPage,
});

const AUTO_REDIRECT_MS = 6000;

function formatMethodLabel(method: string, status: string) {
  if (status === "cod") return "Cash on Delivery";
  const m = method?.toLowerCase();
  if (m === "gcash") return "GCash";
  if (m === "maya") return "Maya";
  if (m === "cod") return "Cash on Delivery";
  return method?.toUpperCase() || "—";
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function SuccessPage() {
  const { orderId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<SuccessOrder | null>(null);
  const [countdown, setCountdown] = useState(Math.ceil(AUTO_REDIRECT_MS / 1000));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    supabase
      .from("orders")
      .select("id, payment_status, payment_method, service_type, estimated_price, updated_at, created_at")
      .eq("id", orderId)
      .maybeSingle()
      .then(({ data }) => setOrder(data as SuccessOrder | null));
  }, [orderId, user, loading, navigate]);

  // Auto-redirect + countdown
  useEffect(() => {
    if (!order) return;
    const interval = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    const redirect = setTimeout(() => {
      navigate({ to: "/orders" });
    }, AUTO_REDIRECT_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(redirect);
    };
  }, [order, navigate]);

  if (!order) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  const isCOD = order.payment_status === "cod";
  const title = isCOD ? "Order confirmed ✅" : "Payment Successful ✅";
  const methodLabel = formatMethodLabel(order.payment_method, order.payment_status);
  const subtitle = isCOD
    ? "Please have cash ready when your rider arrives."
    : `Paid via ${methodLabel}. Your receipt is saved in My Orders.`;

  const fare = Number(order.estimated_price ?? 0);
  const deliveryFee = DELIVERY_FEE_BY_SERVICE[order.service_type] ?? 0;
  const total = fare + deliveryFee;
  const paidAt = formatTimestamp(order.updated_at || order.created_at);
  const MethodIcon = isCOD ? Banknote : Wallet;

  return (
    <PageShell>
      <div className="mx-auto max-w-md px-4 py-10 text-center sm:px-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        {/* Receipt */}
        <section
          className="mt-6 rounded-2xl border border-border/60 p-5 text-left"
          style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
          aria-label="Payment receipt"
        >
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary-glow" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide">
              Receipt
            </h2>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Order ID</dt>
              <dd className="break-all text-right font-mono text-xs font-semibold">
                {order.id}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Service</dt>
              <dd className="text-right font-medium">
                {SERVICE_LABELS[order.service_type]}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Payment method</dt>
              <dd className="flex items-center gap-1.5 text-right font-medium">
                <MethodIcon className="h-4 w-4 text-primary-glow" />
                {methodLabel}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Timestamp</dt>
              <dd className="text-right font-medium">{paidAt}</dd>
            </div>
            {deliveryFee > 0 && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Service / fare</dt>
                  <dd className="text-right font-medium">₱{fare.toFixed(2)}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Delivery fee</dt>
                  <dd className="text-right font-medium">₱{deliveryFee.toFixed(2)}</dd>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <dt className="font-display text-base font-semibold">
                {isCOD ? "Amount due" : "Total paid"}
              </dt>
              <dd className="font-display text-xl font-bold text-primary-glow">
                ₱{total.toFixed(2)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
            <div className="relative">
              <div
                className="absolute inset-0 animate-ping rounded-full opacity-40"
                style={{ background: "var(--gradient-primary)" }}
              />
              <div
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Bike className="h-5 w-5" />
              </div>
            </div>
            <div>
              <p className="font-display text-sm font-semibold">Driver assignment in progress</p>
              <p className="text-xs text-muted-foreground">We're matching you with a nearby rider.</p>
            </div>
          </div>
        </section>

        <p className="mt-6 text-xs text-muted-foreground">
          Redirecting to order tracking in {countdown}s…
        </p>

        <Button asChild className="mt-3 w-full" size="lg">
          <Link to="/orders">
            Track my order <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
