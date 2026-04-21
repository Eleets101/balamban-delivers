import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pinIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:18px;height:18px;border-radius:9999px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const driverIcon = L.divIcon({
  className: "",
  html: `<div style="background:hsl(280 90% 60%);width:24px;height:24px;border-radius:9999px;border:3px solid white;box-shadow:0 0 0 4px hsl(280 90% 60% / .3),0 4px 12px rgba(0,0,0,.5);position:relative">
    <div style="position:absolute;inset:0;border-radius:9999px;background:hsl(280 90% 60%);animation:pulse 1.6s ease-out infinite;opacity:.6"></div>
  </div>
  <style>@keyframes pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.2);opacity:0}}</style>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface LiveTrackingMapProps {
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  driver: { lat: number; lng: number } | null;
  height?: number;
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [points, map]);
  return null;
}

export function LiveTrackingMap({ pickup, dropoff, driver, height = 320 }: LiveTrackingMapProps) {
  const points = useMemo<Array<[number, number]>>(() => {
    const arr: Array<[number, number]> = [];
    if (pickup) arr.push([pickup.lat, pickup.lng]);
    if (dropoff) arr.push([dropoff.lat, dropoff.lng]);
    if (driver) arr.push([driver.lat, driver.lng]);
    return arr;
  }, [pickup, dropoff, driver]);

  const center = points[0] ?? [10.4456, 123.7016];
  const routeLine = pickup && dropoff ? [
    [pickup.lat, pickup.lng] as [number, number],
    [dropoff.lat, dropoff.lng] as [number, number],
  ] : [];

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="overflow-hidden rounded-xl border border-border/60" style={{ height }}>
      <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pickup && (
          <Marker position={[pickup.lat, pickup.lng]} icon={pinIcon("hsl(160 84% 45%)")}>
            <Popup>Pickup</Popup>
          </Marker>
        )}
        {dropoff && (
          <Marker position={[dropoff.lat, dropoff.lng]} icon={pinIcon("hsl(20 90% 55%)")}>
            <Popup>Drop-off</Popup>
          </Marker>
        )}
        {driver && (
          <Marker position={[driver.lat, driver.lng]} icon={driverIcon}>
            <Popup>Your rider is here</Popup>
          </Marker>
        )}
        {routeLine.length === 2 && (
          <Polyline positions={routeLine} pathOptions={{ color: "hsl(280 90% 60%)", weight: 3, dashArray: "6 6", opacity: 0.7 }} />
        )}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
