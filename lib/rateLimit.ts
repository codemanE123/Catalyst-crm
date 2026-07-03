import type { SupabaseClient } from "@supabase/supabase-js";

export const RATE_LIMIT_ACTIONS = {
  interviewNote: "interview_note",
  universityResearch: "university_research"
} as const;

export const RATE_LIMITS = {
  interviewNote: {
    limit: 10,
    windowSeconds: 15 * 60
  },
  universityResearch: {
    limit: 3,
    windowSeconds: 15 * 60
  }
} as const;

type RateLimitConfig = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; error: string };

function getWindowStart(windowSeconds: number) {
  return new Date(Date.now() - windowSeconds * 1000).toISOString();
}

export async function enforceRateLimit(
  supabase: SupabaseClient,
  userId: string,
  actionKey: string,
  config: RateLimitConfig,
  exceededMessage: string
): Promise<RateLimitResult> {
  const windowStart = getWindowStart(config.windowSeconds);
  const { count, error: countError } = await supabase
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_key", actionKey)
    .gte("created_at", windowStart);

  if (countError) {
    return { allowed: false, error: "Could not verify rate limit. Please try again." };
  }

  if ((count ?? 0) >= config.limit) {
    return { allowed: false, error: exceededMessage };
  }

  const { error: insertError } = await supabase.from("rate_limit_events").insert({
    user_id: userId,
    action_key: actionKey
  });

  if (insertError) {
    return { allowed: false, error: "Could not verify rate limit. Please try again." };
  }

  return { allowed: true };
}
