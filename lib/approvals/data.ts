import type { SupabaseClient } from "@supabase/supabase-js";

import { startOfUtcDay } from "@/lib/agentOperations";

import {
  APPROVAL_TYPES,
  buildApprovalItemId,
  deriveApprovalPriority,
  mapSourceStatusToApprovalStatus,
  priorityRank,
  staleDaysSince,
  type ApprovalDashboardMetrics,
  type ApprovalItem,
  type ApprovalListFilter,
  type ApprovalListResult,
  type ApprovalPriority,
  type ApprovalSort,
  type ApprovalStatus,
  type ApprovalType
} from "./types";

type AssignmentRow = {
  approval_type: ApprovalType;
  source_id: string;
  assigned_to: string;
  priority: ApprovalPriority | null;
};

type OrgNameRow = { id: string; name: string };

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const FETCH_CAP_PER_SOURCE = 200;

function resolvePageSize(limit?: number): number {
  return Math.max(1, Math.min(MAX_PAGE_SIZE, limit ?? DEFAULT_PAGE_SIZE));
}

function resolveOrgScope(
  filter: ApprovalListFilter
): string[] | null | "empty" {
  if (filter.organizationId) {
    if (
      filter.organizationIds &&
      filter.organizationIds.length > 0 &&
      !filter.organizationIds.includes(filter.organizationId)
    ) {
      return "empty";
    }

    if (
      filter.organizationIds === null ||
      filter.organizationIds === undefined
    ) {
      return [filter.organizationId];
    }

    return [filter.organizationId];
  }

  if (filter.organizationIds === null) {
    return null;
  }

  if (filter.organizationIds && filter.organizationIds.length === 0) {
    return "empty";
  }

  return filter.organizationIds ?? null;
}

function applyOrgFilter<T extends { eq: (column: string, value: string) => T; in: (column: string, values: string[]) => T }>(
  query: T,
  orgIds: string[] | null
): T {
  if (orgIds === null) {
    return query;
  }

  if (orgIds.length === 1) {
    return query.eq("organization_id", orgIds[0]) as T;
  }

  return query.in("organization_id", orgIds) as T;
}

function matchesFilter(
  item: ApprovalItem,
  filter: ApprovalListFilter
): boolean {
  if (filter.organizationId && item.organization_id !== filter.organizationId) {
    return false;
  }

  if (
    filter.organizationIds &&
    filter.organizationIds.length > 0 &&
    !filter.organizationIds.includes(item.organization_id)
  ) {
    return false;
  }

  if (filter.approvalType && item.approval_type !== filter.approvalType) {
    return false;
  }

  if (filter.status && item.status !== filter.status) {
    return false;
  }

  if (filter.priority && item.priority !== filter.priority) {
    return false;
  }

  if (filter.assignedReviewer && item.assigned_reviewer !== filter.assignedReviewer) {
    return false;
  }

  if (filter.assignedToMe && filter.currentUserId) {
    if (item.assigned_reviewer !== filter.currentUserId) {
      return false;
    }
  }

  if (filter.createdFrom && item.created_at < filter.createdFrom) {
    return false;
  }

  if (filter.createdTo && item.created_at > filter.createdTo) {
    return false;
  }

  if (
    filter.confidenceMin != null &&
    (item.confidence_score == null || item.confidence_score < filter.confidenceMin)
  ) {
    return false;
  }

  if (
    filter.confidenceMax != null &&
    (item.confidence_score == null || item.confidence_score > filter.confidenceMax)
  ) {
    return false;
  }

  if (filter.staleDaysMin != null && item.stale_days < filter.staleDaysMin) {
    return false;
  }

  if (filter.targetQuery?.trim()) {
    const q = filter.targetQuery.trim().toLowerCase();
    const haystack = [
      item.title,
      item.summary,
      item.school_name ?? "",
      item.target_id
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(q)) {
      return false;
    }
  }

  return true;
}

