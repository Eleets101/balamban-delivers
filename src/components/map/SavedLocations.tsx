import { useEffect, useState } from "react";
import { Home, Briefcase, Star, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Kind = "home" | "work" | "favorite";

export interface SavedLocation {
  id: string;
  kind: Kind;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

interface SavedLocationsProps {
  /** Called when user taps a saved chip. */
  onPick: (loc: SavedLocation) => void;
  /** Currently-pinned coords + address (so we can offer to save them). */
  currentCoords?: { lat: number; lng: number } | null;
  currentAddress?: string;
}

const KIND_ICON = {
  home: Home,
  work: Briefcase,
  favorite: Star,
};

export function SavedLocations({ onPick, currentCoords, currentAddress }: SavedLocationsProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedLocation[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ kind: Kind; label: string }>({ kind: "favorite", label: "" });

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("saved_locations")
      .select("id, kind, label, address, lat, lng")
      .eq("user_id", user.id)
      .order("kind", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setItems((data as SavedLocation[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("saved_locations")
      .select("id, kind, label, address, lat, lng")
      .eq("user_id", user.id)
      .order("kind", { ascending: true })
      .order("created_at", { ascending: true });
    setItems((data as SavedLocation[]) ?? []);
  };

  const handleSave = async () => {
    if (!user || !currentCoords) return;
    if (!form.label.trim()) {
      toast.error("Give this place a short name.");
      return;
    }
    setSaving(true);
    // For Home/Work, upsert (replace existing).
    const payload = {
      user_id: user.id,
      kind: form.kind,
      label: form.label.trim(),
      address: currentAddress ?? `${currentCoords.lat.toFixed(5)}, ${currentCoords.lng.toFixed(5)}`,
      lat: currentCoords.lat,
      lng: currentCoords.lng,
    };
    let error;
    if (form.kind === "home" || form.kind === "work") {
      ({ error } = await supabase
        .from("saved_locations")
        .upsert(payload, { onConflict: "user_id,kind" }));
    } else {
      ({ error } = await supabase.from("saved_locations").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Saved as ${form.label}`);
    setSaveOpen(false);
    setForm({ kind: "favorite", label: "" });
    void refresh();
  };

  if (!user) return null;

  const canSave = !!currentCoords;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {items?.map((loc) => {
          const Icon = KIND_ICON[loc.kind];
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => onPick(loc)}
              className="group flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/60 hover:bg-primary/10"
              title={loc.address}
            >
              <Icon className="h-3.5 w-3.5 text-primary-glow" />
              <span>{loc.label}</span>
            </button>
          );
        })}
        {items && items.length === 0 && (
          <span className="text-xs text-muted-foreground">No saved places yet.</span>
        )}
        {canSave && (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/60 hover:text-primary-glow"
          >
            <Plus className="h-3.5 w-3.5" /> Save this place
          </button>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this place</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Save as</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["home", "work", "favorite"] as Kind[]).map((k) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setForm({
                          kind: k,
                          label: k === "home" ? "Home" : k === "work" ? "Work" : form.label,
                        })
                      }
                      className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
                        form.kind === k
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/60 hover:border-border"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-semibold capitalize">{k}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="sl-label">Name</Label>
              <Input
                id="sl-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Mama's house, Dorm"
              />
            </div>
            {currentAddress && (
              <p className="text-xs text-muted-foreground">📍 {currentAddress}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
