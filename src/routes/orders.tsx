import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Package, MapPin, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { OrderTracker } from "@/components/OrderTracker";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";
import { SERVICE_LABELS, STATUS_LABELS, STATUS_COLORS, type OrderStatus, type ServiceType } from "@/lib/orders";

interface CancellationDetails {
  reason: string;
  reason_label: string;
  note: string | null;
  cancelled_at: string;
}

interface OrderDetails {
  description?: string;
  cancellation?: CancellationDetails;
  [key: string]: unknown;
}

interface Order {
  id: string;
  service_type: ServiceType;
  status: OrderStatus;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  rider_id: string | null;
  details: OrderDetails;
  estimated_price: number | null;
  payment_method: string;
  payment_status: "pending" | "paid" | "cod" | "failed";
  created_at: string;
}

const PAYMENT_BADGES: Record<Order["payment_status"], { label: string; className: string }> = {
  pending: { label: "Payment pending", className: "bg-warning/15 text-warning border-warning/30" },
  paid: { label: "Paid", className: "bg-success/15 text-success border-success/30" },
  cod: { label: "Cash on delivery", className: "bg-accent/15 text-accent-foreground border-accent/30" },
  failed: { label: "Payment failed", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My Orders — HatodGo" },
      { name: "description", content: "Track your HatodGo orders and ride bookings." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, service_type, status, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, rider_id, details, estimated_price, payment_method, payment_status, created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      setOrders((data as Order[]) ?? []);
    };
    load();

    const channel = supabase
      .channel("orders-customer")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loading, navigate]);

  return (
    <PageShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">My Orders</h1>
            <p className="mt-1 text-muted-foreground">All your HatodGo orders in one place.</p>
          </div>
          <Button asChild>
            <Link to="/">New order <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>

        <div className="mt-8">
          {orders === null ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div
              className="rounded-2xl border border-border/60 p-10 text-center"
              style={{ background: "var(--gradient-card)" }}
            >
              <Package className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 font-display text-lg font-semibold">No orders yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">Start by picking a service.</p>
              <Button asChild className="mt-6">
                <Link to="/">Browse services</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((o) => {
                const pickup = o.pickup_lat != null && o.pickup_lng != null ? { lat: o.pickup_lat, lng: o.pickup_lng } : null;
                const dropoff = o.dropoff_lat != null && o.dropoff_lng != null ? { lat: o.dropoff_lat, lng: o.dropoff_lng } : null;
                return (
                  <article
                    key={o.id}
                    className="rounded-2xl border border-border/60 p-5"
                    style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-base font-semibold">{SERVICE_LABELS[o.service_type]}</span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status]}`}>
                          {STATUS_LABELS[o.status]}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
                        <div>
                          <p className="text-xs text-muted-foreground">Pickup</p>
                          <p className="font-medium">{o.pickup_address}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <div>
                          <p className="text-xs text-muted-foreground">Drop-off</p>
                          <p className="font-medium">{o.dropoff_address}</p>
                        </div>
                      </div>
                    </div>

                    {o.details?.description && (
                      <p className="mt-3 rounded-lg bg-secondary/40 p-3 text-sm text-muted-foreground">
                        {o.details.description}
                      </p>
                    )}

                    {o.estimated_price !== null && (
                      <p className="mt-3 text-sm">
                        Estimated: <span className="font-semibold">₱{Number(o.estimated_price).toFixed(2)}</span>
                      </p>
                    )}

                    {(pickup || dropoff) && (
                      <OrderTracker
                        orderId={o.id}
                        riderId={o.rider_id}
                        pickup={pickup}
                        dropoff={dropoff}
                        status={o.status}
                      />
                    )}

                    {o.status === "cancelled" && o.details?.cancellation && (
                      <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                          Cancellation reason
                        </p>
                        <p className="mt-1 font-medium">{o.details.cancellation.reason_label}</p>
                        {o.details.cancellation.note && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            “{o.details.cancellation.note}”
                          </p>
                        )}
                      </div>
                    )}

                    {o.status === "pending" && (
                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setCancelTarget(o)}
                        >
                          <X className="h-4 w-4" /> Cancel order
                        </Button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CancelOrderDialog
        open={cancelTarget !== null}
        onOpenChange={(next) => !next && setCancelTarget(null)}
        orderId={cancelTarget?.id ?? ""}
        existingDetails={cancelTarget?.details ?? null}
        riderId={cancelTarget?.rider_id ?? null}
        pickupAddress={cancelTarget?.pickup_address ?? null}
        dropoffAddress={cancelTarget?.dropoff_address ?? null}
      />
    </PageShell>
  );
}