export function sortApprovalItems(
  items: ApprovalItem[],
  sort: ApprovalSort = "default"
): ApprovalItem[] {
  const copy = [...items];

  copy.sort((left, right) => {
    if (sort === "newest") {
      return right.created_at.localeCompare(left.created_at);
    }

    if (sort === "oldest") {
      return left.created_at.localeCompare(right.created_at);
    }

    if (sort === "highest_confidence") {
      return (right.confidence_score ?? -1) - (left.confidence_score ?? -1);
    }

    if (sort === "lowest_confidence") {
      return (left.confidence_score ?? 2) - (right.confidence_score ?? 2);
    }

    if (sort === "highest_priority") {
      const byPriority = priorityRank(right.priority) - priorityRank(left.priority);
      if (byPriority !== 0) {
        return byPriority;
      }

      return left.created_at.localeCompare(right.created_at);
    }

    // default: high priority first, then oldest pending
    const byPriority = priorityRank(right.priority) - priorityRank(left.priority);
    if (byPriority !== 0) {
      return byPriority;
    }

    return left.created_at.localeCompare(right.created_at);
  });

  return copy;
}

export function paginateApprovalItems(
  items: ApprovalItem[],
  filter: ApprovalListFilter
): ApprovalListResult {
  const filtered = sortApprovalItems(
    items.filter((item) => matchesFilter(item, filter)),
    filter.sort ?? "default"
  );
  const pageSize = resolvePageSize(filter.limit);
  const offset = Math.max(0, filter.offset ?? 0);
  const page = Math.floor(offset / pageSize) + 1;

  return {
    items: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    pageSize
  };
}

export function calculateApprovalDashboardMetrics(
  items: ApprovalItem[],
  currentUserId: string | null,
  todayStartIso: string = startOfUtcDay()
): ApprovalDashboardMetrics {
  const pending = items.filter((item) => item.status === "pending");
  let oldestMs: number | null = null;

  for (const item of pending) {
    const created = Date.parse(item.created_at);
    if (!Number.isFinite(created)) {
      continue;
    }

    if (oldestMs == null || created < oldestMs) {
      oldestMs = created;
    }
  }

  return {
    total_awaiting_review: pending.length,
    high_priority_items: pending.filter(
      (item) => item.priority === "high" || item.priority === "urgent"
    ).length,
    ai_generated_items: pending.filter((item) => item.is_ai_generated).length,
    assigned_to_me: pending.filter(
      (item) => currentUserId && item.assigned_reviewer === currentUserId
    ).length,
    oldest_pending_age_hours:
      oldestMs == null
        ? null
        : Math.max(0, Math.floor((Date.now() - oldestMs) / (60 * 60 * 1000))),
    approved_today: items.filter(
      (item) =>
        item.status === "approved" &&
        item.updated_at >= todayStartIso
    ).length,
    rejected_today: items.filter(
      (item) =>
        item.status === "rejected" &&
        item.updated_at >= todayStartIso
    ).length
  };
}

function sourceHref(input: {
  approvalType: ApprovalType;
  jobId: string | null;
  targetType: string;
  targetId: string;
  schoolId?: string | null;
}): string | null {
  if (
    input.approvalType === "prospect_candidate" ||
    input.approvalType === "prospect_enrichment" ||
    input.approvalType === "outreach_draft"
  ) {
    if (input.jobId) {
      return `/prospects/jobs/${input.jobId}/review`;
    }

    return "/prospects/generate";
  }

  if (input.targetType === "school" || input.schoolId) {
    return `/schools/${input.schoolId ?? input.targetId}`;
  }

  if (input.jobId) {
    return `/prospects/jobs/${input.jobId}/review`;
  }

  return "/approvals";
}

async function loadAssignments(
  supabase: SupabaseClient,
  orgIds: string[] | null
): Promise<Map<string, AssignmentRow>> {
  let query = supabase
    .from("approval_assignments")
    .select("approval_type,source_id,assigned_to,priority")
    .limit(2000);

  query = applyOrgFilter(query, orgIds);

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load approval assignments:", error.message);
    return new Map();
  }

  const map = new Map<string, AssignmentRow>();

  for (const row of (data ?? []) as AssignmentRow[]) {
    map.set(`${row.approval_type}:${row.source_id}`, row);
  }

  return map;
}

