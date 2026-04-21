import { lazy, type ComponentType } from "react";
import type { ComponentProps } from "react";
import type { MapPicker as MapPickerImpl } from "./MapPickerImpl";

// Lazy import keeps Leaflet out of the SSR bundle. Combined with
// <MapClientOnly>, this component only loads in the browser.
export const MapPicker = lazy(() =>
  import("./MapPickerImpl").then((m) => ({ default: m.MapPicker })),
) as ComponentType<ComponentProps<typeof MapPickerImpl>>;
