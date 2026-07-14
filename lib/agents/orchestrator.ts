import { startOfUtcDay } from "@/lib/agentOperations";

import { sanitizeAgentErrorMessage } from "./sanitize";
import { createAgentHandlerRegistry } from "./handlers";
import {
  auditActionForPolicyDenial,
  evaluateAgentPolicy,
  type AgentPolicyDecision,
  type AgentPolicyReasonCode
} from "./policy";
import { decideAgentRetry } from "./retryPolicy";
import {
  computeChainDepthFromParent,
  detectCircularDependency
} from "./safety";
import type { AgentExecutionStore } from "./store";
import {
  hoursAgoIso,
  recordLlmUsageEvent,
  startOfUtcMonth,
  type AgentUsageStore
} from "./usage";
import type {
  AgentExecution,
  AgentExecutor,
  AgentName,
  QueueAgentChainInput,
  QueueAgentInput
} from "./types";

export type AgentAuditEventInput = {
  organizationId: string;
  actorUserId: string;
  action: string;
  recordId: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AgentAuditRecorder = (event: AgentAuditEventInput) => Promise<void>;

export const AGENT_AUDIT_ACTIONS = {
  queue: "agent.queue",
  start: "agent.start",
  complete: "agent.complete",
  fail: "agent.fail",
  retry: "agent.retry",
  cancel: "agent.cancel",
  retryScheduled: "agent.retry_scheduled",
  retryExhausted: "agent.retry_exhausted",
  staleRecovered: "agent.stale_recovered",
  policyDenied: "agent.policy_denied",
  usageLimitReached: "agent.usage_limit_reached",
  budgetLimitReached: "agent.budget_limit_reached",
  chainDepthExceeded: "agent.chain_depth_exceeded"
} as const;

export type QueueAgentResult =
  | { ok: true; execution: AgentExecution }
  | { ok: false; error: string; reason_code?: AgentPolicyReasonCode };

export type QueueAgentChainResult =
  | { ok: true; executions: AgentExecution[] }
  | { ok: false; error: string; reason_code?: AgentPolicyReasonCode };

export type RunNextAgentResult =
  | { ok: true; execution: AgentExecution; ran: true }
  | { ok: true; execution: null; ran: false; reason: string }
  | { ok: false; error: string };

export type CancelAgentResult =
  | { ok: true; execution: AgentExecution }
  | { ok: false; error: string };

export type RetryAgentResult =
  | { ok: true; execution: AgentExecution }
  | { ok: false; error: string };

function defaultMissingAgentExecutor(agentName: AgentName): AgentExecutor {
  return async () => ({
    ok: false,
    error_message: `${agentName} is not registered.`,
    error_code: "configuration"
  });
}

const LLM_BACKED_AGENTS = new Set<AgentName>([
  "ProspectEnrichmentAgent",
  "OutreachDraftAgent"
]);

export class AgentOrchestrator {
  private readonly executors: Map<AgentName, AgentExecutor>;

  constructor(
    private readonly store: AgentExecutionStore,
    executors?: Map<AgentName, AgentExecutor>,
    private readonly audit?: AgentAuditRecorder,
    private readonly usageStore?: AgentUsageStore
  ) {
    this.executors = executors ?? createAgentHandlerRegistry();
  }

  private async loadUsageSnapshot(
    organizationId: string,
    now: Date = new Date()
  ) {
    const [executionsLastHour, runningCount] = await Promise.all([
      this.store.countCreatedSince(organizationId, hoursAgoIso(1, now)),
      this.store.countByStatus(organizationId, "running")
    ]);

    if (!this.usageStore) {
      return {
        executionsLastHour,
        runningCount,
        llmCallsToday: 0,
        estimatedSpendTodayUsd: 0,
        estimatedSpendMonthUsd: 0
      };
    }

    const [llmCallsToday, estimatedSpendTodayUsd, estimatedSpendMonthUsd] =
      await Promise.all([
        this.usageStore.countLlmCallsSince(organizationId, startOfUtcDay(now)),
        this.usageStore.sumEstimatedCostSince(organizationId, startOfUtcDay(now)),
        this.usageStore.sumEstimatedCostSince(organizationId, startOfUtcMonth(now))
      ]);

    return {
      executionsLastHour,
      runningCount,
      llmCallsToday,
      estimatedSpendTodayUsd,
      estimatedSpendMonthUsd
    };
  }

  private async evaluatePreflight(params: {
    organizationId: string;
    agentName: AgentName;
    chainDepth?: number;
    candidateBatchSize?: number;
    env?: NodeJS.ProcessEnv;
    includeSelfInRunning?: boolean;
  }): Promise<AgentPolicyDecision> {
    const usage = await this.loadUsageSnapshot(params.organizationId);
    const runningCount = params.includeSelfInRunning
      ? usage.runningCount
      : Math.max(0, usage.runningCount);

    return evaluateAgentPolicy({
      usage: {
        ...usage,
        runningCount
      },
      chainDepth: params.chainDepth,
      candidateBatchSize: params.candidateBatchSize,
      checkLlmBudget: LLM_BACKED_AGENTS.has(params.agentName),
      env: params.env
    });
  }

  async queueAgent(input: QueueAgentInput): Promise<QueueAgentResult> {
    const circular = await detectCircularDependency({
      organizationId: input.organizationId,
      dependsOnExecutionId: input.dependsOnExecutionId,
      findById: (id, organizationId) => this.store.findById(id, organizationId)
    });

    if (!circular.ok) {
      return { ok: false, error: circular.error, reason_code: "invalid_configuration" };
    }

    let chainDepth = 1;

    if (input.dependsOnExecutionId) {
      const dependency = await this.store.findById(
        input.dependsOnExecutionId,
        input.organizationId
      );

      if (!dependency) {
        return {
          ok: false,
          error: "Dependency execution was not found in your organization."
        };
      }

      chainDepth = computeChainDepthFromParent(dependency.chain_depth);
    }

    const candidateBatchSize =
      typeof input.metadata?.max_results === "number"
        ? input.metadata.max_results
        : undefined;

    const policy = await this.evaluatePreflight({
      organizationId: input.organizationId,
      agentName: input.agentName,
      chainDepth,
      candidateBatchSize,
      env: undefined,
      includeSelfInRunning: false
    });

    if (!policy.allowed) {
      await this.recordPolicyDenial({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        executionId: null,
        agentName: input.agentName,
        targetType: input.targetType,
        targetId: input.targetId,
        decision: policy
      });

      return {
        ok: false,
        error: policy.user_safe_message,
        reason_code: policy.reason_code
      };
    }

    const execution = await this.store.insert({
      organization_id: input.organizationId,
      agent_name: input.agentName,
      target_type: input.targetType,
      target_id: input.targetId,
      status: "queued",
      depends_on_execution_id: input.dependsOnExecutionId ?? null,
      chain_depth: chainDepth,
      metadata: input.metadata ?? {}
    });

    await this.recordAudit({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: AGENT_AUDIT_ACTIONS.queue,
      recordId: execution.id,
      metadata: {
        agent_name: execution.agent_name,
        target_type: execution.target_type,
        target_id: execution.target_id,
        depends_on_execution_id: execution.depends_on_execution_id,
        chain_depth: execution.chain_depth
      }
    });

    return { ok: true, execution };
  }

  async queueAgentChain(input: QueueAgentChainInput): Promise<QueueAgentChainResult> {
    if (input.agentNames.length === 0) {
      return { ok: false, error: "Select at least one agent for the chain." };
    }

    const executions: AgentExecution[] = [];
    let dependsOnExecutionId: string | null = null;

    for (const agentName of input.agentNames) {
      const queued = await this.queueAgent({
        organizationId: input.organizationId,
        agentName,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
        dependsOnExecutionId,
        actorUserId: input.actorUserId
      });

      if (!queued.ok) {
        return queued;
      }

      executions.push(queued.execution);
      dependsOnExecutionId = queued.execution.id;
    }

    return { ok: true, executions };
  }

  async runNextAgent(params: {
    organizationId: string;
    actorUserId: string;
    env?: NodeJS.ProcessEnv;
  }): Promise<RunNextAgentResult> {
    const claimed = await this.store.claimNext(params.organizationId);

    if (!claimed) {
      return {
        ok: true,
        execution: null,
        ran: false,
        reason: "No queued agent executions are ready to run."
      };
    }

    return this.runClaimedExecution(claimed, params);
  }

  async runClaimedExecution(
    running: AgentExecution,
    params: {
      actorUserId: string;
      env?: NodeJS.ProcessEnv;
    }
  ): Promise<RunNextAgentResult> {
    const startedAt = running.started_at
      ? Date.parse(running.started_at)
      : Date.now();

    const policy = await this.evaluatePreflight({
      organizationId: running.organization_id,
      agentName: running.agent_name,
      chainDepth: running.chain_depth,
      env: params.env,
      includeSelfInRunning: true
    });

    if (!policy.allowed) {
      await this.recordPolicyDenial({
        organizationId: running.organization_id,
        actorUserId: params.actorUserId,
        executionId: running.id,
        agentName: running.agent_name,
        targetType: running.target_type,
        targetId: running.target_id,
        decision: policy
      });

      const completedAt = Date.now();
      return this.finalizeFailure(running, {
        actorUserId: params.actorUserId,
        errorMessage: policy.user_safe_message,
        errorCode: policy.reason_code,
        metadata: {
          policy_denied: true,
          reason_code: policy.reason_code
        },
        durationMs: completedAt - startedAt,
        completedAt
      });
    }

    await this.recordAudit({
      organizationId: running.organization_id,
      actorUserId: params.actorUserId,
      action: AGENT_AUDIT_ACTIONS.start,
      recordId: running.id,
      metadata: {
        agent_name: running.agent_name,
        target_type: running.target_type,
        target_id: running.target_id,
        attempt_count: running.attempt_count,
        chain_depth: running.chain_depth
      }
    });

    const executor =
      this.executors.get(running.agent_name) ??
      defaultMissingAgentExecutor(running.agent_name);

    let result: Awaited<ReturnType<AgentExecutor>>;

    try {
      result = await executor(running, {
        actorUserId: params.actorUserId,
        env: params.env
      });
    } catch {
      result = {
        ok: false,
        error_message: "Agent execution failed unexpectedly.",
        error_code: "transient"
      };
    }

    if (!result.ok) {
      result = {
        ...result,
        error_message: sanitizeAgentErrorMessage(result.error_message)
      };
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    if (!result.ok) {
      return this.finalizeFailure(running, {
        actorUserId: params.actorUserId,
        errorMessage: result.error_message,
        errorCode: result.error_code ?? null,
        metadata: result.metadata,
        durationMs,
        completedAt
      });
    }

    const completed = await this.store.update(running.id, running.organization_id, {
      status: "completed",
      completed_at: new Date(completedAt).toISOString(),
      duration_ms: durationMs,
      error_message: null,
      last_error_code: null,
      next_retry_at: null,
      metadata: result.metadata
    });

    if (!completed) {
      return { ok: false, error: "Could not record agent execution completion." };
    }

    await this.recordAudit({
      organizationId: completed.organization_id,
      actorUserId: params.actorUserId,
      action: AGENT_AUDIT_ACTIONS.complete,
      recordId: completed.id,
      metadata: {
        agent_name: completed.agent_name,
        duration_ms: completed.duration_ms ?? durationMs
      }
    });

    return { ok: true, execution: completed, ran: true };
  }

  private async finalizeFailure(
    running: AgentExecution,
    params: {
      actorUserId: string;
      errorMessage: string;
      errorCode: string | null;
      metadata?: AgentExecution["metadata"];
      durationMs: number;
      completedAt: number;
    }
  ): Promise<RunNextAgentResult> {
    const decision = decideAgentRetry({
      attemptCount: running.attempt_count,
      maxAttempts: running.max_attempts,
      errorMessage: params.errorMessage,
      errorCode: params.errorCode
    });

    if (decision.shouldRetry) {
      const scheduled = await this.store.update(running.id, running.organization_id, {
        status: "queued",
        started_at: null,
        completed_at: null,
        duration_ms: params.durationMs,
        error_message: params.errorMessage,
        last_error_code: decision.failureClass,
        next_retry_at: decision.nextRetryAt,
        metadata: params.metadata
      });

      if (!scheduled) {
        return { ok: false, error: "Could not schedule agent retry." };
      }

      await this.recordAudit({
        organizationId: scheduled.organization_id,
        actorUserId: params.actorUserId,
        action: AGENT_AUDIT_ACTIONS.retryScheduled,
        recordId: scheduled.id,
        metadata: {
          agent_name: scheduled.agent_name,
          attempt_count: scheduled.attempt_count,
          max_attempts: scheduled.max_attempts,
          failure_class: decision.failureClass,
          next_retry_at: decision.nextRetryAt
        }
      });

      return { ok: true, execution: scheduled, ran: true };
    }

    const failed = await this.store.update(running.id, running.organization_id, {
      status: "failed",
      completed_at: new Date(params.completedAt).toISOString(),
      duration_ms: params.durationMs,
      error_message: params.errorMessage,
      last_error_code: decision.failureClass,
      next_retry_at: null,
      metadata: params.metadata
    });

    if (!failed) {
      return { ok: false, error: "Could not record agent execution failure." };
    }

    await this.recordAudit({
      organizationId: failed.organization_id,
      actorUserId: params.actorUserId,
      action: AGENT_AUDIT_ACTIONS.fail,
      recordId: failed.id,
      metadata: {
        agent_name: failed.agent_name,
        error_message: failed.error_message ?? "unknown",
        failure_class: decision.failureClass
      }
    });

    if (decision.exhausted) {
      await this.recordAudit({
        organizationId: failed.organization_id,
        actorUserId: params.actorUserId,
        action: AGENT_AUDIT_ACTIONS.retryExhausted,
        recordId: failed.id,
        metadata: {
          agent_name: failed.agent_name,
          attempt_count: failed.attempt_count,
          max_attempts: failed.max_attempts,
          failure_class: decision.failureClass
        }
      });
    }

    return { ok: true, execution: failed, ran: true };
  }

  async cancelAgent(params: {
    organizationId: string;
    executionId: string;
    actorUserId: string;
  }): Promise<CancelAgentResult> {
    const execution = await this.store.findById(
      params.executionId,
      params.organizationId
    );

    if (!execution) {
      return {
        ok: false,
        error: "Agent execution not found in your organization."
      };
    }

    if (execution.status !== "queued" && execution.status !== "running") {
      return {
        ok: false,
        error: "Only queued or running agent executions can be cancelled."
      };
    }

    const cancelled = await this.store.update(
      params.executionId,
      params.organizationId,
      {
        status: "cancelled",
        completed_at: new Date().toISOString(),
        error_message: "Cancelled by user.",
        last_error_code: "cancelled",
        next_retry_at: null
      }
    );

    if (!cancelled) {
      return { ok: false, error: "Could not cancel the agent execution." };
    }

    await this.recordAudit({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AGENT_AUDIT_ACTIONS.cancel,
      recordId: cancelled.id,
      metadata: {
        agent_name: cancelled.agent_name,
        target_type: cancelled.target_type,
        target_id: cancelled.target_id
      }
    });

    return { ok: true, execution: cancelled };
  }

  async retryAgent(params: {
    organizationId: string;
    executionId: string;
    actorUserId: string;
  }): Promise<RetryAgentResult> {
    const execution = await this.store.findById(
      params.executionId,
      params.organizationId
    );

    if (!execution) {
      return {
        ok: false,
        error: "Agent execution not found in your organization."
      };
    }

    if (execution.status !== "failed") {
      return {
        ok: false,
        error: "Only failed agent executions can be retried."
      };
    }

    const retried = await this.store.update(
      params.executionId,
      params.organizationId,
      {
        status: "queued",
        started_at: null,
        completed_at: null,
        duration_ms: null,
        error_message: null,
        last_error_code: null,
        next_retry_at: null,
        attempt_count: execution.attempt_count
      }
    );

    if (!retried) {
      return { ok: false, error: "Could not retry the agent execution." };
    }

    await this.recordAudit({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AGENT_AUDIT_ACTIONS.retry,
      recordId: retried.id,
      metadata: {
        agent_name: retried.agent_name,
        attempt_count: retried.attempt_count,
        target_type: retried.target_type,
        target_id: retried.target_id
      }
    });

    return { ok: true, execution: retried };
  }

  private async recordPolicyDenial(params: {
    organizationId: string;
    actorUserId: string;
    executionId: string | null;
    agentName: AgentName;
    targetType: string;
    targetId: string;
    decision: Extract<AgentPolicyDecision, { allowed: false }>;
  }): Promise<void> {
    const action = auditActionForPolicyDenial(params.decision.reason_code);

    if (params.executionId) {
      await this.recordAudit({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action,
        recordId: params.executionId,
        metadata: {
          agent_name: params.agentName,
          reason_code: params.decision.reason_code,
          target_type: params.targetType,
          target_id: params.targetId
        }
      });

      if (action !== AGENT_AUDIT_ACTIONS.policyDenied) {
        await this.recordAudit({
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          action: AGENT_AUDIT_ACTIONS.policyDenied,
          recordId: params.executionId,
          metadata: {
            agent_name: params.agentName,
            reason_code: params.decision.reason_code
          }
        });
      }
    }

    if (this.usageStore) {
      await recordLlmUsageEvent(this.usageStore, {
        organizationId: params.organizationId,
        agentExecutionId: params.executionId,
        agentName: params.agentName,
        targetType: params.targetType,
        targetId: params.targetId,
        status: "denied",
        denialReasonCode: params.decision.reason_code
      });
    }
  }

  private async recordAudit(event: AgentAuditEventInput): Promise<void> {
    if (!this.audit) {
      return;
    }

    await this.audit(event);
  }
}

export async function queueAgent(
  orchestrator: AgentOrchestrator,
  input: QueueAgentInput
): Promise<QueueAgentResult> {
  return orchestrator.queueAgent(input);
}

export async function runNextAgent(
  orchestrator: AgentOrchestrator,
  params: {
    organizationId: string;
    actorUserId: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<RunNextAgentResult> {
  return orchestrator.runNextAgent(params);
}

export async function cancelAgent(
  orchestrator: AgentOrchestrator,
  params: {
    organizationId: string;
    executionId: string;
    actorUserId: string;
  }
): Promise<CancelAgentResult> {
  return orchestrator.cancelAgent(params);
}

export async function retryAgent(
  orchestrator: AgentOrchestrator,
  params: {
    organizationId: string;
    executionId: string;
    actorUserId: string;
  }
): Promise<RetryAgentResult> {
  return orchestrator.retryAgent(params);
}
