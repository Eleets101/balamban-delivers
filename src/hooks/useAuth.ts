import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "rider" | "vendor" | "customer";

export interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    roles: [],
    loading: true,
    rolesLoading: true,
  });

  useEffect(() => {
    let mounted = true;

    const fetchRoles = async (userId: string): Promise<AppRole[]> => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      return (data?.map((r) => r.role as AppRole)) ?? [];
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState((s) => ({
        ...s,
        user: session?.user ?? null,
        session,
        loading: false,
        rolesLoading: !!session?.user,
      }));
      if (session?.user) {
        // Defer role fetch to avoid recursion warnings
        setTimeout(async () => {
          const roles = await fetchRoles(session.user.id);
          if (mounted) setState((s) => ({ ...s, roles, rolesLoading: false }));
        }, 0);
      } else {
        setState((s) => ({ ...s, roles: [], rolesLoading: false }));
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const roles = session?.user ? await fetchRoles(session.user.id) : [];
      setState({ user: session?.user ?? null, session, roles, loading: false, rolesLoading: false });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    ...state,
    isAuthenticated: !!state.user,
    isAdmin: state.roles.includes("admin"),
    isRider: state.roles.includes("rider"),
    signOut: () => supabase.auth.signOut(),
  };
}