async function loadOrganizationNames(
  supabase: SupabaseClient,
  orgIds: string[] | null
): Promise<Map<string, string>> {
  let query = supabase.from("organizations").select("id,name");

  if (orgIds) {
    query = query.in("id", orgIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load organizations for approvals:", error.message);
    return new Map();
  }

  return new Map(
    ((data ?? []) as OrgNameRow[]).map((row) => [row.id, row.name])
  );
}

function withAssignment(
  item: Omit<ApprovalItem, "assigned_reviewer" | "priority"> & {
    priority?: ApprovalPriority;
  },
  assignments: Map<string, AssignmentRow>,
  derivedPriority: ApprovalPriority
): ApprovalItem {
  const key = `${item.approval_type}:${item.source_id}`;
  const assignment = assignments.get(key);

  return {
    ...item,
    assigned_reviewer: assignment?.assigned_to ?? null,
    priority: assignment?.priority ?? item.priority ?? derivedPriority
  };
}

export async function fetchApprovalItemsRaw(
  supabase: SupabaseClient,
  organizationIds: string[] | null
): Promise<ApprovalItem[]> {
  if (organizationIds && organizationIds.length === 0) {
    return [];
  }

  const [assignments, orgNames] = await Promise.all([
    loadAssignments(supabase, organizationIds),
    loadOrganizationNames(supabase, organizationIds)
  ]);

  const [candidates, enrichments, contacts, meetings, proposals] = await Promise.all([
    fetchProspectCandidateItems(supabase, organizationIds, assignments, orgNames),
    fetchEnrichmentItems(supabase, organizationIds, assignments, orgNames),
    fetchContactRecommendationItems(supabase, organizationIds, assignments, orgNames),
    fetchMeetingPrepItems(supabase, organizationIds, assignments, orgNames),
    fetchProposalDraftItems(supabase, organizationIds, assignments, orgNames)
  ]);

  // Outreach drafts: pending enriched candidates that include an outreach angle
  const outreach = enrichments
    .filter((item) => item.status === "pending" && /outreach angle:/i.test(item.summary))
    .map((item) => {
      const derived = deriveApprovalPriority({
        createdAt: item.created_at,
        confidenceScore: item.confidence_score
      });

      return withAssignment(
        {
          ...item,
          id: buildApprovalItemId("outreach_draft", item.source_id),
          approval_type: "outreach_draft",
          title: `Outreach draft · ${item.title.replace(/^Enrichment ·\s*/, "")}`,
          summary: item.summary,
          is_ai_generated: true
        },
        assignments,
        derived
      );
    });

  return [
    ...candidates.filter((item) => item.status === "pending" || item.status === "approved" || item.status === "rejected"),
    ...enrichments,
    ...outreach,
    ...contacts,
    ...meetings,
    ...proposals
  ];
}

async function fetchProspectCandidateItems(
  supabase: SupabaseClient,
  organizationIds: string[] | null,
  assignments: Map<string, AssignmentRow>,
  orgNames: Map<string, string>
): Promise<ApprovalItem[]> {
  let query = supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,job_id,name,status,confidence_score,rationale,created_at,updated_at,enrichment_status,promoted_school_id"
    )
    .order("created_at", { ascending: true })
    .limit(FETCH_CAP_PER_SOURCE);

  query = applyOrgFilter(query, organizationIds);

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load prospect candidates for approvals:", error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const createdAt = String(row.created_at);
    const confidence =
      typeof row.confidence_score === "number" ? row.confidence_score : null;
    const derived = deriveApprovalPriority({
      createdAt,
      confidenceScore: confidence
    });
    const schoolName = String(row.name ?? "Unknown school");
    const status = mapSourceStatusToApprovalStatus({
      approvalType: "prospect_candidate",
      sourceStatus: String(row.status)
    });

    return withAssignment(
      {
        id: buildApprovalItemId("prospect_candidate", String(row.id)),
        organization_id: String(row.organization_id),
        organization_name: orgNames.get(String(row.organization_id)) ?? null,
        approval_type: "prospect_candidate",
        source_type: "prospect_candidates",
        source_id: String(row.id),
        target_type: "prospect_candidate",
        target_id: String(row.id),
        title: schoolName,
        summary: String(row.rationale ?? "Prospect candidate awaiting review."),
        status,
        confidence_score: confidence,
        created_at: createdAt,
        updated_at: String(row.updated_at ?? createdAt),
        created_by: null,
        source_url: sourceHref({
          approvalType: "prospect_candidate",
          jobId: row.job_id ? String(row.job_id) : null,
          targetType: "prospect_candidate",
          targetId: String(row.id)
        }),
        agent_execution_id: null,
        is_ai_generated: true,
        stale_days: staleDaysSince(createdAt),
        citation: null,
        job_id: row.job_id ? String(row.job_id) : null,
        school_name: schoolName
      },
      assignments,
      derived
    );
  });
}

