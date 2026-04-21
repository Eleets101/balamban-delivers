import { haversineKm } from "./pricing";

/** Average urban scooter speed (km/h) used when no rider speed is reported. */
const DEFAULT_SPEED_KMH = 22;
/** Floor for usable speed (km/h) — below this we treat the rider as stopped. */
const MIN_USABLE_SPEED_KMH = 5;

export interface EtaResult {
  /** Distance to target in kilometres. */
  km: number;
  /** Estimated minutes until arrival (rounded up, min 1). */
  minutes: number;
  /** Human-friendly label like "5 min" or "<1 min". */
  label: string;
}

/**
 * Estimate arrival time from `from` to `to`.
 * If a recent driver speed (m/s) is available we use it, otherwise we fall
 * back to a sensible urban average.
 */
export function estimateEta(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number } | null,
  opts: { speedMps?: number | null } = {},
): EtaResult | null {
  if (!from || !to) return null;
  const km = haversineKm(from, to);
  const speedMps = opts.speedMps ?? null;
  const speedKmh =
    speedMps != null && speedMps * 3.6 >= MIN_USABLE_SPEED_KMH
      ? speedMps * 3.6
      : DEFAULT_SPEED_KMH;
  const rawMinutes = (km / speedKmh) * 60;
  const minutes = Math.max(1, Math.ceil(rawMinutes));
  const label = rawMinutes < 1 ? "<1 min" : `${minutes} min`;
  return { km, minutes, label };
}

/**
 * Pick the right ETA target based on the order's current status.
 * - pending / accepted → rider is heading to pickup
 * - in_progress       → rider is heading to drop-off
 * - completed/cancel  → no live ETA
 */
export function etaTargetForStatus(
  status: string,
  pickup: { lat: number; lng: number } | null,
  dropoff: { lat: number; lng: number } | null,
): { label: "pickup" | "drop-off"; coords: { lat: number; lng: number } } | null {
  if (status === "pending" || status === "accepted") {
    return pickup ? { label: "pickup", coords: pickup } : null;
  }
  if (status === "in_progress") {
    return dropoff ? { label: "drop-off", coords: dropoff } : null;
  }
  return null;
}
