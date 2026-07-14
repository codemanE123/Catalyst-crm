import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAgentPromptConfig } from "./config";
import { AGENT_PROMPT_KEY_MAP, type AgentPromptVersion, type PromptExecutionStamp } from "./types";
import { stampFromPromptVersion } from "./service";
import { assignRolloutVariant } from "../rollouts/assignment";
import type { AgentRollout } from "../rollouts/types";
import type { AgentName } from "../types";

const VERSION_SELECT =
  "id,organization_id,prompt_key,version,agent_name,status,description,system_prompt,user_prompt_template,output_schema_version,provider,model,temperature,max_output_tokens,safety_policy_version,change_summary,created_by,created_at,activated_at,deprecated_at";

const ROLLOUT_SELECT =
  "id,organization_id,agent_name,prompt_key,control_prompt_version_id,treatment_prompt_version_id,rollout_type,rollout_percentage,status,started_at,ended_at,created_by,metadata,created_at";

function mapVersion(row: Record<string, unknown>): AgentPromptVersion {
  return {
    id: String(row.id),
    organization_id: (row.organization_id as string | null) ?? null,
    prompt_key: String(row.prompt_key),
    version: String(row.version),
    agent_name: String(row.agent_name),
    status: row.status as AgentPromptVersion["status"],
    description: (row.description as string | null) ?? null,
    system_prompt: String(row.system_prompt),
    user_prompt_template: String(row.user_prompt_template),
    output_schema_version: String(row.output_schema_version),
    provider: String(row.provider),
    model: String(row.model),
    temperature: Number(row.temperature),
    max_output_tokens: Number(row.max_output_tokens),
    safety_policy_version: String(row.safety_policy_version),
    change_summary: (row.change_summary as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    activated_at: (row.activated_at as string | null) ?? null,
    deprecated_at: (row.deprecated_at as string | null) ?? null
  };
}

function mapRollout(row: Record<string, unknown>): AgentRollout {
  return {
    id: String(row.id),
    organization_id: (row.organization_id as string | null) ?? null,
    agent_name: String(row.agent_name),
    prompt_key: String(row.prompt_key),
    control_prompt_version_id: String(row.control_prompt_version_id),
    treatment_prompt_version_id: String(row.treatment_prompt_version_id),
    rollout_type: row.rollout_type as AgentRollout["rollout_type"],
    rollout_percentage: Number(row.rollout_percentage),
    status: row.status as AgentRollout["status"],
    started_at: (row.started_at as string | null) ?? null,
    ended_at: (row.ended_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    metadata: (row.metadata as AgentRollout["metadata"]) ?? {},
    created_at: String(row.created_at)
  };
}

export async function listPromptVersionsFromSupabase(
  supabase: SupabaseClient,
  params?: { promptKey?: string; organizationId?: string | null }
): Promise<AgentPromptVersion[]> {
  let query = supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .order("created_at", { ascending: false });

  if (params?.promptKey) {
    query = query.eq("prompt_key", params.promptKey);
  }
  if (params?.organizationId !== undefined) {
    if (params.organizationId == null) {
      query = query.is("organization_id", null);
    } else {
      query = query.or(
        `organization_id.eq.${params.organizationId},organization_id.is.null`
      );
    }
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }
  return data.map((row) => mapVersion(row as Record<string, unknown>));
}

export async function listRolloutsFromSupabase(
  supabase: SupabaseClient
): Promise<AgentRollout[]> {
  const { data, error } = await supabase
    .from("agent_rollouts")
    .select(ROLLOUT_SELECT)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }
  return data.map((row) => mapRollout(row as Record<string, unknown>));
}

export async function resolvePromptStampFromSupabase(params: {
  supabase: SupabaseClient;
  agentName: AgentName | string;
  organizationId: string;
  userId?: string | null;
  targetId?: string | null;
  existing?: Record<string, string | number | boolean | null> | null;
}): Promise<PromptExecutionStamp | null> {
  if (params.existing?.prompt_version_id && params.existing.prompt_key) {
    return {
      prompt_key: String(params.existing.prompt_key),
      prompt_version: String(params.existing.prompt_version ?? ""),
      prompt_version_id: String(params.existing.prompt_version_id),
      output_schema_version: String(
        params.existing.output_schema_version ?? ""
      ),
      provider: String(params.existing.provider ?? ""),
      model: String(params.existing.model ?? ""),
      rollout_id:
        params.existing.rollout_id == null
          ? null
          : String(params.existing.rollout_id),
      experiment_variant:
        params.existing.experiment_variant === "control" ||
        params.existing.experiment_variant === "treatment"
          ? params.existing.experiment_variant
          : null
    };
  }

  const promptKey = AGENT_PROMPT_KEY_MAP[params.agentName as AgentName];
  if (!promptKey) {
    return null;
  }

  const config = resolveAgentPromptConfig();

  const { data: rolloutRows } = await params.supabase
    .from("agent_rollouts")
    .select(ROLLOUT_SELECT)
    .eq("prompt_key", promptKey)
    .eq("status", "active")
    .or(
      `organization_id.eq.${params.organizationId},organization_id.is.null`
    )
    .order("organization_id", { ascending: false, nullsFirst: false })
    .limit(5);

  const rollouts = (rolloutRows ?? []).map((row) =>
    mapRollout(row as Record<string, unknown>)
  );
  const rollout =
    rollouts.find((row) => row.organization_id === params.organizationId) ??
    rollouts.find((row) => row.organization_id == null) ??
    null;

  if (rollout) {
    const assignment = assignRolloutVariant({
      rollout,
      context: {
        organizationId: params.organizationId,
        userId: params.userId,
        targetId: params.targetId
      },
      assignmentKey: config.rolloutAssignmentKey
    });

    if (assignment) {
      const { data: versionRow } = await params.supabase
        .from("agent_prompt_versions")
        .select(VERSION_SELECT)
        .eq("id", assignment.prompt_version_id)
        .maybeSingle();

      if (versionRow) {
        return stampFromPromptVersion(
          mapVersion(versionRow as Record<string, unknown>),
          {
            rollout_id: assignment.rollout_id,
            experiment_variant: assignment.variant
          }
        );
      }
    }
  }

  const { data: orgActive } = await params.supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .eq("prompt_key", promptKey)
    .eq("status", "active")
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (orgActive) {
    return stampFromPromptVersion(mapVersion(orgActive as Record<string, unknown>));
  }

  const { data: globalActive } = await params.supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .eq("prompt_key", promptKey)
    .eq("status", "active")
    .is("organization_id", null)
    .maybeSingle();

  if (globalActive) {
    return stampFromPromptVersion(
      mapVersion(globalActive as Record<string, unknown>)
    );
  }

  return null;
}

export { mapVersion, mapRollout, VERSION_SELECT, ROLLOUT_SELECT };
