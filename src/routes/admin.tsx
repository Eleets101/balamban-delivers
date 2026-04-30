import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, Package as PackageIcon, ShieldCheck, Clock, CheckCircle2, UserCog, X, Search, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminLiveOrdersMap } from "@/components/map/AdminLiveOrdersMap.lazy";
import { OnlineRiders } from "@/components/OnlineRiders";
import { MapClientOnly } from "@/components/map/MapClientOnly";
import { SERVICE_LABELS, STATUS_LABELS, STATUS_COLORS, type OrderStatus, type ServiceType } from "@/lib/orders";

interface AdminOrder {
  id: string;
  customer_id: string;
  service_type: ServiceType;
  status: OrderStatus;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  estimated_price: number | null;
  created_at: string;
}

interface RiderLoc {
  rider_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

type AppRole = "admin" | "rider" | "vendor" | "customer";
const ALL_ROLES: AppRole[] = ["admin", "rider", "vendor", "customer"];
const ROLE_BADGE: Record<AppRole, string> = {
  admin: "bg-primary/20 text-primary-glow border-primary/30",
  rider: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  vendor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  customer: "bg-muted text-muted-foreground border-border",
};

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}
interface RoleRow {
  id: string;
  user_id: string;
  role: AppRole;
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — HatodGo" },
      { name: "description", content: "Operations dashboard for HatodGo admins." },
    ],
  }),
  component: AdminPage,
});

