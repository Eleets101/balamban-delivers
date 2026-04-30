import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Free OpenStreetMap data via Overpass API. No API key needed.
// We search a 6km radius around Balamban town center for food-related amenities.
const BALAMBAN = { lat: 10.4456, lng: 123.7016 };
const DEFAULT_RADIUS_M = 6000;

export interface OsmPlace {
  osm_id: string; // type/id e.g. "node/1234"
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: "carenderia" | "fast_food" | "snacks" | "drinks" | "bakery" | "pharmacy" | "grocery" | "other";
  amenity: string;
  cuisine: string | null;
  phone: string | null;
  website: string | null;
  open_hours: string | null;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function mapCategory(tags: Record<string, string>): OsmPlace["category"] {
  const a = tags.amenity ?? "";
  const s = tags.shop ?? "";
  if (a === "fast_food") return "fast_food";
  if (a === "cafe" || a === "ice_cream") return "drinks";
  if (a === "bar" || a === "pub") return "drinks";
  if (a === "pharmacy" || s === "chemist") return "pharmacy";
  if (s === "bakery") return "bakery";
  if (s === "supermarket" || s === "convenience" || s === "grocery") return "grocery";
  if (a === "restaurant") {
    const cuisine = (tags.cuisine ?? "").toLowerCase();
    if (cuisine.includes("filipino") || cuisine.includes("carinderia")) return "carenderia";
    return "fast_food";
  }
  return "other";
}

function buildAddress(tags: Record<string, string>): string {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] ?? tags["addr:village"] ?? tags["addr:city"],
    tags["addr:province"] ?? tags["addr:state"],
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return "Balamban, Cebu";
}

export const searchOsmRestaurants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      radiusM: z.number().min(500).max(20000).default(DEFAULT_RADIUS_M),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // Admin gate
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "admin")) {
      throw new Error("Admin only");
    }

    const radius = data.radiusM;
    // Overpass QL: nodes/ways with amenity=restaurant|fast_food|cafe|bar|pub|ice_cream
    // or shop=bakery|supermarket|convenience|grocery|chemist within radius of Balamban.
    const query = `
[out:json][timeout:25];
(
  nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream|pharmacy)$"](around:${radius},${BALAMBAN.lat},${BALAMBAN.lng});
  nwr["shop"~"^(bakery|supermarket|convenience|grocery|chemist)$"](around:${radius},${BALAMBAN.lat},${BALAMBAN.lng});
);
out center tags;
`.trim();

    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    let json: { elements: OverpassElement[] } | null = null;
    let lastErr = "";
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (!res.ok) {
          lastErr = `${ep} -> ${res.status}`;
          continue;
        }
        json = (await res.json()) as { elements: OverpassElement[] };
        break;
      } catch (e) {
        lastErr = `${ep} -> ${(e as Error).message}`;
      }
    }
    if (!json) throw new Error(`Overpass unavailable: ${lastErr}`);

    const places: OsmPlace[] = [];
    for (const el of json.elements) {
      const tags = el.tags ?? {};
      const name = tags.name;
      if (!name) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      places.push({
        osm_id: `${el.type}/${el.id}`,
        name,
        lat,
        lng: lon,
        address: buildAddress(tags),
        category: mapCategory(tags),
        amenity: tags.amenity ?? tags.shop ?? "other",
        cuisine: tags.cuisine ?? null,
        phone: tags["contact:phone"] ?? tags.phone ?? null,
        website: tags["contact:website"] ?? tags.website ?? null,
        open_hours: tags.opening_hours ?? null,
      });
    }

    // Mark which ones are already imported
    const ids = places.map((p) => p.osm_id);
    const existing = new Set<string>();
    if (ids.length > 0) {
      const { data: rows } = await context.supabase
        .from("restaurants")
        .select("osm_id")
        .in("osm_id", ids);
      rows?.forEach((r) => r.osm_id && existing.add(r.osm_id));
    }

    return {
      places: places.map((p) => ({ ...p, alreadyImported: existing.has(p.osm_id) })),
      count: places.length,
    };
  });

export const importOsmRestaurants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      places: z
        .array(
          z.object({
            osm_id: z.string().min(1),
            name: z.string().min(1).max(200),
            lat: z.number(),
            lng: z.number(),
            address: z.string().min(1).max(500),
            category: z.enum([
              "carenderia",
              "fast_food",
              "snacks",
              "drinks",
              "bakery",
              "pharmacy",
              "grocery",
              "other",
            ]),
            phone: z.string().max(50).nullable(),
            website: z.string().max(300).nullable(),
            open_hours: z.string().max(300).nullable(),
            rating: z.number().min(0).max(5).default(0),
            review_count: z.number().int().min(0).default(0),
          }),
        )
        .min(1)
        .max(100),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!roles?.some((r) => r.role === "admin")) {
      throw new Error("Admin only");
    }

    // Insert as inactive so admin can review/add menu before publishing.
    const rows = data.places.map((p) => ({
      osm_id: p.osm_id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      category: p.category,
      phone: p.phone,
      website: p.website,
      open_hours: p.open_hours,
      rating: p.rating,
      review_count: p.review_count,
      source: "osm",
      is_active: false, // requires admin approval
      is_open: true,
    }));

    const { data: inserted, error } = await context.supabase
      .from("restaurants")
      .upsert(rows, { onConflict: "osm_id", ignoreDuplicates: true })
      .select("id, name");

    if (error) throw new Error(error.message);

    return { imported: inserted?.length ?? 0 };
  });
