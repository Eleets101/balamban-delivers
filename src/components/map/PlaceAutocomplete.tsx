import { useEffect, useRef, useState } from "react";
import { Loader2, Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchPlaces, type GeoHit } from "@/lib/geo";

interface PlaceAutocompleteProps {
  id?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  onPick: (hit: GeoHit) => void;
  /** Bias autocomplete toward this point (e.g. user location or other endpoint). */
  bias?: { lat: number; lng: number } | null;
}

/** Free OSM-based autocomplete via Photon. Debounced; renders a dropdown of hits. */
export function PlaceAutocomplete({
  id,
  name,
  required,
  placeholder,
  value,
  onValueChange,
  onPick,
  bias,
}: PlaceAutocompleteProps) {
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastQueryRef = useRef("");

  // Debounced search
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    if (q === lastQueryRef.current) return;
    const t = window.setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      const results = await searchPlaces(q, bias ?? null, 8);
      setLoading(false);
      setHits(results);
      setOpen(results.length > 0);
    }, 280);
    return () => window.clearTimeout(t);
  }, [value, bias]);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handlePick = (hit: GeoHit) => {
    onPick(hit);
    onValueChange(hit.displayName);
    setOpen(false);
    lastQueryRef.current = hit.displayName;
  };

  // Allow Enter to pick the top hit
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && hits.length > 0 && open) {
      e.preventDefault();
      handlePick(hits[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            name={name}
            required={required}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onFocus={() => hits.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            autoComplete="off"
          />
          {loading && (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label="Search"
          onClick={() => hits[0] && handlePick(hits[0])}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {open && hits.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-border/60 bg-popover p-1 shadow-lg"
          role="listbox"
        >
          {hits.map((hit, i) => (
            <li key={`${hit.lat}-${hit.lng}-${i}`}>
              <button
                type="button"
                onClick={() => handlePick(hit)}
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{hit.shortName}</p>
                  <p className="truncate text-xs text-muted-foreground">{hit.displayName}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
