export const APPROVAL_TYPES = [
  "prospect_candidate",
  "prospect_enrichment",
  "outreach_draft",
  "contact_recommendation",
  "meeting_prep",
  "proposal_draft"
] as const;

export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_revision",
  "superseded"
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type ApprovalPriority = (typeof APPROVAL_PRIORITIES)[number];

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  prospect_candidate: "Prospect candidate",
  prospect_enrichment: "Prospect enrichment",
  outreach_draft: "Outreach draft",
  contact_recommendation: "Contact recommendation",
  meeting_prep: "Meeting prep brief",
  proposal_draft: "Proposal draft"
};

export const AI_GENERATED_WARNING =
  "AI-generated content must be reviewed before use.";

export type ApprovalItem = {
  id: string;
  organization_id: string;
  organization_name?: string | null;
  approval_type: ApprovalType;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  title: string;
  summary: string;
  status: ApprovalStatus;
  priority: ApprovalPriority;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  assigned_reviewer: string | null;
  source_url: string | null;
  agent_execution_id: string | null;
  is_ai_generated: boolean;
  stale_days: number;
  citation: string | null;
  job_id: string | null;
  school_name: string | null;
};

export type ApprovalListFilter = {
  organizationIds?: string[] | null;
  organizationId?: string | null;
  approvalType?: ApprovalType | null;
  status?: ApprovalStatus | null;
  priority?: ApprovalPriority | null;
  assignedReviewer?: string | null;
  assignedToMe?: boolean;
  currentUserId?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  confidenceMin?: number | null;
  confidenceMax?: number | null;
  targetQuery?: string | null;
  staleDaysMin?: number | null;
  sort?: ApprovalSort;
  limit?: number;
  offset?: number;
};

export type ApprovalSort =
  | "newest"
  | "oldest"
  | "highest_priority"
  | "highest_confidence"
  | "lowest_confidence"
  | "default";

export type ApprovalDashboardMetrics = {
  total_awaiting_review: number;
  high_priority_items: number;
  ai_generated_items: number;
  assigned_to_me: number;
  oldest_pending_age_hours: number | null;
  approved_today: number;
  rejected_today: number;
};

export type ApprovalListResult = {
  items: ApprovalItem[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Display priority derivation (does not mutate source records):
 * - urgent: pending age >= 7 days
 * - high: pending age >= 3 days, OR confidence >= 0.85, OR contact priority <= 2
 * - low: confidence < 0.4 (when present)
 * - normal: otherwise
 * Explicit assignment priority overrides derived priority when set.
 */
export function deriveApprovalPriority(input: {
  createdAt: string;
  confidenceScore?: number | null;
  contactPriority?: number | null;
  explicitPriority?: ApprovalPriority | null;
  now?: Date;
}): ApprovalPriority {
  if (input.explicitPriority) {
    return input.explicitPriority;
  }

  const now = input.now ?? new Date();
  const ageMs = now.getTime() - Date.parse(input.createdAt);
  const ageDays = Number.isFinite(ageMs) ? ageMs / (24 * 60 * 60 * 1000) : 0;

  if (ageDays >= 7) {
    return "urgent";
  }

  if (
    ageDays >= 3 ||
    (input.confidenceScore != null && input.confidenceScore >= 0.85) ||
    (input.contactPriority != null && input.contactPriority <= 2)
  ) {
    return "high";
  }

  if (input.confidenceScore != null && input.confidenceScore < 0.4) {
    return "low";
  }

  return "normal";
}

export function mapSourceStatusToApprovalStatus(input: {
  approvalType: ApprovalType;
  sourceStatus: string;
}): ApprovalStatus {
  const status = input.sourceStatus;

  if (status === "pending_review") {
    return "pending";
  }

  if (status === "approved" || status === "accepted") {
    return "approved";
  }

  if (status === "rejected" || status === "dismissed") {
    return "rejected";
  }

  if (status === "needs_revision") {
    return "needs_revision";
  }

  return "pending";
}

export function priorityRank(priority: ApprovalPriority): number {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export function staleDaysSince(
  createdAt: string,
  now: Date = new Date()
): number {
  const ageMs = now.getTime() - Date.parse(createdAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 0;
  }

  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

export function buildApprovalItemId(
  approvalType: ApprovalType,
  sourceId: string
): string {
  return `${approvalType}:${sourceId}`;
}

export function parseApprovalItemId(
  id: string
): { approvalType: ApprovalType; sourceId: string } | null {
  const separator = id.indexOf(":");
  if (separator <= 0) {
    return null;
  }

  const approvalType = id.slice(0, separator);
  const sourceId = id.slice(separator + 1);

  if (!(APPROVAL_TYPES as readonly string[]).includes(approvalType) || !sourceId) {
    return null;
  }

  return {
    approvalType: approvalType as ApprovalType,
    sourceId
  };
}
