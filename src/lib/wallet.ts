/**
 * Wallet & settlement domain logic for HatodGo riders.
 *
 * Conventions:
 * - `collected_by = 'rider'` → rider physically/digitally received the customer
 *   payment (cash, or GCash sent to the rider). The rider then OWES HatodGo
 *   the platform commission.
 * - `collected_by = 'hatodgo'` → HatodGo received the payment (GCash to
 *   HatodGo's account). HatodGo then OWES the rider their earning.
 *
 * Net balance (rider POV):
 *   balance = (sum HatodGo owes rider) - (sum rider owes HatodGo)
 *           - (approved payouts) + (approved cash/gcash remittances)
 *
 * Positive balance = HatodGo owes the rider (green).
 * Negative balance = rider owes HatodGo (red).
 */

export type LedgerRow = {
  id: string;
  order_id: string;
  rider_id: string;
  service_type: string;
  payment_method: string;
  gcash_to: "hatodgo" | "rider" | null;
  customer_paid: number;
  rider_earning: number;
  platform_commission: number;
  collected_by: "rider" | "hatodgo";
  settled: boolean;
  created_at: string;
};

export type SettlementType = "cash_remit" | "gcash_to_hatodgo" | "payout_to_rider";
export type SettlementStatus = "pending" | "approved" | "rejected";

