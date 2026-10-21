import { createMiddleware, createStart } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Attach the signed-in user's access token to every server function call so
 * functions using requireSupabaseAuth can verify the caller.
 */
const attachSupabaseBearer = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseBearer],
}));
