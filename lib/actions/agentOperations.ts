"use server";

import { revalidatePath } from "next/cache";

import {
  canAccessAgentOrganization,
  canManageAgentOrganization,
  canManageAgentExecutions,
  canViewAgentOperations,
  getAccessibleAgentOrganizationIds,
  getMembershipsForUser
} from "@/lib/authz";
import {
  fetchAgentOperationsExecutions,
  fetchAgentOperationsMetrics,
  fetchAgentOperationsUsage,
  isKnownAgentName
} from "@/lib/agentOperationsData";
import type { AgentExecutionListItem } from "@/lib/agentOperationsData";
import type { AgentOperationsMetrics } from "@/lib/agentOperations";
import type { AgentUsageTotals } from "@/lib/agents/usage";
import {
  calculateAgentQualityDashboardMetrics,
  SupabaseAgentEvaluationStore,
  type AgentEvaluation,
  type AgentQualityDashboardMetrics
} from "@/lib/agents/evaluation";
import {
  AgentOrchestrator,
  type CancelAgentResult,
  type RetryAgentResult
} from "@/lib/agents/orchestrator";
import {
  createSupabaseAgentAuditRecorder,
  SupabaseAgentExecutionStore
} from "@/lib/agents/supabaseStore";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import { AGENT_EXECUTION_STATUSES, type AgentExecutionStatus } from "@/lib/agents/types";
import { recordAuditEvent } from "@/lib/auditLog";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type AgentOperationsActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const PAGE_SIZE = 25;

async function requireAgentOperationsContext() {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return {
      ok: false as const,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();

  if (!user) {
    return { ok: false as const, error: "Sign in to view agent operations." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);

  if (!canViewAgentOperations(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to view agent operations."
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    memberships,
    accessibleOrganizationIds: getAccessibleAgentOrganizationIds(memberships),
    canManage: canManageAgentExecutions(memberships)
  };
}

function parseStatus(value: string | null | undefined): AgentExecutionStatus | null {
  if (!value) {
    return null;
  }

  return (AGENT_EXECUTION_STATUSES as readonly string[]).includes(value)
    ? (value as AgentExecutionStatus)
    : null;
}

export async function loadAgentOperationsDashboard(input: {
  status?: string | null;
  agentName?: string | null;
  organizationId?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  page?: number;
}): Promise<
  | {
      ok: true;
      metrics: AgentOperationsMetrics;
      usage: AgentUsageTotals;
      quality: AgentQualityDashboardMetrics;
      evaluationsByExecutionId: Record<string, AgentEvaluation[]>;
      executions: AgentExecutionListItem[];
      total: number;
      page: number;
      pageSize: number;
      canManage: boolean;
      isSuperAdmin: boolean;
      organizations: { id: string; name: string }[];
    }
  | { ok: false; error: string }
> {
  const context = await requireAgentOperationsContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const page = Math.max(1, input.page ?? 1);
  const organizationId = input.organizationId?.trim() || null;

  if (
    organizationId &&
    !canAccessAgentOrganization(context.memberships, organizationId)
  ) {
    return { ok: false, error: "Organization is outside your access scope." };
  }

  const agentNameRaw = input.agentName?.trim() || null;
  const agentName =
    agentNameRaw && isKnownAgentName(agentNameRaw) ? agentNameRaw : null;

  const evaluationStore = new SupabaseAgentEvaluationStore(context.supabase);
  const since30Days = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const since7Days = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const scopedOrgIds =
    organizationId
      ? [organizationId]
      : context.accessibleOrganizationIds;

  const [metrics, usage, executions, evaluations] = await Promise.all([
    fetchAgentOperationsMetrics(
      context.supabase,
      context.accessibleOrganizationIds,
      organizationId
    ),
    fetchAgentOperationsUsage(
      context.supabase,
      context.accessibleOrganizationIds,
      organizationId
    ),
    fetchAgentOperationsExecutions(context.supabase, context.accessibleOrganizationIds, {
      organizationId,
      status: parseStatus(input.status),
      agentName,
      createdFrom: input.createdFrom?.trim() || null,
      createdTo: input.createdTo?.trim()
        ? `${input.createdTo.trim()}T23:59:59.999Z`
        : null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }),
    evaluationStore.listForOrganizations(scopedOrgIds, {
      sinceIso: since30Days,
      limit: 2000
    })
  ]);

  const quality = calculateAgentQualityDashboardMetrics(evaluations, {
    since7DaysIso: since7Days
  });

  const evaluationsByExecutionId: Record<string, AgentEvaluation[]> = {};
  for (const evaluation of evaluations) {
    if (!evaluation.agent_execution_id) {
      continue;
    }

    const list = evaluationsByExecutionId[evaluation.agent_execution_id] ?? [];
    list.push(evaluation);
    evaluationsByExecutionId[evaluation.agent_execution_id] = list;
  }

  return {
    ok: true,
    metrics,
    usage,
    quality,
    evaluationsByExecutionId,
    executions: executions.items,
    total: executions.total,
    page,
    pageSize: PAGE_SIZE,
    canManage: context.canManage,
    isSuperAdmin: context.accessibleOrganizationIds === null,
    organizations: executions.organizations
  };
}

function createOrchestrator(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>
) {
  return new AgentOrchestrator(
    new SupabaseAgentExecutionStore(supabase),
    undefined,
    createSupabaseAgentAuditRecorder(supabase, recordAuditEvent),
    new SupabaseAgentUsageStore(supabase)
  );
}

export async function retryAgentExecution(input: {
  executionId: string;
  organizationId: string;
}): Promise<AgentOperationsActionResult> {
  const context = await requireAgentOperationsContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (
    !canManageAgentOrganization(context.memberships, input.organizationId)
  ) {
    return {
      ok: false,
      error: "Only admins can retry agent executions for this organization."
    };
  }

  const orchestrator = createOrchestrator(context.supabase);
  const result: RetryAgentResult = await orchestrator.retryAgent({
    organizationId: input.organizationId,
    executionId: input.executionId,
    actorUserId: context.user.id
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/agents");
  return { ok: true, message: "Execution queued for retry." };
}

export async function cancelAgentExecution(input: {
  executionId: string;
  organizationId: string;
}): Promise<AgentOperationsActionResult> {
  const context = await requireAgentOperationsContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (
    !canManageAgentOrganization(context.memberships, input.organizationId)
  ) {
    return {
      ok: false,
      error: "Only admins can cancel agent executions for this organization."
    };
  }

  const orchestrator = createOrchestrator(context.supabase);
  const result: CancelAgentResult = await orchestrator.cancelAgent({
    organizationId: input.organizationId,
    executionId: input.executionId,
    actorUserId: context.user.id
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/agents");
  return { ok: true, message: "Execution cancelled." };
}
