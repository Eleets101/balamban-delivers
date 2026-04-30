import { useEffect, useMemo, useState } from "react";
import { Check, Circle, MapPin, Navigation, Truck, Zap } from "lucide-react";
import { googleMapsUrl, wazeUrl } from "@/lib/geo";
import { supabase } from "@/integrations/supabase/client";
import { LiveTrackingMap } from "@/components/map/LiveTrackingMap.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders";
import { DevSimulatorPanel } from "@/components/DevSimulatorPanel";
import { RiderInfoCard } from "@/components/RiderInfoCard";

interface OrderTrackerProps {
  orderId: string;
  riderId: string | null;
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  status: OrderStatus | string;
}

interface DriverLoc {
  lat: number;
  lng: number;
  speed: number | null;
  updated_at: string;
}

const TIMELINE: Array<{ status: OrderStatus; label: string; description: string; icon: typeof Circle }> = [
  { status: "pending", label: "Order placed", description: "Looking for a nearby rider.", icon: Circle },
  { status: "accepted", label: "Rider on the way", description: "Heading to your pickup point.", icon: Truck },
  { status: "in_progress", label: "On the way to drop-off", description: "Your order is in transit.", icon: Navigation },
  { status: "completed", label: "Delivered", description: "Order completed. Thanks for riding!", icon: Check },
];

const STATUS_INDEX: Record<OrderStatus, number> = {
  pending: 0,
  accepted: 1,
  in_progress: 2,
  completed: 3,
  cancelled: -1,
};

