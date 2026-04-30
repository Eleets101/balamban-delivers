import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Package,
  Pencil,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wallet,
  Wallet2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  downloadCsv,
  formatPeso,
  ledgerToCsv,
  rangeWindow,
  SETTLEMENT_LABELS,
  STATUS_LABELS,
  summarizeFinance,
  summarizeWallet,
  type LedgerAdjustment,
  type LedgerRow,
  type ReportRange,
  type Settlement,
} from "@/lib/wallet";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({
    meta: [
      { title: "Finance Dashboard — Admin — HatodGo" },
      { name: "description", content: "Owner finance dashboard: gross sales, company revenue, rider settlements, alerts, reports." },
    ],
  }),
  component: AdminFinancePage,
});

interface RiderProfile { id: string; full_name: string | null; phone: string | null; }

const LARGE_CASH_THRESHOLD = 1000; // ₱ — alert when rider holds more than this in unremitted cash

function AdminFinancePage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [adjustments, setAdjustments] = useState<LedgerAdjustment[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, RiderProfile>>({});
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [orderInfo, setOrderInfo] = useState<Record<string, { customer_id: string }>>({});
  const [range, setRange] = useState<ReportRange>("today");
  const [actingId, setActingId] = useState<string | null>(null);
  const [adjustRiderId, setAdjustRiderId] = useState<string | null>(null);
  const [eodOpen, setEodOpen] = useState(false);
  const [snapshotsCount, setSnapshotsCount] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const [{ data: l, error: le }, { data: s, error: se }, { data: a, error: ae }, { data: snaps }] = await Promise.all([
        supabase.from("wallet_ledger").select("*").order("created_at", { ascending: false }),
        supabase.from("settlements").select("*").order("created_at", { ascending: false }),
        supabase.from("ledger_adjustments").select("*").order("created_at", { ascending: false }),
        supabase.from("daily_finance_snapshots").select("id", { count: "exact", head: true }),
      ]);
      if (le) throw le;
      if (se) throw se;
      if (ae) throw ae;
      const ledgerRows = (l ?? []) as LedgerRow[];
      const settlementRows = (s ?? []) as Settlement[];
      const adjustmentRows = (a ?? []) as LedgerAdjustment[];
      setLedger(ledgerRows);
      setSettlements(settlementRows);
      setAdjustments(adjustmentRows);
      setSnapshotsCount(snaps?.length ?? 0);

      const riderIds = Array.from(new Set([
        ...ledgerRows.map(r => r.rider_id),
        ...settlementRows.map(r => r.rider_id),
        ...adjustmentRows.map(r => r.rider_id),
      ]));
      if (riderIds.length > 0) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, phone").in("id", riderIds);
        const map: Record<string, RiderProfile> = {};
        (ps ?? []).forEach(p => { map[p.id] = p as RiderProfile; });
        setProfiles(map);
      }

      // Pull order rows to learn customer ids for the ledger view
      const orderIds = ledgerRows.slice(0, 100).map(r => r.order_id);
      if (orderIds.length > 0) {
        const { data: ords } = await supabase.from("orders").select("id, customer_id").in("id", orderIds);
        const m: Record<string, { customer_id: string }> = {};
        (ords ?? []).forEach((o: any) => { m[o.id] = { customer_id: o.customer_id }; });
        setOrderInfo(m);
        const custIds = Array.from(new Set((ords ?? []).map((o: any) => o.customer_id))).filter(Boolean);
        if (custIds.length > 0) {
          const { data: cps } = await supabase.from("profiles").select("id, full_name").in("id", custIds);
          const cm: Record<string, string> = {};
          (cps ?? []).forEach((p: any) => { cm[p.id] = p.full_name ?? ""; });
          setCustomerNames(cm);
        }
      }
    } catch (err) {
      console.error("[finance] refresh failed", err);
      toast.error("Couldn't load finance data", { description: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (!isAdmin) return;
    void refresh();
  }, [user, loading, isAdmin, navigate, refresh]);

  // Realtime
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin:finance")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_ledger" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_adjustments" }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAdmin, refresh]);

  const rangeWin = useMemo(() => rangeWindow(range), [range]);
  const summary = useMemo(() => {
    if (!ledger || !settlements) return null;
    return summarizeFinance(ledger, settlements, rangeWin);
  }, [ledger, settlements, rangeWin]);

  // Per-rider rollup (lifetime balances + window-scoped order count/cash)
  const perRider = useMemo(() => {
    if (!ledger || !settlements || !adjustments) return null;
    const ids = Array.from(new Set([
      ...ledger.map(r => r.rider_id),
      ...settlements.map(r => r.rider_id),
      ...adjustments.map(r => r.rider_id),
    ]));
    return ids.map(id => {
      const ll = ledger.filter(r => r.rider_id === id);
      const ss = settlements.filter(r => r.rider_id === id);
      const aa = adjustments.filter(r => r.rider_id === id);
      const wl = summarizeWallet(ll, ss, aa);
      const inRange = ll.filter(r => r.created_at >= rangeWin.start.toISOString() && r.created_at < rangeWin.end.toISOString());
      const cashInRange = inRange.filter(r => r.payment_method === "cash").reduce((sum, r) => sum + Number(r.customer_paid), 0);
      const gcashInRange = inRange.filter(r => r.payment_method === "gcash").reduce((sum, r) => sum + Number(r.customer_paid), 0);
      const earningsInRange = inRange.reduce((sum, r) => sum + Number(r.rider_earning), 0);
      const lastApproved = ss.find(s => s.status === "approved");
      return {
        id,
        profile: profiles[id],
        ordersInRange: inRange.length,
        cashInRange,
        gcashInRange,
        earningsInRange,
        riderOwes: wl.riderOwes,
        hatodgoOwes: wl.hatodgoOwes,
        netBalance: wl.netBalance,
        cashHeld: wl.cashHeldWeek, // running cash held
        lastSettlement: lastApproved,
        hasPending: ss.some(s => s.status === "pending"),
      };
    }).sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
  }, [ledger, settlements, adjustments, profiles, rangeWin]);

  const alerts = useMemo(() => {
    if (!perRider) return [];
    const items: { kind: "owes" | "missing" | "cash"; label: string; amount?: number; riderId: string; }[] = [];
    for (const r of perRider) {
      const name = r.profile?.full_name ?? `Rider ${r.id.slice(0, 6)}`;
      if (r.riderOwes > 0) items.push({ kind: "owes", label: `${name} owes ${formatPeso(r.riderOwes)}`, amount: r.riderOwes, riderId: r.id });
      if (r.cashHeld > LARGE_CASH_THRESHOLD) items.push({ kind: "cash", label: `${name} holds ${formatPeso(r.cashHeld)} in cash`, amount: r.cashHeld, riderId: r.id });
      if (r.hasPending) items.push({ kind: "missing", label: `${name} has a pending settlement`, riderId: r.id });
    }
    return items;
  }, [perRider]);

  const ledgerInRange = useMemo(() => {
    if (!ledger) return [];
    return ledger.filter(r => r.created_at >= rangeWin.start.toISOString() && r.created_at < rangeWin.end.toISOString());
  }, [ledger, rangeWin]);

  const exportCsv = () => {
    if (ledgerInRange.length === 0) {
      toast.info("Nothing to export for this range.");
      return;
    }
    const names: Record<string, string> = {};
    Object.values(profiles).forEach(p => { if (p) names[p.id] = p.full_name ?? ""; });
    const csv = ledgerToCsv(ledgerInRange, names);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`hatodgo-finance-${range}-${today}.csv`, csv);
    toast.success("CSV exported");
  };

  // Quick actions on settlements (mark as approved)
  const decideSettlement = async (id: string, status: "approved" | "rejected") => {
    if (!user) return;
    setActingId(id);
    try {
      const { error } = await supabase.from("settlements").update({
        status,
        admin_id: user.id,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
      toast.success(status === "approved" ? "Marked paid" : "Rejected");
      void refresh();
    } catch (err) {
      toast.error("Couldn't update", { description: (err as Error).message });
    } finally {
      setActingId(null);
    }
  };

  // Admin-initiated quick settlement creation (e.g. "I confirm rider remitted ₱500 cash")
  const adminCreateSettlement = async (
    riderId: string,
    type: "cash_remit" | "gcash_to_hatodgo" | "payout_to_rider",
    amount: number,
    notes?: string,
  ) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("settlements").insert({
        rider_id: riderId,
        type,
        amount,
        status: "approved",
        admin_id: user.id,
        approved_at: new Date().toISOString(),
        notes: notes ?? `Logged by admin`,
      });
      if (error) throw error;
      toast.success("Recorded");
      void refresh();
    } catch (err) {
      toast.error("Couldn't record", { description: (err as Error).message });
    }
  };

  // End of day: snapshot today's numbers
  const generateEod = async (notes: string) => {
    if (!user || !ledger || !settlements) return;
    const today = new Date();
    const dayStr = today.toISOString().slice(0, 10);
    const w = rangeWindow("today", today);
    const fin = summarizeFinance(ledger, settlements, w);
    try {
      const { error } = await supabase.from("daily_finance_snapshots").upsert({
        day: dayStr,
        gross_sales: fin.grossSales,
        total_orders: fin.totalOrders,
        company_revenue: fin.companyRevenue,
        rider_earnings: fin.riderEarnings,
        cash_collected: fin.cashCollected,
        gcash_received: fin.gcashReceived,
        pending_settlements_count: fin.pendingSettlementsCount,
        pending_settlements_amount: fin.pendingSettlementsAmount,
        notes: notes.trim() || null,
        generated_by: user.id,
      }, { onConflict: "day" });
      if (error) throw error;
      toast.success("End-of-day saved", { description: `Snapshot for ${dayStr} stored.` });
      setEodOpen(false);
      void refresh();
    } catch (err) {
      toast.error("Couldn't save", { description: (err as Error).message });
    }
  };

  if (loading) {
    return <PageShell><div className="flex min-h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div></PageShell>;
  }
  if (!isAdmin) {
    return (
      <PageShell>
        <div className="container mx-auto max-w-md px-4 py-12 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-warning" />
          <h1 className="mb-2 text-2xl font-bold">Admins only</h1>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="container mx-auto max-w-7xl px-3 pb-24 pt-3 sm:px-6 sm:pt-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CircleDollarSign className="h-7 w-7 text-primary-glow" />
            <div>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Finance Dashboard</h1>
              <p className="text-xs text-muted-foreground">Live cash, settlements & profit — {snapshotsCount} day{snapshotsCount === 1 ? "" : "s"} archived.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as ReportRange)}>
              <TabsList>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <FileSpreadsheet className="h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setEodOpen(true)}>
              <CalendarCheck2 className="h-4 w-4" /> End of day
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">Admin home</Link>
            </Button>
          </div>
        </div>

        {/* Top summary */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <SummaryCard accent="primary" icon={<TrendingUp />} label="Gross sales" value={formatPeso(summary?.grossSales ?? 0)} sub={`${range}`} />
          <SummaryCard icon={<Package />} label="Orders" value={String(summary?.totalOrders ?? 0)} sub={`completed ${range}`} />
          <SummaryCard accent="success" icon={<Sparkles />} label="Company revenue" value={formatPeso(summary?.companyRevenue ?? 0)} sub="20% commission + service fees" />
          <SummaryCard icon={<Wallet />} label="Rider earnings" value={formatPeso(summary?.riderEarnings ?? 0)} sub="paid out / payable" />
          <SummaryCard accent="warning" icon={<Banknote />} label="Cash collected" value={formatPeso(summary?.cashCollected ?? 0)} sub="held by riders" />
          <SummaryCard accent="primary" icon={<Smartphone />} label="GCash received" value={formatPeso(summary?.gcashReceived ?? 0)} sub="all GCash payments" />
          <SummaryCard accent={summary && summary.pendingSettlementsCount > 0 ? "warning" : undefined} icon={<Receipt />} label="Pending settlements" value={String(summary?.pendingSettlementsCount ?? 0)} sub={formatPeso(summary?.pendingSettlementsAmount ?? 0)} />
          <SummaryCard accent="success" icon={<Coins />} label="Net company P&L" value={formatPeso((summary?.companyRevenue ?? 0))} sub="cleared revenue" />
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mt-6 rounded-2xl border border-warning/40 bg-warning/5 p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" /> Attention needed ({alerts.length})
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {alerts.slice(0, 12).map((a, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2 text-sm">
                  <span>{a.label}</span>
                  <Button variant="ghost" size="sm" onClick={() => setAdjustRiderId(a.riderId)}>
                    <Pencil className="h-3 w-3" /> Adjust
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rider settlement table */}
        <h2 className="mb-2 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Wallet2 className="h-4 w-4" /> Rider settlement table
        </h2>
        {perRider === null ? (
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        ) : perRider.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">No rider activity yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Rider</th>
                  <th className="px-3 py-2 text-right">Orders ({range})</th>
                  <th className="px-3 py-2 text-right">Cash held</th>
                  <th className="px-3 py-2 text-right">GCash ({range})</th>
                  <th className="px-3 py-2 text-right">Earnings ({range})</th>
                  <th className="px-3 py-2 text-right">Owes co.</th>
                  <th className="px-3 py-2 text-right">Co. owes</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Last paid</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {perRider.map((r) => {
                  const balanceClass = r.netBalance > 0 ? "text-success" : r.netBalance < 0 ? "text-destructive" : "text-foreground";
                  const status = r.netBalance === 0 ? "Settled" : r.netBalance > 0 ? "Co. owes" : "Owes co.";
                  return (
                    <tr key={r.id} className="border-t border-border align-middle">
                      <td className="px-3 py-2">
                        <p className="font-semibold">{r.profile?.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.profile?.phone ?? r.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.ordersInRange}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPeso(r.cashHeld)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPeso(r.gcashInRange)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPeso(r.earningsInRange)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatPeso(r.riderOwes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-success">{formatPeso(r.hatodgoOwes)}</td>
                      <td className={`px-3 py-2 text-center text-xs font-bold ${balanceClass}`}>{status}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.lastSettlement ? new Date(r.lastSettlement.approved_at ?? r.lastSettlement.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {r.riderOwes > 0 && (
                            <Button variant="outline" size="sm" title="Mark cash remitted in full" onClick={() => adminCreateSettlement(r.id, "cash_remit", r.riderOwes, "Admin marked remitted")}>
                              <Banknote className="h-3 w-3" /> Remitted
                            </Button>
                          )}
                          {r.hatodgoOwes > 0 && (
                            <Button variant="outline" size="sm" title="Mark payout sent" onClick={() => adminCreateSettlement(r.id, "payout_to_rider", r.hatodgoOwes, "Admin marked paid")}>
                              <CheckCircle2 className="h-3 w-3" /> Paid
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setAdjustRiderId(r.id)}>
                            <Pencil className="h-3 w-3" /> Adjust
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pending settlements with receipts */}
        <h2 className="mb-2 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Receipt className="h-4 w-4" /> Pending settlements
        </h2>
        {settlements && settlements.filter(s => s.status === "pending").length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">All caught up — no pending settlements.</p>
        ) : (
          <ul className="space-y-2">
            {(settlements ?? []).filter(s => s.status === "pending").map(s => {
              const profile = profiles[s.rider_id];
              return (
                <li key={s.id} className="rounded-xl border border-warning/40 bg-warning/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{profile?.full_name ?? "Unknown"} · {SETTLEMENT_LABELS[s.type]}</p>
                      <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}{s.reference ? ` · Ref ${s.reference}` : ""}</p>
                      {s.notes && <p className="mt-1 text-xs italic text-muted-foreground">"{s.notes}"</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold tabular-nums">{formatPeso(Number(s.amount))}</span>
                      {s.receipt_url && (
                        <Button variant="outline" size="sm" onClick={async () => {
                          const { data } = await supabase.storage.from("wallet-receipts").createSignedUrl(s.receipt_url!, 300);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
                        }}>
                          <ExternalLink className="h-3 w-3" /> Receipt
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => decideSettlement(s.id, "rejected")} disabled={actingId === s.id}>Reject</Button>
                      <Button size="sm" onClick={() => decideSettlement(s.id, "approved")} disabled={actingId === s.id}>
                        {actingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Mark paid
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Full order ledger */}
        <h2 className="mb-2 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Package className="h-4 w-4" /> Order ledger ({ledgerInRange.length} in {range})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Order</th>
                <th className="px-3 py-2 text-left">Rider</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Service</th>
                <th className="px-3 py-2 text-left">Pay</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Rider</th>
                <th className="px-3 py-2 text-right">Co.</th>
                <th className="px-3 py-2 text-center">Settled</th>
              </tr>
            </thead>
            <tbody>
              {ledgerInRange.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-muted-foreground">No orders in this range.</td></tr>
              ) : ledgerInRange.slice(0, 200).map(row => {
                const ord = orderInfo[row.order_id];
                const custName = ord ? customerNames[ord.customer_id] : "";
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs">#{row.order_id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{profiles[row.rider_id]?.full_name ?? "—"}</td>
                    <td className="px-3 py-2">{custName || "—"}</td>
                    <td className="px-3 py-2 capitalize">{row.service_type.replace("_", " ")}</td>
                    <td className="px-3 py-2">
                      <Badge variant={row.collected_by === "rider" ? "outline" : "secondary"}>
                        {row.payment_method === "gcash" ? "GCash" : "Cash"}
                        {row.collected_by === "hatodgo" ? " → Co." : ""}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPeso(Number(row.customer_paid))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success">{formatPeso(Number(row.rider_earning))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPeso(Number(row.platform_commission))}</td>
                    <td className="px-3 py-2 text-center">
                      {row.settled
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                        : <span className="text-xs text-muted-foreground">No</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual adjustment dialog */}
      <AdjustmentDialog
        riderId={adjustRiderId}
        riderName={adjustRiderId ? profiles[adjustRiderId]?.full_name ?? null : null}
        adminId={user?.id ?? null}
        onClose={() => setAdjustRiderId(null)}
        onSaved={() => { setAdjustRiderId(null); void refresh(); }}
      />

      {/* End of day dialog */}
      <Dialog open={eodOpen} onOpenChange={setEodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End of day summary</DialogTitle>
            <DialogDescription>
              Save today's financial snapshot. You can revisit it any time from the archive.
            </DialogDescription>
          </DialogHeader>
          <EodForm
            todayLedger={ledger ?? []}
            settlements={settlements ?? []}
            onSubmit={(notes) => generateEod(notes)}
            onCancel={() => setEodOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function SummaryCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "success" | "warning";
}) {
  const accentClass =
    accent === "primary" ? "border-primary/40 bg-primary/5"
    : accent === "success" ? "border-success/40 bg-success/5"
    : accent === "warning" ? "border-warning/40 bg-warning/5"
    : "border-border bg-card";
  const iconClass =
    accent === "primary" ? "text-primary"
    : accent === "success" ? "text-success"
    : accent === "warning" ? "text-warning"
    : "text-muted-foreground";
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${accentClass}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</p>
        <span className={`[&>svg]:h-4 [&>svg]:w-4 ${iconClass}`}>{icon}</span>
      </div>
      <p className="mt-1 text-xl font-extrabold tabular-nums sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">{sub}</p>}
    </div>
  );
}

function AdjustmentDialog({
  riderId, riderName, adminId, onClose, onSaved,
}: {
  riderId: string | null;
  riderName: string | null;
  adminId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (riderId) {
      setAmount("");
      setNote("");
      setDirection("credit");
    }
  }, [riderId]);

  if (!riderId) return null;

  const submit = async () => {
    if (!adminId) return;
    const raw = Number(amount);
    if (!Number.isFinite(raw) || raw <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (note.trim().length < 3) {
      toast.error("A note is required (min 3 chars)");
      return;
    }
    setSubmitting(true);
    try {
      const signed = direction === "credit" ? raw : -raw;
      const { error } = await supabase.from("ledger_adjustments").insert({
        rider_id: riderId,
        amount: signed,
        note: note.trim(),
        admin_id: adminId,
      });
      if (error) throw error;
      toast.success("Balance adjusted");
      onSaved();
    } catch (err) {
      toast.error("Couldn't adjust", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!riderId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust balance — {riderName ?? "rider"}</DialogTitle>
          <DialogDescription>
            Manually credit or debit this rider. Use for bonuses, fines, or corrections. A note is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("credit")}
              className={`rounded-xl border p-3 text-sm font-semibold transition ${direction === "credit" ? "border-success bg-success/10 text-success" : "border-border bg-card"}`}
            >
              Credit (+) <span className="block text-[10px] font-normal opacity-70">HatodGo owes rider</span>
            </button>
            <button
              type="button"
              onClick={() => setDirection("debit")}
              className={`rounded-xl border p-3 text-sm font-semibold transition ${direction === "debit" ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-card"}`}
            >
              Debit (−) <span className="block text-[10px] font-normal opacity-70">Rider owes HatodGo</span>
            </button>
          </div>
          <div>
            <Label htmlFor="amt">Amount (₱)</Label>
            <Input id="amt" inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg" />
          </div>
          <div>
            <Label htmlFor="note">Note (required)</Label>
            <Textarea id="note" rows={3} placeholder="e.g. Performance bonus / Late penalty / Correction for order #abc"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="min-w-32">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EodForm({
  todayLedger, settlements, onSubmit, onCancel,
}: {
  todayLedger: LedgerRow[];
  settlements: Settlement[];
  onSubmit: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const todayWindow = useMemo(() => rangeWindow("today"), []);
  const fin = useMemo(() => summarizeFinance(todayLedger, settlements, todayWindow), [todayLedger, settlements, todayWindow]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-sm">
        <Stat label="Gross sales" value={formatPeso(fin.grossSales)} />
        <Stat label="Orders" value={String(fin.totalOrders)} />
        <Stat label="Company revenue" value={formatPeso(fin.companyRevenue)} />
        <Stat label="Rider earnings" value={formatPeso(fin.riderEarnings)} />
        <Stat label="Cash collected" value={formatPeso(fin.cashCollected)} />
        <Stat label="GCash received" value={formatPeso(fin.gcashReceived)} />
        <Stat label="Pending settlements" value={`${fin.pendingSettlementsCount} · ${formatPeso(fin.pendingSettlementsAmount)}`} />
      </div>
      <div className="mt-3">
        <Label htmlFor="eod-notes">Notes (optional)</Label>
        <Textarea id="eod-notes" rows={3} placeholder="Anything noteworthy about today…"
          value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <DialogFooter className="mt-3 gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(notes)}>
          <Download className="h-4 w-4" /> Save snapshot
        </Button>
      </DialogFooter>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  );
}
