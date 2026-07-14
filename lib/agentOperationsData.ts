import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAgentTargetHref,
  startOfUtcDay,
  type AgentExecutionListFilter,
  type AgentExecutionListResult,
  type AgentOperationsMetrics
} from "@/lib/agentOperations";
import { AGENT_NAMES, type AgentExecution } from "@/lib/agents/types";
import { sanitizeAgentErrorMessage } from "@/lib/agents/sanitize";
import { startOfUtcMonth, type AgentUsageTotals } from "@/lib/agents/usage";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import { SupabaseAgentExecutionStore } from "@/lib/agents/supabaseStore";
import { countAwaitingHumanReview } from "@/lib/approvals/data";

export type AgentOperationsOrganization = {
  id: string;
  name: string;
};

export type AgentExecutionListItem = AgentExecution & {
  organization_name: string;
  sanitized_error_message: string | null;
  target_href: string | null;
};

function applyOrgScope(
  filter: AgentExecutionListFilter,
  accessibleOrganizationIds: string[] | null
): AgentExecutionListFilter {
  if (accessibleOrganizationIds === null) {
    return filter;
  }

  if (filter.organizationId) {
    if (!accessibleOrganizationIds.includes(filter.organizationId)) {
      return { ...filter, organizationIds: [] };
    }

    return filter;
  }

  return {
    ...filter,
    organizationIds: accessibleOrganizationIds
  };
}

function resolveScopedOrganizationIds(
  accessibleOrganizationIds: string[] | null,
  organizationId?: string | null
): string[] | null {
  if (organizationId) {
    if (
      accessibleOrganizationIds !== null &&
      !accessibleOrganizationIds.includes(organizationId)
    ) {
      return [];
    }

    return [organizationId];
  }

  return accessibleOrganizationIds;
}

async function countWithFilters(
  supabase: SupabaseClient,
  table: string,
  organizationIds: string[] | null,
  filters: Record<string, string> = {},
  gteFilters: Record<string, string> = {}
): Promise<number> {
  if (organizationIds && organizationIds.length === 0) {
    return 0;
  }

  let query = supabase.from(table).select("id", { count: "exact", head: true });

  if (organizationIds) {
    query = query.in("organization_id", organizationIds);
  }

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  for (const [column, value] of Object.entries(gteFilters)) {
    query = query.gte(column, value);
  }

  const { count, error } = await query;

  if (error) {
    console.error(`Failed to count ${table}:`, error.message);
    return 0;
  }

  return count ?? 0;
}

