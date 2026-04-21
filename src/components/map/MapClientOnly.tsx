import { Suspense, useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only on the client. Leaflet touches `window` and must
 * never run during SSR. Includes Suspense boundary for lazy-loaded children.
 */
export function MapClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const placeholder =
    fallback ?? <div className="h-[260px] animate-pulse rounded-xl border border-border/60 bg-muted/30" />;
  if (!mounted) return <>{placeholder}</>;
  return <Suspense fallback={placeholder}>{children}</Suspense>;
}
