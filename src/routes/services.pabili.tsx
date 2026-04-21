import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { ServiceLayout } from "@/components/ServiceLayout";
import { OrderForm } from "@/components/OrderForm";

export const Route = createFileRoute("/services/pabili")({
  head: () => ({
    meta: [
      { title: "Pabili (Buy for me) — HatodPH" },
      { name: "description", content: "Pabili (buy for me) — need something from the store? Our riders will buy it for you." },
    ],
  }),
  component: PabiliPage,
});

function PabiliPage() {
  return (
    <ServiceLayout
      icon={<ShoppingBasket className="h-6 w-6" />}
      title="Pabili (Buy for me)"
      tagline="Tell our rider what to buy and where to bring it."
    >
      <OrderForm
        serviceType="pabili"
        pickupLabel="Where to buy"
        pickupPlaceholder="e.g. Gaisano Balamban"
        dropoffLabel="Deliver to"
        dropoffPlaceholder="Your address"
        detailsLabel="Pabili (shopping) list"
        detailsPlaceholder="e.g. 1kg sugar, 1 dozen eggs, Surf detergent 70g x2"
        showEstimatedPrice
        submitLabel="Place pabili (buy for me) order"
      />
    </ServiceLayout>
  );
}
