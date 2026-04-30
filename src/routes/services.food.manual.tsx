import { createFileRoute } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { ServiceLayout } from "@/components/ServiceLayout";
import { OrderForm } from "@/components/OrderForm";

export const Route = createFileRoute("/services/food/manual")({
  head: () => ({
    meta: [
      { title: "Manual food request — HatodGo" },
      {
        name: "description",
        content: "Can't find your restaurant? Send a manual food request and a HatodGo rider will pick it up.",
      },
    ],
  }),
  component: ManualFoodPage,
});

function ManualFoodPage() {
  return (
    <ServiceLayout
      icon={<PenLine className="h-6 w-6" />}
      title="Manual food request"
      tagline="Tell us which restaurant to pick up from and what to order."
    >
      <OrderForm
        serviceType="food"
        pickupLabel="Restaurant / carenderia (eatery)"
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
