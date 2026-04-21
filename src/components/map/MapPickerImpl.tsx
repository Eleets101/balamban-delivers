import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Crosshair, Loader2 } from "lucide-react";

// Fix Leaflet default icon paths in bundled builds
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Default center: Balamban, Cebu
const DEFAULT_CENTER: [number, number] = [10.4456, 123.7016];

interface MapPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
  height?: number;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function Recenter({ coords }: { coords: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.setView(coords, Math.max(map.getZoom(), 15), { animate: true });
  }, [coords, map]);
  return null;
}

export function MapPicker({ value, onChange, height = 260 }: MapPickerProps) {
  const [locating, setLocating] = useState(false);
  const [center, setCenter] = useState<[number, number]>(
    value ? [value.lat, value.lng] : DEFAULT_CENTER,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const mapId = useId();

  const useCurrent = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(next);
        setCenter([next.lat, next.lng]);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const markerPos = useMemo<[number, number] | null>(
    () => (value ? [value.lat, value.lng] : null),
    [value],
  );

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-border/60"
        style={{ height }}
      >
        <MapContainer
          key={mapId}
          id={`map-picker-${mapId.replace(/:/g, "")}`}
          center={center}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler
            onPick={(lat, lng) => {
              onChange({ lat, lng });
              setCenter([lat, lng]);
            }}
          />
          {markerPos && (
            <Marker
              position={markerPos}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const p = m.getLatLng();
                  onChange({ lat: p.lat, lng: p.lng });
                },
              }}
            />
          )}
          <Recenter coords={markerPos} />
        </MapContainer>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {value
            ? `Pinned: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
            : "Tap the map to pin a location"}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={useCurrent} disabled={locating}>
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          Use my location
        </Button>
      </div>
    </div>
  );
}
