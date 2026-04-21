import type { Database } from "@/integrations/supabase/types";

export type ServiceType = Database["public"]["Enums"]["service_type"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  food: "Food Delivery",
  padali: "Padala",
  pabili: "Pabili",
  ride: "Ride Booking",
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-warning/20 text-warning border-warning/40",
  accepted: "bg-primary/20 text-primary-glow border-primary/40",
  in_progress: "bg-accent/20 text-accent-foreground border-accent/40",
  completed: "bg-success/20 text-success border-success/40",
  cancelled: "bg-destructive/20 text-destructive border-destructive/40",
};
