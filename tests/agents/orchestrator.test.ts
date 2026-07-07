import { beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_AUDIT_ACTIONS,
  AgentOrchestrator,
  InMemoryAgentExecutionStore,
  PROSPECT_AGENT_PIPELINE,
  type AgentAuditEventInput,
  type AgentExecutor,
  type AgentName
} from "@/lib/agents";

describe("AgentOrchestrator", () => {
  const organizationId = "org-1";
  const actorUserId = "user-1";
  let store: InMemoryAgentExecutionStore;
  let auditEvents: AgentAuditEventInput[];
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    store = new InMemoryAgentExecutionStore();
    auditEvents = [];
    orchestrator = new AgentOrchestrator(store, undefined, async (event) => {
      auditEvents.push(event);
    });
  });

  it("queues a single agent execution", async () => {
    const result = await orchestrator.queueAgent({
      organizationId,
      actorUserId,
      agentName: "ProspectGenerationAgent",
      targetType: "prospect_generation_job",
      targetId: "job-1"
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.execution).toMatchObject({
        organization_id: organizationId,
        agent_name: "ProspectGenerationAgent",
        target_type: "prospect_generation_job",
        target_id: "job-1",
        status: "queued"
      });
    }

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.action).toBe(AGENT_AUDIT_ACTIONS.queue);
  });

  it("queues a dependency chain for prospect agents", async () => {
    const result = await orchestrator.queueAgentChain({
      organizationId,
      actorUserId,
      targetType: "prospect_generation_job",
      targetId: "job-1",
      agentNames: PROSPECT_AGENT_PIPELINE
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.executions.map((execution) => execution.agent_name)).toEqual(
      PROSPECT_AGENT_PIPELINE
    );
    expect(result.executions[0]?.depends_on_execution_id).toBeNull();
    expect(result.executions[1]?.depends_on_execution_id).toBe(
      result.executions[0]?.id
    );
    expect(result.executions[2]?.depends_on_execution_id).toBe(
      result.executions[1]?.id
    );
  });

  it("runs queued agents in dependency order", async () => {
    const executors = new Map<AgentName, AgentExecutor>();
    for (const agentName of PROSPECT_AGENT_PIPELINE) {
      executors.set(agentName, async () => ({ ok: true }));
    }

    const pipelineOrchestrator = new AgentOrchestrator(store, executors);

    const chain = await pipelineOrchestrator.queueAgentChain({
      organizationId,
      actorUserId,
      targetType: "prospect_candidate",
      targetId: "candidate-1",
      agentNames: PROSPECT_AGENT_PIPELINE
    });

    expect(chain.ok).toBe(true);

    const completedAgents: AgentName[] = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const run = await pipelineOrchestrator.runNextAgent({
        organizationId,
        actorUserId
      });

      if (!run.ok || !run.ran) {
        break;
      }

      completedAgents.push(run.execution.agent_name);
    }

    expect(completedAgents).toEqual(PROSPECT_AGENT_PIPELINE);
    expect(
      store
        .snapshot()
        .every((execution) => execution.status === "completed")
    ).toBe(true);
  });

  it("records start, complete, and fail audit events", async () => {
    const executors = new Map<AgentName, AgentExecutor>();
    executors.set("ProspectGenerationAgent", async () => ({
      ok: true,
      metadata: { test: true }
    }));

    const auditedOrchestrator = new AgentOrchestrator(store, executors, async (event) => {
      auditEvents.push(event);
    });

    await auditedOrchestrator.queueAgent({
      organizationId,
      actorUserId,
      agentName: "ProspectGenerationAgent",
      targetType: "prospect_generation_job",
      targetId: "job-1"
    });

    await auditedOrchestrator.runNextAgent({ organizationId, actorUserId });

    expect(auditEvents.map((event) => event.action)).toEqual([
      AGENT_AUDIT_ACTIONS.queue,
      AGENT_AUDIT_ACTIONS.start,
      AGENT_AUDIT_ACTIONS.complete
    ]);
  });

  it("cancels queued executions", async () => {
    const queued = await orchestrator.queueAgent({
      organizationId,
      actorUserId,
      agentName: "ProspectEnrichmentAgent",
      targetType: "prospect_candidate",
      targetId: "candidate-1"
    });

    expect(queued.ok).toBe(true);

    if (!queued.ok) {
      return;
    }

    const cancelled = await orchestrator.cancelAgent({
      organizationId,
      actorUserId,
      executionId: queued.execution.id
    });

    expect(cancelled.ok).toBe(true);

    if (cancelled.ok) {
      expect(cancelled.execution.status).toBe("cancelled");
    }
  });

  it("retries failed executions back to queued", async () => {
    const executors = new Map<AgentName, AgentExecutor>();
    executors.set("ProspectEnrichmentAgent", async () => ({
      ok: false,
      error_message: "Provider unavailable."
    }));

    const failingOrchestrator = new AgentOrchestrator(store, executors);

    const queued = await failingOrchestrator.queueAgent({
      organizationId,
      actorUserId,
      agentName: "ProspectEnrichmentAgent",
      targetType: "prospect_candidate",
      targetId: "candidate-1"
    });

    expect(queued.ok).toBe(true);

    if (!queued.ok) {
      return;
    }

    const failedRun = await failingOrchestrator.runNextAgent({
      organizationId,
      actorUserId
    });

    expect(failedRun.ok).toBe(true);

    if (!failedRun.ok || !failedRun.ran) {
      return;
    }

    expect(failedRun.execution.status).toBe("failed");

    const retried = await failingOrchestrator.retryAgent({
      organizationId,
      actorUserId,
      executionId: failedRun.execution.id
    });

    expect(retried.ok).toBe(true);

    if (retried.ok) {
      expect(retried.execution.status).toBe("queued");
      expect(retried.execution.attempt_count).toBe(1);
    }
  });

  it("marks future agents as failed until implemented", async () => {
    await orchestrator.queueAgent({
      organizationId,
      actorUserId,
      agentName: "FutureContactDiscoveryAgent",
      targetType: "school",
      targetId: "school-1"
    });

    const run = await orchestrator.runNextAgent({ organizationId, actorUserId });

    expect(run.ok).toBe(true);

    if (run.ok && run.ran) {
      expect(run.execution.status).toBe("failed");
      expect(run.execution.error_message).toContain("not implemented");
    }
  });

  it("does not run chained agents until dependencies complete", async () => {
    const executors = new Map<AgentName, AgentExecutor>();
    executors.set("ProspectGenerationAgent", async () => ({ ok: true }));
    executors.set("ProspectEnrichmentAgent", async () => ({ ok: true }));
    executors.set("OutreachDraftAgent", async () => ({ ok: true }));

    const pipelineOrchestrator = new AgentOrchestrator(store, executors);

    const chain = await pipelineOrchestrator.queueAgentChain({
      organizationId,
      actorUserId,
      targetType: "prospect_candidate",
      targetId: "candidate-1",
      agentNames: PROSPECT_AGENT_PIPELINE
    });

    expect(chain.ok).toBe(true);

    const firstRun = await pipelineOrchestrator.runNextAgent({
      organizationId,
      actorUserId
    });
    expect(firstRun.ok).toBe(true);

    if (firstRun.ok && firstRun.ran) {
      expect(firstRun.execution.agent_name).toBe("ProspectGenerationAgent");
    }

    const queuedAfterFirst = store
      .snapshot()
      .filter((execution) => execution.status === "queued")
      .map((execution) => execution.agent_name);

    expect(queuedAfterFirst).toEqual([
      "ProspectEnrichmentAgent",
      "OutreachDraftAgent"
    ]);
  });
});
