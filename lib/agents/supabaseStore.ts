import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentExecution, AgentName } from "./types";
import type {
  AgentExecutionInsert,
  AgentExecutionStore,
  AgentExecutionUpdate
} from "./store";

type AgentExecutionRow = {
  id: string;
  organization_id: string;
  agent_name: AgentName;
  target_type: string;
  target_id: string;
  status: AgentExecution["status"];
  depends_on_execution_id: string | null;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: AgentExecution["metadata"] | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: AgentExecutionRow): AgentExecution {
  return {
    id: row.id,
    organization_id: row.organization_id,
    agent_name: row.agent_name,
    target_type: row.target_type,
    target_id: row.target_id,
    status: row.status,
    depends_on_execution_id: row.depends_on_execution_id,
    attempt_count: row.attempt_count,
    started_at: row.started_at,
    completed_at: row.completed_at,
    duration_ms: row.duration_ms,
    error_message: row.error_message,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export class SupabaseAgentExecutionStore implements AgentExecutionStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async insert(input: AgentExecutionInsert): Promise<AgentExecution> {
    const { data, error } = await this.supabase
      .from("agent_executions")
      .insert({
        organization_id: input.organization_id,
        agent_name: input.agent_name,
        target_type: input.target_type,
        target_id: input.target_id,
        status: input.status,
        depends_on_execution_id: input.depends_on_execution_id ?? null,
        attempt_count: input.attempt_count ?? 0,
        metadata: input.metadata ?? {}
      })
      .select(
        "id,organization_id,agent_name,target_type,target_id,status,depends_on_execution_id,attempt_count,started_at,completed_at,duration_ms,error_message,metadata,created_at,updated_at"
      )
      .single();

    if (error || !data) {
      throw new Error("Could not queue agent execution.");
    }

    return mapRow(data as AgentExecutionRow);
  }

  async update(
    id: string,
    organizationId: string,
    patch: AgentExecutionUpdate
  ): Promise<AgentExecution | null> {
    const { data, error } = await this.supabase
      .from("agent_executions")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(
        "id,organization_id,agent_name,target_type,target_id,status,depends_on_execution_id,attempt_count,started_at,completed_at,duration_ms,error_message,metadata,created_at,updated_at"
      )
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapRow(data as AgentExecutionRow);
  }

  async findById(
    id: string,
    organizationId: string
  ): Promise<AgentExecution | null> {
    const { data, error } = await this.supabase
      .from("agent_executions")
      .select(
        "id,organization_id,agent_name,target_type,target_id,status,depends_on_execution_id,attempt_count,started_at,completed_at,duration_ms,error_message,metadata,created_at,updated_at"
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapRow(data as AgentExecutionRow);
  }

  async findNextRunnable(organizationId: string): Promise<AgentExecution | null> {
    const { data, error } = await this.supabase
      .from("agent_executions")
      .select(
        "id,organization_id,agent_name,target_type,target_id,status,depends_on_execution_id,attempt_count,started_at,completed_at,duration_ms,error_message,metadata,created_at,updated_at"
      )
      .eq("organization_id", organizationId)
      .eq("status", "queued")
      .order("created_at", { ascending: true });

    if (error || !data) {
      return null;
    }

    const queued = (data as AgentExecutionRow[]).map(mapRow);

    for (const candidate of queued) {
      if (!candidate.depends_on_execution_id) {
        return candidate;
      }

      const dependency = await this.findById(
        candidate.depends_on_execution_id,
        organizationId
      );

      if (dependency?.status === "completed") {
        return candidate;
      }
    }

    return null;
  }
}

export function createSupabaseAgentAuditRecorder(
  supabase: SupabaseClient,
  recordAuditEvent: typeof import("@/lib/auditLog").recordAuditEvent
) {
  return async (event: {
    organizationId: string;
    actorUserId: string;
    action: string;
    recordId: string;
    metadata?: Record<string, string | number | boolean | null>;
  }) => {
    await recordAuditEvent(supabase, {
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      action: event.action,
      targetTable: "agent_executions",
      recordId: event.recordId,
      metadata: event.metadata
    });
  };
}
