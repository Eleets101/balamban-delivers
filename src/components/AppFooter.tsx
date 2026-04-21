export function AppFooter() {
  return (
    <footer className="mt-24 border-t border-border/50 bg-background/40">
      <div className="mx-auto max-w-7xl px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p>© {new Date().getFullYear()} HatodPH — Balamban · Toledo · Asturias</p>
          <p className="text-xs">Built with ♥ for Cebu's west coast.</p>
        </div>
      </div>
    </footer>
  );
}
