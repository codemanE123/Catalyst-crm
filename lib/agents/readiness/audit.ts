import type { AuditMetadata } from "@/lib/auditLog";

const DISALLOWED = new Set([
  "api_key",
  "secret",
  "token",
  "password",
  "authorization",
  "cookie",
  "system_prompt",
  "user_prompt",
  "raw_prompt",
  "private_notes"
]);

export function sanitizeReadinessAuditMetadata(
  metadata: Record<string, unknown> | null | undefined
): AuditMetadata {
  if (!metadata) {
    return {};
  }
  const out: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    if (
      DISALLOWED.has(lower) ||
      lower.includes("api_key") ||
      lower.includes("secret") ||
      lower.includes("prompt_text")
    ) {
      continue;
    }
    if (value == null) {
      out[key] = null;
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] =
        typeof value === "string" && value.length > 500
          ? `${value.slice(0, 500)}…`
          : value;
    } else if (Array.isArray(value)) {
      out[key] = value
        .filter((item) => typeof item === "string")
        .slice(0, 40)
        .join(",");
    }
  }
  return out;
}

export const AGENT_READINESS_AUDIT_ACTIONS = {
  evaluate: "agent_readiness.evaluate",
  create: "agent_readiness.create",
  submit: "agent_readiness.submit",
  approve: "agent_readiness.approve",
  reject: "agent_readiness.reject",
  revoke: "agent_readiness.revoke",
  expire: "agent_readiness.expire",
  renew: "agent_readiness.renew",
  executionDenied: "agent_readiness.execution_denied"
} as const;
