import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ServiceType = "food" | "padali" | "pabili" | "ride";

interface OrderFormProps {
  serviceType: ServiceType;
  pickupLabel: string;
  dropoffLabel: string;
  detailsLabel: string;
  detailsPlaceholder: string;
  pickupPlaceholder?: string;
  dropoffPlaceholder?: string;
  showEstimatedPrice?: boolean;
  submitLabel: string;
}

export function OrderForm({
  serviceType,
  pickupLabel,
  dropoffLabel,
  detailsLabel,
  detailsPlaceholder,
  pickupPlaceholder,
  dropoffPlaceholder,
  showEstimatedPrice,
  submitLabel,
}: OrderFormProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);

    const detailsText = String(fd.get("details") ?? "");
    const estPrice = fd.get("estimated_price");
    const { error } = await supabase.from("orders").insert({
      customer_id: user.id,
      service_type: serviceType,
      pickup_address: String(fd.get("pickup")),
      dropoff_address: String(fd.get("dropoff")),
      notes: String(fd.get("notes") ?? "") || null,
      details: { description: detailsText },
      estimated_price: estPrice ? Number(estPrice) : null,
      payment_method: "cash",
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Order placed! A rider will pick it up soon.");
    navigate({ to: "/orders" });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="pickup">{pickupLabel}</Label>
        <Input id="pickup" name="pickup" required placeholder={pickupPlaceholder} />
      </div>
      <div>
        <Label htmlFor="dropoff">{dropoffLabel}</Label>
        <Input id="dropoff" name="dropoff" required placeholder={dropoffPlaceholder} />
      </div>
      <div>
        <Label htmlFor="details">{detailsLabel}</Label>
        <Textarea id="details" name="details" required rows={4} placeholder={detailsPlaceholder} />
      </div>
      {showEstimatedPrice && (
        <div>
          <Label htmlFor="estimated_price">Estimated budget (₱)</Label>
          <Input id="estimated_price" name="estimated_price" type="number" min="0" step="0.01" placeholder="e.g. 250" />
        </div>
      )}
      <div>
        <Label htmlFor="notes">Notes for rider (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Landmark, contact person, etc." />
      </div>

      <div className="rounded-lg border border-border/60 bg-secondary/40 p-3 text-xs text-muted-foreground">
        Payment: <span className="font-medium text-foreground">Cash on delivery</span> · GCash & online payments coming soon.
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy ? "Placing order…" : submitLabel}
      </Button>
    </form>
  );
}
