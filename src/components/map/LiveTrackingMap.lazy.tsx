import { lazy } from "react";

export const LiveTrackingMap = lazy(() =>
  import("./LiveTrackingMap.client").then((m) => ({ default: m.LiveTrackingMap })),
);
