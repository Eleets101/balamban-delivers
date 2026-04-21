import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Bike, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";

interface SuccessOrder {
  id: string;
  payment_status: "pending" | "paid" | "cod" | "failed";
  payment_method: string;
  service_type: string;
}

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

const AUTO_REDIRECT_MS = 4500;

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
      .select("id, payment_status, payment_method, service_type")
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
  const subtitle = isCOD
    ? "Please have cash ready when your rider arrives."
    : `Paid via ${order.payment_method.toUpperCase()}. Your receipt is saved in My Orders.`;

  return (
    <PageShell>
      <div className="mx-auto max-w-md px-4 py-10 text-center sm:px-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        <div
          className="mt-6 rounded-2xl border border-border/60 p-5 text-left"
          style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Order ID</p>
          <p className="mt-1 break-all font-mono text-sm font-semibold">{order.id}</p>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
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
        </div>

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
