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
