import { timingSafeEqual } from "crypto";

import { recordAuditEvent } from "@/lib/auditLog";
import { createServiceRoleSupabaseClient } from "@/lib/supabaseServiceRole";

import {
  AGENT_AUDIT_ACTIONS,
  AgentOrchestrator
} from "./orchestrator";
import {
  DEFAULT_STALE_RUNNING_MINUTES,
  resolveAgentWorkerBatchSize
} from "./retryPolicy";
import {
  createSupabaseAgentAuditRecorder,
  SupabaseAgentExecutionStore
} from "./supabaseStore";
import { SupabaseAgentUsageStore } from "./usageStore";
import type { AgentExecution } from "./types";
import type { AgentExecutionStore } from "./store";

export const AGENT_CRON_ACTOR_USER_ID = "00000000-0000-4000-8000-0000000000cron";

export type AgentBatchProcessSummary = {
  processed: number;
  completed: number;
  failed: number;
  retried: number;
  skipped: number;
  stale_recovered: number;
};

export function validateAgentCronSecret(
  providedSecret: string | null | undefined,
  expectedSecret: string | null | undefined
): boolean {
  if (!providedSecret || !expectedSecret) {
    return false;
  }

  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(expectedSecret);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

export function summarizeClaimedExecution(execution: AgentExecution): {
  completed: number;
  failed: number;
  retried: number;
} {
  if (execution.status === "completed") {
    return { completed: 1, failed: 0, retried: 0 };
  }

  if (execution.status === "queued" && execution.next_retry_at) {
    return { completed: 0, failed: 0, retried: 1 };
  }

  if (execution.status === "failed") {
    return { completed: 0, failed: 1, retried: 0 };
  }

  return { completed: 0, failed: 0, retried: 0 };
}

export async function processAgentExecutionBatch(params: {
  store: AgentExecutionStore;
  orchestrator: AgentOrchestrator;
  actorUserId: string;
  batchSize?: number;
  staleAfterMinutes?: number;
  env?: NodeJS.ProcessEnv;
  auditStale?: (execution: AgentExecution) => Promise<void>;
}): Promise<AgentBatchProcessSummary> {
  const batchSize = params.batchSize ?? resolveAgentWorkerBatchSize(params.env);
  const staleAfterMinutes =
    params.staleAfterMinutes ?? DEFAULT_STALE_RUNNING_MINUTES;

  const recovered = await params.store.recoverStaleRunning(staleAfterMinutes);

  for (const execution of recovered) {
    if (params.auditStale) {
      await params.auditStale(execution);
    }
  }

  const claimed = await params.store.claimBatch(batchSize);

  const summary: AgentBatchProcessSummary = {
    processed: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
    stale_recovered: recovered.length
  };

  if (claimed.length === 0) {
    summary.skipped = 1;
    return summary;
  }

  for (const execution of claimed) {
    const result = await params.orchestrator.runClaimedExecution(execution, {
      actorUserId: params.actorUserId,
      env: params.env
    });

    if (!result.ok || !result.ran || !result.execution) {
      summary.skipped += 1;
      continue;
    }

    summary.processed += 1;
    const counted = summarizeClaimedExecution(result.execution);
    summary.completed += counted.completed;
    summary.failed += counted.failed;
    summary.retried += counted.retried;
  }

  return summary;
}

export async function processAgentExecutionsFromCron(params: {
  env?: NodeJS.ProcessEnv;
  actorUserId?: string;
}): Promise<
  | { ok: true; summary: AgentBatchProcessSummary }
  | { ok: false; error: string; status: number }
> {
  const env = params.env ?? process.env;
  const supabase = createServiceRoleSupabaseClient(env);

  if (!supabase) {
    return {
      ok: false,
      error: "Service role is not configured for the agent worker.",
      status: 503
    };
  }

  const store = new SupabaseAgentExecutionStore(supabase);
  const usageStore = new SupabaseAgentUsageStore(supabase);
  const auditRecorder = createSupabaseAgentAuditRecorder(supabase, recordAuditEvent);
  const orchestrator = new AgentOrchestrator(
    store,
    undefined,
    auditRecorder,
    usageStore
  );
  const actorUserId = params.actorUserId ?? AGENT_CRON_ACTOR_USER_ID;

  const summary = await processAgentExecutionBatch({
    store,
    orchestrator,
    actorUserId,
    env,
    auditStale: async (execution) => {
      await auditRecorder({
        organizationId: execution.organization_id,
        actorUserId,
        action: AGENT_AUDIT_ACTIONS.staleRecovered,
        recordId: execution.id,
        metadata: {
          agent_name: execution.agent_name,
          last_error_code: execution.last_error_code
        }
      });
    }
  });

  return { ok: true, summary };
}
