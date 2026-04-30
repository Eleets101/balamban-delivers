import { useEffect, useState } from "react";
import { Circle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OnlineRider {
  rider_id: string;
  updated_at: string;
  full_name: string | null;
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // last 2 min = online

interface Props {
  /** When true, hides full names (privacy) and shows only a count + initials. */
  compact?: boolean;
  className?: string;
}

export function OnlineRiders({ compact = false, className = "" }: Props) {
  const [riders, setRiders] = useState<OnlineRider[]>([]);

  const fetchRiders = async () => {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const { data: locs } = await supabase
      .from("driver_locations")
      .select("rider_id, updated_at")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false });
    const list = locs ?? [];
    if (list.length === 0) {
      setRiders([]);
      return;
    }
    const ids = Array.from(new Set(list.map((r) => r.rider_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    // De-dupe per rider, keep latest
    const seen = new Set<string>();
    const merged: OnlineRider[] = [];
    for (const r of list) {
      if (seen.has(r.rider_id)) continue;
      seen.add(r.rider_id);
      merged.push({
        rider_id: r.rider_id,
        updated_at: r.updated_at,
        full_name: nameMap.get(r.rider_id) ?? null,
      });
    }
    setRiders(merged);
  };

  useEffect(() => {
    fetchRiders();
    const id = window.setInterval(fetchRiders, 20_000);
    const channel = supabase
      .channel("online-riders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations" },
        () => fetchRiders(),
      )
      .subscribe();
    return () => {
      window.clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, []);

  const initials = (name: string | null, id: string) => {
    if (name) {
      const parts = name.trim().split(/\s+/);
      return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "R";
    }
    return id.slice(0, 2).toUpperCase();
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-2 ${className}`}>
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            {riders.length > 0 && (
              <span className="absolute inset-0 animate-ping rounded-full bg-success/60" aria-hidden />
            )}
            <span className={`relative h-2.5 w-2.5 rounded-full ${riders.length > 0 ? "bg-success" : "bg-muted-foreground"}`} />
          </span>
          <span className="font-medium">{riders.length}</span>
          <span className="text-muted-foreground">rider{riders.length === 1 ? "" : "s"} online</span>
        </div>
        <div className="flex -space-x-2">
          {riders.slice(0, 5).map((r) => (
            <div
              key={r.rider_id}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary/20 text-[10px] font-semibold text-primary-glow"
              title="Online rider"
            >
              {initials(null, r.rider_id)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className={`rounded-2xl border border-border/60 p-5 ${className}`} style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Users className="h-5 w-5 text-primary-glow" /> Online riders
        </h2>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Circle className={`h-2.5 w-2.5 ${riders.length > 0 ? "fill-success text-success" : "fill-muted-foreground text-muted-foreground"}`} />
          {riders.length} now
        </span>
      </div>

      {riders.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No riders online right now.</p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {riders.map((r) => {
            const ageSec = Math.max(0, Math.round((Date.now() - new Date(r.updated_at).getTime()) / 1000));
            const ageLabel = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`;
            return (
              <li key={r.rider_id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-glow">
                  {initials(r.full_name, r.rider_id)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.full_name ?? "Rider"}</p>
                  <p className="text-xs text-muted-foreground">Updated {ageLabel}</p>
                </div>
                <span className="relative flex h-2.5 w-2.5" aria-label="online">
                  <span className="absolute inset-0 animate-ping rounded-full bg-success/60" aria-hidden />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-success" />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
