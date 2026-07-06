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
  type RecordOwnershipFields
} from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";
import {
  validateCreateContact,
  validateUpdateContact,
  type ContactActionResult
} from "@/lib/validation";

type SchoolMutationContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      user: User;
      ownership: RecordOwnershipFields;
      schoolOrganizationId: string;
    }
  | { ok: false; error: string };

async function requireContactMutationContext(
  schoolId: string,
  permissionMessage: string
): Promise<SchoolMutationContext> {
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
    return { ok: false, error: "Sign in to manage contacts." };
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

export async function createContact(
  formData: FormData
): Promise<ContactActionResult> {
  const validation = validateCreateContact(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
  const context = await requireContactMutationContext(
    input.school_id,
    "You do not have permission to create contacts."
  );

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const lastTouch = new Date().toISOString().slice(0, 10);

  const { data: insertedContact, error } = await supabase
    .from("contacts")
    .insert({
      school_id: input.school_id,
      name: input.name,
      role: input.role,
      email: input.email,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      relationship: input.relationship,
      last_touch: lastTouch,
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by
    })
    .select("id")
    .single();

  if (error || !insertedContact) {
    return { ok: false, error: "Could not create the contact." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactCreate,
    targetTable: "contacts",
    recordId: insertedContact.id,
    metadata: {
      school_id: input.school_id,
      name: input.name,
      email: input.email,
      relationship: input.relationship
    }
  });

  revalidatePath(`/schools/${input.school_id}`);
  revalidatePath("/");

  return { ok: true };
}

export async function updateContact(
  formData: FormData
): Promise<ContactActionResult> {
  const validation = validateUpdateContact(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
  const context = await requireContactMutationContext(
    input.school_id,
    "You do not have permission to update contacts."
  );

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;

  const { data: existingContact, error: lookupError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", input.contact_id)
    .eq("school_id", input.school_id)
    .eq("organization_id", ownership.organization_id)
    .maybeSingle();

  if (lookupError || !existingContact) {
    return { ok: false, error: "Contact not found for this school." };
  }

  const { data: updatedContact, error } = await supabase
    .from("contacts")
    .update({
      name: input.name,
      role: input.role,
      email: input.email,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      relationship: input.relationship,
      updated_by: ownership.updated_by
    })
    .eq("id", input.contact_id)
    .eq("school_id", input.school_id)
    .select("id")
    .single();

  if (error || !updatedContact) {
    return { ok: false, error: "Could not update the contact." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactUpdate,
    targetTable: "contacts",
    recordId: updatedContact.id,
    metadata: {
      school_id: input.school_id,
      name: input.name,
      email: input.email,
      relationship: input.relationship
    }
  });

  revalidatePath(`/schools/${input.school_id}`);
  revalidatePath("/");

  return { ok: true };
}
