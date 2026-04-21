import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";

type Phase = "redirecting" | "select" | "processing";
type Wallet = "gcash" | "maya";

export const Route = createFileRoute("/checkout/$orderId/pay")({
  head: () => ({
    meta: [
      { title: "Secure checkout — HatodGo" },
      { name: "description", content: "Complete your HatodGo payment with GCash or Maya." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayPage,
});

function PayPage() {
  const { orderId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("redirecting");
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    // Simulate a hosted-checkout redirect
    const t = setTimeout(() => setPhase("select"), 1400);
    return () => clearTimeout(t);
  }, [user, loading, navigate]);

  const confirmPayment = async (choice: Wallet) => {
    setWallet(choice);
    setPhase("processing");

    // Simulate provider processing
    await new Promise((r) => setTimeout(r, 1600));

    const { error } = await supabase
      .from("orders")
      .update({ payment_method: choice, payment_status: "paid" })
      .eq("id", orderId);

    if (error) {
      toast.error(error.message);
      setPhase("select");
      return;
    }
    navigate({ to: "/checkout/$orderId/success", params: { orderId } });
  };

  if (phase === "redirecting") {
    return (
      <PageShell>
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
          <div className="relative">
            <div
              className="absolute inset-0 animate-ping rounded-full opacity-40"
              style={{ background: "var(--gradient-primary)" }}
            />
            <div
              className="relative flex h-20 w-20 items-center justify-center rounded-full text-primary-foreground"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <ShieldCheck className="h-8 w-8" />
            </div>
          </div>
          <h1 className="mt-6 font-display text-xl font-bold">Redirecting to secure payment…</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please don't close this page. Your checkout is being prepared.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/checkout/$orderId", params: { orderId } })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to summary
        </button>

        <div
          className="mt-6 rounded-2xl border border-border/60 p-6"
          style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Hosted checkout</p>
              <h1 className="font-display text-xl font-bold">Choose your e-wallet</h1>
            </div>
            <ShieldCheck className="h-6 w-6 text-success" />
          </div>

          <div className="mt-6 space-y-3">
            <WalletButton
              label="GCash"
              sub="Pay from your GCash balance"
              color="#007DFE"
              active={wallet === "gcash"}
              disabled={phase === "processing"}
              onClick={() => confirmPayment("gcash")}
            />
            <WalletButton
              label="Maya"
              sub="Pay from your Maya wallet"
              color="#00D632"
              active={wallet === "maya"}
              disabled={phase === "processing"}
              onClick={() => confirmPayment("maya")}
            />
          </div>

          {phase === "processing" && (
            <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary-glow">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing payment with {wallet === "gcash" ? "GCash" : "Maya"}…
            </div>
          )}

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            🔒 Encrypted · PCI-compliant · No card details stored
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full"
          disabled={phase === "processing"}
          onClick={() => navigate({ to: "/checkout/$orderId", params: { orderId } })}
        >
          Cancel and pick another method
        </Button>
      </div>
    </PageShell>
  );
}

function WalletButton({
  label,
  sub,
  color,
  active,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  color: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all disabled:opacity-60 ${
        active ? "border-primary/70 bg-primary/10" : "border-border/60 hover:border-primary/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {label[0]}
        </div>
        <div>
          <p className="font-display text-base font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      {active ? <Check className="h-5 w-5 text-success" /> : null}
    </button>
  );
}
