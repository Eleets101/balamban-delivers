import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Package, ShieldCheck, LogOut, LogIn, Bike } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AppHeader() {
  const { isAuthenticated, isAdmin, isRider, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/services/food" as const, label: "Food (Pagkain)" },
    { to: "/services/padala" as const, label: "Padala (Send)" },
    { to: "/services/pabili" as const, label: "Pabili (Buy)" },
    { to: "/services/ride" as const, label: "Ride (Sakay)" },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl font-display text-lg font-bold text-primary-foreground"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            H
          </div>
          <span className="font-display text-lg font-bold tracking-tight">HatodGo</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/orders">
                  <Package className="h-4 w-4" /> My Orders
                </Link>
              </Button>
              {(isRider || isAdmin) && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/driver">
                    <Bike className="h-4 w-4" /> Driver
                  </Link>
                </Button>
              )}
              {isAdmin && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin">
                    <ShieldCheck className="h-4 w-4" /> Admin
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link to="/auth">
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            </Button>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-sm font-medium hover:bg-secondary"
                >
                  {l.label}
                </Link>
              ))}
              <div className="my-3 h-px bg-border" />
              {isAuthenticated ? (
                <>
                  <Link to="/orders" onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-sm font-medium hover:bg-secondary">
                    My Orders
                  </Link>
                  {(isRider || isAdmin) && (
                    <Link to="/driver" onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-sm font-medium hover:bg-secondary">
                      Driver Dashboard
                    </Link>
                  )}
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-sm font-medium hover:bg-secondary">
                      Admin Dashboard
                    </Link>
                  )}
                  <Button variant="outline" className="mt-2" onClick={() => { setOpen(false); handleSignOut(); }}>
                    Sign out
                  </Button>
                </>
              ) : (
                <Button asChild className="mt-2">
                  <Link to="/auth" onClick={() => setOpen(false)}>Sign in</Link>
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
