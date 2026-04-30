import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, ArrowLeft, Store, Eye, EyeOff, ShieldCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RestaurantFormDialog } from "@/components/admin/RestaurantFormDialog";
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

        <div
          className="mt-6 overflow-hidden rounded-2xl border border-border/60"
          style={{ background: "var(--gradient-card)" }}
        >
          {restaurants === null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : restaurants.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No restaurants yet. Click "Add restaurant" to create your first one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Restaurant</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 last:border-0">
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
