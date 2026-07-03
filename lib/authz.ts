import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { AppRole, OrganizationMember } from "./supabase";
import { getServerSupabaseClient } from "./supabaseServer";

export const MUTATION_ROLES: AppRole[] = ["sales", "admin", "super_admin"];

export const RESTRICTED_FIELD_PLACEHOLDER = "Restricted";

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
