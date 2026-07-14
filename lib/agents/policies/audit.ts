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

export function sanitizePolicyAuditMetadata(
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
      lower.includes("prompt")
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
        .slice(0, 30)
        .join(",");
    }
  }
  return out;
}

export const AGENT_POLICY_AUDIT_ACTIONS = {
  create: "agent_policy.create",
  update: "agent_policy.update",
  validate: "agent_policy.validate",
  activate: "agent_policy.activate",
  deprecate: "agent_policy.deprecate",
  archive: "agent_policy.archive",
  rollback: "agent_policy.rollback",
  breakGlassEnable: "agent_policy.break_glass_enable",
  breakGlassExpire: "agent_policy.break_glass_expire"
} as const;
