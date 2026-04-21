import { useEffect, useRef, useState } from "react";
import { FlaskConical, Play, Square, UserPlus, FastForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  devAssignSelfAsRider,
  devPushLocation,
  devAdvanceStatus,
} from "@/server/devSimulator";
import type { OrderStatus } from "@/lib/orders";

interface Props {
  orderId: string;
  riderId: string | null;
  status: OrderStatus | string;
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
}

/**
 * Dev-only control surface to validate the live tracker end-to-end:
 *  1. Assign yourself as the rider (also flips status → accepted)
 *  2. Start a simulated drive that interpolates pickup → dropoff and
 *     pushes location pings, varying speed to exercise the variance/ETA
 *     adaptive refresh logic.
 *  3. Advance the order status manually.
 *
 * Only visible in DEV builds.
 */
export function DevSimulatorPanel({ orderId, riderId, status, pickup, dropoff }: Props) {
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const stepRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const isSelfRider = !!riderId;

  const assignRider = async () => {
    setBusy(true);
    try {
      await devAssignSelfAsRider({ data: { orderId } });
      toast.success("You're now the rider for this order");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign rider");
    } finally {
      setBusy(false);
    }
  };

  const advance = async (next: "accepted" | "in_progress" | "completed") => {
    setBusy(true);
    try {
      await devAdvanceStatus({ data: { orderId, status: next } });
      toast.success(`Status → ${next}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to advance");
    } finally {
      setBusy(false);
    }
  };

  const startDrive = () => {
    if (!pickup || !dropoff) {
      toast.error("Need both pickup and dropoff coordinates");
      return;
    }
    if (running) return;
    stepRef.current = 0;
    setRunning(true);
    const totalSteps = 30; // ~30 pings
    const tick = async () => {
      const t = Math.min(1, stepRef.current / totalSteps);
      // Interpolate pickup → dropoff
      const lat = pickup.lat + (dropoff.lat - pickup.lat) * t;
      const lng = pickup.lng + (dropoff.lng - pickup.lng) * t;
      // Vary speed: bursts of acceleration + slow turns to exercise variance
      const base = 8; // m/s ≈ 29 km/h
      const wobble = Math.sin(stepRef.current / 2) * 6 + Math.random() * 3;
      const speed = Math.max(0, base + wobble);
      try {
        await devPushLocation({ data: { orderId, lat, lng, speed } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Push failed");
        stopDrive();
        return;
      }
      stepRef.current += 1;
      if (stepRef.current > totalSteps) stopDrive();
    };
    void tick();
    timerRef.current = window.setInterval(tick, 3000);
  };

  const stopDrive = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  };

  return (
    <div className="rounded-xl border border-dashed border-warning/50 bg-warning/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-warning" />
        <p className="text-xs font-semibold uppercase tracking-wide text-warning">
          Dev simulator
        </p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Preview-only · not in production
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || isSelfRider}
          onClick={assignRider}
        >
          <UserPlus className="h-4 w-4" />
          {isSelfRider ? "Rider assigned" : "Assign me as rider"}
        </Button>

        {isSelfRider && status !== "in_progress" && status !== "completed" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => advance("in_progress")}>
            <FastForward className="h-4 w-4" /> Mark in-progress
          </Button>
        )}
        {isSelfRider && status !== "completed" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => advance("completed")}>
            <FastForward className="h-4 w-4" /> Mark completed
          </Button>
        )}

        {isSelfRider && (
          running ? (
            <Button size="sm" variant="destructive" onClick={stopDrive}>
              <Square className="h-4 w-4" /> Stop drive
            </Button>
          ) : (
            <Button size="sm" onClick={startDrive} disabled={!pickup || !dropoff}>
              <Play className="h-4 w-4" /> Start simulated drive
            </Button>
          )
        )}
      </div>

      {!isSelfRider && (
        <p className="mt-2 text-xs text-muted-foreground">
          Step 1: Assign yourself as rider. Step 2: Start a simulated drive to push live location
          pings every ~3s and validate the ETA, map, and timeline.
        </p>
      )}
    </div>
  );
}
