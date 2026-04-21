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

// Default bias toward Balamban, Cebu — used when we have no better reference point.
const DEFAULT_BIAS: { lat: number; lng: number } = { lat: 10.4456, lng: 123.7016 };
const DEFAULT_VIEWBOX = "123.5,10.6,123.9,10.3";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Geocode a free-text query, picking the candidate closest to `near` if provided.
 * Falls back from local-viewbox → PH-wide if no results are found.
 */
async function geocodeAddress(
  query: string,
  near: { lat: number; lng: number } | null,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const bias = near ?? DEFAULT_BIAS;

  const run = async (mode: "nearby" | "ph") => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "10");
    url.searchParams.set("countrycodes", "ph");
    if (mode === "nearby") {
      // Build a ~1° viewbox around the bias (roughly ~110km) so nearby POIs win
      if (near) {
        const d = 0.5;
        const left = bias.lng - d;
        const right = bias.lng + d;
        const top = bias.lat + d;
        const bottom = bias.lat - d;
        url.searchParams.set("viewbox", `${left},${top},${right},${bottom}`);
      } else {
        url.searchParams.set("viewbox", DEFAULT_VIEWBOX);
      }
      // Not strictly bounded — Nominatim prefers results inside the box but still returns outsiders ranked lower
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!data.length) return null;
    // Choose the candidate closest to the bias point
    const ranked = data
      .map((h) => ({
        lat: parseFloat(h.lat),
        lng: parseFloat(h.lon),
        displayName: h.display_name,
      }))
      .map((h) => ({ ...h, distKm: haversineKm(bias, h) }))
      .sort((a, b) => a.distKm - b.distKm);
    return ranked[0];
  };

  try {
    return (await run("nearby")) ?? (await run("ph"));
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
  const [searching, setSearching] = useState<null | "pickup" | "dropoff">(null);

  const runSearch = async (which: "pickup" | "dropoff") => {
    const query = (which === "pickup" ? pickupAddress : dropoffAddress).trim();
    if (!query) {
      toast.error("Type an address or place name first.");
      return;
    }
    setSearching(which);
    const hit = await geocodeAddress(query);
    setSearching(null);
    if (!hit) {
      toast.error(`Couldn't find "${query}". Try a more specific name.`);
      return;
    }
    if (which === "pickup") {
      setPickupCoords({ lat: hit.lat, lng: hit.lng });
      setPickupAddress(hit.displayName);
    } else {
      setDropoffCoords({ lat: hit.lat, lng: hit.lng });
      setDropoffAddress(hit.displayName);
    }
    toast.success(`Pinned: ${hit.displayName.split(",").slice(0, 2).join(", ")}`);
  };

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
        <div className="flex gap-2">
          <Input
            id="pickup"
            name="pickup"
            required
            placeholder={pickupPlaceholder}
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch("pickup");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => runSearch("pickup")}
            disabled={searching === "pickup"}
            aria-label="Find pickup on map"
          >
            {searching === "pickup" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Type an address or place name (e.g. “Jollibee Balamban”) and press Enter or tap the search icon to pin it.
        </p>
        <MapClientOnly>
          <MapPicker value={pickupCoords} onChange={setPickupCoords} onAddressResolved={setPickupAddress} />
        </MapClientOnly>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dropoff">{dropoffLabel}</Label>
        <div className="flex gap-2">
          <Input
            id="dropoff"
            name="dropoff"
            required
            placeholder={dropoffPlaceholder}
            value={dropoffAddress}
            onChange={(e) => setDropoffAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch("dropoff");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => runSearch("dropoff")}
            disabled={searching === "dropoff"}
            aria-label="Find drop-off on map"
          >
            {searching === "dropoff" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
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
