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

type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof getServerSupabaseClient>>
>;

type MutationContext =
  | {
      ok: true;
      supabase: ServerSupabase;
      user: User;
      ownership: RecordOwnershipFields;
      organizationId: string;
    }
  | { ok: false; error: string };

async function requireOrgWriteContext(
  organizationId: string,
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
    return { ok: false, error: "Sign in to manage contacts." };
  }

  const membership = await requireRole(user, MUTATION_ROLES, organizationId);

  if (!membership) {
    return { ok: false, error: permissionMessage };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership || ownership.organization_id !== organizationId) {
    return { ok: false, error: permissionMessage };
  }

  return {
    ok: true,
    supabase,
    user,
    ownership,
    organizationId
  };
}

async function resolveLinkedSchools(
  supabase: ServerSupabase,
  organizationId: string,
  linkedSchoolIds: string[] | undefined
) {
  const ids = [...new Set((linkedSchoolIds ?? []).filter(Boolean))];
  if (!ids.length) {
    return { ok: true as const, ids: [] as string[] };
  }

  const { data, error } = await supabase
    .from("schools")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error || !data || data.length !== ids.length) {
    return {
      ok: false as const,
      error: "One or more linked schools are invalid for your organization."
    };
  }

  return { ok: true as const, ids };
}

export async function createContact(
  formData: FormData
): Promise<ContactActionResult> {
  const validation = validateCreateContact(formData);

  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

  const input = validation.data;
  const schoolId = input.school_id?.trim() || null;
  const partnerId = input.partner_id?.trim() || null;

  const supabaseProbe = await getServerSupabaseClient();
  if (!supabaseProbe) {
    return {
      ok: false,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  let organizationId: string | null = null;
  if (schoolId) {
    organizationId = await getSchoolOrganizationId(supabaseProbe, schoolId);
  } else if (partnerId) {
    const { data: partner } = await supabaseProbe
      .from("partners")
      .select("organization_id")
      .eq("id", partnerId)
      .maybeSingle();
    organizationId = partner?.organization_id ?? null;
  }

  if (!organizationId) {
    return {
      ok: false,
      error: "Select a valid school or partner in your organization."
    };
  }

  const context = await requireOrgWriteContext(
    organizationId,
    "You do not have permission to create contacts."
  );

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const linked = await resolveLinkedSchools(
    context.supabase,
    organizationId,
    input.linked_school_ids
  );
  if (!linked.ok) {
    return { ok: false, error: linked.error };
  }

  const { supabase, user, ownership } = context;
  const lastTouch = new Date().toISOString().slice(0, 10);

  const { data: insertedContact, error } = await supabase
    .from("contacts")
    .insert({
      school_id: schoolId,
      partner_id: partnerId,
      name: input.name,
      role: input.role,
      email: input.email,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      linkedin_url: input.linkedin_url ?? null,
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

  if (linked.ids.length) {
    const { error: linkError } = await supabase
      .from("contact_linked_schools")
      .insert(
        linked.ids.map((id) => ({
          contact_id: insertedContact.id,
          school_id: id,
          organization_id: ownership.organization_id
        }))
      );
    if (linkError) {
      return {
        ok: false,
        error: "Contact created, but linked schools could not be saved."
      };
    }
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactCreate,
    targetTable: "contacts",
    recordId: insertedContact.id,
    metadata: {
      school_id: schoolId,
      partner_id: partnerId,
      name: input.name,
      email: input.email,
      relationship: input.relationship
    }
  });

  if (schoolId) {
    revalidatePath(`/schools/${schoolId}`);
  }
  revalidatePath("/contacts");
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
  const schoolId = input.school_id?.trim() || null;
  const partnerId = input.partner_id?.trim() || null;

  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    return { ok: false, error: "Sign in to update contacts." };
  }

  const context = await requireOrgWriteContext(
    ownership.organization_id,
    "You do not have permission to update contacts."
  );

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user } = context;

  let query = supabase
    .from("contacts")
    .select("id,school_id,partner_id")
    .eq("id", input.contact_id)
    .eq("organization_id", ownership.organization_id);

  if (schoolId) {
    query = query.eq("school_id", schoolId);
  }
  if (partnerId) {
    query = query.eq("partner_id", partnerId);
  }

  const { data: existingContact, error: lookupError } = await query.maybeSingle();

  if (lookupError || !existingContact) {
    return { ok: false, error: "Contact not found." };
  }

  const linked = await resolveLinkedSchools(
    supabase,
    ownership.organization_id,
    input.linked_school_ids
  );
  if (!linked.ok) {
    return { ok: false, error: linked.error };
  }

  const { data: updatedContact, error } = await supabase
    .from("contacts")
    .update({
      name: input.name,
      role: input.role,
      email: input.email,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      linkedin_url: input.linkedin_url ?? null,
      relationship: input.relationship,
      updated_by: ownership.updated_by
    })
    .eq("id", input.contact_id)
    .eq("organization_id", ownership.organization_id)
    .select("id")
    .single();

  if (error || !updatedContact) {
    return { ok: false, error: "Could not update the contact." };
  }

  if (input.linked_school_ids) {
    await supabase
      .from("contact_linked_schools")
      .delete()
      .eq("contact_id", input.contact_id)
      .eq("organization_id", ownership.organization_id);

    if (linked.ids.length) {
      await supabase.from("contact_linked_schools").insert(
        linked.ids.map((id) => ({
          contact_id: input.contact_id,
          school_id: id,
          organization_id: ownership.organization_id
        }))
      );
    }
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactUpdate,
    targetTable: "contacts",
    recordId: updatedContact.id,
    metadata: {
      school_id: existingContact.school_id,
      partner_id: existingContact.partner_id,
      name: input.name,
      email: input.email,
      relationship: input.relationship
    }
  });

  if (existingContact.school_id) {
    revalidatePath(`/schools/${existingContact.school_id}`);
  }
  revalidatePath("/contacts");
  revalidatePath("/");

  return { ok: true };
}
