import { useEffect, useMemo, useState } from "react";
import { normalizePhMobile } from "@/lib/phone";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createOrder } from "@/lib/orderApi";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPicker } from "@/components/map/MapPicker.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import { PlaceAutocomplete } from "@/components/map/PlaceAutocomplete";
import { SavedLocations, type SavedLocation } from "@/components/map/SavedLocations";
import { ServiceAreaWarning } from "@/components/map/ServiceAreaWarning";
import { haversineM } from "@/lib/geo";
import {
  calculateFoodFare,
  calculatePabiliFare,
  calculatePadalaFare,
  type FareBreakdown,
  type ParcelSize,
  PARCEL_LABELS,
} from "@/lib/pricing";

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
  const [budgetInput, setBudgetInput] = useState("");
  const [parcelSize, setParcelSize] = useState<ParcelSize>("small");
  const [landmark, setLandmark] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientPhoneError, setRecipientPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle();
      const savedPhone = data?.phone;
      if (!cancelled && savedPhone) setPhone((p) => p || savedPhone);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const distanceKm = useMemo(() => {
    if (!pickupCoords || !dropoffCoords) return null;
    return haversineM(pickupCoords, dropoffCoords) / 1000;
  }, [pickupCoords, dropoffCoords]);

  const budgetNum = Number(budgetInput) || 0;

  const fareBreakdown: FareBreakdown | null = useMemo(() => {
    if (distanceKm == null) return null;
    if (serviceType === "padali") return calculatePadalaFare(distanceKm, parcelSize);
    if (serviceType === "food") return calculateFoodFare(distanceKm, budgetNum);
    if (serviceType === "pabili") return calculatePabiliFare(distanceKm, budgetNum);
    return null;
  }, [distanceKm, serviceType, parcelSize, budgetNum]);

  const pickSaved = (which: "pickup" | "dropoff", loc: SavedLocation) => {
    if (which === "pickup") {
      setPickupCoords({ lat: loc.lat, lng: loc.lng });
      setPickupAddress(loc.address);
    } else {
      setDropoffCoords({ lat: loc.lat, lng: loc.lng });
      setDropoffAddress(loc.address);
    }
    toast.success(`${loc.label} pinned`);
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
    const normPhone = normalizePhMobile(phone);
    if (!normPhone) {
      const msg = phone.trim()
        ? "Enter a valid PH mobile number, e.g. 0917 123 4567 or +63 917 123 4567."
        : "Please enter your contact phone number.";
      setPhoneError(msg);
      toast.error(msg);
      document.getElementById("contact_phone")?.focus();
      return;
    }
    let normRecipientPhone: string | null = null;
    if (serviceType === "padali" && recipientPhone.trim()) {
      normRecipientPhone = normalizePhMobile(recipientPhone);
      if (!normRecipientPhone) {
        const msg = "Recipient phone must be a valid PH mobile number.";
        setRecipientPhoneError(msg);
        toast.error(msg);
        return;
      }
    }
    const fd = new FormData(e.currentTarget);
    setBusy(true);

    const detailsText = String(fd.get("details") ?? "");
    const details: Record<string, unknown> = { description: detailsText, phone: normPhone };
    if (landmark.trim()) details.landmark = landmark.trim();
    if (serviceType === "padali") {
      const rn = recipientName.trim().slice(0, 80);
      if (rn || normRecipientPhone) {
        details.recipient = { name: rn || null, phone: normRecipientPhone };
      }
    }
    if (showParcelSize) details.parcel_size = parcelSize;
    if (fareBreakdown) details.fare_breakdown = fareBreakdown;

    let newId: string;
    try {
      newId = await createOrder({
        serviceType,
        pickupAddress: pickupAddress || String(fd.get("pickup") ?? ""),
        dropoffAddress: dropoffAddress || String(fd.get("dropoff") ?? ""),
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        dropoffLat: dropoffCoords.lat,
        dropoffLng: dropoffCoords.lng,
        notes: String(fd.get("notes") ?? "") || null,
        details,
        estimatedPrice: fareBreakdown?.total ?? (budgetNum > 0 ? budgetNum : null),
      });
    } catch (err) {
      setBusy(false);
      toast.error((err as Error).message || "Could not place order.");
      return;
    }
    setBusy(false);
    toast.success("Order placed! Choose how to pay.");
    navigate({ to: "/checkout/$orderId", params: { orderId: newId } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="pickup">{pickupLabel}</Label>
        <PlaceAutocomplete
          id="pickup"
          name="pickup"
          required
          placeholder={pickupPlaceholder}
          value={pickupAddress}
          onValueChange={setPickupAddress}
          onEdit={() => setPickupCoords(null)}
          onPick={(hit) => setPickupCoords({ lat: hit.lat, lng: hit.lng })}
          bias={dropoffCoords}
        />
        <SavedLocations
          onPick={(loc) => pickSaved("pickup", loc)}
          currentCoords={pickupCoords}
          currentAddress={pickupAddress}
        />
        <p className="text-xs text-muted-foreground">
          Start typing to search Balamban, Toledo, Asturias and beyond — or drag the pin to fine-tune.
        </p>
        <MapClientOnly>
          <MapPicker value={pickupCoords} onChange={setPickupCoords} onAddressResolved={setPickupAddress} />
        </MapClientOnly>
        <ServiceAreaWarning coords={pickupCoords} label="Pickup" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dropoff">{dropoffLabel}</Label>
        <PlaceAutocomplete
          id="dropoff"
          name="dropoff"
          required
          placeholder={dropoffPlaceholder}
          value={dropoffAddress}
          onValueChange={setDropoffAddress}
          onEdit={() => setDropoffCoords(null)}
          onPick={(hit) => setDropoffCoords({ lat: hit.lat, lng: hit.lng })}
          bias={pickupCoords}
        />
        <SavedLocations
          onPick={(loc) => pickSaved("dropoff", loc)}
          currentCoords={dropoffCoords}
          currentAddress={dropoffAddress}
        />
        <MapClientOnly>
          <MapPicker value={dropoffCoords} onChange={setDropoffCoords} onAddressResolved={setDropoffAddress} />
        </MapClientOnly>
        <ServiceAreaWarning coords={dropoffCoords} label="Drop-off" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="landmark">Landmark / nearby reference (optional)</Label>
        <Input
          id="landmark"
          value={landmark}
          onChange={(e) => setLandmark(e.target.value)}
          placeholder="e.g. near Gaisano, beside church, Purok 3"
        />
        <p className="text-xs text-muted-foreground">
          Helps the rider find you faster — especially in places without street numbers.
        </p>
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

      <div className="space-y-2">
        <Label htmlFor="contact_phone">Your contact phone number</Label>
        <Input
          id="contact_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (phoneError) setPhoneError(null);
          }}
          placeholder="09xx xxx xxxx"
          aria-invalid={!!phoneError}
          aria-describedby="contact_phone_hint"
        />
        <p
          id="contact_phone_hint"
          className={`text-xs ${phoneError ? "text-destructive" : "text-muted-foreground"}`}
        >
          {phoneError ?? "The rider will call this number if they can't find the location."}
        </p>
      </div>

      {serviceType === "padali" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="recipient_name">Recipient name (optional)</Label>
            <Input
              id="recipient_name"
              maxLength={80}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Who will receive the parcel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipient_phone">Recipient phone (optional)</Label>
            <Input
              id="recipient_phone"
              type="tel"
              inputMode="tel"
              maxLength={20}
              value={recipientPhone}
              onChange={(e) => {
                setRecipientPhone(e.target.value);
                if (recipientPhoneError) setRecipientPhoneError(null);
              }}
              placeholder="09xx xxx xxxx"
              aria-invalid={!!recipientPhoneError}
            />
            {recipientPhoneError && <p className="text-xs text-destructive">{recipientPhoneError}</p>}
          </div>
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
