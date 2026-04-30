import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatPeso,
  SETTLEMENT_LABELS,
  STATUS_LABELS,
  summarizeWallet,
  type LedgerAdjustment,
  type LedgerRow,
  type Settlement,
} from "@/lib/wallet";

export const Route = createFileRoute("/admin/wallet")({
  head: () => ({
    meta: [
      { title: "Rider Wallets — Admin — HatodGo" },
      { name: "description", content: "Approve rider remittances, payouts, and view per-rider balances." },
    ],
  }),
  component: AdminWalletPage,
});

interface RiderProfile { id: string; full_name: string | null; phone: string | null; }

function AdminWalletPage() {
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [adjustments, setAdjustments] = useState<LedgerAdjustment[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, RiderProfile>>({});
  const [search, setSearch] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const [{ data: l, error: le }, { data: s, error: se }, { data: a, error: ae }, { data: rr, error: re }] = await Promise.all([
        supabase.from("wallet_ledger").select("*").order("created_at", { ascending: false }),
        supabase.from("settlements").select("*").order("created_at", { ascending: false }),
        supabase.from("ledger_adjustments").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "rider"),
      ]);
      if (le) throw le;
      if (se) throw se;
      if (ae) throw ae;
      if (re) throw re;
      const ledgerRows = (l ?? []) as LedgerRow[];
      const settlementRows = (s ?? []) as Settlement[];
      const adjustmentRows = (a ?? []) as LedgerAdjustment[];
      const riderRoleRows = (rr ?? []) as { user_id: string }[];
      setLedger(ledgerRows);
      setSettlements(settlementRows);
      setAdjustments(adjustmentRows);

      const ids = Array.from(new Set([
        ...riderRoleRows.map(r => r.user_id),
        ...ledgerRows.map(r => r.rider_id),
        ...settlementRows.map(r => r.rider_id),
        ...adjustmentRows.map(r => r.rider_id),
      ]));
      if (ids.length > 0) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
        const map: Record<string, RiderProfile> = {};
        (ps ?? []).forEach(p => { map[p.id] = p as RiderProfile; });
        setProfiles(map);
      } else {
        setProfiles({});
      }
    } catch (err) {
      console.error("[admin wallet] refresh failed", err);
      toast.error("Couldn't load wallet data", { description: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    if (loading || rolesLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (!isAdmin) return;
    void refresh();
  }, [user, loading, rolesLoading, isAdmin, navigate, refresh]);

  // Realtime
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin:wallet")
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_ledger" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_adjustments" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAdmin, refresh]);

  // Per-rider summary
  const perRider = useMemo(() => {
    if (!ledger || !settlements || !adjustments) return null;
    const riderIds = Array.from(new Set([
      ...Object.keys(profiles),
      ...ledger.map(r => r.rider_id),
      ...settlements.map(r => r.rider_id),
      ...adjustments.map(r => r.rider_id),
    ]));
    return riderIds.map(id => {
      const ll = ledger.filter(r => r.rider_id === id);
      const ss = settlements.filter(r => r.rider_id === id);
      const aa = adjustments.filter(r => r.rider_id === id);
      const summary = summarizeWallet(ll, ss, aa);
      const lastSettlement = ss.find(s => s.status === "approved");
      return { id, profile: profiles[id], summary, lastSettlement };
    }).sort((a, b) => Math.abs(b.summary.netBalance) - Math.abs(a.summary.netBalance));
  }, [ledger, settlements, adjustments, profiles]);

  const filteredRiders = useMemo(() => {
    if (!perRider) return null;
    const q = search.trim().toLowerCase();
    if (!q) return perRider;
    return perRider.filter(r =>
      (r.profile?.full_name ?? "").toLowerCase().includes(q) ||
      (r.profile?.phone ?? "").toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    );
  }, [perRider, search]);

  const pendingSettlements = useMemo(() => {
    if (!settlements) return [];
    return settlements.filter(s => s.status === "pending");
  }, [settlements]);

  // Lazy sign receipt URLs as needed
  const ensureSignedUrl = useCallback(async (path: string) => {
    if (signedUrls[path]) return signedUrls[path];
    const { data, error } = await supabase.storage.from("wallet-receipts").createSignedUrl(path, 300);
    if (error || !data) return null;
    setSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
    return data.signedUrl;
  }, [signedUrls]);

  const decide = async (id: string, status: "approved" | "rejected") => {
    if (!user) return;
    setActingId(id);
    try {
      const { error } = await supabase.from("settlements").update({
        status,
        admin_id: user.id,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
      toast.success(status === "approved" ? "Approved" : "Rejected");
      void refresh();
    } catch (err) {
      toast.error("Couldn't update", { description: (err as Error).message });
    } finally {
      setActingId(null);
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
      <div className="container mx-auto max-w-5xl px-3 pb-24 pt-3 sm:px-4 sm:pt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold sm:text-2xl">Rider Wallets</h1>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin">Back to admin</Link>
          </Button>
        </div>

        {/* Pending approvals */}
        <h2 className="mb-2 mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-4 w-4" /> Pending approvals ({pendingSettlements.length})
        </h2>
        {pendingSettlements.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">No pending settlements.</p>
        ) : (
          <ul className="space-y-2">
            {pendingSettlements.map(s => {
              const profile = profiles[s.rider_id];
              return (
                <li key={s.id} className="rounded-xl border border-warning/40 bg-warning/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{profile?.full_name ?? "Unknown rider"} · {SETTLEMENT_LABELS[s.type]}</p>
                      <p className="text-xs text-muted-foreground">
                        {profile?.phone ?? s.rider_id.slice(0, 8)} · {new Date(s.created_at).toLocaleString()}
                        {s.reference ? ` · Ref ${s.reference}` : ""}
                      </p>
                      {s.notes && <p className="mt-1 text-xs italic text-muted-foreground">"{s.notes}"</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold tabular-nums">{formatPeso(Number(s.amount))}</span>
                      {s.receipt_url && (
                        <Button variant="outline" size="sm" onClick={async () => {
                          const url = await ensureSignedUrl(s.receipt_url!);
                          if (url) window.open(url, "_blank", "noopener");
                        }}>
                          <ExternalLink className="h-3 w-3" /> Receipt
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => decide(s.id, "rejected")} disabled={actingId === s.id}>
                        <X className="h-3 w-3" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => decide(s.id, "approved")} disabled={actingId === s.id}>
                        {actingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Per-rider balances */}
        <h2 className="mb-2 mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Wallet className="h-4 w-4" /> Rider balances
        </h2>
        <Input
          placeholder="Search rider name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 h-11"
        />
        {filteredRiders === null ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        ) : filteredRiders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">No riders yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Rider</th>
                  <th className="px-3 py-2 text-right">Cash held</th>
                  <th className="px-3 py-2 text-right">Owes HatodGo</th>
                  <th className="px-3 py-2 text-right">Owed by HatodGo</th>
                  <th className="px-3 py-2 text-right">Net balance</th>
                  <th className="px-3 py-2 text-left">Last settled</th>
                </tr>
              </thead>
              <tbody>
                {filteredRiders.map(({ id, profile, summary, lastSettlement }) => {
                  const balanceClass = summary.netBalance > 0 ? "text-success" : summary.netBalance < 0 ? "text-destructive" : "text-foreground";
                  return (
                    <tr key={id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <p className="font-semibold">{profile?.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{profile?.phone ?? id.slice(0, 8)}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPeso(summary.cashHeldWeek)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatPeso(summary.riderOwes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-success">{formatPeso(summary.hatodgoOwes)}</td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${balanceClass}`}>
                        {summary.netBalance >= 0 ? "+" : ""}{formatPeso(summary.netBalance)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {lastSettlement ? `${SETTLEMENT_LABELS[lastSettlement.type]} · ${new Date(lastSettlement.approved_at ?? lastSettlement.created_at).toLocaleDateString()}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* All settlements (history) */}
        <h2 className="mb-2 mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h2>
        {settlements && settlements.length > 0 && (
          <ul className="space-y-2">
            {settlements.slice(0, 30).map(s => {
              const profile = profiles[s.rider_id];
              return (
                <li key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{profile?.full_name ?? "Unknown"} · {SETTLEMENT_LABELS[s.type]}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold tabular-nums">{formatPeso(Number(s.amount))}</span>
                    <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>
                      {STATUS_LABELS[s.status]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
