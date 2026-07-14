import type { OrganizationMember } from "@/lib/supabase";
import {
  canManageAgentExecutions,
  canManageSchools,
  canViewProspectGeneration,
  isSuperAdmin,
  MUTATION_ROLES
} from "@/lib/authz";

import type { ApprovalType } from "./types";

export function canViewApprovals(memberships: OrganizationMember[]): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some(
    (membership) =>
      MUTATION_ROLES.includes(membership.role) || membership.role === "read_only"
  );
}

export function canActOnApprovals(memberships: OrganizationMember[]): boolean {
  return canManageSchools(memberships);
}

export function canAssignApprovals(memberships: OrganizationMember[]): boolean {
  return canManageAgentExecutions(memberships) || isSuperAdmin(memberships);
}

export function canAccessApprovalOrganization(
  memberships: OrganizationMember[],
  organizationId: string
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some(
    (membership) => membership.organization_id === organizationId
  );
}

export function getAccessibleApprovalOrganizationIds(
  memberships: OrganizationMember[]
): string[] | null {
  if (isSuperAdmin(memberships)) {
    return null;
  }

  return [
    ...new Set(
      memberships
        .filter(
          (membership) =>
            MUTATION_ROLES.includes(membership.role) ||
            membership.role === "read_only"
        )
        .map((membership) => membership.organization_id)
    )
  ];
}

export function canOpenApprovalSourceRoute(
  memberships: OrganizationMember[],
  approvalType: ApprovalType
): boolean {
  if (!canViewApprovals(memberships)) {
    return false;
  }

  if (approvalType === "prospect_candidate" || approvalType === "prospect_enrichment") {
    return canViewProspectGeneration(memberships);
  }

  return canViewProspectGeneration(memberships) || canManageSchools(memberships);
}

/**
 * Human-in-the-loop hard stops — Approval Center must never flip these to true.
 */
export const APPROVAL_HITL_GUARDS = {
  mayAutonomouslyApproveProspects: false,
  mayAutonomouslySendEmail: false,
  mayAutonomouslySendLinkedIn: false,
  mayAutonomouslySendProposals: false,
  mayAutonomouslyCreatePersonalContacts: false,
  mayBulkApproveProspects: false,
  mayBulkRejectMixedTypes: false,
  mayBulkSendExternally: false
} as const;

export function isUnsafeBulkApprovalAction(
  action: "approve" | "reject" | "send" | "create_contact" | "assign" | "set_priority" | "needs_revision"
): boolean {
  return (
    action === "approve" ||
    action === "reject" ||
    action === "send" ||
    action === "create_contact"
  );
}
