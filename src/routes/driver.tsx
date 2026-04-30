import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Bike, Loader2, MapPin, Navigation, Power, ShieldAlert, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LiveTrackingMap } from "@/components/map/LiveTrackingMap.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import { DriverEarningsBar } from "@/components/DriverEarningsBar";
import { playNewOrderAlert, unlockAlertSound } from "@/lib/alerts";
import { googleMapsUrl, wazeUrl } from "@/lib/geo";
import { SERVICE_LABELS, STATUS_LABELS, STATUS_COLORS, type OrderStatus, type ServiceType } from "@/lib/orders";
import {
  adaptiveRefreshMs,
  estimateEta,
  etaTargetForStatus,
  LOCATION_BUFFER_SIZE,
  pushLocationSample,
  smoothedSpeedMps,
  speedVariance,
  type LocationSample,
} from "@/lib/eta";

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "Driver Dashboard — HatodGo" },
      { name: "description", content: "Accept orders, share live location, and navigate to customers." },
    ],
  }),
  component: DriverPage,
});

type TripStage = "enroute_pickup" | "arrived_pickup" | "picked_up" | "completed";

interface CustomerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
}

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
  payment_method: string | null;
  details: { description?: string; trip_stage?: TripStage };
  notes: string | null;
  created_at: string;
}

