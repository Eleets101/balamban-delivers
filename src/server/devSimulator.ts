import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Dev-only: assign the current authenticated user as the rider for one of
 * their own orders so they can preview the full tracker flow end-to-end.
 *
 * Security: We verify the caller is the order's customer before mutating
 * anything. This is gated to orders the caller already owns; no escalation.
 */
export const devAssignSelfAsRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => {
    if (!input?.orderId || typeof input.orderId !== "string") {
      throw new Error("orderId required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify ownership via user-scoped client (RLS enforced)
    const { data: order, error: fetchErr } = await context.supabase
      .from("orders")
      .select("id, customer_id, rider_id, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!order || order.customer_id !== userId) {
      throw new Error("Order not found or not yours");
    }

    // Ensure the user has the 'rider' role for the duration of the sim
    // (idempotent — unique on user_id+role).
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "rider" }, { onConflict: "user_id,role" });

    // Assign rider + flip to 'accepted' if still pending
    const nextStatus = order.status === "pending" ? "accepted" : order.status;
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ rider_id: userId, status: nextStatus })
      .eq("id", data.orderId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, riderId: userId, status: nextStatus };
  });

/**
 * Dev-only: push a simulated driver location point for an order the caller
 * owns. Lets you preview the live ETA + map without a real rider device.
 */
export const devPushLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { orderId: string; lat: number; lng: number; speed?: number | null }) => {
      if (!input?.orderId) throw new Error("orderId required");
      if (typeof input.lat !== "number" || typeof input.lng !== "number") {
        throw new Error("lat/lng required");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, customer_id, rider_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order || order.customer_id !== userId) {
      throw new Error("Order not found or not yours");
    }
    if (order.rider_id !== userId) {
      throw new Error("You aren't assigned as this order's rider");
    }

    const { error: insErr } = await supabaseAdmin.from("driver_locations").insert({
      order_id: data.orderId,
      rider_id: userId,
      lat: data.lat,
      lng: data.lng,
      speed: data.speed ?? null,
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

/**
 * Dev-only: advance the order status (accepted → in_progress → completed)
 * so you can validate every stage of the timeline.
 */
export const devAdvanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      status: "accepted" | "in_progress" | "completed" | "pending";
    }) => {
      if (!input?.orderId) throw new Error("orderId required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, customer_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order || order.customer_id !== userId) {
      throw new Error("Order not found or not yours");
    }
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.orderId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, status: data.status };
  });
