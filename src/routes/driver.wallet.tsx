import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Receipt,
  Send,
  ShieldAlert,
  Smartphone,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  STATUS_LABELS,
  SETTLEMENT_LABELS,
  summarizeWallet,
  type LedgerRow,
  type Settlement,
  type SettlementType,
} from "@/lib/wallet";

export const Route = createFileRoute("/driver/wallet")({
  head: () => ({
    meta: [
      { title: "Driver Wallet — HatodGo" },
      { name: "description", content: "Track your earnings, collected cash, GCash payments and balance with HatodGo." },
    ],
  }),
  component: DriverWalletPage,
});

function DriverWalletPage() {
  const { user, loading, isRider, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogType, setDialogType] = useState<SettlementType | null>(null);

  const refresh = useCallback(async (uid: string) => {
    setRefreshing(true);
    try {
      const [{ data: l, error: le }, { data: s, error: se }] = await Promise.all([
        supabase.from("wallet_ledger").select("*").eq("rider_id", uid).order("created_at", { ascending: false }),
        supabase.from("settlements").select("*").eq("rider_id", uid).order("created_at", { ascending: false }),
      ]);
      if (le) throw le;
      if (se) throw se;
      setLedger((l ?? []) as LedgerRow[]);
      setSettlements((s ?? []) as Settlement[]);
    } catch (err) {
      console.error("[wallet] refresh failed", err);
      toast.error("Couldn't load wallet", { description: (err as Error).message });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (!isRider && !isAdmin) return;
    void refresh(user.id);
  }, [user, loading, isRider, isAdmin, navigate, refresh]);

  // Realtime: refresh on new ledger row or settlement update
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`wallet:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_ledger", filter: `rider_id=eq.${user.id}` }, () => void refresh(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter: `rider_id=eq.${user.id}` }, () => void refresh(user.id))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, refresh]);

  const summary = useMemo(() => {
    if (!ledger || !settlements) return null;
    return summarizeWallet(ledger, settlements);
  }, [ledger, settlements]);

  if (loading || !user) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading wallet…
        </div>
      </PageShell>
    );
  }

  if (!isRider && !isAdmin) {
    return (
      <PageShell>
        <div className="container mx-auto max-w-md px-4 py-12 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-warning" />
          <h1 className="mb-2 text-2xl font-bold">Riders only</h1>
          <p className="text-muted-foreground">The wallet is for HatodGo riders. Contact admin if you should have access.</p>
        </div>
      </PageShell>
    );
  }

  const owed = summary?.netBalance ?? 0;
  const balanceColor = owed > 0 ? "bg-success/10 border-success text-success" : owed < 0 ? "bg-destructive/10 border-destructive text-destructive" : "bg-muted border-border text-foreground";
  const balanceLabel = owed > 0 ? "HatodGo owes you" : owed < 0 ? "You owe HatodGo" : "All settled";

  return (
    <PageShell>
      <div className="container mx-auto max-w-2xl px-3 pb-24 pt-3 sm:px-4 sm:pt-6">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold sm:text-2xl">My Wallet</h1>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/driver">Back to dashboard</Link>
          </Button>
        </div>

        {/* Balance card — the headline number */}
        <div className={`rounded-2xl border-2 p-5 ${balanceColor}`}>
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">{balanceLabel}</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums sm:text-5xl">{formatPeso(Math.abs(owed))}</p>
          <p className="mt-2 text-xs opacity-80">
            {owed > 0
              ? "You'll receive this on your next payout."
              : owed < 0
                ? "Remit this amount to HatodGo to settle."
                : "Your account is fully settled."}
          </p>
        </div>

        {/* Earnings */}
        <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>Earnings</SectionTitle>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile label="Today" value={formatPeso(summary?.todayEarnings ?? 0)} />
          <StatTile label="This week" value={formatPeso(summary?.weekEarnings ?? 0)} />
          <StatTile label="Lifetime" value={formatPeso(summary?.lifetimeEarnings ?? 0)} />
        </div>

        {/* Collections */}
        <SectionTitle icon={<Banknote className="h-4 w-4" />}>Collections</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <StatTile label="Cash today" value={formatPeso(summary?.cashHeldToday ?? 0)} accent="warning" />
          <StatTile label="GCash today" value={formatPeso(summary?.gcashCollectedToday ?? 0)} accent="primary" />
          <StatTile label="Cash this week" value={formatPeso(summary?.cashHeldWeek ?? 0)} />
          <StatTile label="GCash this week" value={formatPeso(summary?.gcashCollectedWeek ?? 0)} />
        </div>

        {/* Settlement actions */}
        <SectionTitle icon={<Send className="h-4 w-4" />}>Settle up</SectionTitle>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ActionButton
            icon={<Banknote className="h-5 w-5" />}
            label="Mark cash remitted"
            onClick={() => setDialogType("cash_remit")}
            disabled={(summary?.riderOwes ?? 0) <= 0}
          />
          <ActionButton
            icon={<Smartphone className="h-5 w-5" />}
            label="Paid via GCash"
            onClick={() => setDialogType("gcash_to_hatodgo")}
            disabled={(summary?.riderOwes ?? 0) <= 0}
          />
          <ActionButton
            icon={<ArrowDownToLine className="h-5 w-5" />}
            label="Request payout"
            onClick={() => setDialogType("payout_to_rider")}
            disabled={(summary?.hatodgoOwes ?? 0) <= 0}
          />
        </div>

        {/* Settlements list */}
        <SectionTitle icon={<Receipt className="h-4 w-4" />}>Recent settlements</SectionTitle>
        {settlements === null ? (
          <SkeletonRow />
        ) : settlements.length === 0 ? (
          <EmptyHint>No remittances yet.</EmptyHint>
        ) : (
          <ul className="space-y-2">
            {settlements.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{SETTLEMENT_LABELS[s.type]}</p>
                  <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums">{formatPeso(Number(s.amount))}</span>
                  <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>
                    {s.status === "approved" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                    {s.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                    {s.status === "rejected" && <X className="mr-1 h-3 w-3" />}
                    {STATUS_LABELS[s.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Order ledger */}
        <SectionTitle icon={<ArrowUpFromLine className="h-4 w-4" />}>Order ledger</SectionTitle>
        {ledger === null ? (
          <SkeletonRow />
        ) : ledger.length === 0 ? (
          <EmptyHint>Completed orders will appear here.</EmptyHint>
        ) : (
          <ul className="space-y-2">
            {ledger.slice(0, 20).map((row) => (
              <li key={row.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold capitalize">{row.service_type.replace("_", " ")}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">#{row.order_id.slice(0, 8)} · {new Date(row.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={row.collected_by === "rider" ? "outline" : "secondary"} className="shrink-0">
                    {row.payment_method === "gcash" ? "GCash" : "Cash"}
                    {row.collected_by === "hatodgo" ? " → HatodGo" : ""}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <LedgerCell label="Customer paid" value={formatPeso(Number(row.customer_paid))} />
                  <LedgerCell label="Your earning" value={formatPeso(Number(row.rider_earning))} accent="success" />
                  <LedgerCell label="HatodGo cut" value={formatPeso(Number(row.platform_commission))} accent="muted" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {refreshing && (
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
          </p>
        )}
      </div>

      <SettlementDialog
        type={dialogType}
        onClose={() => setDialogType(null)}
        userId={user.id}
        suggestedAmount={
          dialogType === "cash_remit"
            ? summary?.riderOwes
            : dialogType === "gcash_to_hatodgo"
              ? summary?.riderOwes
              : summary?.hatodgoOwes
        }
        onCreated={() => { setDialogType(null); void refresh(user.id); }}
      />
    </PageShell>
  );
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {children}
    </h2>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "primary" | "warning" | "success" }) {
  const accentClass =
    accent === "primary" ? "text-primary"
    : accent === "warning" ? "text-warning"
    : accent === "success" ? "text-success"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${accentClass}`}>{value}</p>
    </div>
  );
}

function ActionButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-secondary"
    >
      {icon}
      {label}
    </button>
  );
}

function LedgerCell({ label, value, accent }: { label: string; value: string; accent?: "success" | "muted" }) {
  const cls = accent === "success" ? "text-success" : accent === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function SkeletonRow() { return <div className="h-16 animate-pulse rounded-xl bg-muted" />; }
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">{children}</p>;
}

function SettlementDialog({
  type, onClose, userId, suggestedAmount, onCreated,
}: {
  type: SettlementType | null;
  onClose: () => void;
  userId: string;
  suggestedAmount: number | undefined;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (type) {
      setAmount(suggestedAmount && suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");
      setReference("");
      setNotes("");
      setFile(null);
    }
  }, [type, suggestedAmount]);

  if (!type) return null;

  const requiresReceipt = type !== "cash_remit"; // GCash and payout requests should have a receipt
  const title = type === "cash_remit" ? "Remit cash to HatodGo" : type === "gcash_to_hatodgo" ? "Paid via GCash" : "Request a payout";

  const onSubmit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (requiresReceipt && !file) {
      toast.error("Receipt is required", { description: "Upload a screenshot for GCash settlements." });
      return;
    }
    setSubmitting(true);
    try {
      let receiptUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("wallet-receipts").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        receiptUrl = path;
      }
      const { error } = await supabase.from("settlements").insert({
        rider_id: userId,
        type,
        amount: amt,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        receipt_url: receiptUrl,
      });
      if (error) throw error;
      toast.success("Submitted", { description: "Admin will review and approve shortly." });
      onCreated();
    } catch (err) {
      console.error("[wallet] submit settlement failed", err);
      toast.error("Couldn't submit", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!type} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {type === "cash_remit" && "Tell HatodGo how much cash you turned in."}
            {type === "gcash_to_hatodgo" && "Confirm the amount you sent to HatodGo via GCash."}
            {type === "payout_to_rider" && "Request HatodGo to send your earnings via GCash."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="amt">Amount (₱)</Label>
            <Input id="amt" inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg" />
          </div>
          {type !== "cash_remit" && (
            <div>
              <Label htmlFor="ref">Reference number {type === "payout_to_rider" ? "(your GCash number)" : "(GCash ref #)"}</Label>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} className="h-12" />
            </div>
          )}
          <div>
            <Label htmlFor="receipt">{requiresReceipt ? "Receipt photo (required)" : "Receipt photo (optional)"}</Label>
            <Input id="receipt" ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-12" />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting} className="h-12 min-w-32">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