const STATUSES: OrderStatus[] = ["pending", "accepted", "in_progress", "completed", "cancelled"];

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [roleSearch, setRoleSearch] = useState("");

  const [riderLocs, setRiderLocs] = useState<RiderLoc[]>([]);
  const [mapFilter, setMapFilter] = useState<OrderStatus | "all">("all");

  const refresh = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, customer_id, service_type, status, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, estimated_price, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders((data as AdminOrder[]) ?? []);

    // Live rider locations: latest per rider in the last 5 minutes.
    const sinceIso = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: locData } = await supabase
      .from("driver_locations")
      .select("rider_id, lat, lng, updated_at")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(200);
    const latestByRider = new Map<string, RiderLoc>();
    (locData as RiderLoc[] | null)?.forEach((row) => {
      if (!latestByRider.has(row.rider_id)) latestByRider.set(row.rider_id, row);
    });
    setRiderLocs(Array.from(latestByRider.values()));

    const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
    setUserCount(count ?? 0);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, phone, created_at")
      .order("created_at", { ascending: false });
    setProfiles((profileData as ProfileRow[]) ?? []);

    const { data: roleData } = await supabase.from("user_roles").select("id, user_id, role");
    setRoles((roleData as RoleRow[]) ?? []);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!isAdmin) return;
    refresh();
  }, [isAdmin, loading, user, navigate]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Order marked ${STATUS_LABELS[status]}`);
    setOrders((prev) => prev?.map((o) => (o.id === id ? { ...o, status } : o)) ?? null);
  };

  const addRole = async (userId: string, role: AppRole) => {
    if (roles?.some((r) => r.user_id === userId && r.role === role)) {
      toast.info("User already has this role.");
      return;
    }
    const { data, error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role })
      .select("id, user_id, role")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setRoles((prev) => [...(prev ?? []), data as RoleRow]);
    toast.success(`Granted ${role}`);
  };

  const removeRole = async (roleId: string, role: AppRole, userId: string) => {
    if (role === "admin" && userId === user?.id) {
      toast.error("You can't remove your own admin role.");
      return;
    }
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRoles((prev) => prev?.filter((r) => r.id !== roleId) ?? null);
    toast.success(`Removed ${role}`);
  };

  const rolesByUser = useMemo(() => {
    const map = new Map<string, RoleRow[]>();
    (roles ?? []).forEach((r) => {
      const list = map.get(r.user_id) ?? [];
      list.push(r);
      map.set(r.user_id, list);
    });
    return map;
  }, [roles]);

  const filteredProfiles = useMemo(() => {
    if (!profiles) return null;
    const q = roleSearch.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [profiles, roleSearch]);

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
          <p className="mt-2 text-sm text-muted-foreground">
            You don't have admin access. Ask the project owner to grant you the <code>admin</code> role.
          </p>
        </div>
      </PageShell>
    );
  }

  const stats = orders
    ? {
        total: orders.length,
        pending: orders.filter((o) => o.status === "pending").length,
        completed: orders.filter((o) => o.status === "completed").length,
      }
    : null;

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary-glow" />
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Admin Dashboard</h1>
        </div>
        <p className="mt-1 text-muted-foreground">Overview of HatodGo operations.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Users className="h-5 w-5" />} label="Users" value={userCount} />
          <StatCard icon={<PackageIcon className="h-5 w-5" />} label="Orders (latest 100)" value={stats?.total ?? null} />
          <StatCard icon={<Clock className="h-5 w-5" />} label="Pending" value={stats?.pending ?? null} accent />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={stats?.completed ?? null} />
        </div>

        {/* Live operations map */}
        <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <MapIcon className="h-6 w-6 text-primary-glow" />
            <h2 className="font-display text-xl font-bold">Live operations map</h2>
          </div>
          <Select value={mapFilter} onValueChange={(v) => setMapFilter(v as OrderStatus | "all")}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          className="mt-4 rounded-2xl border border-border/60 p-3"
          style={{ background: "var(--gradient-card)" }}
        >
          <MapClientOnly>
            <AdminLiveOrdersMap
              orders={(orders ?? []).map((o) => ({
                id: o.id,
                status: o.status,
                pickup: o.pickup_lat != null && o.pickup_lng != null ? { lat: o.pickup_lat, lng: o.pickup_lng } : null,
                dropoff: o.dropoff_lat != null && o.dropoff_lng != null ? { lat: o.dropoff_lat, lng: o.dropoff_lng } : null,
              }))}
              riders={riderLocs.map((r) => ({ id: r.rider_id, coords: { lat: r.lat, lng: r.lng } }))}
              statusFilter={mapFilter}
              height={460}
            />
          </MapClientOnly>
        </div>

        <h2 className="mt-12 font-display text-xl font-bold">Recent orders</h2>
        <div
          className="mt-4 overflow-hidden rounded-2xl border border-border/60"
          style={{ background: "var(--gradient-card)" }}
        >
          {orders === null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Pickup → Drop-off</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3 font-medium">{SERVICE_LABELS[o.service_type]}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="max-w-xs truncate">{o.pickup_address}</div>
                        <div className="max-w-xs truncate text-xs">→ {o.dropoff_address}</div>
                      </td>
                      <td className="px-4 py-3">{o.estimated_price ? `₱${Number(o.estimated_price).toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v as OrderStatus)}>
                          <SelectTrigger className={`h-8 w-36 border ${STATUS_COLORS[o.status]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserCog className="h-6 w-6 text-primary-glow" />
            <h2 className="font-display text-xl font-bold">User roles</h2>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="Search by name, phone, or ID"
              className="pl-9"
            />
          </div>
        </div>

        <div
          className="mt-4 overflow-hidden rounded-2xl border border-border/60"
          style={{ background: "var(--gradient-card)" }}
        >
          {filteredProfiles === null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProfiles.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Current roles</th>
                    <th className="px-4 py-3">Grant role</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((p) => {
                    const userRoles = rolesByUser.get(p.id) ?? [];
                    const heldRoles = new Set(userRoles.map((r) => r.role));
                    const grantable = ALL_ROLES.filter((r) => !heldRoles.has(r));
                    return (
                      <tr key={p.id} className="border-b border-border/40 align-top last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.full_name || "Unnamed"}</div>
                          <div className="text-xs text-muted-foreground">{p.phone || "No phone"}</div>
                          <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">{p.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          {userRoles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {userRoles.map((r) => (
                                <Badge
                                  key={r.id}
                                  variant="outline"
                                  className={`gap-1 border ${ROLE_BADGE[r.role]}`}
                                >
                                  {r.role}
                                  <button
                                    type="button"
                                    onClick={() => removeRole(r.id, r.role, p.id)}
                                    className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
                                    aria-label={`Remove ${r.role}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {grantable.length === 0 ? (
                            <span className="text-xs text-muted-foreground">All assigned</span>
                          ) : (
                            <Select onValueChange={(v) => addRole(p.id, v as AppRole)}>
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue placeholder="Add role" />
                              </SelectTrigger>
                              <SelectContent>
                                {grantable.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-border/60 p-5"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-2 font-display text-3xl font-bold ${accent ? "text-warning" : ""}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}