export type Settlement = {
  id: string;
  rider_id: string;
  type: SettlementType;
  amount: number;
  status: SettlementStatus;
  reference: string | null;
  receipt_url: string | null;
  notes: string | null;
  admin_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface WalletSummary {
  /** Lifetime earnings = sum of rider_earning across all completed orders. */
  lifetimeEarnings: number;
  todayEarnings: number;
  weekEarnings: number;
  /** Cash physically held by the rider that hasn't been remitted yet. */
  cashHeldToday: number;
  cashHeldWeek: number;
  /** GCash collected directly by the rider today/week (owed to HatodGo as commission share is separate). */
  gcashCollectedToday: number;
  gcashCollectedWeek: number;
  /** Net balance — positive = HatodGo owes rider, negative = rider owes HatodGo. */
  netBalance: number;
  /** Outstanding cash + GCash the rider still owes HatodGo (commission on rider-collected orders, minus approved remits). */
  riderOwes: number;
  /** Outstanding earnings HatodGo still owes the rider (gcash-to-hatodgo orders, minus approved payouts). */
  hatodgoOwes: number;
  /** Total commission HatodGo has earned from this rider (lifetime). */
  lifetimeCommission: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisWeek(iso: string) {
  const d = new Date(iso).getTime();
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Monday-start week
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  return d >= start.getTime() && d < start.getTime() + 7 * DAY_MS;
}

export type LedgerAdjustment = {
  id: string;
  rider_id: string;
  amount: number; // positive = HatodGo owes rider; negative = rider owes HatodGo
  note: string;
  admin_id: string;
  created_at: string;
};

export function summarizeWallet(
  ledger: LedgerRow[],
  settlements: Settlement[],
  adjustments: LedgerAdjustment[] = [],
): WalletSummary {
  let lifetimeEarnings = 0;
  let lifetimeCommission = 0;
  let todayEarnings = 0;
  let weekEarnings = 0;
  let cashHeldToday = 0;
  let cashHeldWeek = 0;
  let gcashCollectedToday = 0;
  let gcashCollectedWeek = 0;
  // Lifetime running totals of what each side owes the other (before settlements)
  let riderCollectedTotal = 0; // what rider collected on HatodGo's behalf (= commissions owed to HatodGo)
  let hatodgoCollectedTotal = 0; // what HatodGo collected on rider's behalf (= earnings owed to rider)

  for (const row of ledger) {
    lifetimeEarnings += Number(row.rider_earning);
    lifetimeCommission += Number(row.platform_commission);
    const today = isToday(row.created_at);
    const week = isThisWeek(row.created_at);
    if (today) todayEarnings += Number(row.rider_earning);
    if (week) weekEarnings += Number(row.rider_earning);

    if (row.collected_by === "rider") {
      // Rider holds the customer's full payment; they owe HatodGo the commission.
      riderCollectedTotal += Number(row.platform_commission);
      if (row.payment_method === "cash") {
        if (today) cashHeldToday += Number(row.customer_paid);
        if (week) cashHeldWeek += Number(row.customer_paid);
      } else if (row.payment_method === "gcash") {
        if (today) gcashCollectedToday += Number(row.customer_paid);
        if (week) gcashCollectedWeek += Number(row.customer_paid);
      }
    } else {
      // HatodGo holds the customer's payment; owes rider their earning.
      hatodgoCollectedTotal += Number(row.rider_earning);
    }
  }

  // Apply approved settlements
  let approvedRemits = 0; // rider → HatodGo (reduces rider's debt)
  let approvedPayouts = 0; // HatodGo → rider (reduces HatodGo's debt)
  for (const s of settlements) {
    if (s.status !== "approved") continue;
    if (s.type === "cash_remit" || s.type === "gcash_to_hatodgo") {
      approvedRemits += Number(s.amount);
    } else if (s.type === "payout_to_rider") {
      approvedPayouts += Number(s.amount);
    }
  }

  const riderOwes = Math.max(0, riderCollectedTotal - approvedRemits);
  const hatodgoOwes = Math.max(0, hatodgoCollectedTotal - approvedPayouts);
  const adjustmentsTotal = adjustments.reduce((sum, a) => sum + Number(a.amount), 0);
  const netBalance = hatodgoOwes - riderOwes + adjustmentsTotal;

  // Subtract pending remittances from "cash held" so the rider sees only
  // the cash they still physically have.
  const pendingCashRemit = settlements
    .filter((s) => s.status === "pending" && s.type === "cash_remit")
    .reduce((sum, s) => sum + Number(s.amount), 0);
  const pendingGcashRemit = settlements
    .filter((s) => s.status === "pending" && s.type === "gcash_to_hatodgo")
    .reduce((sum, s) => sum + Number(s.amount), 0);

  return {
    lifetimeEarnings,
    lifetimeCommission,
    todayEarnings,
    weekEarnings,
    cashHeldToday: Math.max(0, cashHeldToday - pendingCashRemit),
    cashHeldWeek: Math.max(0, cashHeldWeek - pendingCashRemit),
    gcashCollectedToday: Math.max(0, gcashCollectedToday - pendingGcashRemit),
    gcashCollectedWeek: Math.max(0, gcashCollectedWeek - pendingGcashRemit),
    netBalance,
    riderOwes,
    hatodgoOwes,
  };
}

export function formatPeso(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}₱${abs.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const SETTLEMENT_LABELS: Record<SettlementType, string> = {
  cash_remit: "Cash remitted",
  gcash_to_hatodgo: "GCash to HatodGo",
  payout_to_rider: "Payout request",
};

export const STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

// ============================================================
// Owner finance helpers — company-wide aggregates
// ============================================================

export interface FinanceWindow {
  start: Date;
  end: Date; // exclusive
}

export type ReportRange = "today" | "week" | "month";

export function rangeWindow(range: ReportRange, ref: Date = new Date()): FinanceWindow {
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  if (range === "today") {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (range === "week") {
    const day = start.getDay();
    const diff = (day + 6) % 7; // Monday-start
    start.setDate(start.getDate() - diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  // month
  start.setDate(1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function inWindow(iso: string, w: FinanceWindow): boolean {
  const t = new Date(iso).getTime();
  return t >= w.start.getTime() && t < w.end.getTime();
}

export interface FinanceSummary {
  grossSales: number;
  totalOrders: number;
  companyRevenue: number;
  riderEarnings: number;
  cashCollected: number;
  gcashReceived: number;
  pendingSettlementsCount: number;
  pendingSettlementsAmount: number;
}

export function summarizeFinance(
  ledger: LedgerRow[],
  settlements: Settlement[],
  window: FinanceWindow,
): FinanceSummary {
  let grossSales = 0;
  let totalOrders = 0;
  let companyRevenue = 0;
  let riderEarnings = 0;
  let cashCollected = 0;
  let gcashReceived = 0;

  for (const row of ledger) {
    if (!inWindow(row.created_at, window)) continue;
    grossSales += Number(row.customer_paid);
    totalOrders += 1;
    companyRevenue += Number(row.platform_commission);
    riderEarnings += Number(row.rider_earning);
    if (row.payment_method === "cash") {
      // Cash always collected by rider
      cashCollected += Number(row.customer_paid);
    } else if (row.payment_method === "gcash") {
      gcashReceived += Number(row.customer_paid);
    }
  }

  const pending = settlements.filter((s) => s.status === "pending");
  const pendingSettlementsCount = pending.length;
  const pendingSettlementsAmount = pending.reduce((sum, s) => sum + Number(s.amount), 0);

  return {
    grossSales,
    totalOrders,
    companyRevenue,
    riderEarnings,
    cashCollected,
    gcashReceived,
    pendingSettlementsCount,
    pendingSettlementsAmount,
  };
}

/** CSV-safe escaping. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ledgerToCsv(rows: LedgerRow[], riderNames: Record<string, string>): string {
  const headers = [
    "order_id", "created_at", "rider_id", "rider_name", "service_type",
    "payment_method", "collected_by", "customer_paid", "rider_earning",
    "platform_commission", "settled",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.order_id, r.created_at, r.rider_id, riderNames[r.rider_id] ?? "",
      r.service_type, r.payment_method, r.collected_by,
      Number(r.customer_paid).toFixed(2), Number(r.rider_earning).toFixed(2),
      Number(r.platform_commission).toFixed(2), r.settled ? "yes" : "no",
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
