import { createFileRoute } from "@tanstack/react-router";
import { Bike } from "lucide-react";
import { ServiceLayout } from "@/components/ServiceLayout";
import { OrderForm } from "@/components/OrderForm";

export const Route = createFileRoute("/services/ride")({
  head: () => ({
    meta: [
      { title: "Book a ride — HatodPH" },
      { name: "description", content: "Book a habal-habal or motor ride within Balamban." },
    ],
  }),
  component: RidePage,
});

function RidePage() {
  return (
    <ServiceLayout
      icon={<Bike className="h-6 w-6" />}
      title="Book a ride"
      tagline="Habal-habal or motor — quick rides around town."
    >
      <OrderForm
        serviceType="ride"
        pickupLabel="Pickup point"
        pickupPlaceholder="Where are you now?"
        dropoffLabel="Destination"
        dropoffPlaceholder="Where to?"
        detailsLabel="Trip details"
        detailsPlaceholder="e.g. 1 passenger with small bag"
        submitLabel="Book ride"
      />
    </ServiceLayout>
  );
}
