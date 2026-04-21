import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bike, Loader2, MapPin, Navigation, Power, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiveTrackingMap } from "@/components/map/LiveTrackingMap.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import { SERVICE_LABELS, STATUS_LABELS, STATUS_COLORS, type OrderStatus, type ServiceType } from "@/lib/orders";
import { estimateEta, etaTargetForStatus } from "@/lib/eta";

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "Driver Dashboard — HatodGo" },
      { name: "description", content: "Accept orders, share live location, and navigate to customers." },
    ],
  }),
  component: DriverPage,
});

interface DriverOrder {
  id: string;
  customer_id: string;
  rider_id: string | null;
  service_type: ServiceType;
  status: OrderStatus;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  estimated_price: number | null;
  details: { description?: string };
  notes: string | null;
  created_at: string;
}

function DriverPage() {
  const { user, loading, isRider, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<DriverOrder[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const activeOrderIdRef = useRef<string | null>(null);

  const allowed = isRider || isAdmin;

  const refresh = async () => {
    // Available (pending, no rider) + my assigned active orders
    const { data } = await supabase
      .from("orders")
      .select("id, customer_id, rider_id, service_type, status, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, estimated_price, details, notes, created_at")
      .or(`status.eq.pending,rider_id.eq.${user?.id ?? "00000000-0000-0000-0000-000000000000"}`)
      .order("created_at", { ascending: false })
      .limit(50);
    setOrders((data as DriverOrder[]) ?? []);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!allowed) return;
    refresh();

    const channel = supabase
      .channel("driver-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
      .subscribe();

    const notifChannel = supabase
      .channel(`driver-notifs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as { type: string; title: string; body: string | null };
          if (n.type === "order_cancelled") {
            toast.warning(n.title, { description: n.body ?? undefined, duration: 10_000 });
          } else {
            toast(n.title, { description: n.body ?? undefined });
          }
          refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(notifChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, allowed, navigate]);

  // Track active order (the most recent accepted/in_progress one)
  useEffect(() => {
    const active = orders?.find((o) => o.rider_id === user?.id && (o.status === "accepted" || o.status === "in_progress"));
    activeOrderIdRef.current = active?.id ?? null;
  }, [orders, user]);

  // Push driver location every time it updates while sharing
  useEffect(() => {
    if (!sharing || !user) return;
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation is not available on this device.");
      setSharing(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyCoords(c);
        const { error } = await supabase.from("driver_locations").upsert(
          {
            rider_id: user.id,
            order_id: activeOrderIdRef.current,
            lat: c.lat,
            lng: c.lng,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
            accuracy: pos.coords.accuracy ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "rider_id" },
        );
        if (error) console.error("location upsert failed", error.message);
      },
      (err) => {
        toast.error(err.message);
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [sharing, user]);

  const acceptOrder = async (o: DriverOrder) => {
    if (!user) return;
    const { error } = await supabase
      .from("orders")
      .update({ status: "accepted", rider_id: user.id })
      .eq("id", o.id)
      .eq("status", "pending");
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Order accepted");
    refresh();
  };

  const updateStatus = async (id: string, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Order marked ${STATUS_LABELS[status]}`);
    refresh();
  };

  const openInMaps = (target: { lat: number; lng: number }) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (!allowed) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-bold">Riders only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask an admin to grant you the <code>rider</code> role to access the driver dashboard.
          </p>
        </div>
      </PageShell>
    );
  }

  const available = orders?.filter((o) => o.status === "pending") ?? [];
  const mine = orders?.filter((o) => o.rider_id === user?.id && o.status !== "completed" && o.status !== "cancelled") ?? [];

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              <Bike className="inline h-7 w-7 text-primary-glow" /> Driver Dashboard
            </h1>
            <p className="mt-1 text-muted-foreground">Accept orders and share your live location.</p>
          </div>
          <Button
            onClick={() => setSharing((v) => !v)}
            variant={sharing ? "default" : "outline"}
            className={sharing ? "shadow-[var(--shadow-glow)]" : ""}
          >
            <Power className="h-4 w-4" /> {sharing ? "Sharing location — go offline" : "Go online & share location"}
          </Button>
        </div>

        {sharing && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary-glow">
            Live: your location is being broadcast to assigned customers. Keep this tab open while driving.
            {myCoords && (
              <span className="ml-2 text-muted-foreground">
                ({myCoords.lat.toFixed(5)}, {myCoords.lng.toFixed(5)})
              </span>
            )}
          </div>
        )}

        {/* My active orders */}
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">My active orders</h2>
          <div className="mt-3 space-y-4">
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active orders. Accept one below.</p>
            ) : (
              mine.map((o) => {
                const pickup = o.pickup_lat != null && o.pickup_lng != null ? { lat: o.pickup_lat, lng: o.pickup_lng } : null;
                const dropoff = o.dropoff_lat != null && o.dropoff_lng != null ? { lat: o.dropoff_lat, lng: o.dropoff_lng } : null;
                return (
                  <article key={o.id} className="rounded-2xl border border-border/60 p-5" style={{ background: "var(--gradient-card)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-base font-semibold">{SERVICE_LABELS[o.service_type]}</span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status]}`}>
                          {STATUS_LABELS[o.status]}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</span>
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

                    {(pickup || dropoff) && (
                      <div className="mt-4">
                        <MapClientOnly>
                          <LiveTrackingMap pickup={pickup} dropoff={dropoff} driver={myCoords} height={260} />
                        </MapClientOnly>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {pickup && (
                        <Button size="sm" variant="outline" onClick={() => openInMaps(pickup)}>
                          <Navigation className="h-4 w-4" /> Navigate to pickup
                        </Button>
                      )}
                      {dropoff && (
                        <Button size="sm" variant="outline" onClick={() => openInMaps(dropoff)}>
                          <Navigation className="h-4 w-4" /> Navigate to drop-off
                        </Button>
                      )}
                      {o.status === "accepted" && (
                        <Button size="sm" onClick={() => updateStatus(o.id, "in_progress")}>
                          Start trip
                        </Button>
                      )}
                      {o.status === "in_progress" && (
                        <Button size="sm" onClick={() => updateStatus(o.id, "completed")}>
                          Mark completed
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Available orders */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Available orders</h2>
          <div className="mt-3 space-y-3">
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending orders right now.</p>
            ) : (
              available.map((o) => (
                <article key={o.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 p-4" style={{ background: "var(--gradient-card)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{SERVICE_LABELS[o.service_type]}</Badge>
                      {o.estimated_price && <span className="text-sm font-semibold">₱{Number(o.estimated_price).toFixed(2)}</span>}
                    </div>
                    <p className="mt-2 truncate text-sm"><span className="text-muted-foreground">From:</span> {o.pickup_address}</p>
                    <p className="truncate text-sm"><span className="text-muted-foreground">To:</span> {o.dropoff_address}</p>
                  </div>
                  <Button size="sm" onClick={() => acceptOrder(o)}>Accept</Button>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
