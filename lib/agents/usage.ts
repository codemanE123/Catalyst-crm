import {
  estimateLlmCostUsd,
  sumTokenCounts
} from "@/lib/llm/pricing";

import type { AgentName } from "./types";
import type { AgentPolicyReasonCode } from "./policy";

export const AGENT_USAGE_STATUSES = [
  "success",
  "failed",
  "denied",
  "blocked"
] as const;

export type AgentUsageStatus = (typeof AGENT_USAGE_STATUSES)[number];

export type AgentUsageEvent = {
  id: string;
  organization_id: string;
  agent_execution_id: string | null;
  agent_name: string | null;
  target_type: string | null;
  target_id: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  status: AgentUsageStatus;
  denial_reason_code: string | null;
  created_at: string;
};

export type AgentUsageEventInsert = {
  organization_id: string;
  agent_execution_id?: string | null;
  agent_name?: AgentName | string | null;
  target_type?: string | null;
  target_id?: string | null;
  provider?: string | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
  status: AgentUsageStatus;
  denial_reason_code?: string | null;
  created_at?: string;
};

/**
 * Sanitized usage insert — never stores prompts, raw LLM output, tokens/cookies/emails.
 */
export function buildSafeUsageEventInsert(
  input: AgentUsageEventInsert
): AgentUsageEventInsert {
  const inputTokens =
    input.input_tokens == null || !Number.isFinite(input.input_tokens)
      ? null
      : Math.max(0, Math.floor(input.input_tokens));
  const outputTokens =
    input.output_tokens == null || !Number.isFinite(input.output_tokens)
      ? null
      : Math.max(0, Math.floor(input.output_tokens));

  const totalTokens =
    input.total_tokens != null && Number.isFinite(input.total_tokens)
      ? Math.max(0, Math.floor(input.total_tokens))
      : sumTokenCounts(inputTokens, outputTokens);

  const estimatedCost =
    input.estimated_cost_usd != null && Number.isFinite(input.estimated_cost_usd)
      ? input.estimated_cost_usd
      : estimateLlmCostUsd({
          model: input.model,
          inputTokens,
          outputTokens
        });

  return {
    organization_id: input.organization_id,
    agent_execution_id: input.agent_execution_id ?? null,
    agent_name: input.agent_name ?? null,
    target_type: input.target_type ?? null,
    target_id: input.target_id ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCost,
    status: input.status,
    denial_reason_code: input.denial_reason_code ?? null,
    created_at: input.created_at
  };
}

export function usageEventContainsDisallowedPayload(
  event: Record<string, unknown>
): boolean {
  const forbiddenKeys = [
    "prompt",
    "prompts",
    "raw_response",
    "raw_llm",
    "completion",
    "messages",
    "api_key",
    "cookie",
    "cookies",
    "email",
    "token",
    "private_notes"
  ];

  return Object.keys(event).some((key) =>
    forbiddenKeys.includes(key.toLowerCase())
  );
}

export type AgentUsageTotals = {
  llm_calls_today: number;
  agent_executions_today: number;
  estimated_spend_today_usd: number;
  estimated_spend_month_usd: number;
  usage_by_agent: Array<{ agent_name: string; events: number; estimated_cost_usd: number }>;
  usage_by_model: Array<{ model: string; events: number; estimated_cost_usd: number }>;
  denied_by_reason: Array<{ reason_code: string; count: number }>;
};

export type AgentUsageStore = {
  insert(input: AgentUsageEventInsert): Promise<AgentUsageEvent>;
  countLlmCallsSince(
    organizationId: string,
    sinceIso: string
  ): Promise<number>;
  sumEstimatedCostSince(
    organizationId: string,
    sinceIso: string
  ): Promise<number>;
  summarizeForDashboard(input: {
    organizationIds: string[] | null;
    todayStartIso: string;
    monthStartIso: string;
  }): Promise<AgentUsageTotals>;
};

function createId(): string {
  return `usage-${crypto.randomUUID()}`;
}

export class InMemoryAgentUsageStore implements AgentUsageStore {
  private rows: AgentUsageEvent[] = [];

  async insert(input: AgentUsageEventInsert): Promise<AgentUsageEvent> {
    const safe = buildSafeUsageEventInsert(input);
    const row: AgentUsageEvent = {
      id: createId(),
      organization_id: safe.organization_id,
      agent_execution_id: safe.agent_execution_id ?? null,
      agent_name: safe.agent_name ?? null,
      target_type: safe.target_type ?? null,
      target_id: safe.target_id ?? null,
      provider: safe.provider ?? null,
      model: safe.model ?? null,
      input_tokens: safe.input_tokens ?? null,
      output_tokens: safe.output_tokens ?? null,
      total_tokens: safe.total_tokens ?? null,
      estimated_cost_usd: safe.estimated_cost_usd ?? null,
      status: safe.status,
      denial_reason_code: safe.denial_reason_code ?? null,
      created_at: safe.created_at ?? new Date().toISOString()
    };

    this.rows.push(row);
    return row;
  }

