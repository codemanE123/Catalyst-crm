import { describe, expect, it } from "vitest";

import {
  buildAgentTargetHref,
  calculateAgentOperationsMetrics,
  matchesAgentExecutionFilters,
  paginateAgentExecutions,
  startOfUtcDay
} from "@/lib/agentOperations";
import type { AgentExecution } from "@/lib/agents/types";
import { sanitizeAgentErrorMessage } from "@/lib/agents/sanitize";
import {
  canAccessAgentOrganization,
  canManageAgentExecutions,
  canManageAgentOrganization,
  canViewAgentOperations,
  getAccessibleAgentOrganizationIds
} from "@/lib/authz";
import type { OrganizationMember } from "@/lib/supabase";

function member(
  role: OrganizationMember["role"],
  organizationId = "org-1"
): OrganizationMember {
  return {
    id: `${role}-${organizationId}`,
    organization_id: organizationId,
    user_id: "user-1",
    role,
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z"
  };
}

function execution(
  overrides: Partial<AgentExecution> = {}
): AgentExecution {
  return {
    id: "exec-1",
    organization_id: "org-1",
    agent_name: "MeetingPrepAgent",
    target_type: "school",
    target_id: "school-1",
    status: "completed",
    depends_on_execution_id: null,
    attempt_count: 0,
    max_attempts: 3,
    next_retry_at: null,
    last_error_code: null,
    started_at: "2026-07-14T10:00:00.000Z",
    completed_at: "2026-07-14T10:01:00.000Z",
    duration_ms: 1000,
    error_message: null,
    metadata: {},
    created_at: "2026-07-14T09:59:00.000Z",
    updated_at: "2026-07-14T10:01:00.000Z",
    ...overrides
  };
}

describe("agent operations authorization", () => {
  it("allows sales and admins to view, denies read_only", () => {
    expect(canViewAgentOperations([member("sales")])).toBe(true);
    expect(canViewAgentOperations([member("admin")])).toBe(true);
    expect(canViewAgentOperations([member("super_admin")])).toBe(true);
    expect(canViewAgentOperations([member("read_only")])).toBe(false);
    expect(canViewAgentOperations([])).toBe(false);
  });

  it("allows only admin and super_admin to manage executions", () => {
    expect(canManageAgentExecutions([member("sales")])).toBe(false);
    expect(canManageAgentExecutions([member("admin")])).toBe(true);
    expect(canManageAgentExecutions([member("super_admin")])).toBe(true);
  });

  it("scopes organization access for non-super-admins", () => {
    const memberships = [member("sales", "org-1"), member("admin", "org-2")];

    expect(canAccessAgentOrganization(memberships, "org-1")).toBe(true);
    expect(canAccessAgentOrganization(memberships, "org-3")).toBe(false);
    expect(canManageAgentOrganization(memberships, "org-1")).toBe(false);
    expect(canManageAgentOrganization(memberships, "org-2")).toBe(true);
    expect(getAccessibleAgentOrganizationIds(memberships)).toEqual([
      "org-1",
      "org-2"
    ]);
    expect(getAccessibleAgentOrganizationIds([member("super_admin")])).toBeNull();
  });
});

describe("agent operations metrics", () => {
  it("calculates queue and today counts from executions", () => {
    const todayStart = startOfUtcDay(new Date("2026-07-14T15:00:00.000Z"));

    const metrics = calculateAgentOperationsMetrics({
      executions: [
        execution({ id: "1", status: "queued", completed_at: null }),
        execution({ id: "2", status: "running", completed_at: null }),
        execution({
          id: "3",
          status: "completed",
          completed_at: "2026-07-14T12:00:00.000Z"
        }),
        execution({
          id: "4",
          status: "failed",
          completed_at: "2026-07-14T13:00:00.000Z"
        }),
        execution({
          id: "5",
          status: "failed",
          completed_at: "2026-07-13T13:00:00.000Z"
        })
      ],
      candidatesAwaitingReview: 4,
      enrichedCandidates: 2,
      outreachDraftsGenerated: 3,
      meetingBriefsGenerated: 1,
      proposalDraftsGenerated: 5,
      todayStartIso: todayStart
    });

    expect(metrics).toEqual({
      queued: 1,
      running: 1,
      completed_today: 1,
      failed_today: 1,
      candidates_awaiting_review: 4,
      enriched_candidates: 2,
      outreach_drafts_generated: 3,
      meeting_briefs_generated: 1,
      proposal_drafts_generated: 5
    });
  });
});

describe("agent operations filters and pagination", () => {
  it("scopes by organization and paginates", () => {
    const rows = [
      execution({ id: "a", organization_id: "org-1", created_at: "2026-07-14T12:00:00.000Z" }),
      execution({ id: "b", organization_id: "org-2", created_at: "2026-07-14T11:00:00.000Z" }),
      execution({ id: "c", organization_id: "org-1", created_at: "2026-07-14T10:00:00.000Z" })
    ];

    expect(
      matchesAgentExecutionFilters(rows[1]!, { organizationIds: ["org-1"] })
    ).toBe(false);

    const page = paginateAgentExecutions(rows, {
      organizationIds: ["org-1"],
      limit: 1,
      offset: 0
    });

    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual(["a"]);
  });
});

describe("agent operations privacy helpers", () => {
  it("sanitizes error summaries for display", () => {
    expect(
      sanitizeAgentErrorMessage("failed for alice@example.com token sk-secret123")
    ).toContain("[redacted]");
    expect(
      sanitizeAgentErrorMessage("failed for alice@example.com token sk-secret123")
    ).not.toContain("alice@example.com");
  });

  it("builds safe related links without exposing private data", () => {
    expect(
      buildAgentTargetHref({
        target_type: "school",
        target_id: "school-1"
      })
    ).toBe("/schools/school-1");

    expect(
      buildAgentTargetHref({
        target_type: "prospect_generation_job",
        target_id: "job-1"
      })
    ).toBe("/prospects/jobs/job-1/review");

    expect(
      buildAgentTargetHref({
        target_type: "prospect_candidate",
        target_id: "candidate-1",
        metadata: { job_id: "job-9" }
      })
    ).toBe("/prospects/jobs/job-9/review");
  });
});
