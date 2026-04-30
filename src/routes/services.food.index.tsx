import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  UtensilsCrossed,
  Search,
  Clock,
  Star,
  MapPin,
  ArrowRight,
  ShoppingBag,
  PenLine,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  isRestaurantOpenNow,
  CATEGORY_EMOJI,
  type Restaurant,
  type RestaurantCategory,
} from "@/lib/restaurants";
import { useFoodCart } from "@/hooks/useFoodCart";

export const Route = createFileRoute("/services/food/")({
  head: () => ({
    meta: [
      { title: "Order food (Pagkain) — HatodGo" },
      {
        name: "description",
        content: "Browse local restaurants, carenderia and shops in Balamban. Order food for delivery in minutes.",
      },
      { property: "og:title", content: "Order food in Balamban — HatodGo" },
      {
        property: "og:description",
        content: "Browse restaurants and place orders directly. Cash, GCash, or Maya accepted.",
      },
    ],
  }),
  component: FoodHomePage,
});

const CATEGORY_FILTERS: Array<{ value: RestaurantCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "carenderia", label: "Carenderia" },
  { value: "fast_food", label: "Fast Food" },
  { value: "snacks", label: "Snacks" },
  { value: "drinks", label: "Drinks" },
  { value: "bakery", label: "Bakery" },
  { value: "grocery", label: "Grocery" },
  { value: "pharmacy", label: "Pharmacy" },
];

function FoodHomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RestaurantCategory | "all">("all");
  const { itemsCount, restaurant: cartRestaurant } = useFoodCart();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(
          "id, name, slug, category, description, address, lat, lng, phone, logo_url, cover_url, open_hours, open_time, close_time, is_open, is_active, base_delivery_fee, per_km_fee, free_distance_km, estimated_minutes, rating, sort_order",
        )
        .eq("is_active", true)
        .order("is_open", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        setRestaurants([]);
        return;
      }
      setRestaurants((data as Restaurant[]) ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!restaurants) return null;
    const q = search.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (filter !== "all" && r.category !== filter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [restaurants, search, filter]);

  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Order food (Pagkain)</h1>
            <p className="text-sm text-muted-foreground">
              Browse local restaurants and shops. Add items to cart and check out.
            </p>
          </div>
          {itemsCount > 0 && (
            <Button asChild className="shadow-[var(--shadow-glow)]">
              <Link to="/services/food/cart">
                <ShoppingBag className="h-4 w-4" /> View cart ({itemsCount})
              </Link>
            </Button>
          )}
        </div>

        {cartRestaurant && itemsCount > 0 && (
          <div className="mt-4 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
            You have <strong>{itemsCount}</strong> item{itemsCount === 1 ? "" : "s"} in your cart from{" "}
            <strong>{cartRestaurant.name}</strong>.
          </div>
        )}

        {/* Search + filters */}
        <div className="mt-6 flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search restaurants, food, or address…"
              className="h-11 pl-9"
            />
          </div>
          <div className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c.value}
                onClick={() => setFilter(c.value)}
                className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  filter === c.value
                    ? "border-primary bg-primary/15 text-primary-glow"
                    : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.value !== "all" ? `${CATEGORY_EMOJI[c.value]} ` : ""}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-8">
          {filtered === null ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-2xl border border-border/60"
                  style={{ background: "var(--gradient-card)" }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState totalRestaurants={restaurants?.length ?? 0} hasSearch={!!search || filter !== "all"} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((r) => (
                <RestaurantCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </div>

        {/* Manual fallback */}
        <div
          className="mt-12 flex flex-col items-start gap-3 rounded-2xl border border-border/60 p-5 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: "var(--gradient-card)" }}
        >
          <div>
            <p className="font-display text-base font-semibold">Can't find your restaurant?</p>
            <p className="text-sm text-muted-foreground">
              Send us a manual request — our riders will pick it up from anywhere in town.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/services/food/manual">
              <PenLine className="h-4 w-4" /> Request manually
            </Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function RestaurantCard({ r }: { r: Restaurant }) {
  return (
    <Link
      to="/services/food/$restaurantId"
      params={{ restaurantId: r.id }}
      className="group relative block overflow-hidden rounded-2xl border border-border/60 transition-all hover:-translate-y-1 hover:border-primary/50"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="relative h-36 w-full overflow-hidden bg-secondary">
        {r.cover_url ? (
          <img
            src={r.cover_url}
            alt={r.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">
            {CATEGORY_EMOJI[r.category]}
          </div>
        )}
        {!isRestaurantOpenNow(r) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <Badge variant="outline" className="border-destructive bg-destructive/20 text-destructive">
              Closed
            </Badge>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <Badge variant="outline" className="border-border/60 bg-background/80 text-xs backdrop-blur">
            {CATEGORY_EMOJI[r.category]} {CATEGORY_LABELS[r.category]}
          </Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {r.logo_url ? (
            <img
              src={r.logo_url}
              alt=""
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded-lg border border-border/60 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-secondary text-lg">
              {CATEGORY_EMOJI[r.category]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-base font-semibold">{r.name}</h3>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {r.address}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {r.estimated_minutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <ShoppingBag className="h-3 w-3" /> ₱{Number(r.base_delivery_fee).toFixed(0)} delivery
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 text-warning" /> {Number(r.rating).toFixed(1)}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-primary-glow">
            View menu <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ totalRestaurants, hasSearch }: { totalRestaurants: number; hasSearch: boolean }) {
  if (totalRestaurants === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border/60 p-10 text-center"
        style={{ background: "var(--gradient-card)" }}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">
          🍴
        </div>
        <h2 className="font-display text-xl font-semibold">Restaurants coming soon</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          We're onboarding local restaurants and carenderia in Balamban right now. In the meantime, you can
          send us a manual food request and our riders will pick it up.
        </p>
        <Button asChild className="mt-6">
          <Link to="/services/food/manual">
            <PenLine className="h-4 w-4" /> Manual food request
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border/60 p-10 text-center" style={{ background: "var(--gradient-card)" }}>
      <p className="text-sm text-muted-foreground">
        {hasSearch
          ? "No restaurants match your search. Try a different keyword or category."
          : "No restaurants available right now."}
      </p>
    </div>
  );
}
