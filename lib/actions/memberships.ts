"use server";

import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  canAccessSettingsRoutes,
  canManageOrganizationMembership,
  getMembershipsForUser,
  isSuperAdmin,
  MEMBERSHIP_ASSIGNABLE_ROLES
} from "@/lib/authz";
import type { AppRole, Organization, OrganizationMember } from "@/lib/supabase";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";

export type MembershipActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type OrganizationMemberRow = OrganizationMember & {
  organization?: Pick<Organization, "id" | "name">;
};

type AdminContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      userId: string;
      memberships: OrganizationMember[];
    }
  | { ok: false; error: string };

async function requireMembershipAdmin(): Promise<AdminContext> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const user = await requireUser();

  if (!user) {
    return { ok: false, error: "Sign in to manage organization members." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);

  if (!canAccessSettingsRoutes(memberships)) {
    return { ok: false, error: "You do not have permission to manage members." };
  }

  return { ok: true, supabase, userId: user.id, memberships };
}

function parseOrganizationId(formData: FormData): string | null {
  const value = formData.get("organization_id");

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function parseMembershipId(formData: FormData): string | null {
  const value = formData.get("membership_id");

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function parseRole(formData: FormData): AppRole | null {
  const value = formData.get("role");

  if (typeof value !== "string") {
    return null;
  }

  const role = value.trim() as AppRole;

  if (!MEMBERSHIP_ASSIGNABLE_ROLES.includes(role) && role !== "super_admin") {
    return null;
  }

  return role;
}

function rolesAllowedForActor(
  memberships: OrganizationMember[],
  role: AppRole
): boolean {
  if (role === "super_admin") {
    return isSuperAdmin(memberships);
  }

  return MEMBERSHIP_ASSIGNABLE_ROLES.includes(role);
}

export async function getManageableOrganizations(): Promise<{
  organizations: Organization[];
  defaultOrganizationId: string | null;
}> {
  const context = await requireMembershipAdmin();

  if (!context.ok) {
    return { organizations: [], defaultOrganizationId: null };
  }

  const { supabase, memberships } = context;

  if (isSuperAdmin(memberships)) {
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,slug,created_at,updated_at")
      .order("name", { ascending: true });

    if (error || !data?.length) {
      return { organizations: [], defaultOrganizationId: null };
    }

    return {
      organizations: data as Organization[],
      defaultOrganizationId: data[0]?.id ?? null
    };
  }

  const adminOrgIds = memberships
    .filter((membership) => membership.role === "admin")
    .map((membership) => membership.organization_id);

  if (!adminOrgIds.length) {
    return { organizations: [], defaultOrganizationId: null };
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id,name,slug,created_at,updated_at")
    .in("id", adminOrgIds)
    .order("name", { ascending: true });

  if (error || !data?.length) {
    return { organizations: [], defaultOrganizationId: null };
  }

  return {
    organizations: data as Organization[],
    defaultOrganizationId: data[0]?.id ?? null
  };
}

export async function getOrganizationMembers(
  organizationId: string
): Promise<OrganizationMemberRow[]> {
  const context = await requireMembershipAdmin();

  if (!context.ok) {
    return [];
  }

  if (
    !canManageOrganizationMembership(context.memberships, organizationId)
  ) {
    return [];
  }

  const { data, error } = await context.supabase
    .from("organization_members")
    .select(
      "id,organization_id,user_id,role,created_at,updated_at,organizations(id,name)"
    )
    .eq("organization_id", organizationId)
    .order("role", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const organization = Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations;

    return {
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role as AppRole,
      created_at: row.created_at,
      updated_at: row.updated_at,
      organization: organization
        ? { id: organization.id, name: organization.name }
        : undefined
    };
  });
}

export async function updateMemberRole(
  formData: FormData
): Promise<MembershipActionResult> {
  const context = await requireMembershipAdmin();

  if (!context.ok) {
    return context;
  }

  const organizationId = parseOrganizationId(formData);
  const membershipId = parseMembershipId(formData);
  const newRole = parseRole(formData);

  if (!organizationId || !membershipId || !newRole) {
    return { ok: false, error: "Invalid membership update request." };
  }

  if (
    !canManageOrganizationMembership(context.memberships, organizationId)
  ) {
    return { ok: false, error: "You do not have permission to manage members." };
  }

  if (!rolesAllowedForActor(context.memberships, newRole)) {
    return { ok: false, error: "You cannot assign that role." };
  }

  const { data: target, error: targetError } = await context.supabase
    .from("organization_members")
    .select("id,organization_id,user_id,role")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (targetError || !target) {
    return { ok: false, error: "Member not found in this organization." };
  }

  if (target.user_id === context.userId) {
    return { ok: false, error: "You cannot change your own role." };
  }

  if (target.role === "super_admin" && !isSuperAdmin(context.memberships)) {
    return {
      ok: false,
      error: "Only super_admin can change another super_admin membership."
    };
  }

  if (newRole === target.role) {
    return { ok: true };
  }

  const { error: updateError } = await context.supabase
    .from("organization_members")
    .update({ role: newRole })
    .eq("id", membershipId)
    .eq("organization_id", organizationId);

  if (updateError) {
    return { ok: false, error: "Could not update member role." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId,
    actorUserId: context.userId,
    action: AUDIT_ACTIONS.membershipRoleChange,
    targetTable: "organization_members",
    recordId: membershipId,
    metadata: {
      target_user_id: target.user_id,
      previous_role: target.role,
      new_role: newRole
    }
  });

  revalidatePath("/settings/members");
  return { ok: true };
}

export async function removeMember(
  formData: FormData
): Promise<MembershipActionResult> {
  const context = await requireMembershipAdmin();

  if (!context.ok) {
    return context;
  }

  const organizationId = parseOrganizationId(formData);
  const membershipId = parseMembershipId(formData);

  if (!organizationId || !membershipId) {
    return { ok: false, error: "Invalid membership removal request." };
  }

  if (
    !canManageOrganizationMembership(context.memberships, organizationId)
  ) {
    return { ok: false, error: "You do not have permission to manage members." };
  }

  const { data: target, error: targetError } = await context.supabase
    .from("organization_members")
    .select("id,organization_id,user_id,role")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (targetError || !target) {
    return { ok: false, error: "Member not found in this organization." };
  }

  if (target.user_id === context.userId) {
    return { ok: false, error: "You cannot remove your own membership." };
  }

  if (target.role === "super_admin" && !isSuperAdmin(context.memberships)) {
    return {
      ok: false,
      error: "Only super_admin can remove another super_admin membership."
    };
  }

  const { error: deleteError } = await context.supabase
    .from("organization_members")
    .delete()
    .eq("id", membershipId)
    .eq("organization_id", organizationId);

  if (deleteError) {
    return { ok: false, error: "Could not remove member." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId,
    actorUserId: context.userId,
    action: AUDIT_ACTIONS.membershipRemove,
    targetTable: "organization_members",
    recordId: membershipId,
    metadata: {
      target_user_id: target.user_id,
      removed_role: target.role
    }
  });

  revalidatePath("/settings/members");
  return { ok: true };
}
