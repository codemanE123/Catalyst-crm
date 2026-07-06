"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  getSchoolOrganizationId,
  MUTATION_ROLES,
  requireRole
} from "@/lib/authz";
import {
  getRecordOwnershipFields,
  type FollowUp,
  type RecordOwnershipFields
} from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";
import {
  validateCompleteFollowUp,
  validateCreateFollowUp,
  type FollowUpActionResult
} from "@/lib/validation";

type MutationContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      user: User;
      ownership: RecordOwnershipFields;
      schoolOrganizationId: string;
    }
  | { ok: false; error: string };

async function requireFollowUpMutationContext(
  schoolId: string,
  permissionMessage: string
): Promise<MutationContext> {
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
    return { ok: false, error: "Sign in to manage follow-ups." };
  }

  const schoolOrganizationId = await getSchoolOrganizationId(supabase, schoolId);

  if (!schoolOrganizationId) {
    return {
      ok: false,
      error: "Select a valid school in your organization."
    };
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    schoolOrganizationId
  );

  if (!membership) {
    return { ok: false, error: permissionMessage };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership || ownership.organization_id !== schoolOrganizationId) {
    return { ok: false, error: permissionMessage };
  }

  return {
    ok: true,
    supabase,
    user,
    ownership,
    schoolOrganizationId
  };
}

export async function getOpenFollowUpsForSchool(
  schoolId: string
): Promise<FollowUp[]> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("follow_ups")
    .select("id,title,due_date,status,owner,notes")
    .eq("school_id", schoolId)
    .neq("status", "Done")
    .order("due_date", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as FollowUp[];
}

export async function createFollowUp(
  formData: FormData
): Promise<FollowUpActionResult> {
  const validation = validateCreateFollowUp(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
  const context = await requireFollowUpMutationContext(
    input.school_id,
    "You do not have permission to create follow-ups."
  );

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const owner = input.owner ?? user.email ?? null;

  const { data: insertedFollowUp, error } = await supabase
    .from("follow_ups")
    .insert({
      school_id: input.school_id,
      title: input.title,
      due_date: input.due_date,
      notes: input.notes ?? null,
      owner,
      status: "Open",
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by,
      assigned_to: ownership.assigned_to
    })
    .select("id")
    .single();

  if (error || !insertedFollowUp) {
    return { ok: false, error: "Could not create the follow-up." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.followUpCreate,
    targetTable: "follow_ups",
    recordId: insertedFollowUp.id,
    metadata: {
      school_id: input.school_id,
      due_date: input.due_date,
      title: input.title
    }
  });

  revalidatePath(`/schools/${input.school_id}`);

  return { ok: true };
}

export async function completeFollowUp(
  formData: FormData
): Promise<FollowUpActionResult> {
  const validation = validateCompleteFollowUp(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
  const context = await requireFollowUpMutationContext(
    input.school_id,
    "You do not have permission to complete follow-ups."
  );

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;

  const { data: existingFollowUp, error: lookupError } = await supabase
    .from("follow_ups")
    .select("id,status")
    .eq("id", input.follow_up_id)
    .eq("school_id", input.school_id)
    .eq("organization_id", ownership.organization_id)
    .maybeSingle();

  if (lookupError || !existingFollowUp) {
    return { ok: false, error: "Follow-up not found for this school." };
  }

  if (existingFollowUp.status === "Done") {
    return { ok: false, error: "This follow-up is already complete." };
  }

  const completedAt = new Date().toISOString();

  const { data: updatedFollowUp, error } = await supabase
    .from("follow_ups")
    .update({
      status: "Done",
      completed_at: completedAt,
      updated_by: ownership.updated_by
    })
    .eq("id", input.follow_up_id)
    .eq("school_id", input.school_id)
    .select("id")
    .single();

  if (error || !updatedFollowUp) {
    return { ok: false, error: "Could not complete the follow-up." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.followUpComplete,
    targetTable: "follow_ups",
    recordId: updatedFollowUp.id,
    metadata: {
      school_id: input.school_id,
      completed_at: completedAt
    }
  });

  revalidatePath(`/schools/${input.school_id}`);

  return { ok: true };
}