  async countLlmCallsSince(
    organizationId: string,
    sinceIso: string
  ): Promise<number> {
    return this.rows.filter(
      (row) =>
        row.organization_id === organizationId &&
        row.created_at >= sinceIso &&
        row.provider != null &&
        row.status !== "denied"
    ).length;
  }

  async sumEstimatedCostSince(
    organizationId: string,
    sinceIso: string
  ): Promise<number> {
    return this.rows
      .filter(
        (row) =>
          row.organization_id === organizationId && row.created_at >= sinceIso
      )
      .reduce((sum, row) => sum + (row.estimated_cost_usd ?? 0), 0);
  }

  async summarizeForDashboard(input: {
    organizationIds: string[] | null;
    todayStartIso: string;
    monthStartIso: string;
  }): Promise<AgentUsageTotals> {
    const scoped = this.rows.filter((row) => {
      if (input.organizationIds === null) {
        return true;
      }

      return input.organizationIds.includes(row.organization_id);
    });

    const todayRows = scoped.filter((row) => row.created_at >= input.todayStartIso);
    const monthRows = scoped.filter((row) => row.created_at >= input.monthStartIso);

    const byAgent = new Map<string, { events: number; estimated_cost_usd: number }>();
    const byModel = new Map<string, { events: number; estimated_cost_usd: number }>();
    const denied = new Map<string, number>();

    for (const row of todayRows) {
      if (row.agent_name) {
        const current = byAgent.get(row.agent_name) ?? {
          events: 0,
          estimated_cost_usd: 0
        };
        current.events += 1;
        current.estimated_cost_usd += row.estimated_cost_usd ?? 0;
        byAgent.set(row.agent_name, current);
      }

      if (row.model) {
        const current = byModel.get(row.model) ?? {
          events: 0,
          estimated_cost_usd: 0
        };
        current.events += 1;
        current.estimated_cost_usd += row.estimated_cost_usd ?? 0;
        byModel.set(row.model, current);
      }

      if (row.status === "denied" && row.denial_reason_code) {
        denied.set(
          row.denial_reason_code,
          (denied.get(row.denial_reason_code) ?? 0) + 1
        );
      }
    }

    return {
      llm_calls_today: todayRows.filter((row) => row.provider != null).length,
      agent_executions_today: 0,
      estimated_spend_today_usd: roundUsd(
        todayRows.reduce((sum, row) => sum + (row.estimated_cost_usd ?? 0), 0)
      ),
      estimated_spend_month_usd: roundUsd(
        monthRows.reduce((sum, row) => sum + (row.estimated_cost_usd ?? 0), 0)
      ),
      usage_by_agent: [...byAgent.entries()]
        .map(([agent_name, value]) => ({
          agent_name,
          events: value.events,
          estimated_cost_usd: roundUsd(value.estimated_cost_usd)
        }))
        .sort((a, b) => b.events - a.events),
      usage_by_model: [...byModel.entries()]
        .map(([model, value]) => ({
          model,
          events: value.events,
          estimated_cost_usd: roundUsd(value.estimated_cost_usd)
        }))
        .sort((a, b) => b.events - a.events),
      denied_by_reason: [...denied.entries()]
        .map(([reason_code, count]) => ({ reason_code, count }))
        .sort((a, b) => b.count - a.count)
    };
  }

  getAll(): AgentUsageEvent[] {
    return [...this.rows];
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function startOfUtcMonth(reference: Date = new Date()): string {
  return new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0)
  ).toISOString();
}

export function hoursAgoIso(hours: number, reference: Date = new Date()): string {
  return new Date(reference.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export type RecordLlmUsageInput = {
  organizationId: string;
  agentExecutionId?: string | null;
  agentName?: AgentName | string | null;
  targetType?: string | null;
  targetId?: string | null;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status: AgentUsageStatus;
  denialReasonCode?: AgentPolicyReasonCode | string | null;
};

export async function recordLlmUsageEvent(
  store: AgentUsageStore,
  input: RecordLlmUsageInput
): Promise<AgentUsageEvent> {
  return store.insert(
    buildSafeUsageEventInsert({
      organization_id: input.organizationId,
      agent_execution_id: input.agentExecutionId ?? null,
      agent_name: input.agentName ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      status: input.status,
      denial_reason_code: input.denialReasonCode ?? null
    })
  );
}
