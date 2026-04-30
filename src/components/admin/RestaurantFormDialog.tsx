import { useEffect, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  CATEGORY_LABELS,
  type Restaurant,
  type RestaurantCategory,
} from "@/lib/restaurants";

interface Props {
  open: boolean;
  restaurant: Restaurant | null;
  onClose: () => void;
  onSaved: () => void;
}

const BUCKET = "restaurant-images";

const blank = {
  name: "",
  category: "carenderia" as RestaurantCategory,
  description: "",
  address: "",
  lat: "",
  lng: "",
  phone: "",
  logo_url: "",
  cover_url: "",
  open_hours: "",
  is_open: true,
  is_active: true,
  base_delivery_fee: 30,
  per_km_fee: 7,
  free_distance_km: 2,
  estimated_minutes: 30,
  rating: 4.5,
};

export function RestaurantFormDialog({ open, restaurant, onClose, onSaved }: Props) {
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      if (restaurant) {
        setForm({
          name: restaurant.name,
          category: restaurant.category,
          description: restaurant.description ?? "",
          address: restaurant.address,
          lat: restaurant.lat?.toString() ?? "",
          lng: restaurant.lng?.toString() ?? "",
          phone: restaurant.phone ?? "",
          logo_url: restaurant.logo_url ?? "",
          cover_url: restaurant.cover_url ?? "",
          open_hours: restaurant.open_hours ?? "",
          is_open: restaurant.is_open,
          is_active: restaurant.is_active,
          base_delivery_fee: Number(restaurant.base_delivery_fee),
          per_km_fee: Number(restaurant.per_km_fee),
          free_distance_km: Number(restaurant.free_distance_km),
          estimated_minutes: restaurant.estimated_minutes,
          rating: Number(restaurant.rating),
        });
      } else {
        setForm(blank);
      }
    }
  }, [open, restaurant]);

  const handleUpload = async (kind: "logo_url" | "cover_url", file: File) => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${kind}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setForm((prev) => ({ ...prev, [kind]: data.publicUrl }));
    toast.success("Image uploaded");
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim()) {
      toast.error("Name and address are required.");
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || null,
      address: form.address.trim(),
      lat: form.lat ? Number(form.lat) : null,
      lng: form.lng ? Number(form.lng) : null,
      phone: form.phone.trim() || null,
      logo_url: form.logo_url.trim() || null,
      cover_url: form.cover_url.trim() || null,
      open_hours: form.open_hours.trim() || null,
      is_open: form.is_open,
      is_active: form.is_active,
      base_delivery_fee: form.base_delivery_fee,
      per_km_fee: form.per_km_fee,
      free_distance_km: form.free_distance_km,
      estimated_minutes: form.estimated_minutes,
      rating: form.rating,
    };
    const op = restaurant
      ? supabase.from("restaurants").update(payload).eq("id", restaurant.id)
      : supabase.from("restaurants").insert(payload);
    const { error } = await op;
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(restaurant ? "Restaurant updated" : "Restaurant created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{restaurant ? "Edit restaurant" : "Add restaurant"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as RestaurantCategory })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as RestaurantCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Address" required>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Latitude">
              <Input
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                placeholder="10.512"
              />
            </Field>
            <Field label="Longitude">
              <Input
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
                placeholder="123.713"
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Open hours">
              <Input
                value={form.open_hours}
                onChange={(e) => setForm({ ...form, open_hours: e.target.value })}
                placeholder="Mon-Sun 7am-9pm"
              />
            </Field>
          </div>

          {/* Images */}
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField
              label="Logo"
              url={form.logo_url}
              onUpload={(f) => handleUpload("logo_url", f)}
              onClear={() => setForm({ ...form, logo_url: "" })}
            />
            <ImageField
              label="Cover image"
              url={form.cover_url}
              onUpload={(f) => handleUpload("cover_url", f)}
              onClear={() => setForm({ ...form, cover_url: "" })}
            />
          </div>

          {/* Pricing */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Base delivery fee (₱)">
              <Input
                type="number"
                value={form.base_delivery_fee}
                onChange={(e) => setForm({ ...form, base_delivery_fee: Number(e.target.value) })}
              />
            </Field>
            <Field label="Per km fee (₱)">
              <Input
                type="number"
                value={form.per_km_fee}
                onChange={(e) => setForm({ ...form, per_km_fee: Number(e.target.value) })}
              />
            </Field>
            <Field label="Free distance (km)">
              <Input
                type="number"
                step="0.1"
                value={form.free_distance_km}
                onChange={(e) => setForm({ ...form, free_distance_km: Number(e.target.value) })}
              />
            </Field>
            <Field label="Estimated minutes">
              <Input
                type="number"
                value={form.estimated_minutes}
                onChange={(e) => setForm({ ...form, estimated_minutes: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Rating (0-5)">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
            />
          </Field>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2">
              <Switch
                checked={form.is_open}
                onCheckedChange={(v) => setForm({ ...form, is_open: v })}
              />
              <span className="text-sm">Open now (accepting orders)</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <span className="text-sm">Visible to customers</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {restaurant ? "Save changes" : "Create restaurant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required ? " *" : ""}</Label>
      {children}
    </div>
  );
}

function ImageField({
  label,
  url,
  onUpload,
  onClear,
}: {
  label: string;
  url: string;
  onUpload: (file: File) => void | Promise<void>;
  onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {url ? (
          <img src={url} alt="" className="h-16 w-16 rounded-lg border border-border/60 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground">
            <Upload className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                await onUpload(f);
                setUploading(false);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {url ? "Replace" : "Upload"}
            </span>
          </label>
          {url && (
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
