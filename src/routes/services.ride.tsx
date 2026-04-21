import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bike,
  MapPin,
  Navigation,
  Clock,
  Star,
  Zap,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  PhoneCall,
  MessageSquare,
  Crosshair,
} from "lucide-react";
import { ServiceLayout } from "@/components/ServiceLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPicker } from "@/components/map/MapPicker.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  calculateRideFare,
  haversineKm as pricingHaversineKm,
  type FareBreakdown,
} from "@/lib/pricing";

export const Route = createFileRoute("/services/ride")({
  head: () => ({
    meta: [
      { title: "Book a ride (Sakay) — HatodGo" },
      { name: "description", content: "Book a habal-habal (motorcycle taxi) in Balamban with live fare estimate, ETA and trusted local riders." },
      { property: "og:title", content: "Book a ride (Sakay) — HatodGo" },
      { property: "og:description", content: "Premium ride booking for Balamban, Toledo & Asturias — instant fare, no need to text drivers." },
    ],
  }),
  component: RidePage,
});

type Coords = { lat: number; lng: number } | null;
type RideType = "standard" | "express";
type Stage = "form" | "searching" | "found";

// Ride fare rates are defined centrally in src/lib/pricing.ts

// Snap-to-landmark fallback. When GPS accuracy is poor or reverse geocoding
// returns nothing, drop the pickup on the closest known mapped pin so the
// rider always has a recognisable address to head to.
const ACCURACY_THRESHOLD_M = 150;
const KNOWN_LANDMARKS: Array<{ name: string; lat: number; lng: number }> = [
  { name: "Balamban Public Market", lat: 10.4456, lng: 123.7016 },
  { name: "Balamban Municipal Hall", lat: 10.4488, lng: 123.7029 },
  { name: "Balamban Public Plaza", lat: 10.4471, lng: 123.7022 },
  { name: "Gaisano Grand Balamban", lat: 10.4468, lng: 123.7041 },
  { name: "Balamban District Hospital", lat: 10.4502, lng: 123.7068 },
  { name: "Tubod Flowing Waters", lat: 10.4530, lng: 123.7110 },
  { name: "Asturias Public Market", lat: 10.5667, lng: 123.7167 },
  { name: "Toledo City Public Market", lat: 10.3778, lng: 123.6386 },
  { name: "Toledo City Hall", lat: 10.3781, lng: 123.6403 },
];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestLandmarks(coords: { lat: number; lng: number }, k = 3) {
  return KNOWN_LANDMARKS
    .map((l) => ({ ...l, distanceKm: haversineKm(coords, l) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, k);
}

function nearestLandmark(coords: { lat: number; lng: number }) {
  return nearestLandmarks(coords, 1)[0];
}

const SAMPLE_DRIVER = {
  name: "Mark Patalinghug",
  rating: 4.9,
  trips: 1284,
  vehicle: "Honda XRM 125 · Motor",
  plate: "BLM 482",
  eta: 6, // minutes to pickup
};

function RidePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupCoords, setPickupCoords] = useState<Coords>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords>(null);
  const [rideType, setRideType] = useState<RideType>("standard");
  const [stage, setStage] = useState<Stage>("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [locatingMe, setLocatingMe] = useState(false);
  const [fallbackOptions, setFallbackOptions] = useState<
    Array<{ name: string; lat: number; lng: number; distanceKm: number }>
  >([]);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [fallbackChoice, setFallbackChoice] = useState<string | null>(null);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation isn't available on this device.");
      return;
    }
    setLocatingMe(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const rawCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const accuracy = pos.coords.accuracy ?? Infinity;
        const lowAccuracy = accuracy > ACCURACY_THRESHOLD_M;

        // Try reverse geocoding first
        let resolvedAddress: string | null = null;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${rawCoords.lat}&lon=${rawCoords.lng}&zoom=18&addressdetails=1`,
            { headers: { Accept: "application/json" } },
          );
          if (res.ok) {
            const data = (await res.json()) as { display_name?: string };
            const name = data.display_name?.trim();
            if (name) resolvedAddress = name;
          }
        } catch {
          // best-effort
        }

        // Fall back to a dropdown of the 3 nearest known landmarks when GPS
        // is fuzzy or reverse geocoding came back empty. The user confirms
        // which one to pin before we set the pickup.
        if (lowAccuracy || !resolvedAddress) {
          const options = nearestLandmarks(rawCoords, 3);
          setFallbackOptions(options);
          setFallbackChoice(options[0]?.name ?? null);
          setFallbackReason(
            lowAccuracy
              ? `GPS accuracy was ±${Math.round(accuracy)}m — pick the closest landmark to confirm your pickup.`
              : "We couldn't resolve a street address — pick the closest landmark to confirm your pickup.",
          );
          setLocatingMe(false);
          return;
        }

        // Good GPS + we have an address — use the live coordinates.
        setPickupCoords(rawCoords);
        setPickup(resolvedAddress);
        setFallbackOptions([]);
        setFallbackReason(null);
        setFallbackChoice(null);
        setLocatingMe(false);
        toast.success("Pickup pinned to your current location.");
      },
      (err) => {
        setLocatingMe(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow access in your browser settings."
            : "Couldn't get your location. Try again or pin it on the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const distanceKm = useMemo(() => {
    if (!pickupCoords || !dropoffCoords) return null;
    return pricingHaversineKm(pickupCoords, dropoffCoords);
  }, [pickupCoords, dropoffCoords]);

  const fareBreakdown: FareBreakdown | null = useMemo(() => {
    if (distanceKm == null) return null;
    return calculateRideFare(distanceKm, rideType);
  }, [distanceKm, rideType]);

  const fare = fareBreakdown?.total ?? null;

  const tripEta = useMemo(() => {
    if (distanceKm == null) return null;
    // Assume avg 25 km/h on local roads; express slightly faster
    const speed = rideType === "express" ? 32 : 25;
    return Math.max(3, Math.round((distanceKm / speed) * 60));
  }, [distanceKm, rideType]);

  const findRide = async () => {
    if (!user) return;
    if (!pickupCoords || !dropoffCoords) {
      toast.error("Please pin both pickup and destination on the map.");
      return;
    }
    if (!pickup.trim() || !dropoff.trim()) {
      toast.error("Add a pickup point and destination.");
      return;
    }
    setStage("searching");

    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer_id: user.id,
        service_type: "ride",
        pickup_address: pickup,
        dropoff_address: dropoff,
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        dropoff_lat: dropoffCoords.lat,
        dropoff_lng: dropoffCoords.lng,
        details: JSON.parse(JSON.stringify({
          description: `Ride · ${rideType}`,
          ride_type: rideType,
          estimated_eta_min: tripEta,
          fare_breakdown: fareBreakdown,
        })),
        estimated_price: fare,
        payment_method: "pending",
      })
      .select("id")
      .single();

    if (error || !data) {
      toast.error(error?.message ?? "Could not create ride.");
      setStage("form");
      return;
    }
    setOrderId(data.id);
    // Short UX delay to match the "preparing your ride" vibe, then jump to checkout
    setTimeout(() => {
      navigate({ to: "/checkout/$orderId", params: { orderId: data.id } });
    }, 900);
  };

  if (stage === "searching") {
    return (
      <ServiceLayout
        icon={<Bike className="h-6 w-6" />}
        title="Preparing your checkout…"
        tagline="We're locking in your fare. You'll choose how to pay next."
      >
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="relative">
            <div
              className="absolute inset-0 animate-ping rounded-full opacity-40"
              style={{ background: "var(--gradient-primary)" }}
            />
            <div
              className="relative flex h-24 w-24 items-center justify-center rounded-full text-primary-foreground"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <Bike className="h-10 w-10" />
            </div>
          </div>
          <p className="mt-8 font-display text-lg font-semibold">Confirming your ride</p>
          <p className="mt-1 text-sm text-muted-foreground">Redirecting to secure payment…</p>
          <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </ServiceLayout>
    );
  }

  if (stage === "found") {
    return (
      <ServiceLayout
        icon={<CheckCircle2 className="h-6 w-6" />}
        title="Driver found!"
        tagline="Your rider is on the way to your pickup point."
      >
        <div className="space-y-5">
          <div
            className="flex items-center gap-4 rounded-2xl border border-primary/30 p-4"
            style={{ background: "linear-gradient(145deg, oklch(0.22 0.05 295), oklch(0.17 0.03 285))" }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary font-display text-lg font-bold">
              {SAMPLE_DRIVER.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div className="flex-1">
              <p className="font-display text-base font-semibold">{SAMPLE_DRIVER.name}</p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                <span className="font-medium text-foreground">{SAMPLE_DRIVER.rating}</span>
                <span>· {SAMPLE_DRIVER.trips.toLocaleString()} trips</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {SAMPLE_DRIVER.vehicle} · <span className="font-medium text-foreground">{SAMPLE_DRIVER.plate}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Arrives in</p>
              <p className="font-display text-2xl font-bold text-primary-glow">{SAMPLE_DRIVER.eta}m</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11">
              <PhoneCall className="h-4 w-4" /> Call
            </Button>
            <Button variant="outline" className="h-11">
              <MessageSquare className="h-4 w-4" /> Message
            </Button>
          </div>

          <div className="rounded-2xl border border-border/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Trip</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary-glow ring-4 ring-primary/15" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pickup</p>
                  <p className="text-sm font-medium">{pickup}</p>
                </div>
              </div>
              <div className="ml-1 h-4 w-px bg-border" />
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-sm bg-foreground" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Destination</p>
                  <p className="text-sm font-medium">{dropoff}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
              <span className="text-muted-foreground">
                {rideType === "express" ? "Express ride" : "Standard ride"}
                {distanceKm != null && ` · ${distanceKm.toFixed(1)} km`}
              </span>
              <span className="font-display text-lg font-bold">₱{fare}</span>
            </div>
          </div>

          <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success-foreground">
            <span className="font-semibold text-success">Status:</span> Driver is on the way to your pickup point.
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStage("form");
                setOrderId(null);
              }}
            >
              Book another
            </Button>
            <Button onClick={() => navigate({ to: "/orders" })}>
              {orderId ? "View in My Orders" : "My Orders"}
            </Button>
          </div>
        </div>
      </ServiceLayout>
    );
  }

  return (
    <ServiceLayout
      icon={<Bike className="h-6 w-6" />}
      title="Book a ride (Sakay)"
      tagline="Habal-habal (motorcycle taxi) — quick rides around town. No need to text drivers."
    >
      <div className="space-y-5">
        {/* Drivers nearby indicator */}
        <div
          className="flex items-center justify-between rounded-2xl border border-success/30 px-4 py-3"
          style={{ background: "linear-gradient(145deg, oklch(0.22 0.04 155 / 0.5), oklch(0.17 0.03 285))" }}
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <div>
              <p className="text-sm font-semibold">8 drivers nearby</p>
              <p className="text-xs text-muted-foreground">Avg pickup time: 5–10 mins</p>
            </div>
          </div>
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold"
              >
                <Bike className="h-3 w-3" />
              </div>
            ))}
          </div>
        </div>

        {/* Pickup */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="pickup">
              <MapPin className="mr-1 inline h-3.5 w-3.5 text-primary-glow" /> Pickup point
            </Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={useMyLocation}
              disabled={locatingMe}
              className="h-8 gap-1.5 text-xs"
            >
              {locatingMe ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Crosshair className="h-3.5 w-3.5 text-primary-glow" />
              )}
              {locatingMe ? "Locating…" : "Use my location"}
            </Button>
          </div>
          <Input
            id="pickup"
            placeholder="Where are you now?"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
          />

          {fallbackOptions.length > 0 && (
            <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <div className="flex items-start gap-2">
                <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs text-warning-foreground">
                  <span className="font-semibold text-warning">Confirm pickup:</span>{" "}
                  {fallbackReason}
                </p>
              </div>
              <Select
                value={fallbackChoice ?? undefined}
                onValueChange={setFallbackChoice}
              >
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Choose nearest landmark" />
                </SelectTrigger>
                <SelectContent>
                  {fallbackOptions.map((opt) => (
                    <SelectItem key={opt.name} value={opt.name}>
                      {opt.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ~{opt.distanceKm.toFixed(1)} km
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const chosen = fallbackOptions.find((o) => o.name === fallbackChoice);
                    if (!chosen) return;
                    setPickupCoords({ lat: chosen.lat, lng: chosen.lng });
                    setPickup(chosen.name);
                    setFallbackOptions([]);
                    setFallbackReason(null);
                    setFallbackChoice(null);
                    toast.success(`Pickup pinned to ${chosen.name}.`);
                  }}
                  disabled={!fallbackChoice}
                >
                  Confirm pickup
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFallbackOptions([]);
                    setFallbackReason(null);
                    setFallbackChoice(null);
                  }}
                >
                  Pin manually
                </Button>
              </div>
            </div>
          )}

          <MapClientOnly>
            <MapPicker
              value={pickupCoords}
              onChange={setPickupCoords}
              onAddressResolved={setPickup}
              height={200}
            />
          </MapClientOnly>
        </div>

        {/* Dropoff */}
        <div className="space-y-2">
          <Label htmlFor="dropoff">
            <Navigation className="mr-1 inline h-3.5 w-3.5 text-primary-glow" /> Destination
          </Label>
          <Input
            id="dropoff"
            placeholder="Where to?"
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
          />
          <MapClientOnly>
            <MapPicker
              value={dropoffCoords}
              onChange={setDropoffCoords}
              onAddressResolved={setDropoff}
              height={200}
            />
          </MapClientOnly>
        </div>

        {/* Ride type */}
        <div>
          <Label className="mb-2 block">Ride type</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRideType("standard")}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                rideType === "standard"
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/60 hover:border-border"
              }`}
            >
              <Bike className="h-5 w-5 text-primary-glow" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Standard</p>
                <p className="text-[11px] text-muted-foreground">Best value</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setRideType("express")}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                rideType === "express"
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/60 hover:border-border"
              }`}
            >
              <Zap className="h-5 w-5 text-primary-glow" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Express</p>
                <p className="text-[11px] text-muted-foreground">Fastest pickup</p>
              </div>
            </button>
          </div>
        </div>

        {/* Fare + ETA */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl border border-border/60 p-4"
            style={{ background: "var(--gradient-card)" }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Estimated fare
            </p>
            <p className="mt-1 font-display text-2xl font-bold">
              {fare != null ? `₱${fare}` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {distanceKm != null ? `${distanceKm.toFixed(1)} km` : "Pin both points"}
            </p>
          </div>
          <div
            className="rounded-2xl border border-border/60 p-4"
            style={{ background: "var(--gradient-card)" }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Trip ETA
            </p>
            <p className="mt-1 font-display text-2xl font-bold">
              {tripEta != null ? `${tripEta}m` : "—"}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> Pickup in 5–10 mins
            </p>
          </div>
        </div>

        {/* Sample driver preview */}
        <div className="rounded-2xl border border-border/60 p-4" style={{ background: "var(--gradient-card)" }}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            A nearby rider
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-sm font-bold">
              MP
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{SAMPLE_DRIVER.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Star className="h-3 w-3 fill-warning text-warning" />
                <span className="font-medium text-foreground">{SAMPLE_DRIVER.rating}</span>
                <span>· {SAMPLE_DRIVER.vehicle}</span>
              </div>
            </div>
            <ShieldCheck className="h-5 w-5 text-success" />
          </div>
        </div>

        {/* Find ride CTA */}
        <Button
          size="lg"
          className="h-14 w-full text-base shadow-[var(--shadow-glow)]"
          onClick={findRide}
        >
          Find Ride
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Cash on delivery · GCash & online payments coming soon
        </p>
      </div>
    </ServiceLayout>
  );
}
