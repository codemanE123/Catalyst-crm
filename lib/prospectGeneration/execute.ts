/**
 * Worker-side prospect generation execution (Phase 5.2.1).
 * Invoked by AgentWorker / cron — not from blocking page requests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import type { AgentExecutorResult } from "@/lib/agents/types";
import { recordLlmUsageEvent } from "@/lib/agents/usage";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import type { ProspectGenerationInput } from "@/lib/prospectGeneration";
import { generateProspectCandidatesForJob } from "@/lib/prospectSources";
import { COLLEGE_SCORECARD_PROVIDER } from "@/lib/prospectSources/collegeScorecard";
import {
  extractRegistrableDomainHint,
  normalizeOrganizationName
} from "@/lib/prospectSources/domainAllowlist";

function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) {
    return null;
  }
  try {
    return extractRegistrableDomainHint(new URL(website).hostname);
  } catch {
    return null;
  }
}

async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  organizationId: string,
  errorMessage: string,
  errorCode = "PROSPECT_GENERATION_FAILED"
) {
  await supabase
    .from("prospect_generation_jobs")
    .update({
      status: "failed",
      error_code: errorCode,
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId);
}

async function markJobRunning(
  supabase: SupabaseClient,
  jobId: string,
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      error_code: null,
      error_message: null
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  return !error && Boolean(data);
}

export function createProspectGenerationHandlerDependency(
  supabase: SupabaseClient
): {
  processProspectGenerationJob: (input: {
    jobId: string;
    organizationId: string;
    actorUserId: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<AgentExecutorResult>;
} {
  return {
    processProspectGenerationJob: (input) =>
      executeProspectGenerationJob({
        supabase,
        jobId: input.jobId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        env: input.env
      })
  };
}

export async function executeProspectGenerationJob(params: {
  supabase: SupabaseClient;
  jobId: string;
  organizationId: string;
  actorUserId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<AgentExecutorResult> {
  const env = params.env ?? process.env;
  const { supabase, jobId, organizationId, actorUserId } = params;

  const { data: job, error: jobError } = await supabase
    .from("prospect_generation_jobs")
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (jobError || !job) {
    return {
      ok: false,
      error_message: "Prospect generation job not found.",
      error_code: "not_found"
    };
  }

  if (job.status !== "queued" && job.status !== "running") {
    return {
      ok: false,
      error_message: `Prospect generation job is ${job.status}.`,
      error_code: "invalid_state"
    };
  }

  if (job.status === "queued") {
    const claimed = await markJobRunning(supabase, jobId, organizationId);
    if (!claimed) {
      return {
        ok: false,
        error_message: "This job is already being processed.",
        error_code: "conflict"
      };
    }
  }

  await recordAuditEvent(supabase, {
    organizationId,
    actorUserId,
    action: AUDIT_ACTIONS.prospectWebDiscoveryStarted,
    targetTable: "prospect_generation_jobs",
    recordId: jobId,
    metadata: { source: "worker" }
  });

  const input = job.input as ProspectGenerationInput;
  let generation;
  try {
    generation = await generateProspectCandidatesForJob(input, jobId, { env });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.replace(/api_key=[^&\s]+/gi, "api_key=REDACTED")
        : "Prospect discovery failed.";
    await markJobFailed(supabase, jobId, organizationId, message);
    await recordAuditEvent(supabase, {
      organizationId,
      actorUserId,
      action: AUDIT_ACTIONS.prospectWebDiscoveryFailed,
      targetTable: "prospect_generation_jobs",
      recordId: jobId,
      metadata: { error_code: "PROSPECT_GENERATION_FAILED" }
    });
    return { ok: false, error_message: message, error_code: "provider_error" };
  }

  const usageStore = new SupabaseAgentUsageStore(supabase);
  const usageStatus =
    generation.summary.configuration_status === "provider_not_configured" ||
    generation.summary.configuration_status === "missing_api_key" ||
    generation.summary.configuration_status === "disabled"
      ? "denied"
      : generation.summary.configuration_status === "error"
        ? "failed"
        : "success";

  try {
    await recordLlmUsageEvent(usageStore, {
      organizationId,
      agentName: "ProspectGenerationAgent",
      targetType: "prospect_generation_job",
      targetId: jobId,
      provider:
        generation.summary.source === "public_web"
          ? "public_web"
          : COLLEGE_SCORECARD_PROVIDER,
      status: usageStatus,
      denialReasonCode: generation.summary.provider_error_code ?? null,
      inputTokens: generation.summary.provider_request_count ?? 0,
      outputTokens: generation.summary.candidate_count
    });
  } catch {
    // Usage recording must not fail discovery.
  }

  await recordAuditEvent(supabase, {
    organizationId,
    actorUserId,
    action: AUDIT_ACTIONS.prospectJobRun,
    targetTable: "prospect_generation_jobs",
    recordId: jobId,
    metadata: {
      source: generation.summary.source,
      configuration_status: generation.summary.configuration_status ?? null,
      provider_error_code: generation.summary.provider_error_code ?? null,
      candidate_count: generation.summary.candidate_count,
      duplicate_count: generation.summary.duplicate_count ?? 0,
      skipped_count: generation.summary.skipped_count ?? 0
    }
  });

  // Dedup against CRM schools + existing pending candidates in org.
  const { data: schoolRows } = await supabase
    .from("schools")
    .select("name,website")
    .eq("organization_id", organizationId);
  const { data: pendingRows } = await supabase
    .from("prospect_candidates")
    .select("name,website")
    .eq("organization_id", organizationId)
    .in("status", ["pending_review", "approved"]);

  const existingDomains = new Set<string>();
  const existingNames = new Set<string>();
  for (const row of [...(schoolRows ?? []), ...(pendingRows ?? [])]) {
    const domain = domainFromWebsite(
      (row as { website?: string | null }).website
    );
    if (domain) {
      existingDomains.add(domain);
    }
    existingNames.add(
      normalizeOrganizationName(String((row as { name?: string }).name ?? ""))
    );
  }

  let skippedDuplicates = 0;
  const drafts = generation.drafts.filter((draft) => {
    const domain = domainFromWebsite(draft.website);
    const nameKey = normalizeOrganizationName(draft.name);
    if (
      (domain && existingDomains.has(domain)) ||
      (nameKey && existingNames.has(nameKey))
    ) {
      skippedDuplicates += 1;
      return false;
    }
    if (domain) {
      existingDomains.add(domain);
    }
    existingNames.add(nameKey);
    return true;
  });

  if (skippedDuplicates > 0) {
    await recordAuditEvent(supabase, {
      organizationId,
      actorUserId,
      action: AUDIT_ACTIONS.prospectWebDuplicateSkipped,
      targetTable: "prospect_generation_jobs",
      recordId: jobId,
      metadata: { skipped_count: skippedDuplicates }
    });
  }

  if (drafts.length > 0) {
    const { error: insertError } = await supabase.from("prospect_candidates").insert(
      drafts.map((draft) => ({
        organization_id: organizationId,
        job_id: jobId,
        status: "pending_review",
        name: draft.name,
        website: draft.website,
        district: draft.district,
        location: draft.location,
        rationale: draft.rationale,
        confidence_score: draft.confidence_score,
        source_name: draft.source_name,
        source_url: draft.source_url,
        discovery_method: draft.discovery_method,
        retrieved_at: draft.retrieved_at
      }))
    );

    if (insertError) {
      const errorMessage = "Could not save generated prospect candidates.";
      await markJobFailed(supabase, jobId, organizationId, errorMessage);
      await recordAuditEvent(supabase, {
        organizationId,
        actorUserId,
        action: AUDIT_ACTIONS.prospectJobFail,
        targetTable: "prospect_generation_jobs",
        recordId: jobId,
        metadata: { error_code: "PROSPECT_GENERATION_FAILED" }
      });
      return {
        ok: false,
        error_message: errorMessage,
        error_code: "persist_failed"
      };
    }
  }

  const summary = {
    ...generation.summary,
    candidate_count: drafts.length,
    duplicate_count:
      (generation.summary.duplicate_count ?? 0) + skippedDuplicates
  };

  const { error: completeError } = await supabase
    .from("prospect_generation_jobs")
    .update({
      status: "completed",
      summary,
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .eq("status", "running");

  if (completeError) {
    const errorMessage = "Could not complete the prospect generation job.";
    await markJobFailed(supabase, jobId, organizationId, errorMessage);
    return {
      ok: false,
      error_message: errorMessage,
      error_code: "complete_failed"
    };
  }

  await recordAuditEvent(supabase, {
    organizationId,
    actorUserId,
    action: AUDIT_ACTIONS.prospectJobComplete,
    targetTable: "prospect_generation_jobs",
    recordId: jobId,
    metadata: {
      source: summary.source,
      candidate_count: drafts.length
    }
  });

  await recordAuditEvent(supabase, {
    organizationId,
    actorUserId,
    action: AUDIT_ACTIONS.prospectWebDiscoveryCompleted,
    targetTable: "prospect_generation_jobs",
    recordId: jobId,
    metadata: {
      source: summary.source,
      candidate_count: drafts.length,
      skipped_count: summary.skipped_count ?? 0,
      configuration_status: summary.configuration_status ?? null
    }
  });

  if (summary.configuration_status === "provider_not_configured") {
    await recordAuditEvent(supabase, {
      organizationId,
      actorUserId,
      action: AUDIT_ACTIONS.prospectProviderNotConfigured,
      targetTable: "prospect_generation_jobs",
      recordId: jobId,
      metadata: { source: summary.source }
    });
  }

  return {
    ok: true,
    metadata: {
      candidate_count: drafts.length,
      source: summary.source,
      configuration_status: summary.configuration_status ?? null
    }
  };
}
