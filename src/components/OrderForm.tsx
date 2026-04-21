import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Search, Loader2, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPicker } from "@/components/map/MapPicker.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import {
  calculateFoodFare,
  calculatePabiliFare,
  calculatePadalaFare,
  type FareBreakdown,
  type ParcelSize,
  PARCEL_LABELS,
} from "@/lib/pricing";

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

// Common local-brand misspellings we auto-correct before searching.
const SPELLING_FIXES: Array<[RegExp, string]> = [
  [/\bgiasano\b/gi, "Gaisano"],
  [/\bjolibee\b/gi, "Jollibee"],
  [/\bjolibe\b/gi, "Jollibee"],
  [/\bmcdo\b/gi, "McDonald's"],
  [/\bsavemore\b/gi, "Save More"],
];

function normalizeQuery(q: string): string {
  let out = q.trim();
  for (const [pattern, replacement] of SPELLING_FIXES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Geocode a free-text query, picking the candidate closest to `near` if provided.
 * Tries a cascade of strategies so typos and generic place names still resolve.
 */
async function geocodeAddress(
  rawQuery: string,
  near: { lat: number; lng: number } | null,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const bias = near ?? DEFAULT_BIAS;
  const normalized = normalizeQuery(rawQuery);

  const fetchOnce = async (
    q: string,
    mode: "nearby" | "ph",
  ): Promise<{ lat: number; lng: number; displayName: string } | null> => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "15");
    url.searchParams.set("countrycodes", "ph");
    if (mode === "nearby") {
      if (near) {
        const d = 0.5;
        url.searchParams.set(
          "viewbox",
          `${bias.lng - d},${bias.lat + d},${bias.lng + d},${bias.lat - d}`,
        );
      } else {
        url.searchParams.set("viewbox", DEFAULT_VIEWBOX);
      }
    }
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!data.length) return null;
    return data
      .map((h) => ({
        lat: parseFloat(h.lat),
        lng: parseFloat(h.lon),
        displayName: h.display_name,
      }))
      .map((h) => ({ ...h, distKm: haversineKm(bias, h) }))
      .sort((a, b) => a.distKm - b.distKm)[0];
  };

  // Build a cascade of query variants so a typo or extra words still resolve.
  const broadened = normalized
    .split(/\s+/)
    .filter((t) => t.length >= 4)
    .join(" ");
  const variants = Array.from(
    new Set(
      [normalized, rawQuery.trim(), broadened].filter((v) => v.length > 0),
    ),
  );

  try {
    for (const v of variants) {
      const hit = (await fetchOnce(v, "nearby")) ?? (await fetchOnce(v, "ph"));
      if (hit) return hit;
    }
    return null;
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
  /** Show a "budget" input; required for food/pabili to compute service fee. */
  showEstimatedPrice?: boolean;
  /** Show a small/medium/large parcel selector (Padala only). */
  showParcelSize?: boolean;
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
  showParcelSize,
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
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [parcelSize, setParcelSize] = useState<ParcelSize>("small");

  const distanceKm = useMemo(() => {
    if (!pickupCoords || !dropoffCoords) return null;
    return haversineKm(pickupCoords, dropoffCoords);
  }, [pickupCoords, dropoffCoords]);

  const budgetNum = Number(budgetInput) || 0;

  const fareBreakdown: FareBreakdown | null = useMemo(() => {
    if (distanceKm == null) return null;
    if (serviceType === "padali") return calculatePadalaFare(distanceKm, parcelSize);
    if (serviceType === "food") return calculateFoodFare(distanceKm, budgetNum);
    if (serviceType === "pabili") return calculatePabiliFare(distanceKm, budgetNum);
    return null;
  }, [distanceKm, serviceType, parcelSize, budgetNum]);

  // Try to grab the user's current location once, silently, so "Jollibee" can resolve to the nearest branch.
  // Failure is fine — we just fall back to other biases.
  const ensureUserLocation = (): Promise<{ lat: number; lng: number } | null> => {
    if (userLoc) return Promise.resolve(userLoc);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLoc(loc);
          resolve(loc);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 5 * 60_000 },
      );
    });
  };

  const runSearch = async (which: "pickup" | "dropoff") => {
    const query = (which === "pickup" ? pickupAddress : dropoffAddress).trim();
    if (!query) {
      toast.error("Type an address or place name first.");
      return;
    }
    setSearching(which);

    const otherCoords = which === "pickup" ? dropoffCoords : pickupCoords;
    const sameCoords = which === "pickup" ? pickupCoords : dropoffCoords;
    const geoLoc = await ensureUserLocation();
    const bias = otherCoords ?? sameCoords ?? geoLoc ?? null;

    const hit = await geocodeAddress(query, bias);
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
    const details: Record<string, unknown> = { description: detailsText };
    if (showParcelSize) details.parcel_size = parcelSize;
    if (fareBreakdown) details.fare_breakdown = fareBreakdown;

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
        details: JSON.parse(JSON.stringify(details)),
        estimated_price: fareBreakdown?.total ?? (budgetNum > 0 ? budgetNum : null),
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

      {showParcelSize && (
        <div>
          <Label className="mb-2 block">Parcel size</Label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PARCEL_LABELS) as ParcelSize[]).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setParcelSize(size)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  parcelSize === size
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 hover:border-border"
                }`}
              >
                <p className="text-sm font-semibold capitalize">{size}</p>
                <p className="text-[11px] text-muted-foreground">{PARCEL_LABELS[size]}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showEstimatedPrice && (
        <div>
          <Label htmlFor="estimated_price">
            {serviceType === "food" ? "Food budget (₱)" : "Shopping budget (₱)"}
          </Label>
          <Input
            id="estimated_price"
            name="estimated_price"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 250"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
          />
        </div>
      )}

      {/* Live fare breakdown */}
      {fareBreakdown && (
        <div
          className="rounded-2xl border border-border/60 p-4"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary-glow" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fare estimate · {distanceKm != null ? `${distanceKm.toFixed(1)} km` : ""}
            </p>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {fareBreakdown.lines.map((line, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{line.label}</dt>
                <dd className="font-medium">₱{line.amount.toFixed(2)}</dd>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2">
              <dt className="font-display text-base font-semibold">Total</dt>
              <dd className="font-display text-lg font-bold text-primary-glow">
                ₱{fareBreakdown.total.toFixed(2)}
              </dd>
            </div>
          </dl>
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
