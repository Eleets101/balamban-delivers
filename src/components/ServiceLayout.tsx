import { type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PageShell } from "./PageShell";

interface ServiceLayoutProps {
  icon: ReactNode;
  title: string;
  tagline: string;
  children: ReactNode;
}

export function ServiceLayout({ icon, title, tagline, children }: ServiceLayoutProps) {
  const { loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Sign in to continue</h1>
          <p className="mt-2 text-muted-foreground">
            You need an account to place an order on HatodGo.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild>
              <Link to="/auth">Sign in / Sign up</Link>
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back home
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mt-6 flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            {icon}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{tagline}</p>
          </div>
        </div>
        <div
          className="mt-8 rounded-2xl border border-border/60 p-6 sm:p-8"
          style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-card)" }}
        >
          {children}
        </div>
      </div>
    </PageShell>
  );
}