export async function fetchAgentOperationsOrganizations(
  supabase: SupabaseClient,
  accessibleOrganizationIds: string[] | null
): Promise<AgentOperationsOrganization[]> {
  if (accessibleOrganizationIds && accessibleOrganizationIds.length === 0) {
    return [];
  }

  let query = supabase.from("organizations").select("id,name").order("name");

  if (accessibleOrganizationIds) {
    query = query.in("id", accessibleOrganizationIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load organizations for agent ops:", error.message);
    return [];
  }

  return (data ?? []) as AgentOperationsOrganization[];
}

export async function fetchAgentOperationsMetrics(
  supabase: SupabaseClient,
  accessibleOrganizationIds: string[] | null,
  organizationId?: string | null
): Promise<AgentOperationsMetrics> {
  const scopedIds = resolveScopedOrganizationIds(
    accessibleOrganizationIds,
    organizationId
  );
  const todayStart = startOfUtcDay();

  const [
    queued,
    running,
    completedToday,
    failedToday,
    candidatesAwaitingReview,
    awaitingHumanReview,
    enrichedCandidates,
    outreachDraftsGenerated,
    meetingBriefsGenerated,
    proposalDraftsGenerated
  ] = await Promise.all([
    countWithFilters(supabase, "agent_executions", scopedIds, {
      status: "queued"
    }),
    countWithFilters(supabase, "agent_executions", scopedIds, {
      status: "running"
    }),
    countWithFilters(
      supabase,
      "agent_executions",
      scopedIds,
      { status: "completed" },
      { completed_at: todayStart }
    ),
    countWithFilters(
      supabase,
      "agent_executions",
      scopedIds,
      { status: "failed" },
      { completed_at: todayStart }
    ),
    countWithFilters(supabase, "prospect_candidates", scopedIds, {
      status: "pending_review"
    }),
    countAwaitingHumanReview(supabase, scopedIds),
    countWithFilters(supabase, "prospect_candidates", scopedIds, {
      enrichment_status: "enriched"
    }),
    countWithFilters(supabase, "agent_executions", scopedIds, {
      agent_name: "OutreachDraftAgent",
      status: "completed"
    }),
    countWithFilters(supabase, "meeting_prep_briefs", scopedIds),
    countWithFilters(supabase, "proposal_drafts", scopedIds)
  ]);

  return {
    queued,
    running,
    completed_today: completedToday,
    failed_today: failedToday,
    candidates_awaiting_review: candidatesAwaitingReview,
    awaiting_human_review: awaitingHumanReview,
    enriched_candidates: enrichedCandidates,
    outreach_drafts_generated: outreachDraftsGenerated,
    meeting_briefs_generated: meetingBriefsGenerated,
    proposal_drafts_generated: proposalDraftsGenerated
  };
}

export async function fetchAgentOperationsUsage(
  supabase: SupabaseClient,
  accessibleOrganizationIds: string[] | null,
  organizationId?: string | null
): Promise<AgentUsageTotals> {
  const scopedIds = resolveScopedOrganizationIds(
    accessibleOrganizationIds,
    organizationId
  );
  const usageStore = new SupabaseAgentUsageStore(supabase);
  const summary = await usageStore.summarizeForDashboard({
    organizationIds: scopedIds,
    todayStartIso: startOfUtcDay(),
    monthStartIso: startOfUtcMonth()
  });

  const executionsToday = await countWithFilters(
    supabase,
    "agent_executions",
    scopedIds,
    {},
    { created_at: startOfUtcDay() }
  );

  return {
    ...summary,
    agent_executions_today: executionsToday
  };
}

export async function fetchAgentOperationsExecutions(
  supabase: SupabaseClient,
  accessibleOrganizationIds: string[] | null,
  filter: AgentExecutionListFilter
): Promise<
  AgentExecutionListResult & {
    organizations: AgentOperationsOrganization[];
    items: AgentExecutionListItem[];
  }
> {
  const scopedFilter = applyOrgScope(filter, accessibleOrganizationIds);
  const store = new SupabaseAgentExecutionStore(supabase);
  const [result, organizations] = await Promise.all([
    store.list(scopedFilter),
    fetchAgentOperationsOrganizations(supabase, accessibleOrganizationIds)
  ]);

  const organizationNameById = new Map(
    organizations.map((organization) => [organization.id, organization.name])
  );

  const items = result.rows.map((execution) =>
    toAgentExecutionListItem(execution, organizationNameById)
  );

  return {
    ...result,
    organizations,
    items
  };
}

export function toAgentExecutionListItem(
  execution: AgentExecution,
  organizationNameById: Map<string, string>
): AgentExecutionListItem {
  return {
    ...execution,
    organization_name:
      organizationNameById.get(execution.organization_id) ?? "Unknown organization",
    sanitized_error_message: execution.error_message
      ? sanitizeAgentErrorMessage(execution.error_message)
      : null,
    target_href: buildAgentTargetHref(execution)
  };
}

async function sumCostForAgentNames(
  supabase: SupabaseClient,
  organizationIds: string[] | null,
  agentNames: string[]
): Promise<number | null> {
  if (organizationIds && organizationIds.length === 0) {
    return 0;
  }

  let query = supabase
    .from("agent_usage_events")
    .select("estimated_cost_usd")
    .eq("status", "success")
    .in("agent_name", agentNames);

  if (organizationIds) {
    query = query.in("organization_id", organizationIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to sum agent spend:", error.message);
    return null;
  }

  let total = 0;
  let sawValue = false;

  for (const row of data ?? []) {
    const value = Number(
      (row as { estimated_cost_usd?: number | string | null }).estimated_cost_usd
    );
    if (Number.isFinite(value)) {
      total += value;
      sawValue = true;
    }
  }

  return sawValue ? total : null;
}

async function countAuditActions(
  supabase: SupabaseClient,
  organizationIds: string[] | null,
  action: string
): Promise<number> {
  if (organizationIds && organizationIds.length === 0) {
    return 0;
  }

  let query = supabase
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("action", action);

  if (organizationIds) {
    query = query.in("organization_id", organizationIds);
  }

  const { count, error } = await query;

  if (error) {
    console.error("Failed to count audit actions:", error.message);
    return 0;
  }

  return count ?? 0;
}

export async function fetchAgentPilotMonitoringSnapshot(
  supabase: SupabaseClient,
  accessibleOrganizationIds: string[] | null,
  organizationId?: string | null
): Promise<{
  candidatesApproved: number;
  candidatesRejected: number;
  policyDenials: number;
  budgetDenials: number;
  failedJobs: number;
  outreachDraftsGenerated: number;
  outreachDraftsSaved: number;
  prospectGenerationSpendUsd: number | null;
  outreachDraftSpendUsd: number | null;
}> {
  const scopedIds = resolveScopedOrganizationIds(
    accessibleOrganizationIds,
    organizationId
  );
  const todayStart = startOfUtcDay();

  const [
    candidatesApproved,
    candidatesRejected,
    policyDenials,
    budgetDenials,
    failedJobs,
    outreachDraftsGenerated,
    outreachDraftsSaved,
    prospectGenerationSpendUsd,
    outreachDraftSpendUsd
  ] = await Promise.all([
    countWithFilters(supabase, "prospect_candidates", scopedIds, {
      status: "approved"
    }),
    countWithFilters(supabase, "prospect_candidates", scopedIds, {
      status: "rejected"
    }),
    countWithFilters(supabase, "prospect_candidates", scopedIds, {
      enrichment_status: "policy_denied"
    }),
    countWithFilters(supabase, "prospect_candidates", scopedIds, {
      enrichment_status: "budget_denied"
    }),
    countWithFilters(
      supabase,
      "agent_executions",
      scopedIds,
      { status: "failed" },
      { completed_at: todayStart }
    ),
    countWithFilters(supabase, "agent_executions", scopedIds, {
      agent_name: "OutreachDraftAgent",
      status: "completed"
    }),
    countAuditActions(
      supabase,
      scopedIds,
      "prospect_candidate.outreach_draft_save"
    ),
    sumCostForAgentNames(supabase, scopedIds, [
      "ProspectGenerationAgent",
      "ProspectEnrichmentAgent"
    ]),
    sumCostForAgentNames(supabase, scopedIds, ["OutreachDraftAgent"])
  ]);

  return {
    candidatesApproved,
    candidatesRejected,
    policyDenials,
    budgetDenials,
    failedJobs,
    outreachDraftsGenerated,
    outreachDraftsSaved,
    prospectGenerationSpendUsd,
    outreachDraftSpendUsd
  };
}

export function isKnownAgentName(
  value: string
): value is (typeof AGENT_NAMES)[number] {
  return (AGENT_NAMES as readonly string[]).includes(value);
}
