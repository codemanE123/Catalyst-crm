import type {
  AgentExecutionListFilter,
  AgentExecutionListResult
} from "@/lib/agentOperations";
import { paginateAgentExecutions } from "@/lib/agentOperations";

import { resolveAgentMaxAttempts } from "./retryPolicy";
import type { AgentExecution, AgentExecutionMetadata, AgentName } from "./types";

export type AgentExecutionInsert = {
  organization_id: string;
  agent_name: AgentName;
  target_type: string;
  target_id: string;
  status: AgentExecution["status"];
  depends_on_execution_id?: string | null;
  attempt_count?: number;
  max_attempts?: number;
  next_retry_at?: string | null;
  last_error_code?: string | null;
  metadata?: AgentExecutionMetadata;
};

export type AgentExecutionUpdate = Partial<
  Pick<
    AgentExecution,
    | "status"
    | "started_at"
    | "completed_at"
    | "duration_ms"
    | "error_message"
    | "metadata"
    | "attempt_count"
    | "max_attempts"
    | "next_retry_at"
    | "last_error_code"
  >
>;

export interface AgentExecutionStore {
  insert(input: AgentExecutionInsert): Promise<AgentExecution>;
  update(
    id: string,
    organizationId: string,
    patch: AgentExecutionUpdate
  ): Promise<AgentExecution | null>;
  findById(id: string, organizationId: string): Promise<AgentExecution | null>;
  findNextRunnable(organizationId: string): Promise<AgentExecution | null>;
  claimNext(
    organizationId: string,
    now?: Date
  ): Promise<AgentExecution | null>;
  claimBatch(limit: number, now?: Date): Promise<AgentExecution[]>;
  recoverStaleRunning(
    staleAfterMinutes: number,
    now?: Date
  ): Promise<AgentExecution[]>;
  list(filter: AgentExecutionListFilter): Promise<AgentExecutionListResult>;
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isRetryReady(execution: AgentExecution, now: Date): boolean {
  if (!execution.next_retry_at) {
    return true;
  }

  return execution.next_retry_at <= now.toISOString();
}

function dependencySatisfied(
  rows: Map<string, AgentExecution>,
  execution: AgentExecution
): boolean {
  if (!execution.depends_on_execution_id) {
    return true;
  }

  return rows.get(execution.depends_on_execution_id)?.status === "completed";
}

export class InMemoryAgentExecutionStore implements AgentExecutionStore {
  private rows = new Map<string, AgentExecution>();

  async insert(input: AgentExecutionInsert): Promise<AgentExecution> {
    const timestamp = nowIso();
    const row: AgentExecution = {
      id: createId("agent-exec"),
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
      started_at: null,
      completed_at: null,
      duration_ms: null,
      error_message: null,
      metadata: input.metadata ?? {},
      created_at: timestamp,
      updated_at: timestamp
    };

    this.rows.set(row.id, row);
    return row;
  }

  async update(
    id: string,
    organizationId: string,
    patch: AgentExecutionUpdate
  ): Promise<AgentExecution | null> {
    const existing = this.rows.get(id);

    if (!existing || existing.organization_id !== organizationId) {
      return null;
    }

    const updated: AgentExecution = {
      ...existing,
      ...patch,
      metadata: patch.metadata
        ? { ...existing.metadata, ...patch.metadata }
        : existing.metadata,
      updated_at: nowIso()
    };

    this.rows.set(id, updated);
    return updated;
  }

  async findById(
    id: string,
    organizationId: string
  ): Promise<AgentExecution | null> {
    const row = this.rows.get(id);

    if (!row || row.organization_id !== organizationId) {
      return null;
    }

    return row;
  }

  async findNextRunnable(organizationId: string): Promise<AgentExecution | null> {
    return this.claimNext(organizationId);
  }

  async claimNext(
    organizationId: string,
    now: Date = new Date()
  ): Promise<AgentExecution | null> {
    const queued = [...this.rows.values()]
      .filter(
        (row) =>
          row.organization_id === organizationId &&
          row.status === "queued" &&
          isRetryReady(row, now) &&
          dependencySatisfied(this.rows, row)
      )
      .sort(
        (left, right) =>
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id)
      );

    const candidate = queued[0];

    if (!candidate) {
      return null;
    }

    // Atomic-style claim: only transition from queued.
    if (candidate.status !== "queued") {
      return null;
    }

    const claimed: AgentExecution = {
      ...candidate,
      status: "running",
      started_at: nowIso(now),
      attempt_count: candidate.attempt_count + 1,
      error_message: null,
      updated_at: nowIso(now)
    };

    this.rows.set(claimed.id, claimed);
    return claimed;
  }

  async claimBatch(limit: number, now: Date = new Date()): Promise<AgentExecution[]> {
    const claimed: AgentExecution[] = [];
    const orgIds = [...new Set([...this.rows.values()].map((row) => row.organization_id))];

    for (const organizationId of orgIds) {
      while (claimed.length < limit) {
        const next = await this.claimNext(organizationId, now);

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

  async recoverStaleRunning(
    staleAfterMinutes: number,
    now: Date = new Date()
  ): Promise<AgentExecution[]> {
    const cutoff = new Date(
      now.getTime() - Math.max(1, staleAfterMinutes) * 60_000
    ).toISOString();
    const recovered: AgentExecution[] = [];

    for (const row of this.rows.values()) {
      if (
        row.status === "running" &&
        row.started_at &&
        row.started_at < cutoff
      ) {
        const updated: AgentExecution = {
          ...row,
          status: "queued",
          next_retry_at: nowIso(now),
          started_at: null,
          error_message: row.error_message ?? "Recovered stale running execution.",
          last_error_code: row.last_error_code ?? "stale_running",
          updated_at: nowIso(now)
        };
        this.rows.set(row.id, updated);
        recovered.push(updated);
      }
    }

    return recovered;
  }

  async list(filter: AgentExecutionListFilter): Promise<AgentExecutionListResult> {
    return paginateAgentExecutions([...this.rows.values()], filter);
  }

  snapshot(): AgentExecution[] {
    return [...this.rows.values()].sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    );
  }
}