function DriverPage() {
  const { user, loading, isRider, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<DriverOrder[] | null>(null);
  const [customers, setCustomers] = useState<Record<string, CustomerProfile>>({});
  const [sharing, setSharing] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [myHistory, setMyHistory] = useState<LocationSample[]>([]);
  const [adaptive, setAdaptive] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [, setTick] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const activeOrderIdRef = useRef<string | null>(null);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const soundOnRef = useRef(true);

  const allowed = isRider || isAdmin;
  const mySmoothedMps = smoothedSpeedMps(myHistory);
  const myVariance = speedVariance(myHistory);
  const refreshSec = Math.round((adaptive ? adaptiveRefreshMs(myVariance) : 30_000) / 1000);
  const isFastRefresh = adaptive && myVariance != null && myVariance >= 0.3;

  // Keep latest sound preference accessible inside realtime callbacks
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  // Fetch customer profiles for active orders (name + phone for call/chat)
  useEffect(() => {
    if (!user || !orders) return;
    const activeIds = Array.from(
      new Set(
        orders
          .filter((o) => o.rider_id === user.id && o.status !== "completed" && o.status !== "cancelled")
          .map((o) => o.customer_id),
      ),
    );
    const missing = activeIds.filter((id) => !customers[id]);
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", missing);
      if (!data) return;
      setCustomers((prev) => {
        const next = { ...prev };
        for (const p of data) next[p.id] = p as CustomerProfile;
        return next;
      });
    })();
  }, [orders, user, customers]);

  // Tick every second so available-order countdown timers re-render
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Adaptive ETA tick — recomputes ETA labels on a cadence driven by speed variance.
  useEffect(() => {
    if (!sharing) return;
    const intervalMs = adaptive ? adaptiveRefreshMs(myVariance) : 30_000;
    const id = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [sharing, adaptive, myVariance]);

  const refresh = async () => {
    // Available (pending, no rider) + my assigned active orders
    const { data } = await supabase
      .from("orders")
      .select("id, customer_id, rider_id, service_type, status, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, estimated_price, payment_method, details, notes, created_at")
      .or(`status.eq.pending,rider_id.eq.${user?.id ?? "00000000-0000-0000-0000-000000000000"}`)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data as DriverOrder[]) ?? [];
    // Seed seen-set on first load so we don't alert for pre-existing orders
    if (seenOrderIdsRef.current.size === 0 && list.length > 0) {
      list.forEach((o) => seenOrderIdsRef.current.add(o.id));
    }
    setOrders(list);
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as { id: string; status: OrderStatus; service_type: ServiceType; estimated_price: number | null };
          if (row.status === "pending" && !seenOrderIdsRef.current.has(row.id)) {
            seenOrderIdsRef.current.add(row.id);
            playNewOrderAlert({ sound: soundOnRef.current, vibrate: true });
            toast.success("New order available!", {
              description: `${SERVICE_LABELS[row.service_type]} · ₱${Number(row.estimated_price ?? 0).toFixed(0)}`,
              duration: 6000,
            });
          }
          refresh();
        },
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => refresh())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, () => refresh())
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
        const nowIso = new Date().toISOString();
        setMyCoords(c);
        setMyHistory((prev) =>
          pushLocationSample(
            prev,
            { lat: c.lat, lng: c.lng, speed: pos.coords.speed ?? null, updated_at: nowIso },
            LOCATION_BUFFER_SIZE,
          ),
        );
        const { error } = await supabase.from("driver_locations").upsert(
          {
            rider_id: user.id,
            order_id: activeOrderIdRef.current,
            lat: c.lat,
            lng: c.lng,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
            accuracy: pos.coords.accuracy ?? null,
            updated_at: nowIso,
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
      setMyHistory([]);
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

  const STAGE_LABELS: Record<TripStage, string> = {
    enroute_pickup: "En route to pickup",
    arrived_pickup: "Arrived at pickup",
    picked_up: "Picked up — heading to drop-off",
    completed: "Delivered",
  };

  const advanceStage = async (o: DriverOrder, next: TripStage) => {
    const newDetails = { ...(o.details ?? {}), trip_stage: next };
    const patch: { details: typeof newDetails; status?: OrderStatus } = { details: newDetails };
    if (next === "picked_up") patch.status = "in_progress";
    if (next === "completed") patch.status = "completed";
    const { error } = await supabase.from("orders").update(patch).eq("id", o.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(STAGE_LABELS[next]);
    refresh();
  };

  const openGoogle = (target: { lat: number; lng: number }) => window.open(googleMapsUrl(target), "_blank");
  const openWaze = (target: { lat: number; lng: number }) => window.open(wazeUrl(target), "_blank");

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
          <button
            type="button"
            onClick={() =>
              setSharing((v) => {
                const next = !v;
                setSessionStartedAt(next ? Date.now() : null);
                return next;
              })
            }
            aria-pressed={sharing}
            className={`group relative flex min-w-[260px] items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all ${
              sharing
                ? "border-success/60 bg-success/10 shadow-[0_0_0_4px_color-mix(in_oklab,var(--success)_25%,transparent),0_10px_40px_-10px_color-mix(in_oklab,var(--success)_60%,transparent)]"
                : "border-border/60 bg-muted/30 hover:border-border"
            }`}
          >
            <span className="relative flex h-12 w-12 items-center justify-center">
              {sharing && (
                <span className="absolute inset-0 animate-ping rounded-full bg-success/40" aria-hidden />
              )}
              <span
                className={`relative flex h-12 w-12 items-center justify-center rounded-full ${
                  sharing ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <Power className="h-5 w-5" />
              </span>
            </span>
            <span className="flex flex-col">
              <span className={`font-display text-lg font-bold leading-tight ${sharing ? "text-success" : "text-foreground"}`}>
                {sharing ? "🟢 ONLINE" : "⚫ OFFLINE"}
              </span>
              <span className="text-xs text-muted-foreground">
                {sharing ? "Receiving orders · tap to go offline" : "Tap to go online & share location"}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSoundOn((v) => {
                const next = !v;
                if (next) void unlockAlertSound();
                return next;
              });
            }}
            aria-pressed={soundOn}
            title={soundOn ? "Sound alerts on — tap to mute" : "Sound alerts off — tap to enable"}
            className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
              soundOn
                ? "border-primary/40 bg-primary/10 text-primary-glow"
                : "border-border/60 bg-muted/30 text-muted-foreground"
            }`}
          >
            {soundOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </button>
        </div>

        {user && (
          <DriverEarningsBar userId={user.id} sharing={sharing} sessionStartedAt={sessionStartedAt} />
        )}

        {sharing && (
          <div className="mt-4 space-y-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary-glow">
            <div>
              Live: your location is being broadcast to assigned customers. Keep this tab open while driving.
              {myCoords && (
                <span className="ml-2 text-muted-foreground">
                  ({myCoords.lat.toFixed(5)}, {myCoords.lng.toFixed(5)})
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/20 pt-2">
              <div className="flex items-center gap-2">
                <Switch id="adaptive-eta-rider" checked={adaptive} onCheckedChange={setAdaptive} />
                <Label htmlFor="adaptive-eta-rider" className="cursor-pointer text-xs font-medium text-foreground">
                  Auto-refresh ETA faster on speed changes
                </Label>
              </div>
              <span
                className={`flex items-center gap-1 ${isFastRefresh ? "text-primary-glow" : "text-muted-foreground"}`}
                aria-live="polite"
              >
                {isFastRefresh && <Zap className="h-3 w-3" />}
                Refresh: {refreshSec}s
              </span>
            </div>
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
                const target = etaTargetForStatus(o.status, pickup, dropoff);
                const eta = myCoords && target ? estimateEta(myCoords, target.coords, { speedMps: mySmoothedMps }) : null;
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

                    {target && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                        <Navigation className="h-4 w-4 text-primary-glow" />
                        <span className="font-medium">
                          {target.label === "pickup" ? "Heading to pickup" : "Delivering to drop-off"}
                        </span>
                        <span className="text-muted-foreground">
                          {eta ? `· ${eta.label} · ${eta.km.toFixed(1)} km` : sharing ? "· locating you…" : "· go online to compute ETA"}
                        </span>
                      </div>
                    )}

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
                        <>
                          <Button size="sm" variant="outline" onClick={() => openGoogle(pickup)}>
                            <Navigation className="h-4 w-4" /> Pickup · Google
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openWaze(pickup)}>
                            <Navigation className="h-4 w-4" /> Pickup · Waze
                          </Button>
                        </>
                      )}
                      {dropoff && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openGoogle(dropoff)}>
                            <Navigation className="h-4 w-4" /> Drop-off · Google
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openWaze(dropoff)}>
                            <Navigation className="h-4 w-4" /> Drop-off · Waze
                          </Button>
                        </>
                      )}
                      {o.status === "accepted" && (
                        <Button size="sm" onClick={() => updateStatus(o.id, "in_progress")}>
                          Arrived at pickup — Start trip
                        </Button>
                      )}
                      {o.status === "in_progress" && (
                        <Button size="sm" onClick={() => updateStatus(o.id, "completed")}>
                          Mark delivered
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
          <div className="flex items-end justify-between">
            <h2 className="font-display text-xl font-bold">Available orders</h2>
            <span className="text-xs text-muted-foreground">{available.length} pending</span>
          </div>
          <div className="mt-3 space-y-3">
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending orders right now.</p>
            ) : (
              available.map((o) => {
                const pickup = o.pickup_lat != null && o.pickup_lng != null ? { lat: o.pickup_lat, lng: o.pickup_lng } : null;
                const dropoff = o.dropoff_lat != null && o.dropoff_lng != null ? { lat: o.dropoff_lat, lng: o.dropoff_lng } : null;
                const distanceToPickup = myCoords && pickup ? estimateEta(myCoords, pickup, { speedMps: mySmoothedMps }) : null;
                const tripEta = pickup && dropoff ? estimateEta(pickup, dropoff) : null;
                const payLabel = (o.payment_method ?? "cash").toLowerCase() === "gcash" ? "GCash" : "Cash on Delivery";
                const payIcon = payLabel === "GCash" ? "📱" : "💵";
                // Busy-area bonus: pickup inside a known hotspot (Balamban town, Toledo public market)
                const HOTSPOTS: Array<{ lat: number; lng: number; radiusKm: number; label: string; bonus: number }> = [
                  { lat: 10.4456, lng: 123.7016, radiusKm: 1.5, label: "Balamban town center", bonus: 10 },
                  { lat: 10.3787, lng: 123.6386, radiusKm: 1.5, label: "Toledo public market", bonus: 10 },
                ];
                const bonus = pickup
                  ? HOTSPOTS.find((h) => {
                      const eta = estimateEta(pickup, { lat: h.lat, lng: h.lng });
                      return eta != null && eta.km <= h.radiusKm;
                    })
                  : undefined;
                const fare = Number(o.estimated_price ?? 0);
                const ageMs = Date.now() - new Date(o.created_at).getTime();
                const isFresh = ageMs < 60_000;
                // 30s "act fast" countdown after order is created
                const ACCEPT_WINDOW_MS = 30_000;
                const secondsLeft = Math.max(0, Math.ceil((ACCEPT_WINDOW_MS - ageMs) / 1000));
                const showCountdown = secondsLeft > 0;
                const urgent = secondsLeft > 0 && secondsLeft <= 10;

                return (
                  <article
                    key={o.id}
                    className={`rounded-2xl border p-4 transition-all hover:shadow-[var(--shadow-glow)] ${
                      urgent
                        ? "border-destructive/60 animate-pulse"
                        : isFresh
                        ? "border-primary/50"
                        : "border-border/60 hover:border-primary/40"
                    }`}
                    style={{ background: "var(--gradient-card)" }}
                  >
                    {/* Header: service + fare */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-bold">{SERVICE_LABELS[o.service_type]}</h3>
                          {isFresh && (
                            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                              New
                            </span>
                          )}
                          {showCountdown && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                urgent
                                  ? "bg-destructive/20 text-destructive"
                                  : "bg-primary/15 text-primary-glow"
                              }`}
                              aria-live="polite"
                            >
                              ⏱ {secondsLeft}s to act
                            </span>
                          )}
                        </div>
                        {fare > 0 && (
                          <p className="mt-0.5 font-display text-2xl font-bold text-primary-glow">
                            ₱{fare.toFixed(0)} <span className="text-xs font-medium text-muted-foreground">fare</span>
                          </p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => acceptOrder(o)} className="shrink-0 shadow-[var(--shadow-glow)]">
                        Accept Order
                      </Button>
                    </div>

                    {/* Quick chips */}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {distanceToPickup && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2.5 py-1">
                          📍 {distanceToPickup.km.toFixed(1)} km away
                        </span>
                      )}
                      {tripEta && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2.5 py-1">
                          🕒 {tripEta.label} trip · {tripEta.km.toFixed(1)} km
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2.5 py-1">
                        {payIcon} {payLabel}
                      </span>
                      {bonus && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 font-semibold text-warning">
                          ⭐ Busy area bonus +₱{bonus.bonus}
                        </span>
                      )}
                    </div>

                    {/* Addresses */}
                    <div className="mt-3 space-y-1 text-sm">
                      <p className="truncate"><span className="text-muted-foreground">From:</span> {o.pickup_address}</p>
                      <p className="truncate"><span className="text-muted-foreground">To:</span> {o.dropoff_address}</p>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
