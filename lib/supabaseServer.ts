import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const SUPABASE_CONFIGURATION_ERROR =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Sample data is only available when NODE_ENV is development.";

export function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === "development";
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

function assertSupabaseConfiguredForRuntime(): void {
  if (!isDevelopmentEnvironment()) {
    throw new Error(SUPABASE_CONFIGURATION_ERROR);
  }
}

export async function getServerSupabaseClient(): Promise<SupabaseClient | null> {
  const env = getSupabaseEnv();

  if (!env) {
    assertSupabaseConfiguredForRuntime();
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; middleware will refresh sessions later.
        }
      }
    }
  });
}

export async function requireUser(): Promise<User | null> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}
