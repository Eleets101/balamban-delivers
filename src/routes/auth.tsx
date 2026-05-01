import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or sign up — HatodGo" },
      { name: "description", content: "Create your HatodGo account to start ordering food, padala, pabili or rides." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate({ to: "/orders" });
    }
  }, [isAuthenticated, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back!");
    navigate({ to: "/orders" });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/orders`,
        data: {
          full_name: String(fd.get("full_name")),
          phone: String(fd.get("phone")),
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome to HatodGo!");
    navigate({ to: "/orders" });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link to="/" className="mb-8 flex items-center gap-2">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl font-display text-lg font-bold text-primary-foreground"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          H
        </div>
        <span className="font-display text-xl font-bold">HatodGo</span>
      </Link>

      <div
        className="w-full max-w-md rounded-2xl border border-border/60 p-6 sm:p-8"
        style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
      >
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-6">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <Label htmlFor="si-email">Email</Label>
                <Input id="si-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div>
                <Label htmlFor="si-pw">Password</Label>
                <Input id="si-pw" name="password" type="password" required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-6">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <Label htmlFor="su-name">Full name</Label>
                <Input id="su-name" name="full_name" required />
              </div>
              <div>
                <Label htmlFor="su-phone">Phone</Label>
                <Input id="su-phone" name="phone" type="tel" placeholder="09xx xxx xxxx" required />
              </div>
              <div>
                <Label htmlFor="su-email">Email</Label>
                <Input id="su-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div>
                <Label htmlFor="su-pw">Password</Label>
                <Input id="su-pw" name="password" type="password" required minLength={6} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="mt-6 space-y-3 text-center text-xs text-muted-foreground">
          <p>By continuing you agree to HatodGo's terms of service and privacy policy.</p>
          <p>
            Need help signing in or placing an order?{" "}
            <Link to="/support" className="text-primary underline">
              Contact support
            </Link>
            .
          </p>
          <p>Serving Balamban, Toledo, and Asturias.</p>
        </div>
      </div>
    </div>
  );
}
