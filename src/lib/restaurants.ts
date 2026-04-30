import { haversineKm } from "@/lib/pricing";

export type RestaurantCategory =
  | "carenderia"
  | "fast_food"
  | "snacks"
  | "drinks"
  | "pharmacy"
  | "grocery"
  | "bakery"
  | "other";

export const CATEGORY_LABELS: Record<RestaurantCategory, string> = {
  carenderia: "Carenderia",
  fast_food: "Fast Food",
  snacks: "Snacks",
  drinks: "Drinks",
  pharmacy: "Pharmacy",
  grocery: "Grocery",
  bakery: "Bakery",
  other: "Other",
};

export const CATEGORY_EMOJI: Record<RestaurantCategory, string> = {
  carenderia: "🍲",
  fast_food: "🍔",
  snacks: "🍟",
  drinks: "🥤",
  pharmacy: "💊",
  grocery: "🛒",
  bakery: "🥐",
  other: "🍴",
};

export interface Restaurant {
  id: string;
  name: string;
  slug: string | null;
  category: RestaurantCategory;
  description: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  logo_url: string | null;
  cover_url: string | null;
  open_hours: string | null;
  is_open: boolean;
  is_active: boolean;
  base_delivery_fee: number;
  per_km_fee: number;
  free_distance_km: number;
  estimated_minutes: number;
  rating: number;
  sort_order: number;
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
}

/**
 * Compute the delivery fee for a restaurant order:
 * base + max(0, distance - free_distance) * per_km, rounded up.
 */
export function calcRestaurantDeliveryFee(
  restaurant: Pick<Restaurant, "base_delivery_fee" | "per_km_fee" | "free_distance_km">,
  distanceKm: number,
): number {
  const extra = Math.max(0, distanceKm - Number(restaurant.free_distance_km));
  return Math.ceil(Number(restaurant.base_delivery_fee) + extra * Number(restaurant.per_km_fee));
}

/** Distance from restaurant to customer drop-off (km). */
export function distanceFromRestaurantKm(
  restaurant: Pick<Restaurant, "lat" | "lng">,
  drop: { lat: number; lng: number } | null,
): number | null {
  if (!drop || restaurant.lat == null || restaurant.lng == null) return null;
  return haversineKm({ lat: restaurant.lat, lng: restaurant.lng }, drop);
}

export const HATODGO_SERVICE_FEE_RATE = 0.08;
export const HATODGO_SERVICE_FEE_MIN = 8;
export const HATODGO_SERVICE_FEE_MAX = 30;

export function calcServiceFee(itemsSubtotal: number): number {
  const raw = itemsSubtotal * HATODGO_SERVICE_FEE_RATE;
  return Math.ceil(Math.max(HATODGO_SERVICE_FEE_MIN, Math.min(HATODGO_SERVICE_FEE_MAX, raw)));
}
