import { resolveAgentPolicyBootstrap } from "./defaults";
import type { BreakGlassGrant } from "./types";

export type BreakGlassRequest = {
  organizationId: string | null;
  policyKey: string;
  reason: string;
  expiresAt: string;
  createdBy: string;
  now?: Date;
};

export type BreakGlassResult =
  | { ok: true; grant: BreakGlassGrant }
  | { ok: false; error: string };

/**
 * super_admin break-glass for high-risk policy keys.
 * Requires typed reason, explicit expiration, and audit by caller.
 */
export function createBreakGlassGrant(
  request: BreakGlassRequest,
  options?: { env?: NodeJS.ProcessEnv; isSuperAdmin?: boolean }
): BreakGlassResult {
  if (!options?.isSuperAdmin) {
    return { ok: false, error: "Break-glass requires super_admin." };
  }

  const reason = request.reason.trim();
  if (reason.length < 20) {
    return {
      ok: false,
      error: "Break-glass reason must be at least 20 characters."
    };
  }

  const now = request.now ?? new Date();
  const expires = new Date(request.expiresAt);
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= now.getTime()) {
    return { ok: false, error: "Break-glass expiration must be in the future." };
  }

  const maxHours = resolveAgentPolicyBootstrap(options.env).breakGlassMaxHours;
  const maxMs = maxHours * 60 * 60 * 1000;
  if (expires.getTime() - now.getTime() > maxMs) {
    return {
      ok: false,
      error: `Break-glass expiration cannot exceed ${maxHours} hours.`
    };
  }

  return {
    ok: true,
    grant: {
      id: `bg_${Math.random().toString(36).slice(2, 10)}`,
      organization_id: request.organizationId,
      policy_key: request.policyKey,
      reason,
      expires_at: expires.toISOString(),
      created_by: request.createdBy,
      created_at: now.toISOString(),
      expired_at: null
    }
  };
}

export function isBreakGlassActive(
  grant: BreakGlassGrant | null | undefined,
  now: Date = new Date()
): boolean {
  if (!grant || grant.expired_at) {
    return false;
  }
  return new Date(grant.expires_at).getTime() > now.getTime();
}

export function expireBreakGlassGrant(
  grant: BreakGlassGrant,
  now: Date = new Date()
): BreakGlassGrant {
  return {
    ...grant,
    expired_at: now.toISOString()
  };
}

export function collectActiveBreakGlassKeys(
  grants: BreakGlassGrant[],
  now: Date = new Date()
): Set<string> {
  const keys = new Set<string>();
  for (const grant of grants) {
    if (isBreakGlassActive(grant, now)) {
      keys.add(grant.policy_key);
    }
  }
  return keys;
}
