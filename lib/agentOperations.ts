import type {
  AgentExecution,
  AgentExecutionStatus,
  AgentName
} from "@/lib/agents/types";

export type AgentExecutionListFilter = {
  organizationIds?: string[] | null;
  organizationId?: string | null;
  status?: AgentExecutionStatus | null;
  agentName?: AgentName | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  limit?: number;
  offset?: number;
};

export type AgentExecutionListResult = {
  rows: AgentExecution[];
  total: number;
};

export type AgentOperationsMetrics = {
  queued: number;
  running: number;
  completed_today: number;
  failed_today: number;
  candidates_awaiting_review: number;
  enriched_candidates: number;
  outreach_drafts_generated: number;
  meeting_briefs_generated: number;
  proposal_drafts_generated: number;
};

export function startOfUtcDay(reference: Date = new Date()): string {
  const start = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  return start.toISOString();
}

export function matchesAgentExecutionFilters(
  execution: AgentExecution,
  filter: AgentExecutionListFilter
): boolean {
  if (filter.organizationId && execution.organization_id !== filter.organizationId) {
    return false;
  }

  if (
    filter.organizationIds &&
    filter.organizationIds.length > 0 &&
    !filter.organizationIds.includes(execution.organization_id)
  ) {
    return false;
  }

  if (filter.status && execution.status !== filter.status) {
    return false;
  }

  if (filter.agentName && execution.agent_name !== filter.agentName) {
    return false;
  }

  if (filter.createdFrom && execution.created_at < filter.createdFrom) {
    return false;
  }

  if (filter.createdTo && execution.created_at > filter.createdTo) {
    return false;
  }

  return true;
}

export function paginateAgentExecutions(
  executions: AgentExecution[],
  filter: AgentExecutionListFilter
): AgentExecutionListResult {
  const filtered = executions
    .filter((execution) => matchesAgentExecutionFilters(execution, filter))
    .sort(
      (left, right) =>
        right.created_at.localeCompare(left.created_at) ||
        right.id.localeCompare(left.id)
    );

  const offset = Math.max(0, filter.offset ?? 0);
  const limit = Math.max(1, Math.min(100, filter.limit ?? 25));

  return {
    total: filtered.length,
    rows: filtered.slice(offset, offset + limit)
  };
}

export function calculateAgentOperationsMetrics(input: {
  executions: AgentExecution[];
  candidatesAwaitingReview: number;
  enrichedCandidates: number;
  outreachDraftsGenerated: number;
  meetingBriefsGenerated: number;
  proposalDraftsGenerated: number;
  todayStartIso?: string;
}): AgentOperationsMetrics {
  const todayStart = input.todayStartIso ?? startOfUtcDay();

  let queued = 0;
  let running = 0;
  let completedToday = 0;
  let failedToday = 0;

  for (const execution of input.executions) {
    if (execution.status === "queued") {
      queued += 1;
    }

    if (execution.status === "running") {
      running += 1;
    }

    if (
      execution.status === "completed" &&
      execution.completed_at &&
      execution.completed_at >= todayStart
    ) {
      completedToday += 1;
    }

    if (
      execution.status === "failed" &&
      execution.completed_at &&
      execution.completed_at >= todayStart
    ) {
      failedToday += 1;
    }
  }

  return {
    queued,
    running,
    completed_today: completedToday,
    failed_today: failedToday,
    candidates_awaiting_review: input.candidatesAwaitingReview,
    enriched_candidates: input.enrichedCandidates,
    outreach_drafts_generated: input.outreachDraftsGenerated,
    meeting_briefs_generated: input.meetingBriefsGenerated,
    proposal_drafts_generated: input.proposalDraftsGenerated
  };
}

export function buildAgentTargetHref(execution: {
  target_type: string;
  target_id: string;
  metadata?: Record<string, string | number | boolean | null>;
}): string | null {
  if (execution.target_type === "school") {
    return `/schools/${execution.target_id}`;
  }

  if (execution.target_type === "prospect_candidate") {
    const jobId = execution.metadata?.job_id;

    if (typeof jobId === "string" && jobId.trim()) {
      return `/prospects/jobs/${jobId}/review`;
    }

    return null;
  }

  if (execution.target_type === "prospect_generation_job") {
    return `/prospects/jobs/${execution.target_id}/review`;
  }

  return null;
}