async function fetchEnrichmentItems(
  supabase: SupabaseClient,
  organizationIds: string[] | null,
  assignments: Map<string, AssignmentRow>,
  orgNames: Map<string, string>
): Promise<ApprovalItem[]> {
  let query = supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,job_id,name,status,confidence_score,enrichment_summary,outreach_angle,enrichment_status,created_at,updated_at,enriched_at"
    )
    .eq("enrichment_status", "enriched")
    .order("enriched_at", { ascending: true })
    .limit(FETCH_CAP_PER_SOURCE);

  query = applyOrgFilter(query, organizationIds);

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load enrichment approvals:", error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => String(row.status) === "pending_review")
    .map((row) => {
      const createdAt = String(row.enriched_at ?? row.updated_at ?? row.created_at);
      const confidence =
        typeof row.confidence_score === "number" ? row.confidence_score : null;
      const derived = deriveApprovalPriority({
        createdAt,
        confidenceScore: confidence
      });
      const schoolName = String(row.name ?? "Unknown school");
      const outreach = row.outreach_angle ? String(row.outreach_angle) : "";
      const summary = [
        String(row.enrichment_summary ?? "Enrichment ready for review."),
        outreach ? `Outreach angle: ${outreach}` : null
      ]
        .filter(Boolean)
        .join(" ");

      return withAssignment(
        {
          id: buildApprovalItemId("prospect_enrichment", String(row.id)),
          organization_id: String(row.organization_id),
          organization_name: orgNames.get(String(row.organization_id)) ?? null,
          approval_type: "prospect_enrichment",
          source_type: "prospect_candidates",
          source_id: String(row.id),
          target_type: "prospect_candidate",
          target_id: String(row.id),
          title: `Enrichment · ${schoolName}`,
          summary,
          status: "pending",
          confidence_score: confidence,
          created_at: createdAt,
          updated_at: String(row.updated_at ?? createdAt),
          created_by: null,
          source_url: sourceHref({
            approvalType: "prospect_enrichment",
            jobId: row.job_id ? String(row.job_id) : null,
            targetType: "prospect_candidate",
            targetId: String(row.id)
          }),
          agent_execution_id: null,
          is_ai_generated: true,
          stale_days: staleDaysSince(createdAt),
          citation: null,
          job_id: row.job_id ? String(row.job_id) : null,
          school_name: schoolName
        },
        assignments,
        derived
      );
    });
}

async function fetchContactRecommendationItems(
  supabase: SupabaseClient,
  organizationIds: string[] | null,
  assignments: Map<string, AssignmentRow>,
  orgNames: Map<string, string>
): Promise<ApprovalItem[]> {
  let query = supabase
    .from("prospect_contact_recommendations")
    .select(
      "id,organization_id,target_type,target_id,recommended_title,department,priority,rationale,suggested_outreach_angle,confidence_score,review_status,agent_execution_id,prospect_candidate_id,school_id,created_at,updated_at"
    )
    .order("created_at", { ascending: true })
    .limit(FETCH_CAP_PER_SOURCE);

  query = applyOrgFilter(query, organizationIds);

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load contact recommendations for approvals:", error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const createdAt = String(row.created_at);
    const confidence =
      typeof row.confidence_score === "number"
        ? Number(row.confidence_score)
        : null;
    const contactPriority =
      typeof row.priority === "number" ? row.priority : null;
    const derived = deriveApprovalPriority({
      createdAt,
      confidenceScore: confidence,
      contactPriority
    });

    return withAssignment(
      {
        id: buildApprovalItemId("contact_recommendation", String(row.id)),
        organization_id: String(row.organization_id),
        organization_name: orgNames.get(String(row.organization_id)) ?? null,
        approval_type: "contact_recommendation",
        source_type: "prospect_contact_recommendations",
        source_id: String(row.id),
        target_type: String(row.target_type),
        target_id: String(row.target_id),
        title: String(row.recommended_title ?? "Contact recommendation"),
        summary: String(row.rationale ?? "Recommended role awaiting review."),
        status: mapSourceStatusToApprovalStatus({
          approvalType: "contact_recommendation",
          sourceStatus: String(row.review_status)
        }),
        confidence_score: confidence,
        created_at: createdAt,
        updated_at: String(row.updated_at ?? createdAt),
        created_by: null,
        source_url: sourceHref({
          approvalType: "contact_recommendation",
          jobId: null,
          targetType: String(row.target_type),
          targetId: String(row.target_id),
          schoolId: row.school_id ? String(row.school_id) : null
        }),
        agent_execution_id: row.agent_execution_id
          ? String(row.agent_execution_id)
          : null,
        is_ai_generated: true,
        stale_days: staleDaysSince(createdAt),
        citation: row.department ? String(row.department) : null,
        job_id: null,
        school_name: null
      },
      assignments,
      derived
    );
  });
}

