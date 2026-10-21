/**
 * Secure order / payout actions. Every write to orders and settlement
 * decisions goes through database functions (see
 * supabase/pending/20261021_secure_order_lifecycle.sql) that validate the
 * caller, price and allowed transitions server-side.
 *
 * These functions are not yet in the generated types (the migration is
 * pending review), so calls go through a narrow untyped wrapper.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ServiceType } from "@/lib/orders";

type RpcResult<T> = { data: T | null; error: { message: string } | null };
const rpc = <T,>(fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<RpcResult<T>>)(fn, args);

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc<T>(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type TripStage = "enroute_pickup" | "arrived_pickup" | "picked_up" | "completed";

/** Mirrors public.hg_next_trip_stage — the only allowed forward step. */
export function nextTripStage(current: TripStage | null | undefined): TripStage | null {
  switch (current ?? "enroute_pickup") {
    case "enroute_pickup":
      return "arrived_pickup";
    case "arrived_pickup":
      return "picked_up";
    case "picked_up":
      return "completed";
    default:
      return null;
  }
}

export type PaymentChoice = "cod" | "gcash" | "maya";

/**
 * What the customer should see for a payment. E-wallet payments are only
 * "paid" once an admin confirms them; until then they await confirmation.
 */
export function paymentDisplay(method: string | null | undefined, status: string): {
  key: "paid" | "cod" | "awaiting_confirmation" | "unpaid" | "failed";
  label: string;
} {
  if (status === "paid") return { key: "paid", label: "Paid" };
  if (status === "cod") return { key: "cod", label: "Cash on delivery" };
  if (status === "failed") return { key: "failed", label: "Payment failed" };
  if (method === "gcash" || method === "maya") {
    return { key: "awaiting_confirmation", label: "Awaiting manual confirmation" };
  }
  return { key: "unpaid", label: "Awaiting payment" };
}

export interface CreateOrderInput {
  serviceType: ServiceType;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number;
  dropoffLng: number;
  notes: string | null;
  details: Record<string, unknown>;
  estimatedPrice: number | null;
}

export const createOrder = (i: CreateOrderInput) =>
  call<string>("create_order", {
    p_service_type: i.serviceType,
    p_pickup_address: i.pickupAddress,
    p_dropoff_address: i.dropoffAddress,
    p_pickup_lat: i.pickupLat,
    p_pickup_lng: i.pickupLng,
    p_dropoff_lat: i.dropoffLat,
    p_dropoff_lng: i.dropoffLng,
    p_notes: i.notes,
    p_details: JSON.parse(JSON.stringify(i.details)),
    p_estimated_price: i.estimatedPrice,
  });

/**
 * Optional GCash/Maya transaction reference typed by the customer.
 * Mirrors the database rule: 4-40 letters, digits, spaces or dashes.
 * Returns null for empty input; throws a friendly error when invalid.
 */
export function normalizePaymentReference(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!v) return null;
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(v)) {
    throw new Error("Reference number should be 4-40 letters or numbers");
  }
  return v;
}

export const setPaymentMethod = (orderId: string, method: PaymentChoice, reference?: string | null) =>
  call<null>("set_order_payment_method", {
    p_order_id: orderId,
    p_method: method,
    p_reference: method === "cod" ? null : normalizePaymentReference(reference),
  });

export const cancelMyOrder = (orderId: string, reason: string, reasonLabel: string, note: string | null) =>
  call<null>("cancel_my_order", { p_order_id: orderId, p_reason: reason, p_reason_label: reasonLabel, p_note: note });

export interface AvailableJob {
  id: string;
  service_type: ServiceType;
  status: "pending";
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  estimated_price: number | null;
  payment_method: string | null;
  created_at: string;
  details: Record<string, unknown>;
}

export const listAvailableJobs = async () => (await call<AvailableJob[]>("list_available_jobs")) ?? [];
export const acceptOrder = (orderId: string) => call<null>("accept_order", { p_order_id: orderId });
export const advanceTrip = (orderId: string, next: TripStage) =>
  call<null>("advance_trip", { p_order_id: orderId, p_next_stage: next });

export interface OrderContacts {
  customer_name: string | null;
  customer_phone: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  rider_avatar_url: string | null;
}
export const getOrderContacts = async (orderId: string): Promise<OrderContacts | null> => {
  const rows = await call<OrderContacts[]>("get_order_contacts", { p_order_id: orderId });
  return rows?.[0] ?? null;
};

export const adminConfirmPayment = (orderId: string, confirmed: boolean) =>
  call<null>("admin_confirm_payment", { p_order_id: orderId, p_confirmed: confirmed });
export const riderCancelSettlement = (id: string) => call<null>("rider_cancel_settlement", { p_id: id });
export const adminDecideSettlement = (id: string, approve: boolean, note?: string) =>
  call<null>("admin_decide_settlement", { p_id: id, p_approve: approve, p_note: note ?? null });
export const adminRecordSettlement = (
  riderId: string,
  type: "cash_remit" | "gcash_to_hatodgo" | "payout_to_rider",
  amount: number,
  note?: string,
) => call<string>("admin_record_settlement", { p_rider_id: riderId, p_type: type, p_amount: amount, p_note: note ?? null });

// ---------- UI guards (mirror the database rules; the database still decides) ----------

/** An e-wallet order an admin can confirm or mark failed. */
export function isAwaitingPaymentConfirmation(o: {
  payment_method: string | null;
  payment_status: string;
  status?: string;
}): boolean {
  return (o.payment_method === "gcash" || o.payment_method === "maya") &&
    (o.payment_status === "pending" || o.payment_status === "failed") &&
    o.status !== "cancelled";
}

/** Riders may cancel only their own request while it is still pending. */
export function canRiderCancelSettlement(
  s: { rider_id: string; status: string },
  userId: string | null | undefined,
): boolean {
  return !!userId && s.rider_id === userId && s.status === "pending";
}

/**
 * Wrap an async action so a second call while the first is running is
 * ignored (prevents double submits from double taps).
 */
export function singleFlight<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  let running = false;
  return async (...a: A): Promise<R | undefined> => {
    if (running) return undefined;
    running = true;
    try {
      return await fn(...a);
    } finally {
      running = false;
    }
  };
}
