"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  getMembershipForUser,
  getSchoolOrganizationId,
  MUTATION_ROLES,
  requireRole
} from "@/lib/authz";
import {
  getRecordOwnershipFields,
  type RecordOwnershipFields
} from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";
import {
  isValidSchoolStatusTransition,
  validateCreateSchool,
  validateUpdateSchool,
  type SchoolActionResult,
  type SchoolStatus
} from "@/lib/validation";

type CreateContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      user: User;
      ownership: RecordOwnershipFields;
    }
  | { ok: false; error: string };

type UpdateContext = CreateContext & { schoolOrganizationId: string };

async function requireCreateSchoolContext(): Promise<CreateContext> {
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
    return { ok: false, error: "Sign in to manage schools." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false,
      error: "You do not have permission to manage schools."
    };
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    ownership.organization_id
  );

  if (!membership) {
    return {
      ok: false,
      error: "You do not have permission to manage schools."
    };
  }

  return { ok: true, supabase, user, ownership };
}

async function requireUpdateSchoolContext(
  schoolId: string
): Promise<UpdateContext | { ok: false; error: string }> {
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
    return { ok: false, error: "Sign in to manage schools." };
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
    return {
      ok: false,
      error: "You do not have permission to update this school."
    };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership || ownership.organization_id !== schoolOrganizationId) {
    return {
      ok: false,
      error: "You do not have permission to update this school."
    };
  }

  return {
    ok: true,
    supabase,
    user,
    ownership,
    schoolOrganizationId
  };
}

async function resolveAssignedTo(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  organizationId: string,
  input: {
    assigned_to?: string;
    assign_to_me: boolean;
  },
  fallbackUserId: string,
  actorUserId: string
): Promise<{ assignedTo: string | null; error?: string }> {
  if (input.assign_to_me) {
    return { assignedTo: actorUserId };
  }

  if (!input.assigned_to) {
    return { assignedTo: fallbackUserId };
  }

  const membership = await getMembershipForUser(
    supabase,
    input.assigned_to,
    organizationId
  );

  if (!membership) {
    return {
      assignedTo: null,
      error: "Assignee must be a member of your organization."
    };
  }

  return { assignedTo: input.assigned_to };
}

export async function createSchool(
  formData: FormData
): Promise<SchoolActionResult> {
  const validation = validateCreateSchool(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
  const context = await requireCreateSchoolContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;

  const assignee = await resolveAssignedTo(
    supabase,
    ownership.organization_id,
    input,
    ownership.assigned_to,
    user.id
  );

  if (assignee.error || !assignee.assignedTo) {
    return {
      ok: false,
      error: assignee.error ?? "You do not have permission to manage schools."
    };
  }

  const { data: insertedSchool, error } = await supabase
    .from("schools")
    .insert({
      name: input.name,
      website: input.website ?? null,
      status: input.status,
      owner: input.owner,
      next_step: input.next_step,
      notes: input.notes ?? null,
      district: "Unknown",
      location: "Unknown",
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by,
      assigned_to: assignee.assignedTo
    })
    .select("id")
    .single();

  if (error || !insertedSchool) {
    return { ok: false, error: "Could not create the school." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.schoolCreate,
    targetTable: "schools",
    recordId: insertedSchool.id,
    metadata: {
      name: input.name,
      status: input.status,
      owner: input.owner
    }
  });

  revalidatePath("/");

  return { ok: true };
}

export async function updateSchool(
  formData: FormData
): Promise<SchoolActionResult> {
  const validation = validateUpdateSchool(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
  const context = await requireUpdateSchoolContext(input.school_id);

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;

  const { data: existingSchool, error: lookupError } = await supabase
    .from("schools")
    .select("id,status")
    .eq("id", input.school_id)
    .eq("organization_id", ownership.organization_id)
    .maybeSingle();

  if (lookupError || !existingSchool) {
    return { ok: false, error: "School not found in your organization." };
  }

  const currentStatus = existingSchool.status as SchoolStatus;

  if (!isValidSchoolStatusTransition(currentStatus, input.status)) {
    return {
      ok: false,
      error: "Pipeline status cannot move backward."
    };
  }

  const assignee = await resolveAssignedTo(
    supabase,
    ownership.organization_id,
    input,
    ownership.assigned_to,
    user.id
  );

  if (assignee.error || !assignee.assignedTo) {
    return {
      ok: false,
      error: assignee.error ?? "You do not have permission to update this school."
    };
  }

  const { data: updatedSchool, error } = await supabase
    .from("schools")
    .update({
      name: input.name,
      website: input.website ?? null,
      status: input.status,
      owner: input.owner,
      next_step: input.next_step,
      notes: input.notes ?? null,
      assigned_to: assignee.assignedTo,
      updated_by: ownership.updated_by
    })
    .eq("id", input.school_id)
    .select("id")
    .single();

  if (error || !updatedSchool) {
    return { ok: false, error: "Could not update the school." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.schoolUpdate,
    targetTable: "schools",
    recordId: updatedSchool.id,
    metadata: {
      name: input.name,
      previous_status: currentStatus,
      status: input.status,
      owner: input.owner
    }
  });

  revalidatePath("/");
  revalidatePath(`/schools/${input.school_id}`);

  return { ok: true };
}
