import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { AppRole, OrganizationMember } from "./supabase";
import { getServerSupabaseClient } from "./supabaseServer";

export const MUTATION_ROLES: AppRole[] = ["sales", "admin", "super_admin"];

export const SETTINGS_ADMIN_ROLES: AppRole[] = ["admin", "super_admin"];

export const RESTRICTED_FIELD_PLACEHOLDER = "Restricted";

export const AGENT_WORKER_ROLES: AppRole[] = ["admin", "super_admin"];

export function canTriggerAgentWorker(
  memberships: OrganizationMember[]
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some((membership) =>
    AGENT_WORKER_ROLES.includes(membership.role)
  );
}

export function canAccessSettingsRoutes(
  memberships: OrganizationMember[]
): boolean {
  return memberships.some((membership) =>
    SETTINGS_ADMIN_ROLES.includes(membership.role)
  );
}

export function isSuperAdmin(memberships: OrganizationMember[]): boolean {
  return memberships.some((membership) => membership.role === "super_admin");
}

export function canManageOrganizationMembership(
  memberships: OrganizationMember[],
  organizationId: string
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  const orgMembership = memberships.find(
    (membership) => membership.organization_id === organizationId
  );

  return orgMembership?.role === "admin";
}

export const MEMBERSHIP_ASSIGNABLE_ROLES: AppRole[] = [
  "read_only",
  "sales",
  "admin"
];

export function shouldRedactRestrictedFields(
  membership: OrganizationMember | null,
  allMemberships: OrganizationMember[]
): boolean {
  if (allMemberships.some((item) => item.role === "super_admin")) {
    return false;
  }

  if (membership && hasRole(membership, MUTATION_ROLES)) {
    return false;
  }

  return membership?.role === "read_only";
}

export function canManageSchools(memberships: OrganizationMember[]): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some((membership) => hasRole(membership, MUTATION_ROLES));
}

export function canViewProspectGeneration(
  memberships: OrganizationMember[]
): boolean {
  return memberships.length > 0 || isSuperAdmin(memberships);
}

export function canEnqueueProspectGeneration(
  memberships: OrganizationMember[]
): boolean {
  return canManageSchools(memberships);
}

export function canViewAgentOperations(
  memberships: OrganizationMember[]
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some((membership) =>
    MUTATION_ROLES.includes(membership.role)
  );
}

export function canManageAgentExecutions(
  memberships: OrganizationMember[]
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some((membership) =>
    AGENT_WORKER_ROLES.includes(membership.role)
  );
}

export function canAccessAgentOrganization(
  memberships: OrganizationMember[],
  organizationId: string
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some(
    (membership) =>
      membership.organization_id === organizationId &&
      MUTATION_ROLES.includes(membership.role)
  );
}

export function canManageAgentOrganization(
  memberships: OrganizationMember[],
  organizationId: string
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some(
    (membership) =>
      membership.organization_id === organizationId &&
      AGENT_WORKER_ROLES.includes(membership.role)
  );
}

/** Sales+ may read active prompt metadata; read_only denied. */
export function canViewPromptRegistry(
  memberships: OrganizationMember[]
): boolean {
  return canViewAgentOperations(memberships);
}

/** Org admins manage org-scoped drafts/rollouts; super_admin may as well. */
export function canManageOrgPrompts(
  memberships: OrganizationMember[],
  organizationId: string
): boolean {
  if (isSuperAdmin(memberships)) {
    return true;
  }

  return memberships.some(
    (membership) =>
      membership.organization_id === organizationId &&
      membership.role === "admin"
  );
}

/** Only super_admin manages global (organization_id null) prompts/rollouts. */
export function canManageGlobalPrompts(
  memberships: OrganizationMember[]
): boolean {
  return isSuperAdmin(memberships);
}

export function canManagePromptScope(
  memberships: OrganizationMember[],
  organizationId: string | null
): boolean {
  if (organizationId == null) {
    return canManageGlobalPrompts(memberships);
  }
  return canManageOrgPrompts(memberships, organizationId);
}

export function getAccessibleAgentOrganizationIds(
  memberships: OrganizationMember[]
): string[] | null {
  if (isSuperAdmin(memberships)) {
    return null;
  }

  return memberships
    .filter((membership) => MUTATION_ROLES.includes(membership.role))
    .map((membership) => membership.organization_id);
}

export async function getMembershipsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<OrganizationMember[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id,organization_id,user_id,role,created_at,updated_at")
    .eq("user_id", userId);

  if (error) {
    return [];
  }

  return (data ?? []) as OrganizationMember[];
}

export async function getMembershipForUser(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<OrganizationMember | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id,organization_id,user_id,role,created_at,updated_at")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as OrganizationMember;
}

export async function isMemberOfOrganization(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const membership = await getMembershipForUser(supabase, userId, organizationId);
  return membership !== null;
}

export function hasRole(
  membership: OrganizationMember | null,
  allowedRoles: AppRole[]
): boolean {
  return membership !== null && allowedRoles.includes(membership.role);
}

export async function requireMembership(
  user: User,
  organizationId?: string
): Promise<OrganizationMember | null> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  if (organizationId) {
    return getMembershipForUser(supabase, user.id, organizationId);
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  return memberships[0] ?? null;
}

export async function requireRole(
  user: User,
  allowedRoles: AppRole[],
  organizationId?: string
): Promise<OrganizationMember | null> {
  const membership = await requireMembership(user, organizationId);

  if (!hasRole(membership, allowedRoles)) {
    return null;
  }

  return membership;
}

export async function getSchoolOrganizationId(
  supabase: SupabaseClient,
  schoolId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("schools")
    .select("organization_id")
    .eq("id", schoolId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.organization_id;
}
