import { haversineKm } from "./pricing";

/** Average urban scooter speed (km/h) used when no rider speed is reported. */
const DEFAULT_SPEED_KMH = 22;
/** Floor for usable speed (km/h) — below this we treat the rider as stopped. */
const MIN_USABLE_SPEED_KMH = 5;
/** Cap on plausible scooter/car speed (km/h) to drop GPS spikes. */
const MAX_USABLE_SPEED_KMH = 90;
/** How many recent samples we keep for smoothing. */
export const LOCATION_BUFFER_SIZE = 8;
/** Ignore samples older than this when computing smoothed speed (ms). */
const SAMPLE_MAX_AGE_MS = 60_000;

export interface LocationSample {
  lat: number;
  lng: number;
  /** Reported instantaneous speed in m/s, if any. */
  speed: number | null;
  /** ISO timestamp when the sample was taken. */
  updated_at: string;
}

/**
 * Push a new sample into a fixed-size ring buffer (most recent last).
 * Returns a new array so React state updates remain immutable.
 */
export function pushLocationSample(
  buffer: LocationSample[],
  sample: LocationSample,
  size: number = LOCATION_BUFFER_SIZE,
): LocationSample[] {
  const next = [...buffer, sample];
  if (next.length > size) next.splice(0, next.length - size);
  return next;
}

/**
 * Compute a smoothed speed (m/s) from a buffer of recent locations.
 * Strategy:
 *  1. Drop stale samples (> SAMPLE_MAX_AGE_MS old).
 *  2. Combine GPS-reported speeds with derived segment speeds (Δdistance/Δt).
 *  3. Reject implausible values (negative, > MAX_USABLE_SPEED_KMH).
 *  4. Weight more recent samples higher (linear weights).
 * Returns `null` if there isn't enough signal yet.
 */
export function smoothedSpeedMps(buffer: LocationSample[]): number | null {
  if (buffer.length === 0) return null;
  const now = Date.now();
  const fresh = buffer.filter(
    (s) => now - new Date(s.updated_at).getTime() <= SAMPLE_MAX_AGE_MS,
  );
  if (fresh.length === 0) return null;

  const samples: number[] = [];

  // Reported GPS speeds (m/s)
  for (const s of fresh) {
    if (s.speed != null && Number.isFinite(s.speed) && s.speed >= 0) {
      const kmh = s.speed * 3.6;
      if (kmh <= MAX_USABLE_SPEED_KMH) samples.push(s.speed);
    }
  }

  // Derived speeds from consecutive segments
  for (let i = 1; i < fresh.length; i++) {
    const a = fresh[i - 1];
    const b = fresh[i];
    const dtSec = (new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) / 1000;
    if (dtSec <= 1) continue; // ignore sub-second jitter
    const km = haversineKm(a, b);
    const mps = (km * 1000) / dtSec;
    const kmh = mps * 3.6;
    if (kmh >= 0 && kmh <= MAX_USABLE_SPEED_KMH) samples.push(mps);
  }

  if (samples.length === 0) return null;

  // Linear-weighted average — newest sample gets the highest weight.
  let weightedSum = 0;
  let weightTotal = 0;
  samples.forEach((v, i) => {
    const w = i + 1;
    weightedSum += v * w;
    weightTotal += w;
  });
  return weightedSum / weightTotal;
}

/**
 * Compute the coefficient of variation (stddev / mean) of recent speed samples.
 * Combines reported GPS speeds and per-segment derived speeds, then returns a
 * unitless number that represents how "jittery" the rider's speed has been.
 *
 * Returns `null` when there isn't enough signal to be meaningful (≤1 sample
 * or near-zero average speed). Typical interpretation:
 *   - < 0.15  → cruising steadily
 *   - 0.15..0.4 → mild changes (turns, traffic)
 *   - > 0.4  → fast changes (accel/brake/stop-and-go)
 */
export function speedVariance(buffer: LocationSample[]): number | null {
  if (buffer.length < 2) return null;
  const now = Date.now();
  const fresh = buffer.filter(
    (s) => now - new Date(s.updated_at).getTime() <= SAMPLE_MAX_AGE_MS,
  );
  if (fresh.length < 2) return null;

  const samples: number[] = [];
  for (const s of fresh) {
    if (s.speed != null && Number.isFinite(s.speed) && s.speed >= 0) {
      const kmh = s.speed * 3.6;
      if (kmh <= MAX_USABLE_SPEED_KMH) samples.push(s.speed);
    }
  }
  for (let i = 1; i < fresh.length; i++) {
    const a = fresh[i - 1];
    const b = fresh[i];
    const dtSec = (new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) / 1000;
    if (dtSec <= 1) continue;
    const km = haversineKm(a, b);
    const mps = (km * 1000) / dtSec;
    const kmh = mps * 3.6;
    if (kmh >= 0 && kmh <= MAX_USABLE_SPEED_KMH) samples.push(mps);
  }

  if (samples.length < 2) return null;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean < 0.5) return null; // basically stopped — variance is meaningless
  const variance =
    samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / samples.length;
  const stddev = Math.sqrt(variance);
  return stddev / mean;
}

/**
 * Map a coefficient-of-variation value to an ETA refresh interval (ms).
 * Higher variance → faster refresh so the displayed ETA tracks reality.
 *
 *   variance ≥ 0.5      → 5s   (fast changes — accelerating, braking, turning)
 *   0.3 ≤ variance < 0.5 → 10s  (moderate changes — city traffic)
 *   0.15 ≤ variance < 0.3 → 20s (light changes)
 *   variance < 0.15     → 30s  (cruising / steady)
 *   null                → 30s  (default — not enough signal yet)
 */
export function adaptiveRefreshMs(variance: number | null): number {
  if (variance == null) return 30_000;
  if (variance >= 0.5) return 5_000;
  if (variance >= 0.3) return 10_000;
  if (variance >= 0.15) return 20_000;
  return 30_000;
}

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