async function fetchMeetingPrepItems(
  supabase: SupabaseClient,
  organizationIds: string[] | null,
  assignments: Map<string, AssignmentRow>,
  orgNames: Map<string, string>
): Promise<ApprovalItem[]> {
  let query = supabase
    .from("meeting_prep_briefs")
    .select(
      "id,organization_id,target_type,target_id,meeting_objective,confidence_score,review_status,agent_execution_id,school_id,prospect_candidate_id,created_at,updated_at"
    )
    .order("created_at", { ascending: true })
    .limit(FETCH_CAP_PER_SOURCE);

  query = applyOrgFilter(query, organizationIds);

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load meeting prep briefs for approvals:", error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const createdAt = String(row.created_at);
    const confidence =
      typeof row.confidence_score === "number"
        ? Number(row.confidence_score)
        : null;
    const derived = deriveApprovalPriority({
      createdAt,
      confidenceScore: confidence
    });

    return withAssignment(
      {
        id: buildApprovalItemId("meeting_prep", String(row.id)),
        organization_id: String(row.organization_id),
        organization_name: orgNames.get(String(row.organization_id)) ?? null,
        approval_type: "meeting_prep",
        source_type: "meeting_prep_briefs",
        source_id: String(row.id),
        target_type: String(row.target_type),
        target_id: String(row.target_id),
        title: "Meeting prep brief",
        summary: String(row.meeting_objective ?? "Meeting brief awaiting review."),
        status: mapSourceStatusToApprovalStatus({
          approvalType: "meeting_prep",
          sourceStatus: String(row.review_status)
        }),
        confidence_score: confidence,
        created_at: createdAt,
        updated_at: String(row.updated_at ?? createdAt),
        created_by: null,
        source_url: sourceHref({
          approvalType: "meeting_prep",
          jobId: null,
          targetType: String(row.target_type),
          targetId: String(row.target_id),
          schoolId: row.school_id ? String(row.school_id) : null
        }),
        agent_execution_id: row.agent_execution_id
          ? String(row.agent_execution_id)
          : null,
        is_ai_generated: true,
        stale_days: staleDaysSince(createdAt),
        citation: null,
        job_id: null,
        school_name: null
      },
      assignments,
      derived
    );
  });
}

