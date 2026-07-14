"use server";

import {
  AGENT_WORKER_ROLES,
  requireRole
} from "@/lib/authz";
import { createAgentHandlerDependencies } from "@/lib/actions/agentHandlerDependencies";
import { createAgentWorkerFromSupabase } from "@/lib/agents/worker";
import type { ProcessNextAgentWorkerResult } from "@/lib/agents/worker";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type { ProcessNextAgentWorkerResult };

export async function processNextAgentExecution(): Promise<ProcessNextAgentWorkerResult> {
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
    return { ok: false, error: "Sign in to process agent executions." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false,
      error: "You do not have permission to process agent executions."
    };
  }

  const membership = await requireRole(
    user,
    AGENT_WORKER_ROLES,
    ownership.organization_id
  );

  if (!membership) {
    return {
      ok: false,
      error: "Only admins can process agent executions."
    };
  }

  const handlerDependencies = await createAgentHandlerDependencies(supabase);
  const usageStore = new SupabaseAgentUsageStore(supabase);
  const worker = createAgentWorkerFromSupabase(supabase, {
    handlerDependencies,
    usageStore
  });

  return worker.processNext({
    organizationId: ownership.organization_id,
    actorUserId: user.id
  });
}
