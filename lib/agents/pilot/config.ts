import {
  AGENT_PILOT_ENV,
  DEFAULT_AGENT_PILOT_LIMITS,
  type AgentPilotLimits,
  type AgentPilotOrganizationAllowlistEntry,
  type AgentPilotRuntimeState,
  type AgentPilotSettings,
  type AgentPilotUserAllowlistEntry
} from "./types";

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parsePositiveFloat(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseFloat(raw ?? "");

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseBoolFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  return fallback;
}

export function parseCsvAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    )
  ];
}

export function resolveAgentPilotLimitsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AgentPilotLimits {
  return {
    maxOrganizations: parsePositiveInt(
      env[AGENT_PILOT_ENV.maxOrganizations],
      DEFAULT_AGENT_PILOT_LIMITS.maxOrganizations,
      1,
      1000
    ),
    maxUsers: parsePositiveInt(
      env[AGENT_PILOT_ENV.maxUsers],
      DEFAULT_AGENT_PILOT_LIMITS.maxUsers,
      1,
      10_000
    ),
    maxDailyJobs: parsePositiveInt(
      env[AGENT_PILOT_ENV.maxDailyJobs],
      DEFAULT_AGENT_PILOT_LIMITS.maxDailyJobs,
      1,
      100_000
    ),
    maxDailySpendUsd: parsePositiveFloat(
      env[AGENT_PILOT_ENV.maxDailySpendUsd],
      DEFAULT_AGENT_PILOT_LIMITS.maxDailySpendUsd,
      0,
      1_000_000
    ),
    maxCandidateBatchSize: parsePositiveInt(
      env[AGENT_PILOT_ENV.maxCandidateBatchSize],
      DEFAULT_AGENT_PILOT_LIMITS.maxCandidateBatchSize,
      1,
      500
    )
  };
}

export function resolveAgentPilotSettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AgentPilotSettings {
  return {
    // Default all organizations to disabled unless explicitly enabled.
    enabled: parseBoolFlag(env[AGENT_PILOT_ENV.enabled], false),
    killSwitch: parseBoolFlag(env[AGENT_PILOT_ENV.killSwitch], false),
    limits: resolveAgentPilotLimitsFromEnv(env)
  };
}

export function resolveAgentPilotRuntimeStateFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AgentPilotRuntimeState {
  const settings = resolveAgentPilotSettingsFromEnv(env);
  const orgIds = parseCsvAllowlist(env[AGENT_PILOT_ENV.orgAllowlist]);
  const userIds = parseCsvAllowlist(env[AGENT_PILOT_ENV.userAllowlist]);
  const now = new Date(0).toISOString();

  const organizations: AgentPilotOrganizationAllowlistEntry[] = orgIds.map(
    (organization_id) => ({
      organization_id,
      status: "enabled",
      notes: null,
      created_at: now,
      updated_at: now
    })
  );

  // Env user allowlist is global (any org) — organization_id filled at evaluation time.
  const users: AgentPilotUserAllowlistEntry[] = userIds.map((user_id) => ({
    user_id,
    organization_id: "*",
    status: "enabled",
    notes: null,
    created_at: now,
    updated_at: now
  }));

  return {
    ...settings,
    organizations,
    users,
    source: "env"
  };
}

export function mergePilotRuntimeState(params: {
  envState: AgentPilotRuntimeState;
  databaseState: AgentPilotRuntimeState | null;
  envKillSwitchForced?: boolean;
}): AgentPilotRuntimeState {
  const envKill =
    params.envKillSwitchForced ?? params.envState.killSwitch;

  if (!params.databaseState) {
    return {
      ...params.envState,
      killSwitch: envKill || params.envState.killSwitch,
      source: "env"
    };
  }

  return {
    enabled: params.databaseState.enabled,
    killSwitch: envKill || params.databaseState.killSwitch,
    limits: params.databaseState.limits,
    organizations: params.databaseState.organizations,
    users: params.databaseState.users,
    source: "merged"
  };
}
