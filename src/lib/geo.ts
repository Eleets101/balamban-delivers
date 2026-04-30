// Free, no-API-key geo stack for HatodGo.
//
// - Tiles/style: MapTiler's public OSM-bright demo style (no key needed for the
//   demo style; swap for a keyed style URL later if you want custom branding).
// - Autocomplete: Photon (Komoot) — free OSM-based geocoder with global coverage.
//   https://photon.komoot.io
// - Routing: OSRM public demo server — free road-routed polylines + ETA.
//   https://router.project-osrm.org
//
// All three providers are free, require no signup, and are fine for the
// scale of a barangay-level delivery app. If usage grows, you can self-host
// any of them or switch to MapTiler/Mapbox by changing the constants below.

export const MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

export const MAP_STYLE_DARK_URL =
  "https://tiles.openfreemap.org/styles/positron";

export const DEFAULT_CENTER = { lat: 10.4456, lng: 123.7016 };

export interface GeoHit {
  lat: number;
  lng: number;
  displayName: string;
  shortName: string;
  category?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    osm_value?: string;
    osm_key?: string;
    type?: string;
  };
}

function formatPhoton(f: PhotonFeature): GeoHit {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const headline =
    p.name ??
    [p.housenumber, p.street].filter(Boolean).join(" ") ??
    p.district ??
    p.city ??
    "Unnamed place";
  const tail = [p.district, p.city, p.state].filter(Boolean).join(", ");
  return {
    lat,
    lng,
    displayName: tail ? `${headline}, ${tail}` : headline,
    shortName: headline,
    category: p.osm_value,
  };
}

/** Free-text autocomplete via Photon, biased toward a coordinate. */
export async function searchPlaces(
  query: string,
  near: { lat: number; lng: number } | null = DEFAULT_CENTER,
  limit = 8,
): Promise<GeoHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "en");
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
    url.searchParams.set("location_bias_scale", "0.5");
    url.searchParams.set("zoom", "12");
  }
  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return (data.features ?? []).map(formatPhoton);
  } catch {
    return [];
  }
}

/** Reverse geocode a coordinate into a human-readable address via Photon. */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("lang", "en");
  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const first = data.features?.[0];
    return first ? formatPhoton(first).displayName : null;
  } catch {
    return null;
  }
}

export interface RouteResult {
  /** [lng, lat] pairs ready for MapLibre LineString geometry. */
  coordinates: [number, number][];
  /** Total distance in meters. */
  distanceM: number;
  /** Total duration in seconds. */
  durationS: number;
}

/**
 * Get a road-routed path between waypoints via the public OSRM demo server.
 * Falls back to a straight line if OSRM fails.
 */
export async function fetchRoute(
  waypoints: Array<{ lat: number; lng: number }>,
): Promise<RouteResult | null> {
  const valid = waypoints.filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng));
  if (valid.length < 2) return null;
  const coordsParam = valid.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return straightLine(valid);
    const data = (await res.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }>;
    };
    const route = data.routes?.[0];
    if (!route) return straightLine(valid);
    return {
      coordinates: route.geometry.coordinates,
      distanceM: route.distance,
      durationS: route.duration,
    };
  } catch {
    return straightLine(valid);
  }
}

function straightLine(waypoints: Array<{ lat: number; lng: number }>): RouteResult {
  const coords: [number, number][] = waypoints.map((w) => [w.lng, w.lat]);
  let distanceM = 0;
  for (let i = 1; i < waypoints.length; i++) {
    distanceM += haversineM(waypoints[i - 1], waypoints[i]);
  }
  // Rough 25 km/h average for a fallback ETA.
  const durationS = (distanceM / 1000 / 25) * 3600;
  return { coordinates: coords, distanceM, durationS };
}

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Build a Waze deep link for navigation. */
export function wazeUrl(target: { lat: number; lng: number }): string {
  return `https://waze.com/ul?ll=${target.lat},${target.lng}&navigate=yes`;
}

/** Build a Google Maps deep link for navigation. */
export function googleMapsUrl(target: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`;
}
