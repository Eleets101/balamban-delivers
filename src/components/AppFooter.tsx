import { Link } from "@tanstack/react-router";

export function AppFooter() {
  return (
    <footer className="mt-24 border-t border-border/50 bg-background/40">
      <div className="mx-auto max-w-7xl px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p>© {new Date().getFullYear()} HatodGo — Balamban · Toledo · Asturias</p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <span>Built with ♥ for Cebu's west coast.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
