import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchRoute, MAP_STYLE_URL } from "@/lib/geo";

interface LiveTrackingMapProps {
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  driver: { lat: number; lng: number } | null;
  height?: number;
}

function pinEl(color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "26px";
  el.style.height = "34px";
  el.innerHTML = `
    <svg viewBox="0 0 30 40" width="26" height="34" style="overflow:visible;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11.3 15 25 15 25s15-13.7 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
      <circle cx="15" cy="15" r="5.5" fill="white"/>
    </svg>`;
  return el;
}

function driverEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "relative";
  el.style.width = "28px";
  el.style.height = "28px";
  el.innerHTML = `
    <style>
      @keyframes hatodgo-driver-pulse { 0%{transform:scale(1);opacity:.55} 100%{transform:scale(2.4);opacity:0} }
    </style>
    <div style="position:absolute;inset:0;border-radius:9999px;background:hsl(280 90% 60%);animation:hatodgo-driver-pulse 1.6s ease-out infinite"></div>
    <div style="position:relative;width:28px;height:28px;border-radius:9999px;background:hsl(280 90% 60%);border:3px solid white;box-shadow:0 0 0 2px hsl(280 90% 60% / .35), 0 4px 12px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/><path d="M16 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/><path d="M3 18h2m6 0h5m4 0h2"/><path d="M5 18V9l4-3h6l3 5h2v7"/></svg>
    </div>`;
  return el;
}

const ROUTE_LAYER = "hatodgo-route";
const ROUTE_SOURCE = "hatodgo-route-src";

export function LiveTrackingMap({ pickup, dropoff, driver, height = 280 }: LiveTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const styleReadyRef = useRef(false);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const dropoffMarkerRef = useRef<Marker | null>(null);
  const driverMarkerRef = useRef<Marker | null>(null);
  const animRef = useRef<number | null>(null);
  const animFromRef = useRef<{ lat: number; lng: number } | null>(null);
  const animToRef = useRef<{ lat: number; lng: number } | null>(null);
  const animStartRef = useRef<number>(0);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = pickup ?? dropoff ?? driver ?? { lat: 10.4456, lng: 123.7016 };
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => {
      styleReadyRef.current = true;
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "hsl(280 90% 60%)",
          "line-width": 5,
          "line-opacity": 0.85,
        },
      });
    });
    setTimeout(() => map.resize(), 60);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      driverMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync pickup/dropoff markers + fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const upsert = (
      ref: React.MutableRefObject<Marker | null>,
      coords: { lat: number; lng: number } | null,
      color: string,
    ) => {
      if (!coords) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      if (!ref.current) {
        ref.current = new maplibregl.Marker({ element: pinEl(color), anchor: "bottom" })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
      } else {
        ref.current.setLngLat([coords.lng, coords.lat]);
      }
    };

    upsert(pickupMarkerRef, pickup, "hsl(160 84% 45%)");
    upsert(dropoffMarkerRef, dropoff, "hsl(20 90% 55%)");

    const points: Array<[number, number]> = [];
    if (pickup) points.push([pickup.lng, pickup.lat]);
    if (dropoff) points.push([dropoff.lng, dropoff.lat]);
    if (driver) points.push([driver.lng, driver.lat]);
    if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: 15 });
    } else if (points.length > 1) {
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: 50, maxZoom: 16, duration: 600 });
    }
  }, [pickup, dropoff, driver]);

  // Smoothly animate driver marker between updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driver) {
      if (!driver) {
        driverMarkerRef.current?.remove();
        driverMarkerRef.current = null;
      }
      return;
    }
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new maplibregl.Marker({ element: driverEl(), anchor: "center" })
        .setLngLat([driver.lng, driver.lat])
        .addTo(map);
      return;
    }
    const current = driverMarkerRef.current.getLngLat();
    animFromRef.current = { lat: current.lat, lng: current.lng };
    animToRef.current = driver;
    animStartRef.current = performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const DURATION = 1200; // ms — matches the rough cadence of location updates
    const tick = (t: number) => {
      const from = animFromRef.current;
      const to = animToRef.current;
      if (!from || !to || !driverMarkerRef.current) return;
      const k = Math.min(1, (t - animStartRef.current) / DURATION);
      // ease-out
      const e = 1 - Math.pow(1 - k, 2);
      const lat = from.lat + (to.lat - from.lat) * e;
      const lng = from.lng + (to.lng - from.lng) * e;
      driverMarkerRef.current.setLngLat([lng, lat]);
      if (k < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [driver]);

  // Fetch + draw road-routed polyline whenever endpoints change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    const drawRoute = async () => {
      const waypoints: Array<{ lat: number; lng: number }> = [];
      if (driver) waypoints.push(driver);
      if (pickup) waypoints.push(pickup);
      if (dropoff) waypoints.push(dropoff);
      if (waypoints.length < 2) return;
      const route = await fetchRoute(waypoints);
      if (cancelled || !route) return;

      const apply = () => {
        const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (!src) return;
        src.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: route.coordinates },
        });
      };
      if (styleReadyRef.current) apply();
      else map.once("load", apply);
    };

    void drawRoute();
    return () => {
      cancelled = true;
    };
    // Only refetch when pickup/dropoff change, not on every driver tick — that would
    // hammer OSRM. The driver marker glides smoothly along the existing line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-border/60"
      style={{ height }}
    />
  );
}
