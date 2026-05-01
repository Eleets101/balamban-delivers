import { createFileRoute, Link } from "@tanstack/react-router";
import { LifeBuoy, Mail, MapPin, MessageSquareWarning } from "lucide-react";
import { PageShell } from "@/components/PageShell";

const SUPPORT_EMAIL = "support@hatodgo.net";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — HatodGo" },
      {
        name: "description",
        content:
          "Contact HatodGo support for delivery, padala, pabili, ride, account, and payment concerns.",
      },
      { property: "og:title", content: "Support — HatodGo" },
      {
        property: "og:description",
        content:
          "Get help with HatodGo orders, rides, payments, and account questions.",
      },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <PageShell>
      <article className="mx-auto max-w-3xl px-6 py-12 text-foreground">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-glow">
            <LifeBuoy className="h-3.5 w-3.5" /> HatodGo Support
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight">Need help with a delivery, errand, or ride?</h1>
          <p className="mt-3 text-muted-foreground">
            Reach out if you need help with orders, rider coordination, payments, account access, or service-area questions.
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2">
          <section className="rounded-2xl border border-border/60 p-6" style={{ background: "var(--gradient-card)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mail className="h-4 w-4 text-primary-glow" /> Contact
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Email us for support requests, refund concerns, and order follow-up.
            </p>
            <a className="mt-4 inline-block text-sm font-medium text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </section>

          <section className="rounded-2xl border border-border/60 p-6" style={{ background: "var(--gradient-card)" }}>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary-glow" /> Service Area
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              HatodGo currently serves Balamban, Toledo, and Asturias in Cebu.
            </p>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-border/60 p-6" style={{ background: "var(--gradient-card)" }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquareWarning className="h-4 w-4 text-primary-glow" /> Include these details in your message
          </div>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Your name and phone number</li>
            <li>Order number or rider details if available</li>
            <li>Date and time of the issue</li>
            <li>A short description of what went wrong</li>
          </ul>
        </section>

        <p className="pt-8 text-sm text-muted-foreground">
          Looking for privacy details? <Link to="/privacy" className="text-primary underline">Read our Privacy Policy</Link>.
        </p>
      </article>
    </PageShell>
  );
}
