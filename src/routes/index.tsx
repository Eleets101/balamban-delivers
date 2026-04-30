import { createFileRoute, Link } from "@tanstack/react-router";
import { UtensilsCrossed, Package, ShoppingBasket, Bike, ArrowRight, MapPin, Clock, ShieldCheck, Truck, Store, Zap, Wallet } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HatodGo — Hatod (Deliver), Padala (Send), Sakay (Ride) sa Balamban" },
      { name: "description", content: "Order food, send packages (padala), request errands (pabili) or book a ride (sakay). One app for Balamban, Toledo and Asturias." },
      { property: "og:title", content: "HatodGo — Your everyday hatod (delivery) app" },
      { property: "og:description", content: "Food delivery, padala (send), pabili (buy for me) and ride (sakay) booking for Cebu's west coast." },
    ],
  }),
  component: HomePage,
});

const services = [
  {
    to: "/services/food" as const,
    icon: UtensilsCrossed,
    title: "Food Delivery",
    description: "Order from your favorite local restaurants and carenderia.",
  },
  {
    to: "/services/padala" as const,
    icon: Package,
    title: "Padala (Send)",
    description: "Send documents or items across town — same-day pickup & drop-off.",
  },
  {
    to: "/services/pabili" as const,
    icon: ShoppingBasket,
    title: "Pabili (Buy for me)",
    description: "Need something from the store? Our riders will buy it for you.",
  },
  {
    to: "/services/ride" as const,
    icon: Bike,
    title: "Sakay (Ride Booking)",
    description: "Book a habal-habal (motorcycle taxi) or motor ride within town in minutes.",
  },
];

function HomePage() {
  return (
    <PageShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.55 0.24 295 / 0.35), transparent 70%)" }}
        />
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center sm:pt-28 sm:pb-24">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary-glow"
          >
            <MapPin className="h-3.5 w-3.5" /> Now serving Balamban · Toledo · Asturias
          </span>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            Balamban's{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              All-in-One
            </span>
            <br />
            Delivery App
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Food • Padala • Pabili • Ride
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="h-12 px-8 text-base shadow-[var(--shadow-glow)]">
              <Link to="/services/food">Order Now <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
              <Link to="/auth">Create an account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary-glow" /> Trusted by Locals
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
          {[
            { icon: Truck, stat: "100+", label: "Deliveries Completed" },
            { icon: Store, stat: "20+", label: "Partner Stores" },
            { icon: Zap, stat: "Fast", label: "Local Riders" },
            { icon: Wallet, stat: "COD", label: "Cash on Delivery" },
          ].map((t) => (
            <div
              key={t.label}
              className="rounded-2xl border border-border/50 p-4 text-center sm:p-5"
              style={{ background: "var(--gradient-card)" }}
            >
              <t.icon className="mx-auto h-5 w-5 text-primary-glow" />
              <div className="mt-2 font-display text-2xl font-bold sm:text-3xl">{t.stat}</div>
              <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{t.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Pick a service</h2>
          <p className="mt-2 text-muted-foreground">Four services, one rider network.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group relative overflow-hidden rounded-2xl border border-border/60 p-6 transition-all hover:border-primary/50 hover:-translate-y-1"
              style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
            >
              <div
                className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-60"
                style={{ background: "var(--gradient-primary)" }}
              />
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <s.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-glow">
                Get started <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: Clock, title: "Fast & local", text: "Riders right here in town — no waiting from Cebu City." },
            { icon: ShieldCheck, title: "Secure & trusted", text: "Verified riders, transparent prices, cash on delivery." },
            { icon: MapPin, title: "Built for Balamban", text: "Made for our roads, our people, our community." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/50 p-6"
              style={{ background: "var(--gradient-card)" }}
            >
              <f.icon className="h-6 w-6 text-primary-glow" />
              <h3 className="mt-3 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
