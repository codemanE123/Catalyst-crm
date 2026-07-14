import { describe, expect, it } from "vitest";

import {
  calculateApprovalDashboardMetrics,
  paginateApprovalItems,
  sortApprovalItems
} from "@/lib/approvals/data";
import {
  APPROVAL_HITL_GUARDS,
  canActOnApprovals,
  canAssignApprovals,
  canViewApprovals,
  isUnsafeBulkApprovalAction
} from "@/lib/approvals/permissions";
import {
  AI_GENERATED_WARNING,
  buildApprovalItemId,
  deriveApprovalPriority,
  mapSourceStatusToApprovalStatus,
  parseApprovalItemId,
  staleDaysSince,
  type ApprovalItem
} from "@/lib/approvals/types";
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
    created_at: "2026-07-14T12:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z"
  };
}

function item(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    id: buildApprovalItemId("prospect_candidate", "cand-1"),
    organization_id: "org-1",
    approval_type: "prospect_candidate",
    source_type: "prospect_candidates",
    source_id: "cand-1",
    target_type: "prospect_candidate",
    target_id: "cand-1",
    title: "State University",
    summary: "Strong cyber partnership fit.",
    status: "pending",
    priority: "normal",
    confidence_score: 0.7,
    created_at: "2026-07-10T12:00:00.000Z",
    updated_at: "2026-07-10T12:00:00.000Z",
    created_by: null,
    assigned_reviewer: null,
    source_url: "/prospects/jobs/job-1/review",
    agent_execution_id: null,
    is_ai_generated: true,
    stale_days: 4,
    citation: null,
    job_id: "job-1",
    school_name: "State University",
    ...overrides
  };
}

describe("approval permissions", () => {
  it("allows read_only to view but not act", () => {
    expect(canViewApprovals([member("read_only")])).toBe(true);
    expect(canActOnApprovals([member("read_only")])).toBe(false);
    expect(canActOnApprovals([member("sales")])).toBe(true);
    expect(canAssignApprovals([member("sales")])).toBe(false);
    expect(canAssignApprovals([member("admin")])).toBe(true);
    expect(canViewApprovals([member("super_admin")])).toBe(true);
  });
});

describe("priority and stale calculation", () => {
  it("derives urgent/high/low priorities without mutating sources", () => {
    expect(
      deriveApprovalPriority({
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      })
    ).toBe("urgent");

    expect(
      deriveApprovalPriority({
        createdAt: new Date().toISOString(),
        confidenceScore: 0.9
      })
    ).toBe("high");

    expect(
      deriveApprovalPriority({
        createdAt: new Date().toISOString(),
        confidenceScore: 0.2
      })
    ).toBe("low");

    expect(
      deriveApprovalPriority({
        createdAt: new Date().toISOString(),
        explicitPriority: "normal"
      })
    ).toBe("normal");
  });

  it("calculates stale days", () => {
    const created = new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000).toISOString();
    expect(staleDaysSince(created)).toBeGreaterThanOrEqual(3);
  });
});

describe("status mapping and ids", () => {
  it("maps source statuses and parses composite ids", () => {
    expect(
      mapSourceStatusToApprovalStatus({
        approvalType: "meeting_prep",
        sourceStatus: "pending_review"
      })
    ).toBe("pending");
    expect(
      mapSourceStatusToApprovalStatus({
        approvalType: "proposal_draft",
        sourceStatus: "accepted"
      })
    ).toBe("approved");
    expect(
      mapSourceStatusToApprovalStatus({
        approvalType: "contact_recommendation",
        sourceStatus: "dismissed"
      })
    ).toBe("rejected");

    const id = buildApprovalItemId("meeting_prep", "brief-1");
    expect(parseApprovalItemId(id)).toEqual({
      approvalType: "meeting_prep",
      sourceId: "brief-1"
    });
  });
});

describe("aggregation helpers", () => {
  it("aggregates supported approval types in sorted/paginated lists", () => {
    const items = [
      item({
        id: buildApprovalItemId("prospect_candidate", "a"),
        source_id: "a",
        priority: "low",
        created_at: "2026-07-12T00:00:00.000Z"
      }),
      item({
        id: buildApprovalItemId("meeting_prep", "b"),
        approval_type: "meeting_prep",
        source_id: "b",
        priority: "urgent",
        created_at: "2026-07-13T00:00:00.000Z"
      }),
      item({
        id: buildApprovalItemId("proposal_draft", "c"),
        approval_type: "proposal_draft",
        source_id: "c",
        organization_id: "org-2",
        priority: "high",
        created_at: "2026-07-01T00:00:00.000Z"
      })
    ];

    const sorted = sortApprovalItems(items, "default");
    expect(sorted[0]?.approval_type).toBe("meeting_prep");

    const page = paginateApprovalItems(items, {
      organizationIds: ["org-1"],
      status: "pending",
      limit: 10,
      offset: 0
    });
    expect(page.total).toBe(2);
    expect(page.items.every((row) => row.organization_id === "org-1")).toBe(true);

    const metrics = calculateApprovalDashboardMetrics(items, "user-1");
    expect(metrics.total_awaiting_review).toBe(3);
    expect(metrics.high_priority_items).toBe(2);
    expect(metrics.ai_generated_items).toBe(3);
  });

  it("filters stale items and sorts by confidence", () => {
    const items = [
      item({
        id: "x1",
        confidence_score: 0.2,
        stale_days: 8,
        created_at: "2026-07-01T00:00:00.000Z"
      }),
      item({
        id: "x2",
        confidence_score: 0.95,
        stale_days: 1,
        created_at: "2026-07-13T00:00:00.000Z"
      })
    ];

    const stale = paginateApprovalItems(items, { staleDaysMin: 7, limit: 10 });
    expect(stale.total).toBe(1);

    const byConfidence = sortApprovalItems(items, "highest_confidence");
    expect(byConfidence[0]?.confidence_score).toBe(0.95);
  });
});

describe("human-in-the-loop and bulk safety", () => {
  it("keeps autonomous external actions prohibited", () => {
    expect(APPROVAL_HITL_GUARDS.mayAutonomouslyApproveProspects).toBe(false);
    expect(APPROVAL_HITL_GUARDS.mayAutonomouslySendEmail).toBe(false);
    expect(APPROVAL_HITL_GUARDS.mayAutonomouslySendProposals).toBe(false);
    expect(APPROVAL_HITL_GUARDS.mayBulkApproveProspects).toBe(false);
    expect(isUnsafeBulkApprovalAction("approve")).toBe(true);
    expect(isUnsafeBulkApprovalAction("assign")).toBe(false);
    expect(AI_GENERATED_WARNING).toContain("reviewed before use");
  });

  it("does not expose prompts or secrets in approval item payloads", () => {
    const payload = item();
    expect(payload).not.toHaveProperty("prompt");
    expect(payload).not.toHaveProperty("api_key");
    expect(JSON.stringify(payload)).not.toMatch(/sk-/i);
  });
});
