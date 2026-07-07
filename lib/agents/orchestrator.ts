import { sanitizeAgentErrorMessage } from "./sanitize";
import { createAgentHandlerRegistry } from "./handlers";
import type { AgentExecutionStore } from "./store";
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
  fail: "agent.fail"
} as const;

export type QueueAgentResult =
  | { ok: true; execution: AgentExecution }
  | { ok: false; error: string };

export type QueueAgentChainResult =
  | { ok: true; executions: AgentExecution[] }
  | { ok: false; error: string };

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
    error_message: `${agentName} is not registered.`
  });
}

export class AgentOrchestrator {
  private readonly executors: Map<AgentName, AgentExecutor>;

  constructor(
    private readonly store: AgentExecutionStore,
    executors?: Map<AgentName, AgentExecutor>,
    private readonly audit?: AgentAuditRecorder
  ) {
    this.executors = executors ?? createAgentHandlerRegistry();
  }

  async queueAgent(input: QueueAgentInput): Promise<QueueAgentResult> {
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
    }

    const execution = await this.store.insert({
      organization_id: input.organizationId,
      agent_name: input.agentName,
      target_type: input.targetType,
      target_id: input.targetId,
      status: "queued",
      depends_on_execution_id: input.dependsOnExecutionId ?? null,
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
        depends_on_execution_id: execution.depends_on_execution_id
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
    const next = await this.store.findNextRunnable(params.organizationId);

    if (!next) {
      return {
        ok: true,
        execution: null,
        ran: false,
        reason: "No queued agent executions are ready to run."
      };
    }

    const startedAt = Date.now();
    const running = await this.store.update(next.id, params.organizationId, {
      status: "running",
      started_at: new Date(startedAt).toISOString(),
      error_message: null
    });

    if (!running) {
      return { ok: false, error: "Could not start the next agent execution." };
    }

    await this.recordAudit({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AGENT_AUDIT_ACTIONS.start,
      recordId: running.id,
      metadata: {
        agent_name: running.agent_name,
        target_type: running.target_type,
        target_id: running.target_id
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
        error_message: "Agent execution failed unexpectedly."
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
      const failed = await this.store.update(running.id, params.organizationId, {
        status: "failed",
        completed_at: new Date(completedAt).toISOString(),
        duration_ms: durationMs,
        error_message: result.error_message,
        metadata: result.metadata
      });

      if (!failed) {
        return { ok: false, error: "Could not record agent execution failure." };
      }

      await this.recordAudit({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: AGENT_AUDIT_ACTIONS.fail,
        recordId: failed.id,
        metadata: {
          agent_name: failed.agent_name,
          error_message: failed.error_message ?? "unknown"
        }
      });

      return { ok: true, execution: failed, ran: true };
    }

    const completed = await this.store.update(running.id, params.organizationId, {
      status: "completed",
      completed_at: new Date(completedAt).toISOString(),
      duration_ms: durationMs,
      error_message: null,
      metadata: result.metadata
    });

    if (!completed) {
      return { ok: false, error: "Could not record agent execution completion." };
    }

    await this.recordAudit({
      organizationId: params.organizationId,
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
        error_message: "Cancelled by user."
      }
    );

    if (!cancelled) {
      return { ok: false, error: "Could not cancel the agent execution." };
    }

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
        attempt_count: execution.attempt_count + 1
      }
    );

    if (!retried) {
      return { ok: false, error: "Could not retry the agent execution." };
    }

    await this.recordAudit({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AGENT_AUDIT_ACTIONS.queue,
      recordId: retried.id,
      metadata: {
        agent_name: retried.agent_name,
        retry: true,
        attempt_count: retried.attempt_count
      }
    });

    return { ok: true, execution: retried };
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
