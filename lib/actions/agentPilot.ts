"use server";

import { revalidatePath } from "next/cache";

import {
  canManageAgentPilot,
  canViewAgentOperations,
  getMembershipsForUser
} from "@/lib/authz";
import { recordAuditEvent } from "@/lib/auditLog";
import {
  AGENT_PILOT_AUDIT_ACTIONS,
  assertPilotAutonomyGuardsIntact,
  buildAgentPilotStatusSummary,
  canEnableAnotherPilotOrganization,
  canEnableAnotherPilotUser,
  loadAgentPilotRuntimeState,
  loadAgentPilotUsageSnapshot,
  sanitizePilotAuditMetadata,
  updateAgentPilotSettings,
  upsertPilotOrganizationAllowlist,
  upsertPilotUserAllowlist,
  type AgentPilotStatusSummary
} from "@/lib/agents/pilot";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type AgentPilotActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

async function requirePilotAdminContext() {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return {
      ok: false as const,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();
  if (!user) {
    return { ok: false as const, error: "Sign in to manage the agent pilot." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewAgentOperations(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to view agent operations."
    };
  }

  return { ok: true as const, supabase, user, memberships };
}

export async function loadAgentPilotStatus(): Promise<
  | {
      ok: true;
      status: AgentPilotStatusSummary;
      canManage: boolean;
    }
  | { ok: false; error: string }
> {
  const ctx = await requirePilotAdminContext();
  if (!ctx.ok) {
    return ctx;
  }

  const state = await loadAgentPilotRuntimeState({ supabase: ctx.supabase });
  const enabledOrgIds = state.organizations
    .filter((entry) => entry.status === "enabled")
    .map((entry) => entry.organization_id);
  const usage = await loadAgentPilotUsageSnapshot({
    supabase: ctx.supabase,
    organizationIds: enabledOrgIds
  });

  return {
    ok: true,
    status: buildAgentPilotStatusSummary({ state, usage }),
    canManage: canManageAgentPilot(ctx.memberships)
  };
}

export async function setAgentPilotEnabled(
  enabled: boolean
): Promise<AgentPilotActionResult> {
  const ctx = await requirePilotAdminContext();
  if (!ctx.ok) {
    return ctx;
  }

  if (!canManageAgentPilot(ctx.memberships)) {
    return { ok: false, error: "Only super admins can enable or disable the pilot." };
  }

  const autonomy = assertPilotAutonomyGuardsIntact();
  if (!autonomy.ok) {
    return { ok: false, error: autonomy.error };
  }

  const updated = await updateAgentPilotSettings({
    supabase: ctx.supabase,
    actorUserId: ctx.user.id,
    patch: { enabled }
  });

  if (!updated.ok) {
    return updated;
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: null,
    actorUserId: ctx.user.id,
    action: enabled
      ? AGENT_PILOT_AUDIT_ACTIONS.enable
      : AGENT_PILOT_AUDIT_ACTIONS.disable,
    targetTable: "agent_pilot_settings",
    recordId: "default",
    metadata: sanitizePilotAuditMetadata({ enabled })
  });

  revalidatePath("/agents");
  return {
    ok: true,
    message: enabled
      ? "Production agent pilot enabled."
      : "Production agent pilot disabled."
  };
}

export async function setAgentPilotKillSwitch(
  killSwitch: boolean
): Promise<AgentPilotActionResult> {
  const ctx = await requirePilotAdminContext();
  if (!ctx.ok) {
    return ctx;
  }

  if (!canManageAgentPilot(ctx.memberships)) {
    return {
      ok: false,
      error: "Only super admins can change the pilot kill switch."
    };
  }

  const updated = await updateAgentPilotSettings({
    supabase: ctx.supabase,
    actorUserId: ctx.user.id,
    patch: { killSwitch }
  });

  if (!updated.ok) {
    return updated;
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: null,
    actorUserId: ctx.user.id,
    action: killSwitch
      ? AGENT_PILOT_AUDIT_ACTIONS.killSwitchEnable
      : AGENT_PILOT_AUDIT_ACTIONS.killSwitchDisable,
    targetTable: "agent_pilot_settings",
    recordId: "default",
    metadata: sanitizePilotAuditMetadata({ kill_switch: killSwitch })
  });

  revalidatePath("/agents");
  return {
    ok: true,
    message: killSwitch
      ? "Emergency pilot kill switch enabled. All real provider execution is blocked."
      : "Pilot kill switch disabled."
  };
}

