import { createFileRoute } from "@tanstack/react-router";
import { UtensilsCrossed } from "lucide-react";
import { ServiceLayout } from "@/components/ServiceLayout";
import { OrderForm } from "@/components/OrderForm";

export const Route = createFileRoute("/services/food")({
  head: () => ({
    meta: [
      { title: "Order food — HatodPH" },
      { name: "description", content: "Order from local restaurants and carenderia in Balamban." },
    ],
  }),
  component: FoodPage,
});

function FoodPage() {
  return (
    <ServiceLayout
      icon={<UtensilsCrossed className="h-6 w-6" />}
      title="Order food"
      tagline="Tell us where to pick up and what to order."
    >
      <OrderForm
        serviceType="food"
        pickupLabel="Restaurant / carenderia"
        pickupPlaceholder="e.g. Jollibee Balamban"
        dropoffLabel="Deliver to"
        dropoffPlaceholder="Your address"
        detailsLabel="What would you like to order?"
        detailsPlaceholder="e.g. 1x Chickenjoy w/ rice, 1x Coke float"
        showEstimatedPrice
        submitLabel="Place food order"
      />
    </ServiceLayout>
  );
}
