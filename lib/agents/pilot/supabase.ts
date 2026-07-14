import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfUtcDay } from "@/lib/agentOperations";

import {
  mergePilotRuntimeState,
  resolveAgentPilotRuntimeStateFromEnv
} from "./config";
import type {
  AgentPilotLimits,
  AgentPilotOrganizationAllowlistEntry,
  AgentPilotRuntimeState,
  AgentPilotSettings,
  AgentPilotUsageSnapshot,
  AgentPilotUserAllowlistEntry
} from "./types";

const SETTINGS_SELECT =
  "id,enabled,kill_switch,max_organizations,max_users,max_daily_jobs,max_daily_spend_usd,max_candidate_batch_size,updated_by,updated_at";

const ORG_SELECT =
  "organization_id,status,notes,created_at,updated_at";

const USER_SELECT =
  "user_id,organization_id,status,notes,created_at,updated_at";

function mapSettings(row: Record<string, unknown>): AgentPilotSettings {
  return {
    enabled: Boolean(row.enabled),
    killSwitch: Boolean(row.kill_switch),
    limits: {
      maxOrganizations: Number(row.max_organizations),
      maxUsers: Number(row.max_users),
      maxDailyJobs: Number(row.max_daily_jobs),
      maxDailySpendUsd: Number(row.max_daily_spend_usd),
      maxCandidateBatchSize: Number(row.max_candidate_batch_size)
    }
  };
}

function mapOrganization(
  row: Record<string, unknown>
): AgentPilotOrganizationAllowlistEntry {
  return {
    organization_id: String(row.organization_id),
    status: row.status === "disabled" ? "disabled" : "enabled",
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapUser(row: Record<string, unknown>): AgentPilotUserAllowlistEntry {
  return {
    user_id: String(row.user_id),
    organization_id: String(row.organization_id),
    status: row.status === "disabled" ? "disabled" : "enabled",
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export async function loadAgentPilotRuntimeState(params: {
  supabase: SupabaseClient;
  env?: NodeJS.ProcessEnv;
}): Promise<AgentPilotRuntimeState> {
  const env = params.env ?? process.env;
  const envState = resolveAgentPilotRuntimeStateFromEnv(env);

  const [{ data: settingsRow, error: settingsError }, { data: orgRows }, { data: userRows }] =
    await Promise.all([
      params.supabase
        .from("agent_pilot_settings")
        .select(SETTINGS_SELECT)
        .eq("id", "default")
        .maybeSingle(),
      params.supabase
        .from("agent_pilot_organization_allowlist")
        .select(ORG_SELECT),
      params.supabase.from("agent_pilot_user_allowlist").select(USER_SELECT)
    ]);

  if (settingsError || !settingsRow) {
    return mergePilotRuntimeState({
      envState,
      databaseState: null,
      envKillSwitchForced: envState.killSwitch
    });
  }

  const settings = mapSettings(settingsRow as Record<string, unknown>);
  const databaseState: AgentPilotRuntimeState = {
    ...settings,
    organizations: (orgRows ?? []).map((row) =>
      mapOrganization(row as Record<string, unknown>)
    ),
    users: (userRows ?? []).map((row) => mapUser(row as Record<string, unknown>)),
    source: "database"
  };

  return mergePilotRuntimeState({
    envState,
    databaseState,
    envKillSwitchForced: envState.killSwitch
  });
}

export async function loadAgentPilotUsageSnapshot(params: {
  supabase: SupabaseClient;
  organizationIds?: string[] | null;
}): Promise<AgentPilotUsageSnapshot> {
  const since = startOfUtcDay();
  let jobsQuery = params.supabase
    .from("agent_executions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  if (params.organizationIds && params.organizationIds.length > 0) {
    jobsQuery = jobsQuery.in("organization_id", params.organizationIds);
  }

  const { count: dailyJobs } = await jobsQuery;

  let spendQuery = params.supabase
    .from("agent_usage_events")
    .select("estimated_cost_usd")
    .gte("created_at", since)
    .eq("status", "success");

  if (params.organizationIds && params.organizationIds.length > 0) {
    spendQuery = spendQuery.in("organization_id", params.organizationIds);
  }

  const { data: spendRows } = await spendQuery;
  const dailySpendUsd = (spendRows ?? []).reduce((sum, row) => {
    const value = Number(
      (row as { estimated_cost_usd?: number | string | null }).estimated_cost_usd ??
        0
    );
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    dailyJobs: dailyJobs ?? 0,
    dailySpendUsd
  };
}

export async function updateAgentPilotSettings(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  patch: Partial<{
    enabled: boolean;
    killSwitch: boolean;
    limits: Partial<AgentPilotLimits>;
  }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {
    updated_by: params.actorUserId
  };

  if (typeof params.patch.enabled === "boolean") {
    update.enabled = params.patch.enabled;
  }

  if (typeof params.patch.killSwitch === "boolean") {
    update.kill_switch = params.patch.killSwitch;
  }

  if (params.patch.limits) {
    if (params.patch.limits.maxOrganizations != null) {
      update.max_organizations = params.patch.limits.maxOrganizations;
    }
    if (params.patch.limits.maxUsers != null) {
      update.max_users = params.patch.limits.maxUsers;
    }
    if (params.patch.limits.maxDailyJobs != null) {
      update.max_daily_jobs = params.patch.limits.maxDailyJobs;
    }
    if (params.patch.limits.maxDailySpendUsd != null) {
      update.max_daily_spend_usd = params.patch.limits.maxDailySpendUsd;
    }
    if (params.patch.limits.maxCandidateBatchSize != null) {
      update.max_candidate_batch_size = params.patch.limits.maxCandidateBatchSize;
    }
  }

  const { error } = await params.supabase
    .from("agent_pilot_settings")
    .update(update)
    .eq("id", "default");

  if (error) {
    return { ok: false, error: "Could not update pilot settings." };
  }

  return { ok: true };
}

export async function upsertPilotOrganizationAllowlist(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  organizationId: string;
  status: "enabled" | "disabled";
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = {
    organization_id: params.organizationId,
    status: params.status,
    notes: params.notes ?? null,
    updated_by: params.actorUserId,
    disabled_at: params.status === "disabled" ? new Date().toISOString() : null,
    created_by: params.actorUserId
  };

  const { error } = await params.supabase
    .from("agent_pilot_organization_allowlist")
    .upsert(payload, { onConflict: "organization_id" });

  if (error) {
    return { ok: false, error: "Could not update organization pilot allowlist." };
  }

  return { ok: true };
}

export async function upsertPilotUserAllowlist(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  userId: string;
  organizationId: string;
  status: "enabled" | "disabled";
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = {
    user_id: params.userId,
    organization_id: params.organizationId,
    status: params.status,
    notes: params.notes ?? null,
    updated_by: params.actorUserId,
    disabled_at: params.status === "disabled" ? new Date().toISOString() : null,
    created_by: params.actorUserId
  };

  const { error } = await params.supabase
    .from("agent_pilot_user_allowlist")
    .upsert(payload, { onConflict: "user_id,organization_id" });

  if (error) {
    return { ok: false, error: "Could not update user pilot allowlist." };
  }

  return { ok: true };
}
