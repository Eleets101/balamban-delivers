import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Store,
  UploadCloud,
  Download,
  Star,
  Phone,
  Globe,
  Clock,
  CheckCircle2,
  Trash2,
  FileText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CATEGORY_EMOJI, CATEGORY_LABELS, type RestaurantCategory } from "@/lib/restaurants";
import { importCsvRestaurants } from "@/server/restaurantImport.functions";

export const Route = createFileRoute("/admin/restaurants/import-csv")({
  head: () => ({ meta: [{ title: "Import CSV — Admin — HatodGo" }] }),
  component: CsvImportPage,
});

interface ParsedRow {
  // stable id for selection state
  rowKey: string;
  name: string;
  category: RestaurantCategory;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  rating: number;
  review_count: number;
  open_hours: string | null;
  cover_url: string | null;
  tags: string[];
  external_id: string | null;
  // ui-only
  errors: string[];
}

// Map common Google Maps / Outscraper / generic CSV column names → canonical keys.
const COLUMN_ALIASES: Record<string, string> = {
  // name
  name: "name",
  title: "name",
  business_name: "name",
  "business name": "name",
  // category / type
  category: "category",
  type: "category",
  subtypes: "category",
  categories: "category",
  // address
  address: "address",
  full_address: "address",
  "full address": "address",
  street: "address",
  // coords
  latitude: "lat",
  lat: "lat",
  longitude: "lng",
  lng: "lng",
  lon: "lng",
  long: "lng",
  // phone
  phone: "phone",
  phone_1: "phone",
  "phone number": "phone",
  contact: "phone",
  // website
  website: "website",
  site: "website",
  url: "website",
  // rating
  rating: "rating",
  stars: "rating",
  google_rating: "rating",
  // reviews
  reviews: "review_count",
  review_count: "review_count",
  "review count": "review_count",
  user_ratings_total: "review_count",
  // hours
  hours: "open_hours",
  working_hours: "open_hours",
  opening_hours: "open_hours",
  open_hours: "open_hours",
  // photo
  photo: "cover_url",
  photos: "cover_url",
  photo_url: "cover_url",
  "photo url": "cover_url",
  image: "cover_url",
  image_url: "cover_url",
  // id
  place_id: "external_id",
  google_id: "external_id",
  external_id: "external_id",
  id: "external_id",
};

function inferCategory(raw: string | null | undefined): RestaurantCategory {
  const v = (raw ?? "").toLowerCase();
  if (!v) return "carenderia";
  if (v.includes("pharmac") || v.includes("drug")) return "pharmacy";
  if (v.includes("bakery") || v.includes("bake")) return "bakery";
  if (v.includes("grocer") || v.includes("supermarket") || v.includes("convenience"))
    return "grocery";
  if (v.includes("cafe") || v.includes("coffee") || v.includes("bar") || v.includes("juice") || v.includes("milk tea") || v.includes("drink"))
    return "drinks";
  if (v.includes("snack") || v.includes("street food") || v.includes("dessert") || v.includes("ice cream"))
    return "snacks";
  if (v.includes("carinderia") || v.includes("carenderia") || v.includes("filipino") || v.includes("eatery"))
    return "carenderia";
  if (v.includes("fast food") || v.includes("burger") || v.includes("pizza") || v.includes("chicken") || v.includes("restaurant"))
    return "fast_food";
  return "other";
}

function suggestTags(r: { rating: number; review_count: number; tags: string[] }): string[] {
  const tags = new Set<string>(r.tags);
  if (r.rating >= 4.5 && r.review_count >= 20) tags.add("Highly rated");
  else if (r.rating >= 4.0) tags.add("Highly rated");
  if (r.review_count >= 100) tags.add("Popular");
  return Array.from(tags);
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseInt0(v: unknown): number {
  const n = parseNumber(v);
  return n == null ? 0 : Math.max(0, Math.round(n));
}

function normalizeRow(raw: Record<string, string>, idx: number): ParsedRow {
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase();
    const canonical = COLUMN_ALIASES[key];
    if (canonical && lookup[canonical] === undefined) {
      lookup[canonical] = (v ?? "").toString().trim();
    }
  }

  const name = lookup.name || "";
  const rating = parseNumber(lookup.rating) ?? 0;
  const review_count = parseInt0(lookup.review_count);
  const lat = parseNumber(lookup.lat);
  const lng = parseNumber(lookup.lng);

  const errors: string[] = [];
  if (!name) errors.push("Missing name");
  if (!lookup.address) errors.push("Missing address");

  const row: ParsedRow = {
    rowKey: `row-${idx}`,
    name,
    category: inferCategory(lookup.category),
    address: lookup.address || "",
    lat,
    lng,
    phone: lookup.phone || null,
    website: lookup.website || null,
    rating: Math.max(0, Math.min(5, rating)),
    review_count,
    open_hours: lookup.open_hours || null,
    cover_url: lookup.cover_url || null,
    tags: [],
    external_id: lookup.external_id || null,
    errors,
  };
  row.tags = suggestTags(row);
  return row;
}

