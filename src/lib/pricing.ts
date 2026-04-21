/**
 * Central pricing engine for HatodGo.
 *
 * All monetary amounts are in Philippine pesos (₱). Every calculator returns
 * a transparent breakdown that gets saved on `orders.details.fare_breakdown`
 * and rendered identically on the service page, checkout and PDF receipt so
 * the customer sees the same numbers everywhere.
 *
 * Revenue model:
 *   - Ride / Padala:       rider earns 80%, HatodGo keeps 20% of total fare
 *   - Food delivery fee:   rider earns 80%, HatodGo keeps 20%
 *   - Food service fee:    100% HatodGo (on top of delivery)
 *   - Pabili delivery fee: rider earns 80%, HatodGo keeps 20%
 *   - Pabili service fee:  100% HatodGo (on top of delivery)
 */

export const PLATFORM_COMMISSION_RATE = 0.2; // 20% on delivery/ride fares

export type ParcelSize = "small" | "medium" | "large";
export type RideType = "standard" | "express";

export interface FareBreakdown {
  base: number;
  distance_km: number;
  distance_charge: number;
  surcharges: number;
  /** Pure-margin service fee (food / pabili only). */
  service_fee: number;
  /** Goods cost the customer gave us (food / pabili only). */
  goods_subtotal: number;
  /** Total the customer pays (rider-collected part + HatodGo service fee). */
  total: number;
  /** What the rider takes home from this order. */
  rider_earnings: number;
  /** HatodGo's cut (commission + 100% of service fee). */
  platform_cut: number;
  /** Human-readable line items for receipts. */
  lines: Array<{ label: string; amount: number }>;
}

