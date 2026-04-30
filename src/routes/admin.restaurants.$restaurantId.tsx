import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Upload, X, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MenuCategory, MenuItem, Restaurant } from "@/lib/restaurants";

export const Route = createFileRoute("/admin/restaurants/$restaurantId")({
  head: () => ({ meta: [{ title: "Manage menu — Admin — HatodGo" }] }),
  component: AdminRestaurantMenuPage,
});

const BUCKET = "restaurant-images";

function AdminRestaurantMenuPage() {
  const { restaurantId } = Route.useParams();
  const { isAdmin, loading } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const refresh = async () => {
    const [{ data: r }, { data: cats }, { data: its }] = await Promise.all([
      supabase
        .from("restaurants")
        .select(
          "id, name, slug, category, description, address, lat, lng, phone, logo_url, cover_url, open_hours, is_open, is_active, base_delivery_fee, per_km_fee, free_distance_km, estimated_minutes, rating, sort_order",
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
        .select("id, restaurant_id, category_id, name, description, price, image_url, is_available, sort_order")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
    ]);
    setRestaurant((r as Restaurant) ?? null);
    setCategories((cats as MenuCategory[]) ?? []);
    setItems((its as MenuItem[]) ?? []);
  };

  useEffect(() => {
    if (loading || !isAdmin) return;
    refresh();
  }, [loading, isAdmin, restaurantId]);

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-bold">Admin only</h1>
        </div>
      </PageShell>
    );
  }

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const sort = (categories[categories.length - 1]?.sort_order ?? 0) + 1;
    const { error } = await supabase
      .from("menu_categories")
      .insert({ restaurant_id: restaurantId, name, sort_order: sort });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewCatName("");
    toast.success("Category added");
    refresh();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category? Items in it will become uncategorized.")) return;
    const { error } = await supabase.from("menu_categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const toggleAvailable = async (it: MenuItem) => {
    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: !it.is_available })
      .eq("id", it.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const deleteItem = async (it: MenuItem) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", it.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item deleted");
    refresh();
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link
          to="/admin/restaurants"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All restaurants
        </Link>

        <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
          {restaurant?.name ?? "Loading…"}
        </h1>
        <p className="text-sm text-muted-foreground">{restaurant?.address}</p>

        {/* Categories */}
        <section
          className="mt-6 rounded-2xl border border-border/60 p-5"
          style={{ background: "var(--gradient-card)" }}
        >
          <h2 className="font-display text-lg font-semibold">Menu categories</h2>
          <p className="text-xs text-muted-foreground">Group items like "Rice meals", "Drinks", "Add-ons".</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.id} variant="outline" className="gap-1.5 px-3 py-1">
                {c.name}
                <button
                  onClick={() => deleteCategory(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground">No categories yet.</p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="New category name"
              maxLength={50}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <Button onClick={addCategory} variant="outline">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </section>

        {/* Items */}
        <section
          className="mt-6 rounded-2xl border border-border/60 p-5"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Menu items</h2>
            <Button onClick={() => setCreatingItem(true)}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">No items yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/40">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3">
                  {it.image_url ? (
                    <img src={it.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-xl">
                      🍽️
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ₱{Number(it.price).toFixed(2)}
                      {it.category_id && (
                        <> · {categories.find((c) => c.id === it.category_id)?.name ?? "—"}</>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleAvailable(it)}
                    className={!it.is_available ? "text-warning" : ""}
                  >
                    {it.is_available ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingItem(it)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteItem(it)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <MenuItemDialog
        open={creatingItem || !!editingItem}
        item={editingItem}
        restaurantId={restaurantId}
        categories={categories}
        onClose={() => {
          setCreatingItem(false);
          setEditingItem(null);
        }}
        onSaved={() => {
          setCreatingItem(false);
          setEditingItem(null);
          refresh();
        }}
      />
    </PageShell>
  );
}

function MenuItemDialog({
  open,
  item,
  restaurantId,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: MenuItem | null;
  restaurantId: string;
  categories: MenuCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [imageUrl, setImageUrl] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setDescription(item?.description ?? "");
      setPrice(item ? String(item.price) : "0");
      setCategoryId(item?.category_id ?? "none");
      setImageUrl(item?.image_url ?? "");
      setIsAvailable(item?.is_available ?? true);
    }
  }, [open, item]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `menu/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
    });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setImageUrl(data.publicUrl);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Enter a valid price.");
      return;
    }
    setBusy(true);
    const payload = {
      restaurant_id: restaurantId,
      category_id: categoryId === "none" ? null : categoryId,
      name: name.trim(),
      description: description.trim() || null,
      price: priceNum,
      image_url: imageUrl.trim() || null,
      is_available: isAvailable,
    };
    const op = item
      ? supabase.from("menu_items").update(payload).eq("id", item.id)
      : supabase.from("menu_items").insert(payload);
    const { error } = await op;
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(item ? "Item updated" : "Item added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit menu item" : "Add menu item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price (₱) *</Label>
              <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Image</Label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-16 w-16 rounded-lg border border-border/60 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground">
                  <Upload className="h-5 w-5" />
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {imageUrl ? "Replace" : "Upload"}
                </span>
              </label>
              {imageUrl && (
                <button
                  onClick={() => setImageUrl("")}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
            <span className="text-sm">Available for order</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {item ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