function CsvImportPage() {
  const { isAdmin, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [hideErrors, setHideErrors] = useState(true);

  const handleFile = (file: File) => {
    setFilename(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const parsed = res.data.map((r, i) => normalizeRow(r, i)).filter((r) => r.name || r.address);
        if (parsed.length === 0) {
          toast.error("No valid rows found in CSV. Check column headers.");
          setRows([]);
          return;
        }
        setRows(parsed);
        // Pre-select all rows without errors
        setSelected(new Set(parsed.filter((r) => r.errors.length === 0).map((r) => r.rowKey)));
        toast.success(`Parsed ${parsed.length} row${parsed.length === 1 ? "" : "s"} from ${file.name}`);
      },
      error: (err) => {
        toast.error(`CSV parse failed: ${err.message}`);
        setRows([]);
      },
    });
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideErrors && r.errors.length > 0) return false;
      if (r.rating < minRating) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.address.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.rating - a.rating || b.review_count - a.review_count);
  }, [rows, search, minRating, hideErrors]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const selectAllVisible = () => {
    if (!filtered) return;
    setSelected(new Set(filtered.filter((r) => r.errors.length === 0).map((r) => r.rowKey)));
  };
  const clearSelection = () => setSelected(new Set());

  const updateRow = (key: string, patch: Partial<ParsedRow>) => {
    setRows((prev) => prev?.map((r) => (r.rowKey === key ? { ...r, ...patch } : r)) ?? prev);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev?.filter((r) => r.rowKey !== key) ?? prev);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const reset = () => {
    setRows(null);
    setSelected(new Set());
    setFilename(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runImport = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => selected.has(r.rowKey) && r.errors.length === 0);
    if (toImport.length === 0) {
      toast.error("Select at least one valid row");
      return;
    }
    setImporting(true);
    try {
      // Chunk to stay under the 200-row server cap.
      let imported = 0;
      let skipped = 0;
      for (let i = 0; i < toImport.length; i += 100) {
        const chunk = toImport.slice(i, i + 100).map((r) => ({
          name: r.name,
          category: r.category,
          address: r.address,
          lat: r.lat,
          lng: r.lng,
          phone: r.phone,
          website: r.website,
          rating: r.rating,
          review_count: r.review_count,
          open_hours: r.open_hours,
          cover_url: r.cover_url,
          tags: r.tags,
          external_id: r.external_id,
        }));
        const res = await importCsvRestaurants({ data: { rows: chunk } });
        imported += res.imported;
        skipped += res.skipped;
      }
      toast.success(
        `Imported ${imported} restaurant${imported === 1 ? "" : "s"}${
          skipped > 0 ? ` (${skipped} skipped — already exist)` : ""
        }. They are hidden until you publish them.`,
      );
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "name",
      "category",
      "address",
      "latitude",
      "longitude",
      "phone",
      "website",
      "rating",
      "review_count",
      "working_hours",
      "photo_url",
      "place_id",
    ];
    const example = [
      "Manong Berto Inasal",
      "fast_food",
      "Balamban, Cebu",
      "10.4456",
      "123.7016",
      "+63 912 345 6789",
      "",
      "4.6",
      "120",
      "Mon-Sun 10:00-22:00",
      "",
      "",
    ];
    const csv = `${headers.join(",")}\n${example.map((c) => `"${c}"`).join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hatodgo-restaurants-template.csv";
    a.click();
    URL.revokeObjectURL(url);
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

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const errorCount = rows?.filter((r) => r.errors.length > 0).length ?? 0;

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
            <FileText className="h-7 w-7 text-primary-glow" />
            <div>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Import from CSV</h1>
              <p className="text-sm text-muted-foreground">
                Upload Google Maps / Outscraper exports. Auto-detects common columns.
              </p>
            </div>
          </div>
          <Button onClick={downloadTemplate} variant="outline" size="sm">
            <Download className="h-4 w-4" /> Template CSV
          </Button>
        </div>

        {/* Upload zone or results */}
        {rows === null ? (
          <UploadZone fileInputRef={fileInputRef} onFile={handleFile} />
        ) : (
          <>
            <div
              className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 p-4"
              style={{ background: "var(--gradient-card)" }}
            >
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-5 w-5 text-primary-glow" />
                <div>
                  <p className="font-medium">{filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {validCount} valid · {errorCount} with errors · {selected.size} selected
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>
                  Upload different file
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or address…"
              />
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-xs text-muted-foreground">Min rating</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={minRating}
                  onChange={(e) => setMinRating(parseFloat(e.target.value) || 0)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={hideErrors} onCheckedChange={(v) => setHideErrors(!!v)} />
                Hide rows with errors
              </label>
            </div>

            {/* Action bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Showing <strong className="text-foreground">{filtered?.length ?? 0}</strong> of{" "}
                {rows.length}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAllVisible}>
                  Select all valid
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection} disabled={selected.size === 0}>
                  Clear
                </Button>
                <Button onClick={runImport} disabled={selected.size === 0 || importing}>
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  Import {selected.size > 0 ? `(${selected.size})` : ""}
                </Button>
              </div>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Imports save as <strong>hidden</strong>. Add menus, then bulk-publish from the restaurants
              list when ready.
            </p>

            {/* Rows */}
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {filtered?.map((r) => (
                <RowCard
                  key={r.rowKey}
                  row={r}
                  selected={selected.has(r.rowKey)}
                  onToggle={() => toggleSelect(r.rowKey)}
                  onPatch={(p) => updateRow(r.rowKey, p)}
                  onRemove={() => removeRow(r.rowKey)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

function UploadZone({
  fileInputRef,
  onFile,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`mt-6 cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition ${
        dragOver ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50"
      }`}
      style={{ background: "var(--gradient-card)" }}
      onClick={() => fileInputRef.current?.click()}
    >
      <UploadCloud className="mx-auto h-12 w-12 text-primary-glow" />
      <h2 className="mt-4 font-display text-xl font-semibold">Upload a CSV file</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Drag & drop or click to browse. Auto-detects common Google Maps export columns.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Recognized columns:
        <span className="font-mono">name, category, address, latitude, longitude, phone, website, rating, reviews, hours, photo_url, place_id</span>
      </div>
    </div>
  );
}

function RowCard({
  row,
  selected,
  onToggle,
  onPatch,
  onRemove,
}: {
  row: ParsedRow;
  selected: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<ParsedRow>) => void;
  onRemove: () => void;
}) {
  const hasError = row.errors.length > 0;
  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        hasError
          ? "border-destructive/40"
          : selected
            ? "border-primary/60 ring-1 ring-primary/40"
            : "border-border/60 hover:border-primary/40"
      }`}
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} disabled={hasError} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold">
              {row.name || <span className="text-destructive">(no name)</span>}
            </h3>
            <Badge variant="outline" className="text-xs">
              {CATEGORY_EMOJI[row.category]} {CATEGORY_LABELS[row.category]}
            </Badge>
            {row.rating > 0 && (
              <Badge variant="outline" className="text-xs">
                <Star className="h-3 w-3 text-warning" /> {row.rating.toFixed(1)} ({row.review_count})
              </Badge>
            )}
            {row.tags.map((t) => (
              <Badge key={t} className="bg-primary/15 text-primary-glow border-primary/40 text-xs">
                {t}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.address || "—"}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {row.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {row.phone}
              </span>
            )}
            {row.website && (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3 w-3" /> {row.website.length > 30 ? "Website" : row.website}
              </span>
            )}
            {row.open_hours && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {row.open_hours.length > 30 ? "See hours" : row.open_hours}
              </span>
            )}
            {row.cover_url && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-success" /> Photo
              </span>
            )}
          </div>

          {hasError && (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {row.errors.join(" · ")}
            </div>
          )}

          {!hasError && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={row.category}
                onChange={(e) => onPatch({ category: e.target.value as RestaurantCategory })}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <TagToggle
                label="Highly rated"
                active={row.tags.includes("Highly rated")}
                onToggle={() =>
                  onPatch({
                    tags: row.tags.includes("Highly rated")
                      ? row.tags.filter((t) => t !== "Highly rated")
                      : [...row.tags, "Highly rated"],
                  })
                }
              />
              <TagToggle
                label="Popular"
                active={row.tags.includes("Popular")}
                onToggle={() =>
                  onPatch({
                    tags: row.tags.includes("Popular")
                      ? row.tags.filter((t) => t !== "Popular")
                      : [...row.tags, "Popular"],
                  })
                }
              />
              <TagToggle
                label="New"
                active={row.tags.includes("New")}
                onToggle={() =>
                  onPatch({
                    tags: row.tags.includes("New")
                      ? row.tags.filter((t) => t !== "New")
                      : [...row.tags, "New"],
                  })
                }
              />
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove row"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TagToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
        active
          ? "border-primary bg-primary/15 text-primary-glow"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