/** Haversine distance between two lat/lng points, in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ceilPeso = (n: number) => Math.ceil(n);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function splitEarnings(total: number, serviceFee: number) {
  const rideable = total - serviceFee;
  const platformCommission = rideable * PLATFORM_COMMISSION_RATE;
  const rider_earnings = ceilPeso(rideable - platformCommission);
  const platform_cut = ceilPeso(platformCommission + serviceFee);
  return { rider_earnings, platform_cut };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🛵 Ride
// ─────────────────────────────────────────────────────────────────────────────

const RIDE_RATES = {
  standard: { base: 40, perKm: 10, includedKm: 2, nightSurcharge: 10, min: 40 },
  express: { base: 55, perKm: 15, includedKm: 2, nightSurcharge: 15, min: 55 },
} as const;

function isNightTime(now: Date = new Date()) {
  const h = now.getHours();
  return h >= 22 || h < 5;
}

export function calculateRideFare(
  distanceKm: number,
  rideType: RideType,
  opts: { now?: Date } = {},
): FareBreakdown {
  const r = RIDE_RATES[rideType];
  const km = Math.max(0, distanceKm);
  const extraKm = Math.max(0, km - r.includedKm);
  const distance_charge = ceilPeso(extraKm * r.perKm);
  const night = isNightTime(opts.now);
  const surcharges = night ? r.nightSurcharge : 0;
  const rawTotal = Math.max(r.min, r.base + distance_charge + surcharges);
  const total = ceilPeso(rawTotal);

  const lines: FareBreakdown["lines"] = [
    { label: `${rideType === "express" ? "Express" : "Standard"} base (first ${r.includedKm} km)`, amount: r.base },
  ];
  if (distance_charge > 0) {
    lines.push({ label: `Distance (${extraKm.toFixed(1)} km × ₱${r.perKm})`, amount: distance_charge });
  }
  if (surcharges > 0) lines.push({ label: "Night surcharge (10 PM–5 AM)", amount: surcharges });

  const { rider_earnings, platform_cut } = splitEarnings(total, 0);

  return {
    base: r.base,
    distance_km: km,
    distance_charge,
    surcharges,
    service_fee: 0,
    goods_subtotal: 0,
    total,
    rider_earnings,
    platform_cut,
    lines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Padala
// ─────────────────────────────────────────────────────────────────────────────

const PADALA_RATES = { base: 35, perKm: 8, includedKm: 2, min: 40 };
const PARCEL_SURCHARGES: Record<ParcelSize, number> = { small: 0, medium: 15, large: 35 };
export const PARCEL_LABELS: Record<ParcelSize, string> = {
  small: "Small (≤3 kg)",
  medium: "Medium (3–10 kg)",
  large: "Large (10–20 kg)",
};

export function calculatePadalaFare(
  distanceKm: number,
  parcelSize: ParcelSize,
): FareBreakdown {
  const km = Math.max(0, distanceKm);
  const extraKm = Math.max(0, km - PADALA_RATES.includedKm);
  const distance_charge = ceilPeso(extraKm * PADALA_RATES.perKm);
  const surcharges = PARCEL_SURCHARGES[parcelSize];
  const rawTotal = Math.max(
    PADALA_RATES.min,
    PADALA_RATES.base + distance_charge + surcharges,
  );
  const total = ceilPeso(rawTotal);

  const lines: FareBreakdown["lines"] = [
    { label: `Padala base (first ${PADALA_RATES.includedKm} km)`, amount: PADALA_RATES.base },
  ];
  if (distance_charge > 0) {
    lines.push({ label: `Distance (${extraKm.toFixed(1)} km × ₱${PADALA_RATES.perKm})`, amount: distance_charge });
  }
  if (surcharges > 0) {
    lines.push({ label: `Parcel size — ${PARCEL_LABELS[parcelSize]}`, amount: surcharges });
  }

  const { rider_earnings, platform_cut } = splitEarnings(total, 0);

  return {
    base: PADALA_RATES.base,
    distance_km: km,
    distance_charge,
    surcharges,
    service_fee: 0,
    goods_subtotal: 0,
    total,
    rider_earnings,
    platform_cut,
    lines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🍔 Food
// ─────────────────────────────────────────────────────────────────────────────

const FOOD_RATES = {
  base: 25,
  perKm: 7,
  includedKm: 2,
  minDelivery: 25,
  serviceRate: 0.08,
  serviceMin: 8,
  serviceMax: 30,
};

export function calculateFoodFare(
  distanceKm: number,
  foodBudget: number,
): FareBreakdown {
  const km = Math.max(0, distanceKm);
  const extraKm = Math.max(0, km - FOOD_RATES.includedKm);
  const distance_charge = ceilPeso(extraKm * FOOD_RATES.perKm);
  const deliveryFee = Math.max(FOOD_RATES.minDelivery, FOOD_RATES.base + distance_charge);
  const goods = Math.max(0, foodBudget);
  const service_fee = ceilPeso(
    clamp(goods * FOOD_RATES.serviceRate, FOOD_RATES.serviceMin, FOOD_RATES.serviceMax),
  );
  const total = ceilPeso(goods + deliveryFee + service_fee);

  const lines: FareBreakdown["lines"] = [];
  if (goods > 0) lines.push({ label: "Food budget", amount: goods });
  lines.push({ label: `Delivery fee (first ${FOOD_RATES.includedKm} km)`, amount: FOOD_RATES.base });
  if (distance_charge > 0) {
    lines.push({ label: `Distance (${extraKm.toFixed(1)} km × ₱${FOOD_RATES.perKm})`, amount: distance_charge });
  }
  lines.push({ label: "HatodGo service fee", amount: service_fee });

  const { rider_earnings, platform_cut } = splitEarnings(total - goods, service_fee);

  return {
    base: FOOD_RATES.base,
    distance_km: km,
    distance_charge,
    surcharges: 0,
    service_fee,
    goods_subtotal: goods,
    total,
    rider_earnings,
    platform_cut,
    lines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🛍️ Pabili
// ─────────────────────────────────────────────────────────────────────────────

const PABILI_RATES = {
  base: 30,
  perKm: 8,
  includedKm: 2,
  minTotal: 40,
  serviceRate: 0.12,
  serviceMin: 25,
  serviceMax: 60,
};

export function calculatePabiliFare(
  distanceKm: number,
  budget: number,
): FareBreakdown {
  const km = Math.max(0, distanceKm);
  const extraKm = Math.max(0, km - PABILI_RATES.includedKm);
  const distance_charge = ceilPeso(extraKm * PABILI_RATES.perKm);
  const deliveryFee = Math.max(
    PABILI_RATES.minTotal - 0, // allow delivery alone to be whatever; min enforced on total below
    PABILI_RATES.base + distance_charge,
  );
  const goods = Math.max(0, budget);
  const service_fee = ceilPeso(
    clamp(goods * PABILI_RATES.serviceRate, PABILI_RATES.serviceMin, PABILI_RATES.serviceMax),
  );
  const feesOnly = Math.max(PABILI_RATES.minTotal, deliveryFee + service_fee);
  const total = ceilPeso(goods + feesOnly);

  const lines: FareBreakdown["lines"] = [];
  if (goods > 0) lines.push({ label: "Shopping budget", amount: goods });
  lines.push({ label: `Delivery fee (first ${PABILI_RATES.includedKm} km)`, amount: PABILI_RATES.base });
  if (distance_charge > 0) {
    lines.push({ label: `Distance (${extraKm.toFixed(1)} km × ₱${PABILI_RATES.perKm})`, amount: distance_charge });
  }
  lines.push({ label: "HatodGo shopping & service fee", amount: service_fee });

  const { rider_earnings, platform_cut } = splitEarnings(total - goods, service_fee);

  return {
    base: PABILI_RATES.base,
    distance_km: km,
    distance_charge,
    surcharges: 0,
    service_fee,
    goods_subtotal: goods,
    total,
    rider_earnings,
    platform_cut,
    lines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for checkout / receipt
// ─────────────────────────────────────────────────────────────────────────────

export function isFareBreakdown(v: unknown): v is FareBreakdown {
  if (!v || typeof v !== "object") return false;
  const b = v as Partial<FareBreakdown>;
  return (
    typeof b.total === "number" &&
    typeof b.rider_earnings === "number" &&
    typeof b.platform_cut === "number" &&
    Array.isArray(b.lines)
  );
}

export function formatPHP(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}
