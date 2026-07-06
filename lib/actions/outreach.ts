"use server";

import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  getSchoolOrganizationId,
  MUTATION_ROLES,
  requireRole
} from "@/lib/authz";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";
import {
  validateOutreachLog,
  type OutreachActionResult
} from "@/lib/validation";

export async function createOutreachLog(
  formData: FormData
): Promise<OutreachActionResult> {
  const validation = validateOutreachLog(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
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
    return { ok: false, error: "Sign in to log outreach." };
  }

  const schoolOrganizationId = await getSchoolOrganizationId(
    supabase,
    input.school_id
  );

  if (!schoolOrganizationId) {
    return { ok: false, error: "Select a valid school in your organization." };
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    schoolOrganizationId
  );

  if (!membership) {
    return { ok: false, error: "You do not have permission to log outreach." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership || ownership.organization_id !== schoolOrganizationId) {
    return { ok: false, error: "You do not have permission to log outreach." };
  }

  const { data: insertedOutreach, error } = await supabase
    .from("outreach")
    .insert({
      school_id: input.school_id,
      channel: input.channel,
      subject: input.subject,
      outcome: input.outcome,
      outreach_date: input.outreach_date,
      next_step: input.next_step,
      owner: user.email ?? null,
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by,
      assigned_to: ownership.assigned_to
    })
    .select("id")
    .single();

  if (error || !insertedOutreach) {
    return { ok: false, error: "Could not save the outreach activity." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.outreachCreate,
    targetTable: "outreach",
    recordId: insertedOutreach.id,
    metadata: {
      school_id: input.school_id,
      channel: input.channel,
      outreach_date: input.outreach_date
    }
  });

  revalidatePath(`/schools/${input.school_id}`);

  return { ok: true };
}
