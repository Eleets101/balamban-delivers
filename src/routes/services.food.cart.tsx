import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Minus, Plus, Trash2, ShoppingBag, MapPin, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFoodCart } from "@/hooks/useFoodCart";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPicker } from "@/components/map/MapPicker.lazy";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import { PlaceAutocomplete } from "@/components/map/PlaceAutocomplete";
import { calcRestaurantDeliveryFee, calcServiceFee, distanceFromRestaurantKm } from "@/lib/restaurants";

export const Route = createFileRoute("/services/food/cart")({
  head: () => ({
    meta: [{ title: "Your cart — HatodGo Food" }],
  }),
  component: CartPage,
});

type Coords = { lat: number; lng: number } | null;

function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cart = useFoodCart();
  const [dropoffCoords, setDropoffCoords] = useState<Coords>(null);
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Prefill phone from profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.phone) setPhone(data.phone);
    })();
  }, [user]);

  const distanceKm = useMemo(
    () =>
      cart.restaurant
        ? distanceFromRestaurantKm(
            { lat: cart.restaurant.lat, lng: cart.restaurant.lng },
            dropoffCoords,
          )
        : null,
    [cart.restaurant, dropoffCoords],
  );

  const deliveryFee = useMemo(() => {
    if (!cart.restaurant) return 0;
    if (distanceKm == null) return Number(cart.restaurant.base_delivery_fee);
    return calcRestaurantDeliveryFee(cart.restaurant, distanceKm);
  }, [cart.restaurant, distanceKm]);

  const serviceFee = calcServiceFee(cart.itemsSubtotal);
  const total = cart.itemsSubtotal + deliveryFee + serviceFee;

  if (cart.lines.length === 0 || !cart.restaurant) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">
            🛒
          </div>
          <h1 className="font-display text-2xl font-bold">Your cart is empty</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse restaurants and add some items to get started.
          </p>
          <Button asChild className="mt-6">
            <Link to="/services/food">Browse restaurants</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const handleCheckout = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!dropoffCoords) {
      toast.error("Please pin your delivery address on the map.");
      return;
    }
    if (!phone.trim()) {
      toast.error("Please enter your phone number.");
      return;
    }

    setBusy(true);

    const fareBreakdown = {
      base: Number(cart.restaurant!.base_delivery_fee),
      distance_km: distanceKm ?? 0,
      distance_charge: Math.max(0, deliveryFee - Number(cart.restaurant!.base_delivery_fee)),
      surcharges: 0,
      service_fee: serviceFee,
      goods_subtotal: cart.itemsSubtotal,
      total,
      rider_earnings: Math.ceil((deliveryFee) * 0.8),
      platform_cut: Math.ceil(deliveryFee * 0.2 + serviceFee),
      lines: [
        { label: "Items subtotal", amount: cart.itemsSubtotal },
        { label: `Delivery fee${distanceKm != null ? ` (${distanceKm.toFixed(1)} km)` : ""}`, amount: deliveryFee },
        { label: "HatodGo service fee", amount: serviceFee },
      ],
    };

    const details = {
      description: cart.lines
        .map((l) => `${l.quantity}× ${l.name}${l.notes ? ` (${l.notes})` : ""}`)
        .join(", "),
      restaurant: {
        id: cart.restaurant!.id,
        name: cart.restaurant!.name,
        address: cart.restaurant!.address,
        lat: cart.restaurant!.lat,
        lng: cart.restaurant!.lng,
      },
      items: cart.lines.map((l) => ({
        menu_item_id: l.menu_item_id,
        name: l.name,
        price: l.price,
        quantity: l.quantity,
        notes: l.notes ?? null,
      })),
      landmark: landmark.trim() || undefined,
      phone: phone.trim(),
      fare_breakdown: fareBreakdown,
    };

    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer_id: user.id,
        service_type: "food",
        pickup_address: cart.restaurant!.address,
        pickup_lat: cart.restaurant!.lat,
        pickup_lng: cart.restaurant!.lng,
        dropoff_address: dropoffAddress || "Customer-pinned location",
        dropoff_lat: dropoffCoords.lat,
        dropoff_lng: dropoffCoords.lng,
        notes: notes.trim() || null,
        details: JSON.parse(JSON.stringify(details)),
        estimated_price: total,
        payment_method: "pending",
      })
      .select("id")
      .single();

    setBusy(false);

    if (error || !data) {
      toast.error(error?.message ?? "Could not place order.");
      return;
    }

    cart.clear();
    toast.success("Order placed! Choose how to pay.");
    navigate({ to: "/checkout/$orderId", params: { orderId: data.id } });
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link to="/services/food" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to restaurants
        </Link>

        <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">Your cart</h1>
        <p className="text-sm text-muted-foreground">
          From <strong>{cart.restaurant.name}</strong> · {cart.restaurant.address}
        </p>

        {/* Items */}
        <section
          className="mt-6 rounded-2xl border border-border/60 p-4 sm:p-5"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary-glow" />
            <h2 className="font-display text-base font-semibold">Items</h2>
          </div>
          <ul className="mt-3 divide-y divide-border/40">
            {cart.lines.map((l) => (
              <li key={l.menu_item_id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">₱{l.price.toFixed(2)} each</p>
                  {l.notes && (
                    <p className="mt-1 text-xs italic text-muted-foreground">Notes: {l.notes}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => cart.updateQty(l.menu_item_id, l.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="min-w-[2ch] text-center font-medium">{l.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => cart.updateQty(l.menu_item_id, l.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => cart.removeItem(l.menu_item_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="font-mono font-semibold">₱{(l.price * l.quantity).toFixed(2)}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Delivery */}
        <section
          className="mt-6 space-y-4 rounded-2xl border border-border/60 p-4 sm:p-5"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary-glow" />
            <h2 className="font-display text-base font-semibold">Delivery details</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dropoff">Delivery address</Label>
            <PlaceAutocomplete
              id="dropoff"
              name="dropoff"
              required
              placeholder="Your address"
              value={dropoffAddress}
              onValueChange={setDropoffAddress}
              onPick={(hit) => setDropoffCoords({ lat: hit.lat, lng: hit.lng })}
              bias={cart.restaurant.lat != null && cart.restaurant.lng != null ? { lat: cart.restaurant.lat, lng: cart.restaurant.lng } : null}
            />
            <MapClientOnly>
              <MapPicker value={dropoffCoords} onChange={setDropoffCoords} onAddressResolved={setDropoffAddress} />
            </MapClientOnly>
          </div>

          <div className="space-y-2">
            <Label htmlFor="landmark">Landmark / nearby reference</Label>
            <Input
              id="landmark"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. near Gaisano, beside church, Purok 3"
              maxLength={150}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxxx"
              maxLength={20}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Order notes (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the rider should know"
              maxLength={300}
            />
          </div>
        </section>

        {/* Summary */}
        <section
          className="mt-6 rounded-2xl border border-border/60 p-4 sm:p-5"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary-glow" />
            <h2 className="font-display text-base font-semibold">Summary</h2>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Items subtotal" amount={cart.itemsSubtotal} />
            <Row
              label={`Delivery fee${distanceKm != null ? ` (${distanceKm.toFixed(1)} km)` : ""}`}
              amount={deliveryFee}
            />
            <Row label="HatodGo service fee" amount={serviceFee} />
            <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-3">
              <dt className="font-display text-base font-semibold">Total</dt>
              <dd className="font-display text-xl font-bold text-primary-glow">₱{total.toFixed(2)}</dd>
            </div>
          </dl>
        </section>

        <Button onClick={handleCheckout} disabled={busy} className="mt-6 w-full" size="lg">
          {busy ? "Placing order…" : `Continue to payment · ₱${total.toFixed(2)}`}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          You'll choose Cash, GCash, or Maya on the next step.
        </p>
      </div>
    </PageShell>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">₱{amount.toFixed(2)}</dd>
    </div>
  );
}
