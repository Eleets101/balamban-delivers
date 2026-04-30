import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Search,
  Store,
  ShieldCheck,
  Star,
  Phone,
  Globe,
  Clock,
  CheckCircle2,
  Download,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CATEGORY_EMOJI, CATEGORY_LABELS } from "@/lib/restaurants";
import {
  searchOsmRestaurants,
  importOsmRestaurants,
} from "@/server/restaurantImport.functions";

export const Route = createFileRoute("/admin/restaurants/import")({
  head: () => ({ meta: [{ title: "Import restaurants — Admin — HatodGo" }] }),
  component: ImportRestaurantsPage,
});

type Place = Awaited<ReturnType<typeof searchOsmRestaurants>>["places"][number];

interface PlaceWithMeta extends Place {
  rating: number;
  review_count: number;
}

function ImportRestaurantsPage() {
  const { isAdmin, loading } = useAuth();
  const [radiusKm, setRadiusKm] = useState(6);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [places, setPlaces] = useState<PlaceWithMeta[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filters
  const [minRating, setMinRating] = useState(0);
  const [minReviews, setMinReviews] = useState(0);
  const [foodOnly, setFoodOnly] = useState(true);
  const [hasPhone, setHasPhone] = useState(false);
  const [hideImported, setHideImported] = useState(true);

  const runSearch = async () => {
    setSearching(true);
    setSelected(new Set());
    try {
      const res = await searchOsmRestaurants({
        data: { radiusM: Math.round(radiusKm * 1000) },
      });
      const enriched: PlaceWithMeta[] = res.places.map((p) => ({
        ...p,
        rating: 0, // OSM has no ratings — admin can edit later
        review_count: 0,
      }));
      setPlaces(enriched);
      toast.success(`Found ${enriched.length} places near Balamban`);
    } catch (e) {
      toast.error((e as Error).message);
      setPlaces([]);
    } finally {
      setSearching(false);
    }
  };

  // Auto-run once on mount when admin is ready
  useEffect(() => {
    if (!loading && isAdmin && places === null) {
      runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAdmin]);

  const filtered = useMemo(() => {
    if (!places) return null;
    const q = query.trim().toLowerCase();
    const FOOD_CATS = new Set(["carenderia", "fast_food", "bakery", "drinks", "snacks"]);
    return places
      .filter((p) => {
        if (hideImported && p.alreadyImported) return false;
        if (foodOnly && !FOOD_CATS.has(p.category)) return false;
        if (p.rating < minRating) return false;
        if (p.review_count < minReviews) return false;
        if (hasPhone && !p.phone) return false;
        if (q && !p.name.toLowerCase().includes(q) && !p.address.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  }, [places, query, minRating, minReviews, foodOnly, hasPhone, hideImported]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (!filtered) return;
    const ids = filtered.filter((p) => !p.alreadyImported).map((p) => p.osm_id);
    setSelected(new Set(ids));
  };
  const clearSelection = () => setSelected(new Set());

  const updatePlace = (osmId: string, patch: Partial<PlaceWithMeta>) => {
    setPlaces((prev) => prev?.map((p) => (p.osm_id === osmId ? { ...p, ...patch } : p)) ?? prev);
  };

  const runImport = async () => {
    if (!places || selected.size === 0) return;
    setImporting(true);
    try {
      const toImport = places
        .filter((p) => selected.has(p.osm_id) && !p.alreadyImported)
        .map((p) => ({
          osm_id: p.osm_id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          category: p.category,
          phone: p.phone,
          website: p.website,
          open_hours: p.open_hours,
          rating: p.rating,
          review_count: p.review_count,
        }));
      const res = await importOsmRestaurants({ data: { places: toImport } });
      toast.success(`Imported ${res.imported} restaurant${res.imported === 1 ? "" : "s"} (hidden until you publish)`);
      setSelected(new Set());
      await runSearch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

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

  const visibleSelectable = filtered?.filter((p) => !p.alreadyImported).length ?? 0;

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          to="/admin/restaurants"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to restaurants
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Store className="h-7 w-7 text-primary-glow" />
            <div>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Import restaurants</h1>
              <p className="text-sm text-muted-foreground">
                Free OpenStreetMap data for Balamban, Cebu — no API key required.
              </p>
            </div>
          </div>
          <Button onClick={runSearch} disabled={searching} variant="outline">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {/* Controls */}
        <div
          className="mt-6 grid gap-4 rounded-2xl border border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-4"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Search by name or address</Label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Jollibee, carenderia…"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Search radius: {radiusKm.toFixed(1)} km
            </Label>
            <Slider
              className="mt-3"
              min={1}
              max={15}
              step={0.5}
              value={[radiusKm]}
              onValueChange={(v) => setRadiusKm(v[0])}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Min rating: {minRating.toFixed(1)} ★
            </Label>
            <Slider
              className="mt-3"
              min={0}
              max={5}
              step={0.5}
              value={[minRating]}
              onValueChange={(v) => setMinRating(v[0])}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Min reviews: {minReviews}
            </Label>
            <Slider
              className="mt-3"
              min={0}
              max={50}
              step={1}
              value={[minReviews]}
              onValueChange={(v) => setMinReviews(v[0])}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={foodOnly} onCheckedChange={(v) => setFoodOnly(!!v)} />
              Food only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={hasPhone} onCheckedChange={(v) => setHasPhone(!!v)} />
              Has phone
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={hideImported} onCheckedChange={(v) => setHideImported(!!v)} />
              Hide already imported
            </label>
          </div>
        </div>

        {/* Action bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {filtered ? (
              <>
                <strong className="text-foreground">{filtered.length}</strong> result
                {filtered.length === 1 ? "" : "s"} ·{" "}
                <strong className="text-foreground">{selected.size}</strong> selected
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={selectAllVisible} disabled={!visibleSelectable}>
              Select all ({visibleSelectable})
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} disabled={selected.size === 0}>
              Clear
            </Button>
            <Button onClick={runImport} disabled={selected.size === 0 || importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Import {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Imported restaurants are saved as <strong>hidden</strong>. Add menus and toggle them visible from the
          restaurants list when ready.
        </p>

        {/* Results */}
        <div className="mt-6">
          {searching && places === null ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed border-border/60 p-10 text-center"
              style={{ background: "var(--gradient-card)" }}
            >
              <p className="text-sm text-muted-foreground">
                No places match your filters. Try widening the radius or relaxing the filters.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filtered.map((p) => (
                <PlaceCard
                  key={p.osm_id}
                  place={p}
                  selected={selected.has(p.osm_id)}
                  onToggle={() => toggleSelect(p.osm_id)}
                  onPatch={(patch) => updatePlace(p.osm_id, patch)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function PlaceCard({
  place,
  selected,
  onToggle,
  onPatch,
}: {
  place: PlaceWithMeta;
  selected: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<PlaceWithMeta>) => void;
}) {
  const disabled = place.alreadyImported;
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        disabled
          ? "border-border/40 opacity-70"
          : selected
            ? "border-primary/60 ring-1 ring-primary/40"
            : "border-border/60 hover:border-primary/40"
      }`}
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          disabled={disabled}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold">{place.name}</h3>
            <Badge variant="outline" className="text-xs">
              {CATEGORY_EMOJI[place.category]} {CATEGORY_LABELS[place.category]}
            </Badge>
            {disabled && (
              <Badge variant="outline" className="border-success/40 bg-success/15 text-success text-xs">
                <CheckCircle2 className="h-3 w-3" /> Already imported
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{place.address}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {place.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {place.phone}
              </span>
            )}
            {place.website && (
              <a
                href={place.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary-glow"
              >
                <Globe className="h-3 w-3" /> Website
              </a>
            )}
            {place.open_hours && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {place.open_hours.length > 30 ? "See hours" : place.open_hours}
              </span>
            )}
            {place.cuisine && <span>· {place.cuisine}</span>}
          </div>

          {!disabled && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Rating (optional)
                </Label>
                <div className="relative mt-1">
                  <Star className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-warning" />
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={place.rating || ""}
                    onChange={(e) => onPatch({ rating: parseFloat(e.target.value) || 0 })}
                    placeholder="0.0"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Reviews (optional)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={place.review_count || ""}
                  onChange={(e) => onPatch({ review_count: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
