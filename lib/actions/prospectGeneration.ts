"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import {
  parseProspectGenerationInput,
  type ProspectGenerationInput,
  type ProspectGenerationJob
} from "@/lib/prospectGeneration";
import { getRecordOwnershipFields, type RecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

type ProspectJobContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      user: User;
      ownership: RecordOwnershipFields;
    }
  | { ok: false; error: string };

export type CreateProspectGenerationJobResult =
  | {
      ok: true;
      job: ProspectGenerationJob;
    }
  | { ok: false; error: string };

async function requireProspectJobContext(): Promise<ProspectJobContext> {
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
    return { ok: false, error: "Sign in to generate prospects." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false,
      error: "You do not have permission to generate prospects."
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
      error: "You do not have permission to generate prospects."
    };
  }

  return { ok: true, supabase, user, ownership };
}

export async function createProspectGenerationJob(
  formData: FormData
): Promise<CreateProspectGenerationJobResult> {
  const parsed = parseProspectGenerationInput(formData);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const context = await requireProspectJobContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const input: ProspectGenerationInput = parsed.input;

  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .insert({
      organization_id: ownership.organization_id,
      created_by: user.id,
      job_type: "discover_prospects",
      status: "queued",
      input
    })
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create prospect generation job." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectJobCreate,
    targetTable: "prospect_generation_jobs",
    recordId: data.id,
    metadata: {
      status: "queued",
      geography: input.geography,
      max_results: input.maxResults,
      school_type_count: input.schoolTypes.length
    }
  });

  revalidatePath("/prospects/generate");

  return {
    ok: true,
    job: data as ProspectGenerationJob
  };
}
