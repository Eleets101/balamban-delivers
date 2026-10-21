import { describe, expect, it } from "vitest";
import { nextTripStage, paymentDisplay } from "./orderApi";

describe("nextTripStage", () => {
  it("only allows the fixed forward sequence", () => {
    expect(nextTripStage("enroute_pickup")).toBe("arrived_pickup");
    expect(nextTripStage("arrived_pickup")).toBe("picked_up");
    expect(nextTripStage("picked_up")).toBe("completed");
  });
  it("treats a fresh accepted trip as en route to pickup", () => {
    expect(nextTripStage(undefined)).toBe("arrived_pickup");
  });
  it("has no step after completion", () => {
    expect(nextTripStage("completed")).toBeNull();
  });
});

describe("paymentDisplay", () => {
  it("never shows GCash or Maya as paid without confirmation", () => {
    expect(paymentDisplay("gcash", "pending").key).toBe("awaiting_confirmation");
    expect(paymentDisplay("maya", "pending").key).toBe("awaiting_confirmation");
  });
  it("shows paid only when the stored status is paid", () => {
    expect(paymentDisplay("gcash", "paid").key).toBe("paid");
  });
  it("shows cash on delivery", () => {
    expect(paymentDisplay("cod", "cod").key).toBe("cod");
  });
});

import { canRiderCancelSettlement, isAwaitingPaymentConfirmation, singleFlight } from "./orderApi";

describe("isAwaitingPaymentConfirmation", () => {
  it("shows confirm action for pending GCash and Maya", () => {
    expect(isAwaitingPaymentConfirmation({ payment_method: "gcash", payment_status: "pending" })).toBe(true);
    expect(isAwaitingPaymentConfirmation({ payment_method: "maya", payment_status: "pending" })).toBe(true);
  });
  it("hides it once paid, for cash, and for cancelled orders", () => {
    expect(isAwaitingPaymentConfirmation({ payment_method: "gcash", payment_status: "paid" })).toBe(false);
    expect(isAwaitingPaymentConfirmation({ payment_method: "cod", payment_status: "cod" })).toBe(false);
    expect(isAwaitingPaymentConfirmation({ payment_method: "gcash", payment_status: "pending", status: "cancelled" })).toBe(false);
  });
});

describe("canRiderCancelSettlement", () => {
  it("allows only the owner while pending", () => {
    expect(canRiderCancelSettlement({ rider_id: "r1", status: "pending" }, "r1")).toBe(true);
    expect(canRiderCancelSettlement({ rider_id: "r1", status: "pending" }, "r2")).toBe(false);
    expect(canRiderCancelSettlement({ rider_id: "r1", status: "approved" }, "r1")).toBe(false);
    expect(canRiderCancelSettlement({ rider_id: "r1", status: "rejected" }, "r1")).toBe(false);
  });
});

describe("singleFlight", () => {
  it("ignores a second submit while the first is running", async () => {
    let calls = 0;
    let release!: () => void;
    const run = singleFlight(() => { calls++; return new Promise<void>((r) => { release = r; }); });
    const first = run();
    await run();
    expect(calls).toBe(1);
    release();
    await first;
    run(); release();
    expect(calls).toBe(2);
  });
});
