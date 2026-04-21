import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LiveTrackingMap } from "@/components/map/LiveTrackingMap.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import { Button } from "@/components/ui/button";
import { Navigation } from "lucide-react";

interface OrderTrackerProps {
  orderId: string;
  riderId: string | null;
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  status: string;
}

export function OrderTracker({ orderId, riderId, pickup, dropoff, status }: OrderTrackerProps) {
  const [driver, setDriver] = useState<{ lat: number; lng: number } | null>(null);

  const isActive = status === "accepted" || status === "in_progress";

  useEffect(() => {
    if (!isActive || !riderId) {
      setDriver(null);
      return;
    }
    let cancelled = false;
    // Initial fetch — filter by order_id so the customer RLS policy
    // ("Customers view driver location for own order") permits the read.
    supabase
      .from("driver_locations")
      .select("lat, lng")
      .eq("order_id", orderId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setDriver({ lat: data.lat, lng: data.lng });
      });

    const channel = supabase
      .channel(`driver-loc-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations", filter: `order_id=eq.${orderId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { lat?: number; lng?: number } | null;
          if (row?.lat != null && row?.lng != null) setDriver({ lat: row.lat, lng: row.lng });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId, riderId, isActive]);

  const openInMaps = (target: { lat: number; lng: number }) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  if (!pickup && !dropoff) return null;

  return (
    <div className="mt-4 space-y-3">
      <MapClientOnly>
        <LiveTrackingMap pickup={pickup} dropoff={dropoff} driver={driver} height={280} />
      </MapClientOnly>
      <div className="flex flex-wrap gap-2">
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
      </div>
      {isActive && riderId && (
        <p className="text-xs text-muted-foreground">
          {driver ? "Live: rider location updates in real time." : "Waiting for rider location…"}
        </p>
      )}
    </div>
  );
}
