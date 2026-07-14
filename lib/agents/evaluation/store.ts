import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AgentEvaluation,
  AgentEvaluationInsert,
  AgentEvaluationMetadata,
  AgentEvaluationOutcome,
  AgentEvaluationType,
  AgentEvaluatorType
} from "./types";
import { buildQualityResult } from "./types";

type EvaluationRow = {
  id: string;
  organization_id: string;
  agent_execution_id: string | null;
  agent_name: string | null;
  target_type: string | null;
  target_id: string | null;
  evaluation_type: AgentEvaluationType;
  evaluator_type: AgentEvaluatorType;
  evaluator_user_id: string | null;
  score: number | string | null;
  outcome: AgentEvaluationOutcome | null;
  feedback: string | null;
  metadata: AgentEvaluationMetadata | null;
  created_at: string;
  updated_at: string;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: EvaluationRow): AgentEvaluation {
  return {
    id: row.id,
    organization_id: row.organization_id,
    agent_execution_id: row.agent_execution_id,
    agent_name: row.agent_name,
    target_type: row.target_type,
    target_id: row.target_id,
    evaluation_type: row.evaluation_type,
    evaluator_type: row.evaluator_type,
    evaluator_user_id: row.evaluator_user_id,
    score: toNumber(row.score),
    outcome: row.outcome,
    feedback: row.feedback,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const SELECT_COLUMNS =
  "id,organization_id,agent_execution_id,agent_name,target_type,target_id,evaluation_type,evaluator_type,evaluator_user_id,score,outcome,feedback,metadata,created_at,updated_at";

export class InMemoryAgentEvaluationStore {
  private rows: AgentEvaluation[] = [];

  async insert(input: AgentEvaluationInsert): Promise<AgentEvaluation> {
    const quality = buildQualityResult({
      dimensions: input.metadata?.dimensions,
      outcome: input.outcome,
      feedback: input.feedback
    });

    const row: AgentEvaluation = {
      id: `eval-${crypto.randomUUID()}`,
      organization_id: input.organization_id,
      agent_execution_id: input.agent_execution_id ?? null,
      agent_name: input.agent_name ?? null,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      evaluation_type: input.evaluation_type,
      evaluator_type: input.evaluator_type,
      evaluator_user_id: input.evaluator_user_id ?? null,
      score: input.score ?? quality.overall_score,
      outcome: input.outcome ?? null,
      feedback: input.feedback ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        dimensions: input.metadata?.dimensions,
        overall_score: quality.overall_score
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.rows.push(row);
    return row;
  }

  async update(
    id: string,
    organizationId: string,
    patch: Partial<AgentEvaluationInsert>
  ): Promise<AgentEvaluation | null> {
    const index = this.rows.findIndex(
      (row) => row.id === id && row.organization_id === organizationId
    );

    if (index < 0) {
      return null;
    }

    const existing = this.rows[index]!;
    const metadata = {
      ...existing.metadata,
      ...(patch.metadata ?? {})
    };
    const quality = buildQualityResult({
      dimensions: metadata.dimensions,
      outcome: patch.outcome ?? existing.outcome,
      feedback: patch.feedback ?? existing.feedback
    });

    const updated: AgentEvaluation = {
      ...existing,
      ...patch,
      score: patch.score ?? quality.overall_score ?? existing.score,
      metadata: {
        ...metadata,
        overall_score: quality.overall_score
      },
      updated_at: new Date().toISOString()
    };

    this.rows[index] = updated;
    return updated;
  }

  async listForExecution(
    organizationId: string,
    agentExecutionId: string
  ): Promise<AgentEvaluation[]> {
    return this.rows.filter(
      (row) =>
        row.organization_id === organizationId &&
        row.agent_execution_id === agentExecutionId
    );
  }

  async listForOrganizations(
    organizationIds: string[] | null,
    options?: { sinceIso?: string; limit?: number }
  ): Promise<AgentEvaluation[]> {
    return this.rows
      .filter((row) => {
        if (organizationIds && !organizationIds.includes(row.organization_id)) {
          return false;
        }

        if (options?.sinceIso && row.created_at < options.sinceIso) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, options?.limit ?? 2000);
  }

  getAll(): AgentEvaluation[] {
    return [...this.rows];
  }
}

export class SupabaseAgentEvaluationStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async insert(input: AgentEvaluationInsert): Promise<AgentEvaluation> {
    const quality = buildQualityResult({
      dimensions: input.metadata?.dimensions,
      outcome: input.outcome,
      feedback: input.feedback
    });

    const { data, error } = await this.supabase
      .from("agent_evaluations")
      .insert({
        organization_id: input.organization_id,
        agent_execution_id: input.agent_execution_id ?? null,
        agent_name: input.agent_name ?? null,
        target_type: input.target_type ?? null,
        target_id: input.target_id ?? null,
        evaluation_type: input.evaluation_type,
        evaluator_type: input.evaluator_type,
        evaluator_user_id: input.evaluator_user_id ?? null,
        score: input.score ?? quality.overall_score,
        outcome: input.outcome ?? null,
        feedback: input.feedback ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          dimensions: input.metadata?.dimensions,
          overall_score: quality.overall_score
        }
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create agent evaluation.");
    }

    return mapRow(data as EvaluationRow);
  }

  async update(
    id: string,
    organizationId: string,
    patch: Partial<AgentEvaluationInsert>
  ): Promise<AgentEvaluation | null> {
    const existing = await this.findById(id, organizationId);

    if (!existing) {
      return null;
    }

    const metadata = {
      ...existing.metadata,
      ...(patch.metadata ?? {})
    };
    const quality = buildQualityResult({
      dimensions: metadata.dimensions,
      outcome: patch.outcome ?? existing.outcome,
      feedback: patch.feedback ?? existing.feedback
    });

    const { data, error } = await this.supabase
      .from("agent_evaluations")
      .update({
        score: patch.score ?? quality.overall_score ?? existing.score,
        outcome: patch.outcome ?? existing.outcome,
        feedback: patch.feedback ?? existing.feedback,
        metadata: {
          ...metadata,
          overall_score: quality.overall_score
        },
        evaluation_type: patch.evaluation_type ?? existing.evaluation_type,
        agent_name: patch.agent_name ?? existing.agent_name
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error("Failed to update agent evaluation:", error.message);
      return null;
    }

    return data ? mapRow(data as EvaluationRow) : null;
  }

  async findById(
    id: string,
    organizationId: string
  ): Promise<AgentEvaluation | null> {
    const { data, error } = await this.supabase
      .from("agent_evaluations")
      .select(SELECT_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      console.error("Failed to load agent evaluation:", error.message);
      return null;
    }

    return data ? mapRow(data as EvaluationRow) : null;
  }

  async listForExecution(
    organizationId: string,
    agentExecutionId: string
  ): Promise<AgentEvaluation[]> {
    const { data, error } = await this.supabase
      .from("agent_evaluations")
      .select(SELECT_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("agent_execution_id", agentExecutionId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to list evaluations for execution:", error.message);
      return [];
    }

    return ((data ?? []) as EvaluationRow[]).map(mapRow);
  }

  async listForOrganizations(
    organizationIds: string[] | null,
    options?: { sinceIso?: string; limit?: number }
  ): Promise<AgentEvaluation[]> {
    if (organizationIds && organizationIds.length === 0) {
      return [];
    }

    let query = this.supabase
      .from("agent_evaluations")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(options?.limit ?? 2000);

    if (organizationIds) {
      query = query.in("organization_id", organizationIds);
    }

    if (options?.sinceIso) {
      query = query.gte("created_at", options.sinceIso);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to list agent evaluations:", error.message);
      return [];
    }

    return ((data ?? []) as EvaluationRow[]).map(mapRow);
  }
}
