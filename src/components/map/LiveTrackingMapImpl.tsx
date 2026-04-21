import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pinDivIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:18px;height:18px;border-radius:9999px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const driverDivIcon = L.divIcon({
  className: "",
  html: `<div style="background:hsl(280 90% 60%);width:24px;height:24px;border-radius:9999px;border:3px solid white;box-shadow:0 0 0 4px hsl(280 90% 60% / .3),0 4px 12px rgba(0,0,0,.5);position:relative">
    <div style="position:absolute;inset:0;border-radius:9999px;background:hsl(280 90% 60%);animation:hatodgo-pulse 1.6s ease-out infinite;opacity:.6"></div>
  </div>
  <style>@keyframes hatodgo-pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.2);opacity:0}}</style>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface LiveTrackingMapProps {
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  driver: { lat: number; lng: number } | null;
  height?: number;
}

export function LiveTrackingMap({ pickup, dropoff, driver, height = 320 }: LiveTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [10.4456, 123.7016],
      zoom: 14,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      driverMarkerRef.current = null;
      lineRef.current = null;
    };
  }, []);

  // Sync markers + fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const upsertMarker = (
      ref: React.MutableRefObject<L.Marker | null>,
      coords: { lat: number; lng: number } | null,
      icon: L.DivIcon,
      title: string,
    ) => {
      if (!coords) {
        if (ref.current) {
          ref.current.remove();
          ref.current = null;
        }
        return;
      }
      const pos: L.LatLngExpression = [coords.lat, coords.lng];
      if (!ref.current) {
        ref.current = L.marker(pos, { icon, title }).addTo(map);
      } else {
        ref.current.setLatLng(pos);
      }
    };

    upsertMarker(pickupMarkerRef, pickup, pinDivIcon("hsl(160 84% 45%)"), "Pickup");
    upsertMarker(dropoffMarkerRef, dropoff, pinDivIcon("hsl(20 90% 55%)"), "Drop-off");
    upsertMarker(driverMarkerRef, driver, driverDivIcon, "Rider");

    // Route line
    if (pickup && dropoff) {
      const positions: L.LatLngExpression[] = [
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ];
      if (!lineRef.current) {
        lineRef.current = L.polyline(positions, {
          color: "hsl(280 90% 60%)",
          weight: 3,
          dashArray: "6 6",
          opacity: 0.7,
        }).addTo(map);
      } else {
        lineRef.current.setLatLngs(positions);
      }
    } else if (lineRef.current) {
      lineRef.current.remove();
      lineRef.current = null;
    }

    // Fit bounds
    const points: L.LatLngExpression[] = [];
    if (pickup) points.push([pickup.lat, pickup.lng]);
    if (dropoff) points.push([dropoff.lat, dropoff.lng]);
    if (driver) points.push([driver.lat, driver.lng]);
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    }
  }, [pickup, dropoff, driver]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-border/60"
      style={{ height }}
    />
  );
}
