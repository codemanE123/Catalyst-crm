"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  canManageOrganizationMembership,
  getMembershipsForUser
} from "@/lib/authz";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  isInviteExpired
} from "@/lib/invites/tokens";
import type { AppRole } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";
import { createServiceRoleSupabaseClient } from "@/lib/supabaseServiceRole";

export type InviteActionResult =
  | { ok: true; message: string; inviteUrl?: string }
  | { ok: false; error: string };

export type MembershipInviteRow = {
  id: string;
  organization_id: string;
  role: AppRole;
  expires_at: string;
  max_uses: number;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
};

const INVITE_ROLES: AppRole[] = ["sales", "read_only", "admin"];

function appBaseUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("http")
      ? fromEnv.replace(/\/$/, "")
      : `https://${fromEnv.replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) {
      return null;
    }
    const match = listed.data.users.find(
      (user) => user.email?.toLowerCase() === email
    );
    if (match) {
      return match.id;
    }
    if (listed.data.users.length < 200) {
      break;
    }
  }
  return null;
}

export async function listMembershipInvites(
  organizationId: string
): Promise<MembershipInviteRow[]> {
  const supabase = await getServerSupabaseClient();
  const user = await requireUser();
  if (!supabase || !user) {
    return [];
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canManageOrganizationMembership(memberships, organizationId)) {
    return [];
  }

  const { data } = await supabase
    .from("membership_invites")
    .select(
      "id,organization_id,role,expires_at,max_uses,use_count,revoked_at,created_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []) as MembershipInviteRow[];
}

export async function createMembershipInvite(input: {
  organizationId: string;
  role?: AppRole;
  expiresInDays?: number;
  maxUses?: number;
}): Promise<InviteActionResult> {
  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in to create invite links." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canManageOrganizationMembership(memberships, input.organizationId)) {
    return { ok: false, error: "You do not have permission to create invites." };
  }

  const role = input.role ?? "sales";
  if (!INVITE_ROLES.includes(role)) {
    return { ok: false, error: "Select a valid invite role." };
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = inviteExpiresAt(input.expiresInDays ?? 7).toISOString();
  const maxUses = Math.min(Math.max(input.maxUses ?? 25, 1), 500);

  const { data, error } = await supabase
    .from("membership_invites")
    .insert({
      organization_id: input.organizationId,
      token_hash: tokenHash,
      role,
      created_by: user.id,
      expires_at: expiresAt,
      max_uses: maxUses,
      use_count: 0
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create invite link." };
  }

  await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.membershipInviteCreate,
    targetTable: "membership_invites",
    recordId: data.id,
    metadata: { role, max_uses: maxUses }
  });

  return {
    ok: true,
    message: "Invite link created. Copy it now — it will not be shown again.",
    inviteUrl: `${appBaseUrl()}/invite/${token}`
  };
}

export async function revokeMembershipInvite(input: {
  organizationId: string;
  inviteId: string;
}): Promise<InviteActionResult> {
  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: SUPABASE_CONFIGURATION_ERROR };
  }

  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in to revoke invites." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canManageOrganizationMembership(memberships, input.organizationId)) {
    return { ok: false, error: "You do not have permission to revoke invites." };
  }

  const { error } = await supabase
    .from("membership_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.inviteId)
    .eq("organization_id", input.organizationId)
    .is("revoked_at", null);

  if (error) {
    return { ok: false, error: "Could not revoke invite." };
  }

  await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.membershipInviteRevoke,
    targetTable: "membership_invites",
    recordId: input.inviteId,
    metadata: {}
  });

  revalidatePath("/settings/members");
  return { ok: true, message: "Invite revoked." };
}

export async function redeemMembershipInvite(input: {
  token: string;
  email: string;
  password: string;
}): Promise<InviteActionResult> {
  const token = input.token.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!token || !email || password.length < 8) {
    return {
      ok: false,
      error: "Enter email and a password with at least 8 characters."
    };
  }

  const admin = createServiceRoleSupabaseClient();
  if (!admin) {
    return {
      ok: false,
      error: "Invite redemption is not configured (missing service role)."
    };
  }

  const tokenHash = hashInviteToken(token);
  const { data: invite, error: inviteError } = await admin
    .from("membership_invites")
    .select(
      "id,organization_id,role,expires_at,max_uses,use_count,revoked_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (inviteError || !invite) {
    return { ok: false, error: "Invite link is invalid." };
  }

  if (invite.revoked_at) {
    return { ok: false, error: "This invite link has been revoked." };
  }

  if (isInviteExpired(invite.expires_at)) {
    return { ok: false, error: "This invite link has expired." };
  }

  if (invite.use_count >= invite.max_uses) {
    return { ok: false, error: "This invite link has reached its use limit." };
  }

  let userId = await findAuthUserIdByEmail(admin, email);

  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (created.error || !created.data.user) {
      return {
        ok: false,
        error: created.error?.message || "Could not create the account."
      };
    }
    userId = created.data.user.id;
  } else {
    // Existing account: update password so teammate can use the credentials they just entered.
    const updated = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true
    });
    if (updated.error) {
      return {
        ok: false,
        error: updated.error.message || "Could not update the existing account."
      };
    }
  }

  const { error: membershipError } = await admin
    .from("organization_members")
    .upsert(
      {
        organization_id: invite.organization_id,
        user_id: userId,
        role: invite.role
      },
      { onConflict: "organization_id,user_id" }
    );

  if (membershipError) {
    return { ok: false, error: "Could not add you to the organization." };
  }

  await admin
    .from("membership_invites")
    .update({ use_count: invite.use_count + 1 })
    .eq("id", invite.id)
    .eq("use_count", invite.use_count);

  await recordAuditEvent(admin, {
    organizationId: invite.organization_id,
    actorUserId: userId,
    action: AUDIT_ACTIONS.membershipInviteRedeem,
    targetTable: "membership_invites",
    recordId: invite.id,
    metadata: { role: invite.role }
  });

  return {
    ok: true,
    message:
      "Account ready. Sign in with your email and password to open the CRM."
  };
}
