import type { AgentExecution, AgentExecutionMetadata, AgentName } from "./types";

export type AgentExecutionInsert = {
  organization_id: string;
  agent_name: AgentName;
  target_type: string;
  target_id: string;
  status: AgentExecution["status"];
  depends_on_execution_id?: string | null;
  attempt_count?: number;
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
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
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
    const queued = [...this.rows.values()]
      .filter(
        (row) => row.organization_id === organizationId && row.status === "queued"
      )
      .sort(
        (left, right) =>
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id)
      );

    for (const candidate of queued) {
      if (!candidate.depends_on_execution_id) {
        return candidate;
      }

      const dependency = this.rows.get(candidate.depends_on_execution_id);

      if (dependency?.status === "completed") {
        return candidate;
      }
    }

    return null;
  }

  snapshot(): AgentExecution[] {
    return [...this.rows.values()].sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    );
  }
}
