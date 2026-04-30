import { AlertTriangle } from "lucide-react";
import { zoneFor, SERVICE_ZONES } from "@/lib/serviceArea";

interface ServiceAreaWarningProps {
  coords: { lat: number; lng: number } | null;
  label?: string;
}

/** Inline warning shown when a pinned address falls outside our service zones. */
export function ServiceAreaWarning({ coords, label = "This location" }: ServiceAreaWarningProps) {
  if (!coords) return null;
  const zone = zoneFor(coords);
  if (zone) {
    return (
      <p className="mt-1 text-xs text-success">
        ✅ {label} is inside our <span className="font-semibold">{zone.name}</span> service area.
      </p>
    );
  }
  return (
    <div className="mt-2 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="text-xs">
        <p className="font-semibold text-warning">Outside service area</p>
        <p className="mt-0.5 text-warning-foreground/80">
          {label} is outside our current coverage ({SERVICE_ZONES.map((z) => z.name).join(", ")}).
          You can still place the order, but a rider may decline or charge extra for the long trip.
        </p>
      </div>
    </div>
  );
}
