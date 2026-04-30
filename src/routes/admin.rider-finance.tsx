import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
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
  formatPeso,
  summarizeWallet,
  type LedgerAdjustment,
  type LedgerRow,
  type Settlement,
} from "@/lib/wallet";

export const Route = createFileRoute("/admin/rider-finance")({
  head: () => ({
    meta: [
      { title: "Rider Finance Dashboard — Admin — HatodGo" },
      { name: "description", content: "Owner view of every rider's jobs, money collected, money owed, and payouts." },
    ],
  }),
  component: AdminRiderFinancePage,
});

interface RiderProfile { id: string; full_name: string | null; phone: string | null; }

const ONLINE_WINDOW_MS = 5 * 60_000; // rider considered online if last ping within 5 min

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function AdminRiderFinancePage() {
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [adjustments, setAdjustments] = useState<LedgerAdjustment[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, RiderProfile>>({});
  const [riderIds, setRiderIds] = useState<string[]>([]);
  const [onlineMap, setOnlineMap] = useState<Record<string, string>>({}); // rider_id -> last update iso
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>("");
  const [adjustNote, setAdjustNote] = useState<string>("");
  const [acting, setActing] = useState<string | null>(null);
  const [showSample, setShowSample] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const sinceIso = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
      const [
        { data: l, error: le },
        { data: s, error: se },
        { data: a, error: ae },
        { data: rr, error: re },
        { data: locs },
      ] = await Promise.all([
        supabase.from("wallet_ledger").select("*").order("created_at", { ascending: false }),
        supabase.from("settlements").select("*").order("created_at", { ascending: false }),
        supabase.from("ledger_adjustments").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "rider"),
        supabase.from("driver_locations").select("rider_id, updated_at").gte("updated_at", sinceIso),
      ]);
      if (le) throw le;
      if (se) throw se;
      if (ae) throw ae;
      if (re) throw re;

      const ledgerRows = (l ?? []) as LedgerRow[];
      const settlementRows = (s ?? []) as Settlement[];
      const adjustmentRows = (a ?? []) as LedgerAdjustment[];
      const roleIds = ((rr ?? []) as { user_id: string }[]).map(r => r.user_id);

      setLedger(ledgerRows);
      setSettlements(settlementRows);
      setAdjustments(adjustmentRows);

      const ids = Array.from(new Set([
        ...roleIds,
        ...ledgerRows.map(r => r.rider_id),
        ...settlementRows.map(r => r.rider_id),
        ...adjustmentRows.map(r => r.rider_id),
      ]));
      setRiderIds(ids);

      if (ids.length > 0) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
        const map: Record<string, RiderProfile> = {};
        (ps ?? []).forEach(p => { map[p.id] = p as RiderProfile; });
        setProfiles(map);
      }

      const om: Record<string, string> = {};
      ((locs ?? []) as { rider_id: string; updated_at: string }[]).forEach(r => {
        if (!om[r.rider_id] || r.updated_at > om[r.rider_id]) om[r.rider_id] = r.updated_at;
      });
      setOnlineMap(om);
    } catch (err) {
      console.error("[rider-finance] refresh failed", err);
      toast.error("Couldn't load rider finance data", { description: (err as Error).message });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading || rolesLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (!isAdmin) return;
    void refresh();
  }, [user, loading, rolesLoading, isAdmin, navigate, refresh]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin:rider-finance")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_ledger" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_adjustments" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, () => void refresh())
      .subscribe();
    const t = setInterval(() => void refresh(), 30_000);
    return () => { void supabase.removeChannel(channel); clearInterval(t); };
  }, [isAdmin, refresh]);

  const todayStart = useMemo(() => startOfToday(), []);

  const rows = useMemo(() => {
    if (!ledger || !settlements || !adjustments) return null;
    return riderIds.map(id => {
      const ll = ledger.filter(r => r.rider_id === id);
      const ss = settlements.filter(r => r.rider_id === id);
      const aa = adjustments.filter(r => r.rider_id === id);
      const wl = summarizeWallet(ll, ss, aa);
      const today = ll.filter(r => new Date(r.created_at) >= todayStart);
      const grossToday = today.reduce((s, r) => s + Number(r.customer_paid), 0);
      const cashHeldToday = today.filter(r => r.payment_method === "cash" && r.collected_by === "rider")
        .reduce((s, r) => s + Number(r.customer_paid), 0);
      const gcashToday = today.filter(r => r.payment_method === "gcash")
        .reduce((s, r) => s + Number(r.customer_paid), 0);
      const earningsToday = today.reduce((s, r) => s + Number(r.rider_earning), 0);
      const lastSettlement = ss.find(x => x.status === "approved");
      const lastOnline = onlineMap[id];
      return {
        id,
        profile: profiles[id],
        online: !!lastOnline,
        lastOnline,
        jobsToday: today.length,
        grossToday,
        cashHeldToday,
        gcashToday,
        earningsToday,
        riderOwes: wl.riderOwes,
        hatodgoOwes: wl.hatodgoOwes,
        lastSettlement,
        todayJobs: today,
      };
    }).sort((a, b) => {
      // riders who owe first (alert)
      if ((b.riderOwes > 0 ? 1 : 0) !== (a.riderOwes > 0 ? 1 : 0)) return (b.riderOwes > 0 ? 1 : 0) - (a.riderOwes > 0 ? 1 : 0);
      return b.jobsToday - a.jobsToday;
    });
  }, [ledger, settlements, adjustments, riderIds, profiles, onlineMap, todayStart]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const todayLedger = ledger?.filter(r => new Date(r.created_at) >= todayStart) ?? [];
    const grossSalesToday = todayLedger.reduce((s, r) => s + Number(r.customer_paid), 0);
    const riderCostToday = todayLedger.reduce((s, r) => s + Number(r.rider_earning), 0);
    const companyRevenue = todayLedger.reduce((s, r) => s + Number(r.platform_commission), 0);
    return {
      ridersToday: rows.filter(r => r.jobsToday > 0).length,
      jobsToday: rows.reduce((s, r) => s + r.jobsToday, 0),
      cashCollected: rows.reduce((s, r) => s + r.cashHeldToday, 0),
      gcashCollected: rows.reduce((s, r) => s + r.gcashToday, 0),
      companyRevenue,
      grossSalesToday,
      riderCostToday,
      netProfitToday: grossSalesToday - riderCostToday,
      riderEarningsUnpaid: rows.reduce((s, r) => s + r.hatodgoOwes, 0),
      ridersOwing: rows.filter(r => r.riderOwes > 0).length,
    };
  }, [rows, ledger, todayStart]);

  // Sample rows for visual inspection (admin-only test toggle, no DB writes)
  const sampleRows = useMemo(() => {
    return [
      {
        id: "sample-1",
        profile: { id: "sample-1", full_name: "Juan Dela Cruz (sample)", phone: "0917 000 0001" } as RiderProfile,
        online: true,
        lastOnline: new Date().toISOString() as string | undefined,
        jobsToday: 8,
        grossToday: 1240,
        cashHeldToday: 720,
        gcashToday: 520,
        earningsToday: 992,
        riderOwes: 144,
        hatodgoOwes: 0,
        lastSettlement: null as Settlement | null,
        todayJobs: [] as LedgerRow[],
        sample: true,
      },
      {
        id: "sample-2",
        profile: { id: "sample-2", full_name: "Maria Santos (sample)", phone: "0917 000 0002" } as RiderProfile,
        online: true,
        lastOnline: new Date().toISOString() as string | undefined,
        jobsToday: 5,
        grossToday: 860,
        cashHeldToday: 0,
        gcashToday: 860,
        earningsToday: 688,
        riderOwes: 0,
        hatodgoOwes: 688,
        lastSettlement: null as Settlement | null,
        todayJobs: [] as LedgerRow[],
        sample: true,
      },
      {
        id: "sample-3",
        profile: { id: "sample-3", full_name: "Pedro Reyes (sample)", phone: "0917 000 0003" } as RiderProfile,
        online: false,
        lastOnline: undefined as string | undefined,
        jobsToday: 0,
        grossToday: 0,
        cashHeldToday: 0,
        gcashToday: 0,
        earningsToday: 0,
        riderOwes: 0,
        hatodgoOwes: 0,
        lastSettlement: null as Settlement | null,
        todayJobs: [] as LedgerRow[],
        sample: true,
      },
    ];
  }, []);

  // Demo placeholder row used when there are no riders at all
  const demoRow = useMemo(() => ({
    id: "demo",
    profile: { id: "demo", full_name: "Demo Rider", phone: "—" } as RiderProfile,
    online: false,
    lastOnline: undefined as string | undefined,
    jobsToday: 0,
    grossToday: 0,
    cashHeldToday: 0,
    gcashToday: 0,
    earningsToday: 0,
    riderOwes: 0,
    hatodgoOwes: 0,
    lastSettlement: null as Settlement | null,
    todayJobs: [] as LedgerRow[],
    sample: true,
  }), []);

  const displayRows = useMemo(() => {
    if (showSample) return sampleRows;
    if (!rows) return null;
    if (rows.length === 0) return [demoRow];
    return rows;
  }, [showSample, rows, sampleRows, demoRow]);

  const displaySummary = useMemo(() => {
    if (!showSample) return summary;
    const grossSalesToday = sampleRows.reduce((s, r) => s + r.grossToday, 0);
    const riderCostToday = sampleRows.reduce((s, r) => s + r.earningsToday, 0);
    return {
      ridersToday: sampleRows.filter(r => r.jobsToday > 0).length,
      jobsToday: sampleRows.reduce((s, r) => s + r.jobsToday, 0),
      cashCollected: sampleRows.reduce((s, r) => s + r.cashHeldToday, 0),
      gcashCollected: sampleRows.reduce((s, r) => s + r.gcashToday, 0),
      companyRevenue: grossSalesToday - riderCostToday,
      grossSalesToday,
      riderCostToday,
      netProfitToday: grossSalesToday - riderCostToday,
      riderEarningsUnpaid: sampleRows.reduce((s, r) => s + r.hatodgoOwes, 0),
      ridersOwing: sampleRows.filter(r => r.riderOwes > 0).length,
    };
  }, [showSample, sampleRows, summary]);


  const markRiderPaid = async (riderId: string) => {
    if (!user || !rows) return;
    const row = rows.find(r => r.id === riderId);
    if (!row || row.hatodgoOwes <= 0) {
      toast.info("Nothing to pay this rider.");
      return;
    }
    setActing(riderId);
    try {
      const { error } = await supabase.from("settlements").insert({
        rider_id: riderId,
        type: "payout_to_rider",
        amount: row.hatodgoOwes,
        status: "approved",
        admin_id: user.id,
        approved_at: new Date().toISOString(),
        notes: "Marked paid by admin",
      });
      if (error) throw error;
      toast.success(`Paid ${formatPeso(row.hatodgoOwes)} to rider`);
      void refresh();
    } catch (err) {
      toast.error("Couldn't record payout", { description: (err as Error).message });
    } finally { setActing(null); }
  };

  const markCashRemitted = async (riderId: string) => {
    if (!user || !rows) return;
    const row = rows.find(r => r.id === riderId);
    if (!row || row.riderOwes <= 0) {
      toast.info("Rider owes nothing.");
      return;
    }
    setActing(riderId);
    try {
      const { error } = await supabase.from("settlements").insert({
        rider_id: riderId,
        type: "cash_remit",
        amount: row.riderOwes,
        status: "approved",
        admin_id: user.id,
        approved_at: new Date().toISOString(),
        notes: "Cash remitted (marked by admin)",
      });
      if (error) throw error;
      toast.success(`Recorded ${formatPeso(row.riderOwes)} cash remit`);
      void refresh();
    } catch (err) {
      toast.error("Couldn't record remit", { description: (err as Error).message });
    } finally { setActing(null); }
  };

  const submitAdjustment = async () => {
    if (!user || !adjustOpen) return;
    const amt = Number(adjustAmount);
    if (!Number.isFinite(amt) || amt === 0) {
      toast.error("Enter a non-zero amount (use negative if rider owes us).");
      return;
    }
    if (!adjustNote.trim()) {
      toast.error("Add a note explaining the adjustment.");
      return;
    }
    try {
      const { error } = await supabase.from("ledger_adjustments").insert({
        rider_id: adjustOpen,
        admin_id: user.id,
        amount: amt,
        note: adjustNote.trim(),
      });
      if (error) throw error;
      toast.success("Adjustment saved");
      setAdjustOpen(null);
      setAdjustAmount("");
      setAdjustNote("");
      void refresh();
    } catch (err) {
      toast.error("Couldn't save adjustment", { description: (err as Error).message });
    }
  };

  if (loading || rolesLoading) {
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CircleDollarSign className="h-7 w-7 text-primary-glow" />
            <div>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Rider Finance Dashboard</h1>
              <p className="text-xs text-muted-foreground">Live jobs, cash, GCash & payouts — refreshes every 30s.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showSample ? "default" : "outline"}
              size="sm"
              onClick={() => setShowSample(s => !s)}
            >
              <Sparkles className="h-4 w-4" />
              {showSample ? "Hide sample data" : "Load sample finance data"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/finance">Company Finance</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">Admin home</Link>
            </Button>
          </div>
        </div>

        {showSample && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            <Sparkles className="mr-1 inline h-3 w-3" /> Showing <strong>sample data</strong> for layout inspection. No real records are affected. Action buttons are disabled.
          </div>
        )}

        {/* Hero KPI — Net profit today (the #1 number) */}
        <div className="mt-5 rounded-2xl border border-success/40 bg-gradient-to-br from-success/15 via-success/5 to-transparent p-4 sm:p-6 shadow">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-success">Net profit today (after rider costs)</p>
              <p className="mt-1 font-display text-4xl font-bold text-success sm:text-5xl">
                {formatPeso(displaySummary?.netProfitToday ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Gross sales <strong className="text-foreground">{formatPeso(displaySummary?.grossSalesToday ?? 0)}</strong>
                {" − "}rider earnings <strong className="text-foreground">{formatPeso(displaySummary?.riderCostToday ?? 0)}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 text-success">
              <TrendingUp className="h-10 w-10 sm:h-12 sm:w-12" />
            </div>
          </div>
        </div>

        {/* Summary cards — always render, even with zero values */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Card icon={<Users />} label="Total riders today" value={String(displaySummary?.ridersToday ?? 0)} />
          <Card icon={<Package />} label="Jobs completed today" value={String(displaySummary?.jobsToday ?? 0)} />
          <Card accent="warning" icon={<Banknote />} label="Cash collected today" value={formatPeso(displaySummary?.cashCollected ?? 0)} />
          <Card accent="primary" icon={<Smartphone />} label="GCash collected today" value={formatPeso(displaySummary?.gcashCollected ?? 0)} />
          <Card accent="success" icon={<TrendingUp />} label="Company revenue today" value={formatPeso(displaySummary?.companyRevenue ?? 0)} />
          <Card icon={<Wallet />} label="Rider earnings owed" value={formatPeso(displaySummary?.riderEarningsUnpaid ?? 0)} />
          <Card accent={displaySummary && displaySummary.ridersOwing > 0 ? "danger" : undefined} icon={<AlertTriangle />} label="Riders owing company" value={String(displaySummary?.ridersOwing ?? 0)} />
          <Card accent="success" icon={<CheckCircle2 />} label="Settled riders" value={String(Math.max(0, (displayRows?.filter(r => !("sample" in r) || !r.sample).length ?? 0) - (displaySummary?.ridersOwing ?? 0)))} />
        </div>

        {/* Rider table — always render structure */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-border/60" style={{ background: "var(--gradient-card)" }}>
          {displayRows === null ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3"></th>
                    <th className="px-3 py-3">Rider</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Jobs</th>
                    <th className="px-3 py-3 text-right">Gross</th>
                    <th className="px-3 py-3 text-right">Cash held</th>
                    <th className="px-3 py-3 text-right">GCash</th>
                    <th className="px-3 py-3 text-right">Earnings</th>
                    <th className="px-3 py-3 text-right">Owes us</th>
                    <th className="px-3 py-3 text-right">We owe</th>
                    <th className="px-3 py-3">Last settle</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map(r => {
                    const isSample = "sample" in r && r.sample;
                    const isOpen = expanded === r.id;
                    const owesUs = r.riderOwes > 0;
                    const weOwe = r.hatodgoOwes > 0;
                    const rowAccent = owesUs
                      ? "bg-destructive/15 hover:bg-destructive/20 border-l-4 border-l-destructive"
                      : weOwe ? "bg-success/10 hover:bg-success/15 border-l-4 border-l-success" : "hover:bg-secondary/40 border-l-4 border-l-transparent";
                    return (
                      <Fragment key={r.id}>
                        <tr
                          key={r.id}
                          className={`cursor-pointer border-b border-border/40 transition ${rowAccent}`}
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                        >
                          <td className="px-3 py-3">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div>
                                <div className="font-medium">{r.profile?.full_name ?? `Rider ${r.id.slice(0, 6)}`}</div>
                                <div className="text-xs text-muted-foreground">{r.profile?.phone ?? "—"}</div>
                              </div>
                              {owesUs && (
                                <Badge className="border border-destructive bg-destructive text-destructive-foreground font-bold uppercase tracking-wide shadow-sm animate-pulse">
                                  Owes {formatPeso(r.riderOwes)}
                                </Badge>
                              )}
                              {weOwe && (
                                <Badge className="border border-success bg-success text-success-foreground font-bold uppercase tracking-wide shadow-sm">
                                  We owe {formatPeso(r.hatodgoOwes)}
                                </Badge>
                              )}
                              {!owesUs && !weOwe && (
                                <Badge variant="outline" className="text-muted-foreground">Settled</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {r.online ? (
                              <Badge className="border border-success/40 bg-success/15 text-success">● Online</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">Offline</Badge>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono">{r.jobsToday}</td>
                          <td className="px-3 py-3 text-right font-mono">{formatPeso(r.grossToday)}</td>
                          <td className="px-3 py-3 text-right font-mono">{formatPeso(r.cashHeldToday)}</td>
                          <td className="px-3 py-3 text-right font-mono">{formatPeso(r.gcashToday)}</td>
                          <td className="px-3 py-3 text-right font-mono">{formatPeso(r.earningsToday)}</td>
                          <td className={`px-3 py-3 text-right font-mono ${owesUs ? "bg-destructive/20 font-bold text-destructive" : "text-muted-foreground"}`}>{formatPeso(r.riderOwes)}</td>
                          <td className={`px-3 py-3 text-right font-mono ${weOwe ? "bg-success/20 font-bold text-success" : "text-muted-foreground"}`}>{formatPeso(r.hatodgoOwes)}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {r.lastSettlement ? new Date(r.lastSettlement.approved_at ?? r.lastSettlement.created_at).toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="outline" disabled={isSample || !weOwe || acting === r.id} onClick={() => markRiderPaid(r.id)}>Pay</Button>
                              <Button size="sm" variant="outline" disabled={isSample || !owesUs || acting === r.id} onClick={() => markCashRemitted(r.id)}>Remit</Button>
                              <Button size="sm" variant="ghost" disabled={isSample} onClick={() => { setAdjustOpen(r.id); setAdjustAmount(""); setAdjustNote(""); }}>
                                <Pencil className="h-3 w-3" /> Adjust
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${r.id}-details`} className="border-b border-border/40 bg-card/60">
                            <td colSpan={12} className="p-4">
                              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <h3 className="font-display text-lg font-bold">
                                    {r.profile?.full_name ?? `Rider ${r.id.slice(0, 6)}`} — Daily Breakdown
                                  </h3>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · {r.todayJobs.length} job{r.todayJobs.length === 1 ? "" : "s"}
                                  </p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross today</div>
                                    <div className="font-mono text-base font-bold">{formatPeso(r.grossToday)}</div>
                                  </div>
                                  <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Earnings</div>
                                    <div className="font-mono text-base font-bold">{formatPeso(r.earningsToday)}</div>
                                  </div>
                                  <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wider text-warning">Cash held</div>
                                    <div className="font-mono text-base font-bold text-warning">{formatPeso(r.cashHeldToday)}</div>
                                  </div>
                                  <div className={`rounded-lg border px-3 py-2 ${r.riderOwes > 0 ? "border-destructive bg-destructive/15" : r.hatodgoOwes > 0 ? "border-success bg-success/15" : "border-border/60 bg-card/80"}`}>
                                    <div className={`text-[10px] uppercase tracking-wider ${r.riderOwes > 0 ? "text-destructive" : r.hatodgoOwes > 0 ? "text-success" : "text-muted-foreground"}`}>
                                      {r.riderOwes > 0 ? "Need to remit" : r.hatodgoOwes > 0 ? "We owe rider" : "Settled"}
                                    </div>
                                    <div className={`font-mono text-base font-bold ${r.riderOwes > 0 ? "text-destructive" : r.hatodgoOwes > 0 ? "text-success" : ""}`}>
                                      {formatPeso(r.riderOwes > 0 ? r.riderOwes : r.hatodgoOwes)}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {r.todayJobs.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                                  No completed jobs today.
                                </p>
                              ) : (
                                <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60 bg-card/40">
                                  {r.todayJobs.map(j => {
                                    const isCash = j.payment_method === "cash";
                                    return (
                                      <li key={j.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-secondary/30">
                                        <div className="w-16 font-mono text-xs text-muted-foreground">
                                          {new Date(j.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                        </div>
                                        <div className="min-w-[80px] flex-1">
                                          <div className="text-sm font-medium capitalize">{j.service_type}</div>
                                          <div className="text-[11px] capitalize text-muted-foreground">
                                            {j.payment_method}{j.gcash_to ? ` → ${j.gcash_to}` : ""} · rider {formatPeso(Number(j.rider_earning))} · co. {formatPeso(Number(j.platform_commission))}
                                          </div>
                                        </div>
                                        <div className="font-mono text-sm font-semibold">{formatPeso(Number(j.customer_paid))}</div>
                                        {isCash ? (
                                          <Badge className="border border-warning/40 bg-warning/15 text-warning">Cash</Badge>
                                        ) : (
                                          <Badge className="border border-primary/40 bg-primary/15 text-primary">{j.gcash_to === "rider" ? "GCash→Rider" : "GCash→HatodGo"}</Badge>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}

                              <div className="mt-3 flex flex-wrap gap-2">
                                {r.riderOwes > 0 && (
                                  <Button size="sm" disabled={isSample || acting === r.id} onClick={() => markCashRemitted(r.id)}>
                                    Mark {formatPeso(r.riderOwes)} remitted
                                  </Button>
                                )}
                                {r.hatodgoOwes > 0 && (
                                  <Button size="sm" disabled={isSample || acting === r.id} onClick={() => markRiderPaid(r.id)}>
                                    Pay rider {formatPeso(r.hatodgoOwes)}
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" asChild>
                                  <Link to="/admin/finance">View weekly history</Link>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Empty state message — shown when no real ledger activity yet */}
        {!showSample && rows && rows.length === 0 && (
          <p className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
            No completed trips yet. Values will auto-populate when riders complete orders.
          </p>
        )}
        {!showSample && rows && rows.length > 0 && (rows.every(r => r.jobsToday === 0)) && (
          <p className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
            No completed trips yet today. Values will auto-populate when riders complete orders.
          </p>
        )}
        {/* Adjustment dialog */}
        <Dialog open={!!adjustOpen} onOpenChange={(o) => { if (!o) setAdjustOpen(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manual adjustment</DialogTitle>
              <DialogDescription>
                Positive amount = HatodGo owes the rider more. Negative = rider owes HatodGo more.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Amount (₱)</Label>
                <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="-50 or 100" />
              </div>
              <div>
                <Label>Note</Label>
                <Textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Reason for the adjustment…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAdjustOpen(null)}>Cancel</Button>
              <Button onClick={submitAdjustment}>Save adjustment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageShell>
  );
}

function Card({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "primary" | "success" | "warning" | "danger" }) {
  const tone = accent === "danger"
    ? "border-destructive/40 bg-destructive/5"
    : accent === "warning"
    ? "border-warning/40 bg-warning/5"
    : accent === "success"
    ? "border-success/40 bg-success/5"
    : accent === "primary"
    ? "border-primary/40 bg-primary/5"
    : "border-border/60";
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${tone}`} style={{ background: accent ? undefined : "var(--gradient-card)" }}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="opacity-80">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 font-mono text-lg font-semibold sm:text-xl">{value}</div>
    </div>
  );
}
