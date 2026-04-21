import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { ServiceLayout } from "@/components/ServiceLayout";
import { OrderForm } from "@/components/OrderForm";

export const Route = createFileRoute("/services/padala")({
  head: () => ({
    meta: [
      { title: "Padala — Pickup & Drop-off — HatodPH" },
      { name: "description", content: "Send documents or items across Balamban — same-day pickup and drop-off." },
    ],
  }),
  component: PadalaPage,
});

function PadalaPage() {
  return (
    <ServiceLayout
      icon={<Package className="h-6 w-6" />}
      title="Padala"
      tagline="Pickup and drop-off — anywhere in town."
    >
      <OrderForm
        serviceType="padali"
        pickupLabel="Pickup address"
        pickupPlaceholder="Where should we pick it up?"
        dropoffLabel="Drop-off address"
        dropoffPlaceholder="Where should we deliver it?"
        detailsLabel="What are we picking up?"
        detailsPlaceholder="e.g. Documents in long brown envelope, weight ~1kg"
        submitLabel="Book padala"
      />
    </ServiceLayout>
  );
}
