import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adminConfirmPayment, isAwaitingPaymentConfirmation, singleFlight } from "@/lib/orderApi";
import { SERVICE_LABELS, type ServiceType } from "@/lib/orders";

interface PendingPayment {
  id: string;
  service_type: ServiceType;
  status: string;
  payment_method: string | null;
  payment_status: string;
  estimated_price: number | null;
  created_at: string;
  details: { payment_reference?: string; fare_breakdown?: { total?: number } } | null;
}

/**
 * Admin-only list of GCash/Maya orders waiting for a manual payment check.
 * The database function itself refuses non-admins; this panel is only
 * rendered on the admin page.
 */
export function ConfirmPaymentsPanel() {
  const [rows, setRows] = useState<PendingPayment[] | null>(null);
  const [target, setTarget] = useState<{ order: PendingPayment; confirm: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, service_type, status, payment_method, payment_status, estimated_price, created_at, details")
      .in("payment_method", ["gcash", "maya"])
      .in("payment_status", ["pending", "failed"])
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Couldn't load payments", { description: error.message });
      setRows([]);
      return;
    }
    setRows(((data ?? []) as PendingPayment[]).filter(isAwaitingPaymentConfirmation));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useMemo(
    () =>
      singleFlight(async (order: PendingPayment, confirm: boolean) => {
        setBusy(true);
        try {
          await adminConfirmPayment(order.id, confirm);
          toast.success(confirm ? "Payment confirmed" : "Marked as failed");
          setTarget(null);
          await load();
        } catch (err) {
          toast.error("Couldn't update payment", { description: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }),
    [load],
  );

  const amountOf = (o: PendingPayment) => Number(o.details?.fare_breakdown?.total ?? o.estimated_price ?? 0);

  return (
    <section className="mt-6 rounded-2xl border border-border/60 p-4" style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">E-wallet payments to confirm</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Check your GCash or Maya account for the transfer before confirming. Customers can't mark these paid themselves.
      </p>

      {rows === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No payments waiting for confirmation.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  ₱{amountOf(o).toFixed(2)} · {o.payment_method === "gcash" ? "GCash" : "Maya"}
                  {o.payment_status === "failed" && <span className="ml-2 text-xs text-destructive">(marked failed)</span>}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Order #{o.id.slice(0, 8)} · {SERVICE_LABELS[o.service_type]} · {new Date(o.created_at).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ref: {o.details?.payment_reference ?? "Not provided by customer"}
                </p>
              </div>
              <div className="flex gap-2">
                {o.payment_status === "pending" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setTarget({ order: o, confirm: false })}>
                    <XCircle className="h-4 w-4" /> Not received
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => setTarget({ order: o, confirm: true })}>
                  <CheckCircle2 className="h-4 w-4" /> Confirm paid
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!target} onOpenChange={(open) => !open && !busy && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{target?.confirm ? "Confirm this payment?" : "Mark payment as not received?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {target && (
                <>
                  ₱{amountOf(target.order).toFixed(2)} via {target.order.payment_method === "gcash" ? "GCash" : "Maya"} for order #
                  {target.order.id.slice(0, 8)}. Ref: {target.order.details?.payment_reference ?? "not provided"}.
                  {target.confirm
                    ? " The customer will see this order as paid. This can't be undone here."
                    : " The customer will see the payment as failed and can retry or switch to cash."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <Button
              disabled={busy}
              variant={target?.confirm ? "default" : "destructive"}
              onClick={() => target && void submit(target.order, target.confirm)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {target?.confirm ? "Yes, confirm paid" : "Yes, not received"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
