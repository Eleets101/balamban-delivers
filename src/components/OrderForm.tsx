import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPicker } from "@/components/map/MapPicker.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";

// Biases search toward Balamban, Cebu — but falls back to PH-wide if no local hits.
const SEARCH_VIEWBOX = "123.5,10.6,123.9,10.3";

async function geocodeAddress(
  query: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const run = async (useViewbox: boolean) => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "ph");
    if (useViewbox) {
      url.searchParams.set("viewbox", SEARCH_VIEWBOX);
      url.searchParams.set("bounded", "1");
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    const hit = data[0];
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), displayName: hit.display_name };
  };
  try {
    return (await run(true)) ?? (await run(false));
  } catch {
    return null;
  }
}

type ServiceType = "food" | "padali" | "pabili" | "ride";
type Coords = { lat: number; lng: number } | null;

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
  const [pickupCoords, setPickupCoords] = useState<Coords>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    if (!pickupCoords) {
      toast.error("Please pin the pickup location on the map.");
      return;
    }
    if (!dropoffCoords) {
      toast.error("Please pin the drop-off location on the map.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setBusy(true);

    const detailsText = String(fd.get("details") ?? "");
    const estPrice = fd.get("estimated_price");
    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer_id: user.id,
        service_type: serviceType,
        pickup_address: String(fd.get("pickup")),
        dropoff_address: String(fd.get("dropoff")),
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        dropoff_lat: dropoffCoords.lat,
        dropoff_lng: dropoffCoords.lng,
        notes: String(fd.get("notes") ?? "") || null,
        details: { description: detailsText },
        estimated_price: estPrice ? Number(estPrice) : null,
        payment_method: "pending",
      })
      .select("id")
      .single();
    setBusy(false);

    if (error || !data) {
      toast.error(error?.message ?? "Could not place order.");
      return;
    }
    toast.success("Order placed! Choose how to pay.");
    navigate({ to: "/checkout/$orderId", params: { orderId: data.id } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="pickup">{pickupLabel}</Label>
        <Input
          id="pickup"
          name="pickup"
          required
          placeholder={pickupPlaceholder}
          value={pickupAddress}
          onChange={(e) => setPickupAddress(e.target.value)}
        />
        <MapClientOnly>
          <MapPicker value={pickupCoords} onChange={setPickupCoords} onAddressResolved={setPickupAddress} />
        </MapClientOnly>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dropoff">{dropoffLabel}</Label>
        <Input
          id="dropoff"
          name="dropoff"
          required
          placeholder={dropoffPlaceholder}
          value={dropoffAddress}
          onChange={(e) => setDropoffAddress(e.target.value)}
        />
        <MapClientOnly>
          <MapPicker value={dropoffCoords} onChange={setDropoffCoords} onAddressResolved={setDropoffAddress} />
        </MapClientOnly>
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
        Payment: choose <span className="font-medium text-foreground">GCash, Maya, or Cash on delivery</span> at checkout.
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy ? "Placing order…" : submitLabel}
      </Button>
    </form>
  );
}
