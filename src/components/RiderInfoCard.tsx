import { useEffect, useState } from "react";
import { Phone, MessageCircle, Star, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface RiderInfoCardProps {
  riderId: string;
}

interface RiderProfile {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export function RiderInfoCard({ riderId }: RiderInfoCardProps) {
  const [rider, setRider] = useState<RiderProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, phone, avatar_url")
      .eq("id", riderId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setRider(data as RiderProfile);
      });
    return () => {
      cancelled = true;
    };
  }, [riderId]);

  const name = rider?.full_name?.split(" ")[0] || "Your rider";
  const phone = rider?.phone;
  // Placeholder vehicle / rating until the rider profile schema captures these fields.
  const vehicle = "Honda Click";
  const rating = "4.9";

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
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Bike className="h-3.5 w-3.5" /> {vehicle}
            </span>
            <span aria-hidden>•</span>
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-warning text-warning" /> {rating}
            </span>
          </p>
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
