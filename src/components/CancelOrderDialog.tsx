import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const CANCEL_REASONS = [
  { value: "changed_mind", label: "I changed my mind" },
  { value: "wrong_address", label: "Wrong pickup or drop-off address" },
  { value: "rider_too_far", label: "Rider is too far / waiting too long" },
  { value: "duplicate_order", label: "I placed a duplicate order" },
  { value: "found_alternative", label: "I found another way / arranged transport" },
  { value: "price_too_high", label: "Estimated price is too high" },
  { value: "other", label: "Other reason" },
] as const;

type ReasonValue = (typeof CANCEL_REASONS)[number]["value"];

const cancelSchema = z.object({
  reason: z.enum([
    "changed_mind",
    "wrong_address",
    "rider_too_far",
    "duplicate_order",
    "found_alternative",
    "price_too_high",
    "other",
  ]),
  note: z.string().trim().max(500, "Please keep notes under 500 characters.").optional(),
});

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  existingDetails?: Record<string, unknown> | null;
  riderId?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  onCancelled?: () => void;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderId,
  existingDetails,
  riderId,
  pickupAddress,
  dropoffAddress,
  onCancelled,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState<ReasonValue | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setReason("");
    setNote("");
    setBusy(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = cancelSchema.safeParse({
      reason,
      note: note.trim() ? note : undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please pick a reason.");
      return;
    }
    if (parsed.data.reason === "other" && !parsed.data.note) {
      toast.error("Please add a short note describing the reason.");
      return;
    }

    setBusy(true);

    const reasonLabel =
      CANCEL_REASONS.find((r) => r.value === parsed.data.reason)?.label ?? parsed.data.reason;

    const mergedDetails = {
      ...(existingDetails ?? {}),
      cancellation: {
        reason: parsed.data.reason,
        reason_label: reasonLabel,
        note: parsed.data.note ?? null,
        cancelled_at: new Date().toISOString(),
      },
    };

    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", details: mergedDetails })
      .eq("id", orderId);

    setBusy(false);

    if (error) {
      // RLS blocks cancelling once a rider has accepted — give the user a clear hint.
      toast.error(
        error.message.toLowerCase().includes("row-level")
          ? "This order can no longer be cancelled because a rider already accepted it. Please contact your rider."
          : error.message,
      );
      return;
    }

    toast.success("Order cancelled. Thanks for letting us know.");
    onCancelled?.();
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Cancel this order?
          </DialogTitle>
          <DialogDescription>
            Help us improve by telling us why. Your reason is sent with the order.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <div className="grid gap-2">
              {CANCEL_REASONS.map((r) => {
                const selected = reason === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                      selected
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-note">
              Additional note {reason === "other" ? "(required)" : "(optional)"}
            </Label>
            <Textarea
              id="cancel-note"
              rows={3}
              maxLength={500}
              placeholder="Anything else our team should know?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-right text-[11px] text-muted-foreground">{note.length}/500</p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={busy}
            >
              Keep order
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || !reason}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {busy ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
