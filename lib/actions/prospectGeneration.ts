"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";

import { createAgentHandlerDependencies } from "@/lib/actions/agentHandlerDependencies";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { assertRealProviderPilotAccess } from "@/lib/agents/pilot";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import { createGatedAgentOrchestratorFromSupabase } from "@/lib/agents/worker";
import {
  parseProspectGenerationInput,
  type ProspectGenerationInput,
  type ProspectGenerationJob
} from "@/lib/prospectGeneration";
import { getProspectDiscoveryProviderStatus } from "@/lib/prospectSources/discoveryReadiness";
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

export type ProcessProspectGenerationJobResult =
  | {
      ok: true;
      queued: true;
      job: ProspectGenerationJob;
      message: string;
    }
  | { ok: false; error: string };

function jobIdFromFormData(formData: FormData): string | null {
  const jobId = String(formData.get("job_id") ?? "").trim();
  return jobId || null;
}

async function loadQueuedJob(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  jobId: string,
  organizationId: string
): Promise<ProspectGenerationJob | null> {
  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ProspectGenerationJob;
}

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

  const pilot = await assertRealProviderPilotAccess({
    supabase,
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    agentName: "ProspectGenerationAgent",
    candidateBatchSize: input.maxResults
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

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

/**
 * Queue prospect discovery for the background worker.
 * Does not crawl or call Scorecard/search APIs in-request.
 */
export async function processProspectGenerationJob(
  formData: FormData
): Promise<ProcessProspectGenerationJobResult> {
  const jobId = jobIdFromFormData(formData);

  if (!jobId) {
    return { ok: false, error: "Select a valid prospect generation job." };
  }

  const context = await requireProspectJobContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const job = await loadQueuedJob(supabase, jobId, ownership.organization_id);

  if (!job) {
    return {
      ok: false,
      error: "Prospect generation job not found in your organization."
    };
  }

  if (job.status !== "queued") {
    return {
      ok: false,
      error: "Only queued jobs can generate candidates."
    };
  }

  const providers = getProspectDiscoveryProviderStatus();
  if (!providers.anyReady && !isDevelopmentEnvironment()) {
    await recordAuditEvent(supabase, {
      organizationId: ownership.organization_id,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.prospectProviderNotConfigured,
      targetTable: "prospect_generation_jobs",
      recordId: jobId,
      metadata: {
        scorecard_status: providers.scorecardStatus,
        public_web_status: providers.publicWebStatus
      }
    });
    return {
      ok: false,
      error:
        "Prospect discovery providers are not configured. Set COLLEGE_SCORECARD_API_KEY and/or PUBLIC_WEB_DISCOVERY_ENABLED with WEB_SEARCH_API_KEY and WEB_SEARCH_ENGINE_ID."
    };
  }

  const pilot = await assertRealProviderPilotAccess({
    supabase,
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    agentName: "ProspectGenerationAgent",
    candidateBatchSize: job.input.maxResults
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

  const handlerDependencies = await createAgentHandlerDependencies(supabase);
  const usageStore = new SupabaseAgentUsageStore(supabase);
  const orchestrator = createGatedAgentOrchestratorFromSupabase(supabase, {
    handlerDependencies,
    usageStore
  });

  const queued = await orchestrator.queueAgent({
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    agentName: "ProspectGenerationAgent",
    targetType: "prospect_generation_job",
    targetId: job.id
  });

  if (!queued.ok) {
    return {
      ok: false,
      error: queued.error ?? "Could not queue prospect generation."
    };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectWebDiscoveryQueued,
    targetTable: "prospect_generation_jobs",
    recordId: jobId,
    metadata: {
      agent_execution_id: queued.execution?.id ?? null
    }
  });

  revalidatePath("/prospects/generate");
  revalidatePath("/prospects/jobs");

  return {
    ok: true,
    queued: true,
    job,
    message: "Generation queued."
  };
}
