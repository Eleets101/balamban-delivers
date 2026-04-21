import { Link } from "@tanstack/react-router";
import { UtensilsCrossed, Package, ShoppingBasket, Bike, Home, ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const tabs = [
  { to: "/" as const, label: "Home", icon: Home },
  { to: "/services/food" as const, label: "Food", icon: UtensilsCrossed },
  { to: "/services/padala" as const, label: "Padala", icon: Package },
  { to: "/services/pabili" as const, label: "Pabili", icon: ShoppingBasket },
  { to: "/services/ride" as const, label: "Ride", icon: Bike },
];

export function MobileTabBar() {
  const { isAuthenticated } = useAuth();
  const items = isAuthenticated
    ? [...tabs, { to: "/orders" as const, label: "Orders", icon: ClipboardList }]
    : tabs;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-xl items-center justify-around px-1 py-1.5">
        {items.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              activeOptions={{ exact: t.to === "/" }}
              className="flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors"
              activeProps={{ className: "text-primary-glow" }}
            >
              <t.icon className="h-5 w-5" />
              <span>{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
