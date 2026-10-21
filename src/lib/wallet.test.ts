import { describe, expect, it } from "vitest";
import { summarizeFinance, summarizeWallet, type LedgerRow, type Settlement } from "./wallet";
const ledger: LedgerRow[] = [
  {
    id: "l1",
    order_id: "o1",
    rider_id: "r1",
    service_type: "ride",
    payment_method: "cash",
    gcash_to: null,
    customer_paid: 100,
    rider_earning: 80,
    platform_commission: 20,
    collected_by: "rider",
    settled: false,
    created_at: "2026-10-21T04:00:00Z",
  },
  {
    id: "l2",
    order_id: "o2",
    rider_id: "r1",
    service_type: "padali",
    payment_method: "gcash",
    gcash_to: "hatodgo",
    customer_paid: 200,
    rider_earning: 160,
    platform_commission: 40,
    collected_by: "hatodgo",
    settled: false,
    created_at: "2026-10-21T05:00:00Z",
  },
];
const request: Settlement = {
  id: "s1",
  rider_id: "r1",
  type: "payout_to_rider",
  amount: 100,
  status: "pending",
  reference: null,
  receipt_url: null,
  notes: null,
  admin_id: null,
  approved_at: null,
  created_at: "2026-10-21T05:00:00Z",
  updated_at: "2026-10-21T05:00:00Z",
};
describe("wallet accounting invariants", () => {
  it("keeps pending payout requests payable", () => {
    expect(summarizeWallet(ledger, [request]).hatodgoOwes).toBe(160);
  });
  it("keeps cancelled payout requests payable", () => {
    expect(summarizeWallet(ledger, [{ ...request, status: "rejected" }]).hatodgoOwes).toBe(160);
  });
  it("reduces payable only for an approved payout record", () => {
    const result = summarizeWallet(ledger, [{ ...request, status: "approved" }]);
    expect(result.hatodgoOwes).toBe(60);
    expect(result.riderOwes).toBe(20);
    expect(result.netBalance).toBe(40);
  });
  it("sums gross, rider earnings and company share separately", () => {
    const result = summarizeFinance(ledger, [], {
      start: new Date("2026-10-21T00:00:00Z"),
      end: new Date("2026-10-22T00:00:00Z"),
    });
    expect(result).toMatchObject({
      grossSales: 300,
      totalOrders: 2,
      riderEarnings: 240,
      companyRevenue: 60,
      cashCollected: 100,
      gcashReceived: 200,
    });
  });
});
