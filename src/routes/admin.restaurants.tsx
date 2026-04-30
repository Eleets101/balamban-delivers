import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, ArrowLeft, Store, Eye, EyeOff, ShieldCheck, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RestaurantFormDialog } from "@/components/admin/RestaurantFormDialog";
import { bulkPublishRestaurants } from "@/server/restaurantImport.functions";
import {
  CATEGORY_EMOJI,
  CATEGORY_LABELS,
  type Restaurant,
} from "@/lib/restaurants";

export const Route = createFileRoute("/admin/restaurants")({
  head: () => ({
    meta: [{ title: "Restaurants — Admin — HatodGo" }],
  }),
  component: AdminRestaurantsPage,
});

function AdminRestaurantsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [filter, setFilter] = useState<"all" | "hidden" | "visible">("all");

  const visible = useMemo(() => {
    if (!restaurants) return null;
    if (filter === "hidden") return restaurants.filter((r) => !r.is_active);
    if (filter === "visible") return restaurants.filter((r) => r.is_active);
    return restaurants;
  }, [restaurants, filter]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectAllVisible = () => visible && setSelected(new Set(visible.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());

  const bulkSetActive = async (active: boolean) => {
    if (selected.size === 0) return;
    setPublishing(true);
    try {
      const res = await bulkPublishRestaurants({ data: { ids: Array.from(selected), active } });
      toast.success(`${active ? "Published" : "Hidden"} ${res.updated} restaurant${res.updated === 1 ? "" : "s"}`);
      clearSelection();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const refresh = async () => {
    const { data, error } = await supabase
      .from("restaurants")
      .select(
        "id, name, slug, category, description, address, lat, lng, phone, logo_url, cover_url, open_hours, is_open, is_active, base_delivery_fee, per_km_fee, free_distance_km, estimated_minutes, rating, sort_order",
      )
      .order("sort_order")
      .order("name");
    if (error) {
      toast.error(error.message);
      return;
    }
    setRestaurants((data as Restaurant[]) ?? []);
  };

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) return;
    refresh();
  }, [loading, isAdmin]);

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

  const toggleActive = async (r: Restaurant, field: "is_open" | "is_active") => {
    const update = field === "is_open" ? { is_open: !r.is_open } : { is_active: !r.is_active };
    const { error } = await supabase.from("restaurants").update(update).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${r.name} updated`);
    refresh();
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Admin home
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Store className="h-7 w-7 text-primary-glow" />
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Restaurants</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/restaurants/import-csv">
                <Download className="h-4 w-4" /> Import CSV
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin/restaurants/import">
                <Download className="h-4 w-4" /> Import from OSM
              </Link>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Add restaurant
            </Button>
          </div>
        </div>

        {/* Filter + bulk actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full border border-border/60 bg-card p-1 text-xs">
            {(["all", "hidden", "visible"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 capitalize ${
                  filter === f ? "bg-primary/15 text-primary-glow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}{" "}
                {f !== "all" && restaurants
                  ? `(${restaurants.filter((r) => (f === "hidden" ? !r.is_active : r.is_active)).length})`
                  : ""}
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs">
              <strong>{selected.size}</strong> selected
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                Clear
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkSetActive(false)} disabled={publishing}>
                <EyeOff className="h-3.5 w-3.5" /> Hide
              </Button>
              <Button size="sm" onClick={() => bulkSetActive(true)} disabled={publishing}>
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Publish
              </Button>
            </div>
          )}
        </div>

        <div
          className="mt-3 overflow-hidden rounded-2xl border border-border/60"
          style={{ background: "var(--gradient-card)" }}
        >
          {restaurants === null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !visible || visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {restaurants.length === 0
                ? 'No restaurants yet. Click "Add restaurant" to create your first one.'
                : "No restaurants match this filter."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">
                      <Checkbox
                        checked={visible.length > 0 && visible.every((r) => selected.has(r.id))}
                        onCheckedChange={(v) => (v ? selectAllVisible() : clearSelection())}
                      />
                    </th>
                    <th className="px-4 py-3">Restaurant</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {r.logo_url ? (
                            <img src={r.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-lg">
                              {CATEGORY_EMOJI[r.category]}
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{r.name}</p>
                            <p className="text-xs text-muted-foreground">{r.address}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{CATEGORY_LABELS[r.category]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        ₱{Number(r.base_delivery_fee).toFixed(0)} base + ₱{Number(r.per_km_fee).toFixed(0)}/km
                        <br />
                        ~{r.estimated_minutes} min
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => toggleActive(r, "is_open")}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                              r.is_open
                                ? "border-success/40 bg-success/15 text-success"
                                : "border-destructive/40 bg-destructive/15 text-destructive"
                            }`}
                          >
                            {r.is_open ? "🟢 Open" : "⚫ Closed"}
                          </button>
                          <button
                            onClick={() => toggleActive(r, "is_active")}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                              r.is_active
                                ? "border-border bg-secondary text-foreground"
                                : "border-warning/40 bg-warning/15 text-warning"
                            }`}
                          >
                            {r.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            {r.is_active ? "Visible" : "Hidden"}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              navigate({
                                to: "/admin/restaurants/$restaurantId",
                                params: { restaurantId: r.id },
                              })
                            }
                          >
                            Manage menu
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <RestaurantFormDialog
        open={creating || !!editing}
        restaurant={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          refresh();
        }}
      />
    </PageShell>
  );
}
