import { lazy, type ComponentType, type ComponentProps } from "react";
import type { AdminLiveOrdersMap as Impl } from "./AdminLiveOrdersMapImpl";

export const AdminLiveOrdersMap = lazy(() =>
  import("./AdminLiveOrdersMapImpl").then((m) => ({ default: m.AdminLiveOrdersMap })),
) as ComponentType<ComponentProps<typeof Impl>>;
