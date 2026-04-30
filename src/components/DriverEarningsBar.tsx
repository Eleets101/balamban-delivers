import { useEffect, useState } from "react";
import { Wallet, TrendingUp, Bike, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  todayEarnings: number;
  weekEarnings: number;
  todayTrips: number;
  onlineMs: number;
}

interface Props {
  userId: string;
  sharing: boolean;
  sessionStartedAt: number | null;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Monday-start
  x.setDate(x.getDate() - diff);
  return x;
}

function formatDuration(ms: number) {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

const ONLINE_KEY = (uid: string) => `hatodgo:onlineMs:${uid}:${startOfDay().toISOString().slice(0, 10)}`;

export function DriverEarningsBar({ userId, sharing, sessionStartedAt }: Props) {
  const [stats, setStats] = useState<Stats>({ todayEarnings: 0, weekEarnings: 0, todayTrips: 0, onlineMs: 0 });
  const [, setTick] = useState(0);

  // Load persisted online time for today
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(ONLINE_KEY(userId)) ?? 0);
    setStats((s) => ({ ...s, onlineMs: Number.isFinite(stored) ? stored : 0 }));
  }, [userId]);

  // Persist online time when going offline
  useEffect(() => {
    if (sharing || !sessionStartedAt) return;
    // session ended — already accumulated below before this effect runs in parent
  }, [sharing, sessionStartedAt]);

  // Tick every 30s for live online-time display
  useEffect(() => {
    if (!sharing) return;
    const id = window.setInterval(() => {
      setTick((n) => n + 1);
      // Persist incremental time so refreshes don't lose data
      if (sessionStartedAt) {
        const live = Date.now() - sessionStartedAt;
        const base = Number(window.localStorage.getItem(ONLINE_KEY(userId)) ?? 0);
        window.localStorage.setItem(ONLINE_KEY(userId), String(base + 30_000));
        // Reset session start so we don't double-count
        // (parent owns sessionStartedAt; we just bump localStorage in lockstep)
        void live;
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [sharing, sessionStartedAt, userId]);

  const fetchEarnings = async () => {
    const dayIso = startOfDay().toISOString();
    const weekIso = startOfWeek().toISOString();
    const { data } = await supabase
      .from("orders")
      .select("estimated_price, updated_at, status")
      .eq("rider_id", userId)
      .eq("status", "completed")
      .gte("updated_at", weekIso);
    const rows = data ?? [];
    let weekEarnings = 0;
    let todayEarnings = 0;
    let todayTrips = 0;
    for (const r of rows) {
      const price = Number(r.estimated_price ?? 0);
      weekEarnings += price;
      if (r.updated_at && r.updated_at >= dayIso) {
        todayEarnings += price;
        todayTrips += 1;
      }
    }
    setStats((s) => ({ ...s, todayEarnings, weekEarnings, todayTrips }));
  };

  useEffect(() => {
    fetchEarnings();
    const channel = supabase
      .channel(`driver-earnings-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `rider_id=eq.${userId}` },
        () => fetchEarnings(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const liveOnlineMs =
    stats.onlineMs + (sharing && sessionStartedAt ? Date.now() - sessionStartedAt : 0);

  const items = [
    {
      icon: Wallet,
      label: "Today",
      value: `₱${stats.todayEarnings.toFixed(0)}`,
      color: "text-success",
    },
    {
      icon: TrendingUp,
      label: "This Week",
      value: `₱${stats.weekEarnings.toFixed(0)}`,
      color: "text-primary-glow",
    },
    {
      icon: Bike,
      label: "Trips",
      value: String(stats.todayTrips),
      color: "text-accent",
    },
    {
      icon: Clock,
      label: "Online",
      value: formatDuration(liveOnlineMs),
      color: sharing ? "text-success" : "text-muted-foreground",
    },
  ];

  return (
    <div
      className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-border/60 p-4 sm:grid-cols-4"
      style={{ background: "var(--gradient-card)" }}
    >
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-background/60 ${it.color}`}>
            <it.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{it.label}</p>
            <p className="truncate font-display text-lg font-bold leading-tight">{it.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
