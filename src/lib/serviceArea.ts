// Service area definitions for HatodGo coverage zones.
//
// We use rough circular zones (center + radius_km) rather than full polygons
// because Balamban/Toledo/Asturias are still being mapped in detail. This is
// good enough for "are we serving this address?" and runs in pure JS with no
// heavy geo library.

import { haversineM } from "@/lib/geo";

export interface ServiceZone {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  radiusKm: number;
  /** stroke + fill color for the map circle */
  color: string;
}

export const SERVICE_ZONES: ServiceZone[] = [
  {
    id: "balamban",
    name: "Balamban",
    center: { lat: 10.4456, lng: 123.7016 },
    radiusKm: 12,
    color: "hsl(280 90% 60%)",
  },
  {
    id: "toledo",
    name: "Toledo City",
    center: { lat: 10.3778, lng: 123.6386 },
    radiusKm: 10,
    color: "hsl(200 85% 55%)",
  },
  {
    id: "asturias",
    name: "Asturias",
    center: { lat: 10.5667, lng: 123.7167 },
    radiusKm: 8,
    color: "hsl(160 84% 45%)",
  },
];

/** Returns the zone covering the coordinate, or null if outside all zones. */
export function zoneFor(coord: { lat: number; lng: number }): ServiceZone | null {
  for (const z of SERVICE_ZONES) {
    const distM = haversineM(coord, z.center);
    if (distM <= z.radiusKm * 1000) return z;
  }
  return null;
}

export function isInServiceArea(coord: { lat: number; lng: number }): boolean {
  return zoneFor(coord) !== null;
}

/**
 * Build a GeoJSON FeatureCollection of polygon approximations for each zone.
 * 64-side regular polygon ≈ smooth circle on the map at city zoom levels.
 */
export function zonesAsGeoJSON(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = SERVICE_ZONES.map((zone) => {
    const ring: [number, number][] = [];
    const steps = 64;
    const R = 6371; // km
    const latRad = (zone.center.lat * Math.PI) / 180;
    for (let i = 0; i <= steps; i++) {
      const bearing = (i / steps) * Math.PI * 2;
      const dLat = (zone.radiusKm / R) * Math.cos(bearing);
      const dLng =
        (zone.radiusKm / R) * Math.sin(bearing) / Math.cos(latRad);
      const lat = zone.center.lat + (dLat * 180) / Math.PI;
      const lng = zone.center.lng + (dLng * 180) / Math.PI;
      ring.push([lng, lat]);
    }
    return {
      type: "Feature",
      properties: { id: zone.id, name: zone.name, color: zone.color },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  });
  return { type: "FeatureCollection", features };
}
