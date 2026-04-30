import { lazy, type ComponentType, type ComponentProps } from "react";
import type { ServiceAreaMap as Impl } from "./ServiceAreaMapImpl";

export const ServiceAreaMap = lazy(() =>
  import("./ServiceAreaMapImpl").then((m) => ({ default: m.ServiceAreaMap })),
) as ComponentType<ComponentProps<typeof Impl>>;
