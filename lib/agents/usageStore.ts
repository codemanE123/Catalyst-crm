import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildSafeUsageEventInsert,
  type AgentUsageEvent,
  type AgentUsageEventInsert,
  type AgentUsageStore,
  type AgentUsageTotals
} from "./usage";

type UsageRow = {
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
  estimated_cost_usd: number | string | null;
  status: AgentUsageEvent["status"];
  denial_reason_code: string | null;
  created_at: string;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: UsageRow): AgentUsageEvent {
  return {
    id: row.id,
    organization_id: row.organization_id,
    agent_execution_id: row.agent_execution_id,
    agent_name: row.agent_name,
    target_type: row.target_type,
    target_id: row.target_id,
    provider: row.provider,
    model: row.model,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    total_tokens: row.total_tokens,
    estimated_cost_usd: toNumber(row.estimated_cost_usd),
    status: row.status,
    denial_reason_code: row.denial_reason_code,
    created_at: row.created_at
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export class SupabaseAgentUsageStore implements AgentUsageStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async insert(input: AgentUsageEventInsert): Promise<AgentUsageEvent> {
    const safe = buildSafeUsageEventInsert(input);
    const { data, error } = await this.supabase
      .from("agent_usage_events")
      .insert({
        organization_id: safe.organization_id,
        agent_execution_id: safe.agent_execution_id,
        agent_name: safe.agent_name,
        target_type: safe.target_type,
        target_id: safe.target_id,
        provider: safe.provider,
        model: safe.model,
        input_tokens: safe.input_tokens,
        output_tokens: safe.output_tokens,
        total_tokens: safe.total_tokens,
        estimated_cost_usd: safe.estimated_cost_usd,
        status: safe.status,
        denial_reason_code: safe.denial_reason_code
      })
      .select(
        "id,organization_id,agent_execution_id,agent_name,target_type,target_id,provider,model,input_tokens,output_tokens,total_tokens,estimated_cost_usd,status,denial_reason_code,created_at"
      )
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to record agent usage event.");
    }

    return mapRow(data as UsageRow);
  }

  async countLlmCallsSince(
    organizationId: string,
    sinceIso: string
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from("agent_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", sinceIso)
      .not("provider", "is", null)
      .neq("status", "denied");

    if (error) {
      console.error("countLlmCallsSince failed:", error.message);
      return 0;
    }

    return count ?? 0;
  }

  async sumEstimatedCostSince(
    organizationId: string,
    sinceIso: string
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from("agent_usage_events")
      .select("estimated_cost_usd")
      .eq("organization_id", organizationId)
      .gte("created_at", sinceIso);

    if (error) {
      console.error("sumEstimatedCostSince failed:", error.message);
      return 0;
    }

    return (data ?? []).reduce((sum, row) => {
      return sum + (toNumber((row as { estimated_cost_usd: number | string | null }).estimated_cost_usd) ?? 0);
    }, 0);
  }

  async summarizeForDashboard(input: {
    organizationIds: string[] | null;
    todayStartIso: string;
    monthStartIso: string;
  }): Promise<AgentUsageTotals> {
    if (input.organizationIds && input.organizationIds.length === 0) {
      return emptyTotals();
    }

    let monthQuery = this.supabase
      .from("agent_usage_events")
      .select(
        "agent_name,model,provider,estimated_cost_usd,status,denial_reason_code,created_at"
      )
      .gte("created_at", input.monthStartIso)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (input.organizationIds) {
      monthQuery = monthQuery.in("organization_id", input.organizationIds);
    }

    const { data, error } = await monthQuery;

    if (error) {
      console.error("summarizeForDashboard failed:", error.message);
      return emptyTotals();
    }

    const rows = (data ?? []) as Array<{
      agent_name: string | null;
      model: string | null;
      provider: string | null;
      estimated_cost_usd: number | string | null;
      status: string;
      denial_reason_code: string | null;
      created_at: string;
    }>;

    const todayRows = rows.filter((row) => row.created_at >= input.todayStartIso);
    const byAgent = new Map<string, { events: number; estimated_cost_usd: number }>();
    const byModel = new Map<string, { events: number; estimated_cost_usd: number }>();
    const denied = new Map<string, number>();

    for (const row of todayRows) {
      const cost = toNumber(row.estimated_cost_usd) ?? 0;

      if (row.agent_name) {
        const current = byAgent.get(row.agent_name) ?? {
          events: 0,
          estimated_cost_usd: 0
        };
        current.events += 1;
        current.estimated_cost_usd += cost;
        byAgent.set(row.agent_name, current);
      }

      if (row.model) {
        const current = byModel.get(row.model) ?? {
          events: 0,
          estimated_cost_usd: 0
        };
        current.events += 1;
        current.estimated_cost_usd += cost;
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
        todayRows.reduce(
          (sum, row) => sum + (toNumber(row.estimated_cost_usd) ?? 0),
          0
        )
      ),
      estimated_spend_month_usd: roundUsd(
        rows.reduce(
          (sum, row) => sum + (toNumber(row.estimated_cost_usd) ?? 0),
          0
        )
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
}

function emptyTotals(): AgentUsageTotals {
  return {
    llm_calls_today: 0,
    agent_executions_today: 0,
    estimated_spend_today_usd: 0,
    estimated_spend_month_usd: 0,
    usage_by_agent: [],
    usage_by_model: [],
    denied_by_reason: []
  };
}
