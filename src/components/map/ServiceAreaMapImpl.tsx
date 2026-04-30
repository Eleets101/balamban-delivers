import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE_URL } from "@/lib/geo";
import { SERVICE_ZONES, zonesAsGeoJSON } from "@/lib/serviceArea";

interface ServiceAreaMapProps {
  /** Optional point to highlight (e.g. user's selected pickup). */
  highlight?: { lat: number; lng: number } | null;
  height?: number;
}

const ZONE_FILL = "hatodgo-zones-fill";
const ZONE_LINE = "hatodgo-zones-line";
const ZONE_LABEL = "hatodgo-zones-label";
const ZONE_SOURCE = "hatodgo-zones-src";

/** Read-only overview of the HatodGo service zones. */
export function ServiceAreaMap({ highlight, height = 280 }: ServiceAreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [123.7016, 10.4456],
      zoom: 9.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(ZONE_SOURCE, { type: "geojson", data: zonesAsGeoJSON() });
      map.addLayer({
        id: ZONE_FILL,
        type: "fill",
        source: ZONE_SOURCE,
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: ZONE_LINE,
        type: "line",
        source: ZONE_SOURCE,
        paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.75 },
      });

      // Center label points
      map.addSource("hatodgo-zone-centers", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: SERVICE_ZONES.map((z) => ({
            type: "Feature",
            properties: { name: z.name },
            geometry: { type: "Point", coordinates: [z.center.lng, z.center.lat] },
          })),
        },
      });
      map.addLayer({
        id: ZONE_LABEL,
        type: "symbol",
        source: "hatodgo-zone-centers",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 13,
          "text-font": ["Noto Sans Regular"],
          "text-offset": [0, 0.6],
        },
        paint: {
          "text-color": "#0f0f10",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6,
        },
      });
    });

    setTimeout(() => map.resize(), 60);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync highlight marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!highlight) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const el = document.createElement("div");
    el.style.width = "20px";
    el.style.height = "20px";
    el.style.borderRadius = "9999px";
    el.style.background = "hsl(280 90% 60%)";
    el.style.border = "3px solid white";
    el.style.boxShadow = "0 0 0 3px hsl(280 90% 60% / .3), 0 4px 10px rgba(0,0,0,.4)";
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([highlight.lng, highlight.lat])
      .addTo(map);
    map.easeTo({ center: [highlight.lng, highlight.lat], zoom: 12, duration: 600 });
  }, [highlight]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-border/60"
      style={{ height }}
    />
  );
}
