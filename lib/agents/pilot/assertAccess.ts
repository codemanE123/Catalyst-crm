import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AGENT_PILOT_AUDIT_ACTIONS,
  createPilotGateResolverFromSupabase,
  sanitizePilotAuditMetadata
} from "@/lib/agents/pilot";
import type { AgentName } from "@/lib/agents/types";
import { recordAuditEvent } from "@/lib/auditLog";

/**
 * Shared gate for product actions that invoke real providers outside a
 * queueing path that already has the orchestrator pilot resolver attached.
 */
export async function assertRealProviderPilotAccess(params: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  agentName: AgentName;
  candidateBatchSize?: number | null;
  env?: NodeJS.ProcessEnv;
  recordDenialAudit?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string; reason_code: string }> {
  const gate = createPilotGateResolverFromSupabase(params.supabase);
  const decision = await gate({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    agentName: params.agentName,
    candidateBatchSize: params.candidateBatchSize,
    env: params.env
  });

  if (decision.allowed) {
    return { ok: true };
  }

  if (params.recordDenialAudit !== false) {
    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AGENT_PILOT_AUDIT_ACTIONS.accessDenied,
      targetTable: "agent_pilot_settings",
      recordId: "default",
      metadata: sanitizePilotAuditMetadata({
        agent_name: params.agentName,
        reason_code: decision.reason_code,
        candidate_batch_size: params.candidateBatchSize ?? null
      })
    });
  }

  return {
    ok: false,
    error: decision.user_safe_message,
    reason_code: decision.reason_code
  };
}
