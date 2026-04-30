import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  ShoppingBag,
  Plus,
  Minus,
  Loader2,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  isRestaurantOpenNow,
  type MenuCategory,
  type MenuItem,
  type Restaurant,
} from "@/lib/restaurants";
import { useFoodCart } from "@/hooks/useFoodCart";

export const Route = createFileRoute("/services/food/$restaurantId")({
  head: () => ({
    meta: [{ title: "Restaurant menu — HatodGo" }],
  }),
  component: RestaurantPage,
});

function RestaurantPage() {
  const { restaurantId } = Route.useParams();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const cart = useFoodCart();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: r }, { data: cats }, { data: its }] = await Promise.all([
        supabase
          .from("restaurants")
          .select(
            "id, name, slug, category, description, address, lat, lng, phone, logo_url, cover_url, open_hours, open_time, close_time, is_open, is_active, base_delivery_fee, per_km_fee, free_distance_km, estimated_minutes, rating, sort_order",
          )
          .eq("id", restaurantId)
          .maybeSingle(),
        supabase
          .from("menu_categories")
          .select("id, restaurant_id, name, sort_order")
          .eq("restaurant_id", restaurantId)
          .order("sort_order"),
        supabase
          .from("menu_items")
          .select(
            "id, restaurant_id, category_id, name, description, price, image_url, is_available, sort_order",
          )
          .eq("restaurant_id", restaurantId)
          .eq("is_available", true)
          .order("sort_order"),
      ]);
      setRestaurant((r as Restaurant) ?? null);
      setCategories((cats as MenuCategory[]) ?? []);
      setItems((its as MenuItem[]) ?? []);
      setLoading(false);
    })();
  }, [restaurantId]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    const uncategorized: MenuItem[] = [];
    for (const it of items) {
      if (!it.category_id) {
        uncategorized.push(it);
        continue;
      }
      const list = map.get(it.category_id) ?? [];
      list.push(it);
      map.set(it.category_id, list);
    }
    return { map, uncategorized };
  }, [items]);

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (!restaurant) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Restaurant not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">It may have been removed or hidden.</p>
          <Button asChild className="mt-6">
            <Link to="/services/food">Back to restaurants</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Cover */}
      <div className="relative h-48 w-full overflow-hidden bg-secondary sm:h-64">
        {restaurant.cover_url ? (
          <img src={restaurant.cover_url} alt={restaurant.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-7xl">
            {CATEGORY_EMOJI[restaurant.category]}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <Link
          to="/services/food"
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-sm font-medium backdrop-blur hover:bg-background"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start gap-4">
          {restaurant.logo_url ? (
            <img
              src={restaurant.logo_url}
              alt=""
              className="-mt-12 h-20 w-20 rounded-2xl border-4 border-background object-cover shadow-lg sm:h-24 sm:w-24"
            />
          ) : (
            <div className="-mt-12 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-background bg-card text-3xl shadow-lg sm:h-24 sm:w-24">
              {CATEGORY_EMOJI[restaurant.category]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{restaurant.name}</h1>
              {isRestaurantOpenNow(restaurant) ? (
                <Badge className="border border-success bg-success/20 text-success">🟢 Open now</Badge>
              ) : (
                <Badge variant="outline" className="border-destructive bg-destructive/20 text-destructive">
                  Closed
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {CATEGORY_EMOJI[restaurant.category]} {CATEGORY_LABELS[restaurant.category]}
              {restaurant.description ? ` · ${restaurant.description}` : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-4">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> <span className="truncate">{restaurant.address}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {restaurant.estimated_minutes} min delivery
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShoppingBag className="h-3.5 w-3.5" /> ₱{Number(restaurant.base_delivery_fee).toFixed(0)} base
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-warning" /> {Number(restaurant.rating).toFixed(1)}
              </span>
              {restaurant.open_hours && (
                <span className="col-span-2 inline-flex items-center gap-1.5 sm:col-span-4">
                  <Clock className="h-3.5 w-3.5" /> {restaurant.open_hours}
                </span>
              )}
              {restaurant.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {restaurant.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Menu */}
        <div className="mt-8">
          <h2 className="font-display text-xl font-bold">Menu</h2>
          {items.length === 0 ? (
            <div
              className="mt-4 rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground"
              style={{ background: "var(--gradient-card)" }}
            >
              No menu items yet.
            </div>
          ) : (
            <div className="mt-4 space-y-8">
              {categories.map((cat) => {
                const list = grouped.map.get(cat.id) ?? [];
                if (list.length === 0) return null;
                return (
                  <section key={cat.id}>
                    <h3 className="mb-3 font-display text-lg font-semibold">{cat.name}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {list.map((it) => (
                        <MenuItemRow key={it.id} item={it} onClick={() => setSelected(it)} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {grouped.uncategorized.length > 0 && (
                <section>
                  <h3 className="mb-3 font-display text-lg font-semibold">More</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {grouped.uncategorized.map((it) => (
                      <MenuItemRow key={it.id} item={it} onClick={() => setSelected(it)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky cart bar */}
      {cart.itemsCount > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-3 md:bottom-4">
          <div
            className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-primary/40 px-5 py-3 shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            <div className="text-primary-foreground">
              <p className="text-xs opacity-80">{cart.itemsCount} item{cart.itemsCount === 1 ? "" : "s"}</p>
              <p className="font-display text-lg font-bold">₱{cart.itemsSubtotal.toFixed(2)}</p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate({ to: "/services/food/cart" })}
            >
              View cart →
            </Button>
          </div>
        </div>
      )}

      {/* Add-to-cart dialog */}
      <AddToCartDialog
        item={selected}
        restaurant={restaurant}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </PageShell>
  );
}

function MenuItemRow({ item, onClick }: { item: MenuItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-border/60 p-3 text-left transition-all hover:border-primary/40 hover:-translate-y-0.5"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-semibold">{item.name}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        <p className="mt-2 font-display text-base font-bold text-primary-glow">
          ₱{Number(item.price).toFixed(2)}
        </p>
      </div>
      {item.image_url ? (
        <img
          src={item.image_url}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-secondary text-3xl">
          <UtensilsCrossed className="h-7 w-7 text-muted-foreground" />
        </div>
      )}
    </button>
  );
}

function AddToCartDialog({
  item,
  restaurant,
  open,
  onClose,
}: {
  item: MenuItem | null;
  restaurant: Restaurant;
  open: boolean;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const cart = useFoodCart();

  useEffect(() => {
    if (open) {
      setQty(1);
      setNotes("");
    }
  }, [open, item?.id]);

  if (!item) return null;

  const handleAdd = () => {
    if (!restaurant.is_open) {
      toast.error("Sorry, this restaurant is closed right now.");
      return;
    }
    cart.addItem(
      {
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        base_delivery_fee: Number(restaurant.base_delivery_fee),
        per_km_fee: Number(restaurant.per_km_fee),
        free_distance_km: Number(restaurant.free_distance_km),
        estimated_minutes: restaurant.estimated_minutes,
      },
      {
        menu_item_id: item.id,
        name: item.name,
        price: Number(item.price),
        notes: notes.trim() || undefined,
        image_url: item.image_url,
        quantity: qty,
      },
    );
    toast.success(`Added ${qty} × ${item.name}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          {item.description && <DialogDescription>{item.description}</DialogDescription>}
        </DialogHeader>
        {item.image_url && (
          <img src={item.image_url} alt="" className="h-40 w-full rounded-xl object-cover" />
        )}
        <div className="text-sm">
          <p className="font-display text-lg font-bold text-primary-glow">
            ₱{Number(item.price).toFixed(2)}
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="No onions, extra rice, etc."
            maxLength={200}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Quantity</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setQty(Math.max(1, qty - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-display text-lg font-bold">{qty}</span>
            <Button variant="outline" size="icon" onClick={() => setQty(qty + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} className="w-full" size="lg">
            Add to cart · ₱{(Number(item.price) * qty).toFixed(2)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
