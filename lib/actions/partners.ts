"use server";

import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";
import {
  validateCreatePartner,
  type PartnerActionResult
} from "@/lib/validation";

export type PartnerRecord = {
  id: string;
  name: string;
  partner_type: "Corporate" | "Industry partner" | "Other";
  website: string | null;
  industry: string | null;
  notes: string | null;
};

export async function listPartnersForOrganization(
  organizationId: string
): Promise<PartnerRecord[]> {
  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("partners")
    .select("id,name,partner_type,website,industry,notes")
    .eq("organization_id", organizationId)
    .order("name");

  if (error || !data) {
    return [];
  }

  return data as PartnerRecord[];
}

export async function createPartner(
  formData: FormData
): Promise<PartnerActionResult> {
  const validation = validateCreatePartner(formData);
  if (!validation.success) {
    return { ok: false, error: validation.error };
  }

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
    return { ok: false, error: "Sign in to create partners." };
  }

  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    return { ok: false, error: "Sign in to create partners." };
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    ownership.organization_id
  );
  if (!membership) {
    return { ok: false, error: "You do not have permission to create partners." };
  }

  const input = validation.data;
  const { data, error } = await supabase
    .from("partners")
    .insert({
      name: input.name,
      partner_type: input.partner_type,
      website: input.website ?? null,
      industry: input.industry ?? null,
      notes: input.notes ?? null,
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create the partner organization." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.partnerCreate,
    targetTable: "partners",
    recordId: data.id,
    metadata: {
      name: input.name,
      partner_type: input.partner_type
    }
  });

  revalidatePath("/contacts");
  revalidatePath("/");

  return { ok: true, partnerId: data.id };
}