export async function setPilotOrganizationAllowlist(input: {
  organizationId: string;
  status: "enabled" | "disabled";
  notes?: string;
}): Promise<AgentPilotActionResult> {
  const ctx = await requirePilotAdminContext();
  if (!ctx.ok) {
    return ctx;
  }

  if (!canManageAgentPilot(ctx.memberships)) {
    return {
      ok: false,
      error: "Only super admins can change the pilot organization allowlist."
    };
  }

  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    return { ok: false, error: "Organization id is required." };
  }

  const state = await loadAgentPilotRuntimeState({ supabase: ctx.supabase });
  const alreadyEnabled = state.organizations.some(
    (entry) =>
      entry.organization_id === organizationId && entry.status === "enabled"
  );

  if (
    input.status === "enabled" &&
    !alreadyEnabled &&
    !canEnableAnotherPilotOrganization(state)
  ) {
    return {
      ok: false,
      error: `Pilot organization capacity is ${state.limits.maxOrganizations}.`
    };
  }

  const updated = await upsertPilotOrganizationAllowlist({
    supabase: ctx.supabase,
    actorUserId: ctx.user.id,
    organizationId,
    status: input.status,
    notes: input.notes ?? null
  });

  if (!updated.ok) {
    return updated;
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId,
    actorUserId: ctx.user.id,
    action:
      input.status === "enabled"
        ? AGENT_PILOT_AUDIT_ACTIONS.orgAllowlistEnable
        : AGENT_PILOT_AUDIT_ACTIONS.orgAllowlistDisable,
    targetTable: "agent_pilot_organization_allowlist",
    recordId: organizationId,
    metadata: sanitizePilotAuditMetadata({
      status: input.status,
      notes: input.notes ?? null
    })
  });

  revalidatePath("/agents");
  return {
    ok: true,
    message:
      input.status === "enabled"
        ? "Organization added to the pilot allowlist."
        : "Organization removed from the pilot allowlist."
  };
}

export async function setPilotUserAllowlist(input: {
  userId: string;
  organizationId: string;
  status: "enabled" | "disabled";
  notes?: string;
}): Promise<AgentPilotActionResult> {
  const ctx = await requirePilotAdminContext();
  if (!ctx.ok) {
    return ctx;
  }

  if (!canManageAgentPilot(ctx.memberships)) {
    return {
      ok: false,
      error: "Only super admins can change the pilot user allowlist."
    };
  }

  const userId = input.userId.trim();
  const organizationId = input.organizationId.trim();
  if (!userId || !organizationId) {
    return { ok: false, error: "User id and organization id are required." };
  }

  const state = await loadAgentPilotRuntimeState({ supabase: ctx.supabase });
  const alreadyEnabled = state.users.some(
    (entry) =>
      entry.user_id === userId &&
      entry.organization_id === organizationId &&
      entry.status === "enabled"
  );

  if (
    input.status === "enabled" &&
    !alreadyEnabled &&
    !canEnableAnotherPilotUser(state)
  ) {
    return {
      ok: false,
      error: `Pilot user capacity is ${state.limits.maxUsers}.`
    };
  }

  const updated = await upsertPilotUserAllowlist({
    supabase: ctx.supabase,
    actorUserId: ctx.user.id,
    userId,
    organizationId,
    status: input.status,
    notes: input.notes ?? null
  });

  if (!updated.ok) {
    return updated;
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId,
    actorUserId: ctx.user.id,
    action:
      input.status === "enabled"
        ? AGENT_PILOT_AUDIT_ACTIONS.userAllowlistEnable
        : AGENT_PILOT_AUDIT_ACTIONS.userAllowlistDisable,
    targetTable: "agent_pilot_user_allowlist",
    recordId: userId,
    metadata: sanitizePilotAuditMetadata({
      status: input.status,
      user_id: userId,
      notes: input.notes ?? null
    })
  });

  revalidatePath("/agents");
  return {
    ok: true,
    message:
      input.status === "enabled"
        ? "User added to the pilot allowlist."
        : "User removed from the pilot allowlist."
  };
}
