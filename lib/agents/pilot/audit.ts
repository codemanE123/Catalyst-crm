import type { AuditMetadata } from "@/lib/auditLog";

export const AGENT_PILOT_AUDIT_ACTIONS = {
  enable: "agent_pilot.enable",
  disable: "agent_pilot.disable",
  killSwitchEnable: "agent_pilot.kill_switch_enable",
  killSwitchDisable: "agent_pilot.kill_switch_disable",
  limitsUpdate: "agent_pilot.limits_update",
  orgAllowlistEnable: "agent_pilot.org_allowlist_enable",
  orgAllowlistDisable: "agent_pilot.org_allowlist_disable",
  userAllowlistEnable: "agent_pilot.user_allowlist_enable",
  userAllowlistDisable: "agent_pilot.user_allowlist_disable",
  accessDenied: "agent_pilot.access_denied"
} as const;

export function sanitizePilotAuditMetadata(
  metadata: Record<string, unknown>
): AuditMetadata {
  const sanitized: AuditMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