async function fetchProposalDraftItems(
  supabase: SupabaseClient,
  organizationIds: string[] | null,
  assignments: Map<string, AssignmentRow>,
  orgNames: Map<string, string>
): Promise<ApprovalItem[]> {
  let query = supabase
    .from("proposal_drafts")
    .select(
      "id,organization_id,target_type,target_id,proposal_title,executive_summary,confidence_score,review_status,agent_execution_id,school_id,prospect_candidate_id,created_at,updated_at"
    )
    .order("created_at", { ascending: true })
    .limit(FETCH_CAP_PER_SOURCE);

  query = applyOrgFilter(query, organizationIds);

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load proposal drafts for approvals:", error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const createdAt = String(row.created_at);
    const confidence =
      typeof row.confidence_score === "number"
        ? Number(row.confidence_score)
        : null;
    const derived = deriveApprovalPriority({
      createdAt,
      confidenceScore: confidence
    });

    return withAssignment(
      {
        id: buildApprovalItemId("proposal_draft", String(row.id)),
        organization_id: String(row.organization_id),
        organization_name: orgNames.get(String(row.organization_id)) ?? null,
        approval_type: "proposal_draft",
        source_type: "proposal_drafts",
        source_id: String(row.id),
        target_type: String(row.target_type),
        target_id: String(row.target_id),
        title: String(row.proposal_title ?? "Proposal draft"),
        summary: String(
          row.executive_summary ?? "Proposal draft awaiting human review."
        ),
        status: mapSourceStatusToApprovalStatus({
          approvalType: "proposal_draft",
          sourceStatus: String(row.review_status)
        }),
        confidence_score: confidence,
        created_at: createdAt,
        updated_at: String(row.updated_at ?? createdAt),
        created_by: null,
        source_url: sourceHref({
          approvalType: "proposal_draft",
          jobId: null,
          targetType: String(row.target_type),
          targetId: String(row.target_id),
          schoolId: row.school_id ? String(row.school_id) : null
        }),
        agent_execution_id: row.agent_execution_id
          ? String(row.agent_execution_id)
          : null,
        is_ai_generated: true,
        stale_days: staleDaysSince(createdAt),
        citation: null,
        job_id: null,
        school_name: null
      },
      assignments,
      derived
    );
  });
}

export async function countAwaitingHumanReview(
  supabase: SupabaseClient,
  organizationIds: string[] | null
): Promise<number> {
  if (organizationIds && organizationIds.length === 0) {
    return 0;
  }

  async function count(
    table: string,
    statusColumn: string,
    statusValue: string
  ): Promise<number> {
    let query = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(statusColumn, statusValue);

    query = applyOrgFilter(query, organizationIds);
    const { count, error } = await query;

    if (error) {
      console.error(`countAwaitingHumanReview ${table}:`, error.message);
      return 0;
    }

    return count ?? 0;
  }

  const [candidates, contacts, meetings, proposals] = await Promise.all([
    count("prospect_candidates", "status", "pending_review"),
    count("prospect_contact_recommendations", "review_status", "pending_review"),
    count("meeting_prep_briefs", "review_status", "pending_review"),
    count("proposal_drafts", "review_status", "pending_review")
  ]);

  return candidates + contacts + meetings + proposals;
}

export async function loadApprovalCenterDashboard(
  supabase: SupabaseClient,
  filter: ApprovalListFilter,
  currentUserId: string | null
): Promise<{
  metrics: ApprovalDashboardMetrics;
  list: ApprovalListResult;
  organizations: OrgNameRow[];
}> {
  const orgScope = resolveOrgScope(filter);

  if (orgScope === "empty") {
    return {
      metrics: calculateApprovalDashboardMetrics([], currentUserId),
      list: { items: [], total: 0, page: 1, pageSize: resolvePageSize(filter.limit) },
      organizations: []
    };
  }

  const items = await fetchApprovalItemsRaw(supabase, orgScope);
  const list = paginateApprovalItems(items, {
    ...filter,
    currentUserId
  });
  const metrics = calculateApprovalDashboardMetrics(items, currentUserId);
  const orgNames = await loadOrganizationNames(supabase, orgScope);

  return {
    metrics,
    list,
    organizations: [...orgNames.entries()].map(([id, name]) => ({ id, name }))
  };
}

export function isKnownApprovalType(value: string): value is ApprovalType {
  return (APPROVAL_TYPES as readonly string[]).includes(value);
}

export function isKnownApprovalStatus(value: string): value is ApprovalStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "needs_revision" ||
    value === "superseded"
  );
}

export function isKnownApprovalPriority(value: string): value is ApprovalPriority {
  return (
    value === "low" ||
    value === "normal" ||
    value === "high" ||
    value === "urgent"
  );
}

export function isKnownApprovalSort(value: string): value is ApprovalSort {
  return (
    value === "newest" ||
    value === "oldest" ||
    value === "highest_priority" ||
    value === "highest_confidence" ||
    value === "lowest_confidence" ||
    value === "default"
  );
}
