import type { AuditMetadata } from "@/lib/auditLog";

const DISALLOWED_AUDIT_KEYS = new Set([
  "system_prompt",
  "user_prompt",
  "user_prompt_template",
  "rendered_prompt",
  "raw_prompt",
  "messages",
  "api_key",
  "authorization",
  "cookie",
  "private_notes",
  "secret"
]);

/**
 * Sanitize prompt/rollout audit metadata: never log rendered prompts or secrets.
 */
export function sanitizePromptAuditMetadata(
  metadata: Record<string, unknown> | null | undefined
): AuditMetadata {
  if (!metadata) {
    return {};
  }

  const out: AuditMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    if (
      DISALLOWED_AUDIT_KEYS.has(lower) ||
      lower.includes("prompt_text") ||
      lower.includes("api_key") ||
      lower.includes("secret")
    ) {
      continue;
    }

    if (value == null) {
      out[key] = null;
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (typeof value === "string" && value.length > 500) {
        out[key] = `${value.slice(0, 500)}…`;
      } else {
        out[key] = value;
      }
      continue;
    }

    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      out[key] = value.slice(0, 20).join(",");
    }
  }

  return out;
}

export const PROMPT_AUDIT_ACTIONS = {
  versionCreate: "prompt.version_create",
  versionValidate: "prompt.version_validate",
  versionActivate: "prompt.version_activate",
  versionDeprecate: "prompt.version_deprecate",
  versionArchive: "prompt.version_archive",
  versionRollback: "prompt.version_rollback",
  rolloutCreate: "rollout.create",
  rolloutStart: "rollout.start",
  rolloutPause: "rollout.pause",
  rolloutResume: "rollout.resume",
  rolloutCancel: "rollout.cancel",
  rolloutPromote: "rollout.promote",
  rolloutRollback: "rollout.rollback"
} as const;
