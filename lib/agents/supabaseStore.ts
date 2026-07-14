import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AgentExecutionListFilter,
  AgentExecutionListResult
} from "@/lib/agentOperations";

import { resolveAgentMaxAttempts } from "./retryPolicy";
import type { AgentExecution, AgentName } from "./types";
import type {
  AgentExecutionInsert,
  AgentExecutionStore,
  AgentExecutionUpdate
} from "./store";

const AGENT_EXECUTION_SELECT =
  "id,organization_id,agent_name,target_type,target_id,status,depends_on_execution_id,attempt_count,max_attempts,next_retry_at,last_error_code,started_at,completed_at,duration_ms,error_message,metadata,created_at,updated_at";

type AgentExecutionRow = {
  id: string;
  organization_id: string;
  agent_name: AgentName;
  target_type: string;
  target_id: string;
  status: AgentExecution["status"];
  depends_on_execution_id: string | null;
  attempt_count: number;
  max_attempts: number | null;
  next_retry_at: string | null;
  last_error_code: string | null;
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
    max_attempts: row.max_attempts ?? resolveAgentMaxAttempts(),
    next_retry_at: row.next_retry_at,
    last_error_code: row.last_error_code,
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
        max_attempts: input.max_attempts ?? resolveAgentMaxAttempts(),
        next_retry_at: input.next_retry_at ?? null,
        last_error_code: input.last_error_code ?? null,
        metadata: input.metadata ?? {}
      })
      .select(AGENT_EXECUTION_SELECT)
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
      .select(AGENT_EXECUTION_SELECT)
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
      .select(AGENT_EXECUTION_SELECT)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapRow(data as AgentExecutionRow);
  }

  async findNextRunnable(organizationId: string): Promise<AgentExecution | null> {
    return this.claimNext(organizationId);
  }

  async claimNext(
    organizationId: string,
    now: Date = new Date()
  ): Promise<AgentExecution | null> {
    const nowIso = now.toISOString();
    const { data, error } = await this.supabase
      .from("agent_executions")
      .select(AGENT_EXECUTION_SELECT)
      .eq("organization_id", organizationId)
      .eq("status", "queued")
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order("created_at", { ascending: true });

    if (error || !data) {
      return null;
    }

    for (const row of data as AgentExecutionRow[]) {
      const candidate = mapRow(row);

      if (candidate.depends_on_execution_id) {
        const dependency = await this.findById(
          candidate.depends_on_execution_id,
          organizationId
        );

        if (dependency?.status !== "completed") {
          continue;
        }
      }

      const { data: claimed, error: claimError } = await this.supabase
        .from("agent_executions")
        .update({
          status: "running",
          started_at: nowIso,
          attempt_count: candidate.attempt_count + 1,
          error_message: null
        })
        .eq("id", candidate.id)
        .eq("organization_id", organizationId)
        .eq("status", "queued")
        .select(AGENT_EXECUTION_SELECT)
        .maybeSingle();

      if (claimError || !claimed) {
        continue;
      }

      return mapRow(claimed as AgentExecutionRow);
    }

    return null;
  }

  async claimBatch(limit: number): Promise<AgentExecution[]> {
    const safeLimit = Math.max(1, Math.min(25, limit));
    const { data, error } = await this.supabase.rpc("claim_next_agent_executions", {
      p_limit: safeLimit
    });

    if (error) {
      console.error("claim_next_agent_executions failed:", error.message);
      return this.claimBatchFallback(safeLimit);
    }

    return ((data ?? []) as AgentExecutionRow[]).map(mapRow);
  }

  private async claimBatchFallback(limit: number): Promise<AgentExecution[]> {
    const claimed: AgentExecution[] = [];
    const { data } = await this.supabase
      .from("agent_executions")
      .select("organization_id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(100);

    const organizationIds = [
      ...new Set(((data ?? []) as Array<{ organization_id: string }>).map(
        (row) => row.organization_id
      ))
    ];

    for (const organizationId of organizationIds) {
      while (claimed.length < limit) {
        const next = await this.claimNext(organizationId);

        if (!next) {
          break;
        }

        claimed.push(next);
      }

      if (claimed.length >= limit) {
        break;
      }
    }

    return claimed;
  }

  async recoverStaleRunning(staleAfterMinutes: number): Promise<AgentExecution[]> {
    const { data, error } = await this.supabase.rpc("recover_stale_agent_executions", {
      p_stale_after_minutes: Math.max(1, staleAfterMinutes)
    });

    if (error) {
      console.error("recover_stale_agent_executions failed:", error.message);
      return this.recoverStaleRunningFallback(staleAfterMinutes);
    }

    return ((data ?? []) as AgentExecutionRow[]).map(mapRow);
  }

  private async recoverStaleRunningFallback(
    staleAfterMinutes: number
  ): Promise<AgentExecution[]> {
    const cutoff = new Date(
      Date.now() - Math.max(1, staleAfterMinutes) * 60_000
    ).toISOString();

    const { data: staleRows } = await this.supabase
      .from("agent_executions")
      .select(AGENT_EXECUTION_SELECT)
      .eq("status", "running")
      .lt("started_at", cutoff);

    const recovered: AgentExecution[] = [];

    for (const row of (staleRows ?? []) as AgentExecutionRow[]) {
      const current = mapRow(row);
      const { data: updated } = await this.supabase
        .from("agent_executions")
        .update({
          status: "queued",
          next_retry_at: new Date().toISOString(),
          started_at: null,
          error_message:
            current.error_message ?? "Recovered stale running execution.",
          last_error_code: current.last_error_code ?? "stale_running"
        })
        .eq("id", current.id)
        .eq("status", "running")
        .select(AGENT_EXECUTION_SELECT)
        .maybeSingle();

      if (updated) {
        recovered.push(mapRow(updated as AgentExecutionRow));
      }
    }

    return recovered;
  }

  async list(filter: AgentExecutionListFilter): Promise<AgentExecutionListResult> {
    let query = this.supabase
      .from("agent_executions")
      .select(AGENT_EXECUTION_SELECT, { count: "exact" });

    if (filter.organizationId) {
      query = query.eq("organization_id", filter.organizationId);
    } else if (filter.organizationIds && filter.organizationIds.length > 0) {
      query = query.in("organization_id", filter.organizationIds);
    }

    if (filter.status) {
      query = query.eq("status", filter.status);
    }

    if (filter.agentName) {
      query = query.eq("agent_name", filter.agentName);
    }

    if (filter.createdFrom) {
      query = query.gte("created_at", filter.createdFrom);
    }

    if (filter.createdTo) {
      query = query.lte("created_at", filter.createdTo);
    }

    const offset = Math.max(0, filter.offset ?? 0);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 25));

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Failed to list agent executions:", error.message);
      return { rows: [], total: 0 };
    }

    return {
      rows: ((data ?? []) as AgentExecutionRow[]).map(mapRow),
      total: count ?? 0
    };
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
