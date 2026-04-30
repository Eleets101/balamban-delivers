import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Crosshair, Loader2 } from "lucide-react";
import { DEFAULT_CENTER, MAP_STYLE_URL, reverseGeocode } from "@/lib/geo";

interface MapPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
  onAddressResolved?: (address: string) => void;
  height?: number;
}

function buildPinElement(color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "30px";
  el.style.height = "30px";
  el.style.cursor = "grab";
  el.innerHTML = `
    <svg viewBox="0 0 30 40" width="30" height="40" style="overflow:visible;filter:drop-shadow(0 4px 6px rgba(0,0,0,.4))">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11.3 15 25 15 25s15-13.7 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
      <circle cx="15" cy="15" r="6" fill="white"/>
    </svg>`;
  return el;
}

export function MapPicker({ value, onChange, onAddressResolved, height = 280 }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onAddressResolvedRef.current = onAddressResolved;
  }, [onChange, onAddressResolved]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = value ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [start.lng, start.lat],
      zoom: value ? 15 : 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (e) => {
      onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    mapRef.current = map;
    setTimeout(() => map.resize(), 60);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync draggable marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({
        element: buildPinElement("hsl(280 90% 60%)"),
        draggable: true,
        anchor: "bottom",
      })
        .setLngLat([value.lng, value.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        onChangeRef.current({ lat: ll.lat, lng: ll.lng });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([value.lng, value.lat]);
    }
    map.easeTo({ center: [value.lng, value.lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
  }, [value]);

  // Reverse-geocode whenever the pin moves
  useEffect(() => {
    if (!value || !onAddressResolvedRef.current) return;
    let cancelled = false;
    setResolving(true);
    reverseGeocode(value.lat, value.lng).then((addr) => {
      if (cancelled) return;
      setResolving(false);
      if (addr && onAddressResolvedRef.current) onAddressResolvedRef.current(addr);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const useCurrent = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChangeRef.current({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-border/60"
        style={{ height }}
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {resolving
            ? "Resolving address…"
            : value
              ? "Drag the pin or tap the map to fine-tune"
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
