import { lazy, type ComponentType } from "react";
import type { ComponentProps } from "react";
import type { LiveTrackingMap as LiveTrackingMapImpl } from "./LiveTrackingMapImpl";

export const LiveTrackingMap = lazy(() =>
  import("./LiveTrackingMapImpl").then((m) => ({ default: m.LiveTrackingMap })),
) as ComponentType<ComponentProps<typeof LiveTrackingMapImpl>>;
