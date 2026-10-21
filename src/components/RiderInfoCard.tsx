import { useEffect, useState } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { getOrderContacts } from "@/lib/orderApi";
import { Button } from "@/components/ui/button";

interface RiderInfoCardProps {
  orderId: string;
  riderId: string;
}

interface RiderProfile {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export function RiderInfoCard({ orderId, riderId }: RiderInfoCardProps) {
  const [rider, setRider] = useState<RiderProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRider(null);
    // Contact details come from a guarded lookup that only answers the
    // order's customer, its assigned rider, or an admin.
    getOrderContacts(orderId)
      .then((c) => {
        if (!cancelled && c) setRider({ full_name: c.rider_name, phone: c.rider_phone, avatar_url: c.rider_avatar_url });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orderId, riderId]);

  const name = rider?.full_name?.split(" ")[0] || "Your rider";
  const phone = rider?.phone;

  const initials = (rider?.full_name || "R")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-4"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center gap-3">
        {rider?.avatar_url ? (
          <img
            src={rider.avatar_url}
            alt={name}
            className="h-12 w-12 rounded-full border border-border/60 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-primary/15 font-display text-base font-semibold text-primary-glow">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display text-base font-semibold leading-tight">{name}</p>
          {phone && <p className="mt-0.5 text-xs text-muted-foreground">{phone}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          asChild={!!phone}
          disabled={!phone}
        >
          {phone ? (
            <a href={`tel:${phone}`}>
              <Phone className="h-4 w-4" /> Call
            </a>
          ) : (
            <span>
              <Phone className="h-4 w-4" /> Call
            </span>
          )}
        </Button>
        <Button
          size="sm"
          asChild={!!phone}
          disabled={!phone}
        >
          {phone ? (
            <a href={`sms:${phone}`}>
              <MessageCircle className="h-4 w-4" /> Chat
            </a>
          ) : (
            <span>
              <MessageCircle className="h-4 w-4" /> Chat
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
