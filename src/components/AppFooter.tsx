import { Link } from "@tanstack/react-router";

const SUPPORT_EMAIL = "support@hatodgo.net";

export function AppFooter() {
  return (
    <footer className="mt-24 border-t border-border/50 bg-background/40">
      <div className="mx-auto max-w-7xl px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-center sm:text-left">
            <p>© {new Date().getFullYear()} HatodGo — Balamban · Toledo · Asturias</p>
            <p className="text-xs">
              Local delivery, padala, pabili, and rides across Cebu's west coast.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:justify-end">
            <Link to="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/support" className="transition-colors hover:text-foreground">
              Support
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-foreground">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
