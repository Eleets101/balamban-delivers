import { lazy } from "react";

// Lazy import keeps Leaflet out of the SSR bundle. Combined with
// <MapClientOnly>, this component only loads in the browser.
export const MapPicker = lazy(() =>
  import("./MapPicker.client").then((m) => ({ default: m.MapPicker })),
);
