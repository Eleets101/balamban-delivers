import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Users, Package as PackageIcon, ShieldCheck, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/PageShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SERVICE_LABELS, STATUS_LABELS, STATUS_COLORS, type OrderStatus, type ServiceType } from "@/lib/orders";

interface AdminOrder {
  id: string;
  customer_id: string;
  service_type: ServiceType;
  status: OrderStatus;
  pickup_address: string;
  dropoff_address: string;
  estimated_price: number | null;
  created_at: string;
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — HatodPH" },
      { name: "description", content: "Operations dashboard for HatodPH admins." },
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

  const refresh = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, customer_id, service_type, status, pickup_address, dropoff_address, estimated_price, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders((data as AdminOrder[]) ?? []);

    const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
    setUserCount(count ?? 0);
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
        <p className="mt-1 text-muted-foreground">Overview of HatodPH operations.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Users className="h-5 w-5" />} label="Users" value={userCount} />
          <StatCard icon={<PackageIcon className="h-5 w-5" />} label="Orders (latest 100)" value={stats?.total ?? null} />
          <StatCard icon={<Clock className="h-5 w-5" />} label="Pending" value={stats?.pending ?? null} accent />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={stats?.completed ?? null} />
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
