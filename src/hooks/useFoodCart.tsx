import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

export interface CartLine {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  image_url?: string | null;
}

export interface CartRestaurantSnapshot {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  base_delivery_fee: number;
  per_km_fee: number;
  free_distance_km: number;
  estimated_minutes: number;
}

interface CartState {
  restaurant: CartRestaurantSnapshot | null;
  lines: CartLine[];
}

interface FoodCartContextValue extends CartState {
  itemsCount: number;
  itemsSubtotal: number;
  addItem: (
    restaurant: CartRestaurantSnapshot,
    item: Omit<CartLine, "quantity"> & { quantity?: number },
  ) => void;
  updateQty: (menu_item_id: string, qty: number) => void;
  updateNotes: (menu_item_id: string, notes: string) => void;
  removeItem: (menu_item_id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "hatodgo:food-cart:v1";

const FoodCartContext = createContext<FoodCartContextValue | null>(null);

export function FoodCartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({ restaurant: null, lines: [] });

  // hydrate from localStorage (client only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const addItem: FoodCartContextValue["addItem"] = useCallback((restaurant, item) => {
    setState((prev) => {
      const qty = item.quantity ?? 1;
      // single-restaurant cart: switching clears
      if (prev.restaurant && prev.restaurant.id !== restaurant.id) {
        toast.info(`Cart cleared — switched to ${restaurant.name}`);
        return {
          restaurant,
          lines: [{ ...item, quantity: qty }],
        };
      }
      const existing = prev.lines.find((l) => l.menu_item_id === item.menu_item_id);
      if (existing) {
        return {
          restaurant,
          lines: prev.lines.map((l) =>
            l.menu_item_id === item.menu_item_id ? { ...l, quantity: l.quantity + qty } : l,
          ),
        };
      }
      return { restaurant, lines: [...prev.lines, { ...item, quantity: qty }] };
    });
  }, []);

  const updateQty: FoodCartContextValue["updateQty"] = useCallback((id, qty) => {
    setState((prev) => {
      if (qty <= 0) {
        const lines = prev.lines.filter((l) => l.menu_item_id !== id);
        return { restaurant: lines.length === 0 ? null : prev.restaurant, lines };
      }
      return {
        ...prev,
        lines: prev.lines.map((l) => (l.menu_item_id === id ? { ...l, quantity: qty } : l)),
      };
    });
  }, []);

  const updateNotes: FoodCartContextValue["updateNotes"] = useCallback((id, notes) => {
    setState((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.menu_item_id === id ? { ...l, notes } : l)),
    }));
  }, []);

  const removeItem: FoodCartContextValue["removeItem"] = useCallback((id) => {
    setState((prev) => {
      const lines = prev.lines.filter((l) => l.menu_item_id !== id);
      return { restaurant: lines.length === 0 ? null : prev.restaurant, lines };
    });
  }, []);

  const clear = useCallback(() => setState({ restaurant: null, lines: [] }), []);

  const itemsCount = useMemo(
    () => state.lines.reduce((acc, l) => acc + l.quantity, 0),
    [state.lines],
  );
  const itemsSubtotal = useMemo(
    () => state.lines.reduce((acc, l) => acc + l.price * l.quantity, 0),
    [state.lines],
  );

  const value: FoodCartContextValue = {
    ...state,
    itemsCount,
    itemsSubtotal,
    addItem,
    updateQty,
    updateNotes,
    removeItem,
    clear,
  };

  return <FoodCartContext.Provider value={value}>{children}</FoodCartContext.Provider>;
}

export function useFoodCart() {
  const ctx = useContext(FoodCartContext);
  if (!ctx) throw new Error("useFoodCart must be used inside FoodCartProvider");
  return ctx;
}
