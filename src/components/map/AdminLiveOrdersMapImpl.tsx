import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE_URL } from "@/lib/geo";
import type { OrderStatus } from "@/lib/orders";

export interface AdminMapOrder {
  id: string;
  status: OrderStatus;
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
}

export interface AdminMapRider {
  id: string;
  name?: string | null;
  coords: { lat: number; lng: number };
}

interface AdminLiveOrdersMapProps {
  orders: AdminMapOrder[];
  riders: AdminMapRider[];
  height?: number;
  /** When set, only show orders matching this status (or "all"). */
  statusFilter?: OrderStatus | "all";
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "hsl(45 95% 55%)",      // amber — needs a rider
  accepted: "hsl(220 90% 60%)",    // blue — rider on the way
  in_progress: "hsl(280 90% 60%)", // purple — in transit
  completed: "hsl(160 80% 45%)",   // green — done
  cancelled: "hsl(0 75% 55%)",     // red
};

function pinElement(color: string, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "26px";
  el.style.height = "32px";
  el.title = label;
  el.innerHTML = `
    <svg viewBox="0 0 30 40" width="26" height="32" style="overflow:visible;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11.3 15 25 15 25s15-13.7 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
      <circle cx="15" cy="15" r="5" fill="white"/>
    </svg>`;
  return el;
}

function riderElement(label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.title = label;
  el.style.width = "30px";
  el.style.height = "30px";
  el.innerHTML = `
    <div style="position:relative;width:30px;height:30px;border-radius:9999px;background:hsl(200 90% 55%);border:3px solid white;box-shadow:0 0 0 2px hsl(200 90% 55% / .35), 0 4px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 18 9 9h6l3 5"/><path d="M11 5h4l1 4"/></svg>
    </div>`;
  return el;
}

export function AdminLiveOrdersMap({
  orders,
  riders,
  height = 480,
  statusFilter = "all",
}: AdminLiveOrdersMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const fittedOnceRef = useRef(false);

  const visibleOrders = useMemo(
    () => (statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [123.7016, 10.4456],
      zoom: 10,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    setTimeout(() => map.resize(), 60);
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-render markers whenever data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const points: Array<[number, number]> = [];

    visibleOrders.forEach((o) => {
      const color = STATUS_COLOR[o.status];
      if (o.pickup) {
        const m = new maplibregl.Marker({
          element: pinElement(color, `Pickup · ${o.status}`),
          anchor: "bottom",
        })
          .setLngLat([o.pickup.lng, o.pickup.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 24, closeButton: false }).setHTML(
              `<div style="font-size:12px"><strong>Pickup</strong><br/>${o.status}</div>`,
            ),
          )
          .addTo(map);
        markersRef.current.push(m);
        points.push([o.pickup.lng, o.pickup.lat]);
      }
      if (o.dropoff) {
        const m = new maplibregl.Marker({
          element: pinElement(color, `Drop-off · ${o.status}`),
          anchor: "bottom",
        })
          .setLngLat([o.dropoff.lng, o.dropoff.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 24, closeButton: false }).setHTML(
              `<div style="font-size:12px"><strong>Drop-off</strong><br/>${o.status}</div>`,
            ),
          )
          .addTo(map);
        markersRef.current.push(m);
        points.push([o.dropoff.lng, o.dropoff.lat]);
      }
    });

    riders.forEach((r) => {
      const m = new maplibregl.Marker({
        element: riderElement(r.name ?? "Rider"),
        anchor: "center",
      })
        .setLngLat([r.coords.lng, r.coords.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
            `<div style="font-size:12px"><strong>Rider</strong><br/>${r.name ?? "Online"}</div>`,
          ),
        )
        .addTo(map);
      markersRef.current.push(m);
      points.push([r.coords.lng, r.coords.lat]);
    });

    // Fit on first paint with data, then leave admin-controlled view alone.
    if (!fittedOnceRef.current && points.length > 0) {
      if (points.length === 1) {
        map.easeTo({ center: points[0], zoom: 13 });
      } else {
        const bounds = points.reduce(
          (b, p) => b.extend(p),
          new maplibregl.LngLatBounds(points[0], points[0]),
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
      }
      fittedOnceRef.current = true;
    }
  }, [visibleOrders, riders]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-border/60"
        style={{ height }}
      />
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(["pending", "accepted", "in_progress", "completed", "cancelled"] as OrderStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: STATUS_COLOR[s] }}
            />
            {s.replace("_", " ")}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-[hsl(200_90%_55%)]" />
          rider online
        </span>
      </div>
    </div>
  );
}