export function OrderTracker({ orderId, riderId, pickup, dropoff, status }: OrderTrackerProps) {
  const [driver, setDriver] = useState<DriverLoc | null>(null);
  const [history, setHistory] = useState<LocationSample[]>([]);
  const [tick, setTick] = useState(0); // forces ETA refresh on each interval
  const [adaptive, setAdaptive] = useState(true);

  const isActive = status === "accepted" || status === "in_progress";
  const isCancelled = status === "cancelled";

  useEffect(() => {
    if (!isActive || !riderId) {
      setDriver(null);
      setHistory([]);
      return;
    }
    let cancelled = false;
    // Seed the buffer with the most recent samples so smoothing works on first paint.
    supabase
      .from("driver_locations")
      .select("lat, lng, speed, updated_at")
      .eq("order_id", orderId)
      .order("updated_at", { ascending: false })
      .limit(LOCATION_BUFFER_SIZE)
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return;
        const ordered = [...(data as DriverLoc[])].reverse(); // oldest → newest
        setHistory(ordered);
        setDriver(ordered[ordered.length - 1]);
      });

    const channel = supabase
      .channel(`driver-loc-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations", filter: `order_id=eq.${orderId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<DriverLoc> | null;
          if (row?.lat != null && row?.lng != null) {
            const sample: DriverLoc = {
              lat: row.lat,
              lng: row.lng,
              speed: row.speed ?? null,
              updated_at: row.updated_at ?? new Date().toISOString(),
            };
            setDriver(sample);
            setHistory((prev) => pushLocationSample(prev, sample));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId, riderId, isActive]);

  const variance = useMemo(
    () => speedVariance(history),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, tick],
  );

  // Tick on an adaptive cadence based on recent speed variance.
  // When the rider's speed is changing fast (high variance), refresh ETA more often.
  const intervalMs = adaptive ? adaptiveRefreshMs(variance) : 30_000;
  const refreshSec = Math.round(intervalMs / 1000);
  const isFastRefresh = adaptive && variance != null && variance >= 0.3;
  const [countdown, setCountdown] = useState(refreshSec);

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [isActive, intervalMs]);

  // Per-second countdown to next refresh — resets whenever tick fires
  // or the interval length changes.
  useEffect(() => {
    if (!isActive) {
      setCountdown(refreshSec);
      return;
    }
    setCountdown(refreshSec);
    const id = window.setInterval(() => {
      setCountdown((n) => (n <= 1 ? refreshSec : n - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isActive, tick, refreshSec]);

  const target = etaTargetForStatus(status, pickup, dropoff);
  const smoothedMps = useMemo(
    () => smoothedSpeedMps(history),
    // tick included so stale samples drop out of the window over time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, tick],
  );
  const eta = useMemo(
    () => (driver && target ? estimateEta(driver, target.coords, { speedMps: smoothedMps }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [driver, target?.coords.lat, target?.coords.lng, target?.label, smoothedMps, tick],
  );

  const lastUpdated = useMemo(() => {
    if (!driver) return null;
    const ageSec = Math.max(0, Math.floor((Date.now() - new Date(driver.updated_at).getTime()) / 1000));
    if (ageSec < 15) return "just now";
    if (ageSec < 60) return `${ageSec}s ago`;
    const mins = Math.floor(ageSec / 60);
    return `${mins} min ago`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, tick]);

  const openGoogle = (t: { lat: number; lng: number }) => window.open(googleMapsUrl(t), "_blank");
  const openWaze = (t: { lat: number; lng: number }) => window.open(wazeUrl(t), "_blank");

  if (!pickup && !dropoff) return null;

  const currentIdx = isCancelled ? -1 : STATUS_INDEX[status as OrderStatus] ?? 0;

  return (
    <div className="mt-4 space-y-4">
      {/* Dev-only simulator (hidden in production builds) */}
      {import.meta.env.DEV && (
        <DevSimulatorPanel
          orderId={orderId}
          riderId={riderId}
          status={status}
          pickup={pickup}
          dropoff={dropoff}
        />
      )}

      {/* Rider info — name, vehicle, rating, call & chat */}
      {isActive && riderId && <RiderInfoCard riderId={riderId} />}

      {/* Live ETA banner */}
      {isActive && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 p-4"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden />
              <Truck className="relative h-5 w-5 text-primary-glow" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {target?.label === "drop-off" ? "Arriving at drop-off" : "Rider arriving in"}
              </p>
              <p className="font-display text-xl font-bold">
                {eta ? eta.label : driver ? "Calculating…" : "Waiting for rider…"}
              </p>
              {eta && (
                <p className="text-xs text-muted-foreground">
                  {eta.km.toFixed(1)} km away · updated {lastUpdated ?? "just now"}
                </p>
              )}
            </div>
          </div>
          {target && (
            <Button size="sm" variant="outline" onClick={() => openInMaps(target.coords)}>
              <Navigation className="h-4 w-4" /> Navigate to {target.label}
            </Button>
          )}
          <div className="flex w-full items-center justify-between gap-3 border-t border-border/40 pt-3 text-xs">
            <div className="flex items-center gap-2">
              <Switch id="adaptive-eta" checked={adaptive} onCheckedChange={setAdaptive} />
              <Label htmlFor="adaptive-eta" className="cursor-pointer text-xs font-medium">
                Auto-refresh ETA faster on speed changes
              </Label>
            </div>
            <span
              className={`flex items-center gap-2 ${isFastRefresh ? "text-primary-glow" : "text-muted-foreground"}`}
              aria-live="polite"
            >
              {isFastRefresh && <Zap className="h-3 w-3" />}
              <span>Next update in {countdown}s</span>
              <span className="text-muted-foreground/70">· every {refreshSec}s</span>
            </span>
          </div>
        </div>
      )}

      {/* Status timeline */}
      {!isCancelled && (
        <ol className="rounded-xl border border-border/60 p-4" style={{ background: "var(--gradient-card)" }}>
          {TIMELINE.map((step, idx) => {
            const reached = idx <= currentIdx;
            const isCurrent = idx === currentIdx;
            const Icon = step.icon;
            return (
              <li key={step.status} className="relative flex gap-3 pb-4 last:pb-0">
                {idx < TIMELINE.length - 1 && (
                  <span
                    className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px ${
                      idx < currentIdx ? "bg-primary/60" : "bg-border"
                    }`}
                    aria-hidden
                  />
                )}
                <span
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                    reached
                      ? "border-primary bg-primary/15 text-primary-glow"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {isCurrent && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${reached ? "" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Map */}
      <MapClientOnly>
        <LiveTrackingMap pickup={pickup} dropoff={dropoff} driver={driver} height={280} />
      </MapClientOnly>

      <div className="flex flex-wrap gap-2">
        {pickup && (
          <Button size="sm" variant="outline" onClick={() => openInMaps(pickup)}>
            <MapPin className="h-4 w-4" /> Pickup directions
          </Button>
        )}
        {dropoff && (
          <Button size="sm" variant="outline" onClick={() => openInMaps(dropoff)}>
            <MapPin className="h-4 w-4" /> Drop-off directions
          </Button>
        )}
      </div>

      {isActive && riderId && !driver && (
        <p className="text-xs text-muted-foreground">
          Waiting for rider location… ETA will appear once they go online.
        </p>
      )}
      {!isActive && !isCancelled && status !== "completed" && (
        <p className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{STATUS_LABELS[status as OrderStatus] ?? status}</span>
        </p>
      )}
    </div>
  );
}
