import { beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_AUDIT_ACTIONS,
  AgentOrchestrator,
  AgentWorker,
  createAgentHandlerRegistry,
  InMemoryAgentExecutionStore,
  sanitizeAgentErrorMessage,
  type AgentAuditEventInput,
  type AgentExecutor,
  type AgentName
} from "@/lib/agents";

describe("AgentWorker", () => {
  const organizationId = "org-1";
  const actorUserId = "user-1";
  let store: InMemoryAgentExecutionStore;
  let auditEvents: AgentAuditEventInput[];
  let worker: AgentWorker;

  beforeEach(() => {
    store = new InMemoryAgentExecutionStore();
    auditEvents = [];

    const handlers = createAgentHandlerRegistry();
    const orchestrator = new AgentOrchestrator(store, handlers, async (event) => {
      auditEvents.push(event);
    });
    worker = new AgentWorker(orchestrator);
  });

  it("processes queued executions through running to completed", async () => {
    await store.insert({
      organization_id: organizationId,
      agent_name: "ProspectGenerationAgent",
      target_type: "prospect_generation_job",
      target_id: "job-1",
      status: "queued"
    });

    const result = await worker.processNext({ organizationId, actorUserId });

    expect(result.ok).toBe(true);

    if (result.ok && result.ran) {
      expect(result.execution.status).toBe("completed");
      expect(result.execution.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain("completed successfully");
    }

    expect(auditEvents.map((event) => event.action)).toEqual([
      AGENT_AUDIT_ACTIONS.start,
      AGENT_AUDIT_ACTIONS.complete
    ]);
  });

  it("processes queued executions through running to failed with sanitized errors", async () => {
    const handlers = new Map<AgentName, AgentExecutor>();
    handlers.set("ProspectEnrichmentAgent", async () => ({
      ok: false,
      error_message:
        "Provider failed for dean@school.edu with token sk-test-secret-key-value"
    }));

    const orchestrator = new AgentOrchestrator(store, handlers);
    worker = new AgentWorker(orchestrator);

    await store.insert({
      organization_id: organizationId,
      agent_name: "ProspectEnrichmentAgent",
      target_type: "prospect_candidate",
      target_id: "candidate-1",
      status: "queued"
    });

    const result = await worker.processNext({ organizationId, actorUserId });

    expect(result.ok).toBe(true);

    if (result.ok && result.ran) {
      expect(result.execution.status).toBe("failed");
      expect(result.execution.error_message).not.toContain("dean@school.edu");
      expect(result.execution.error_message).not.toContain("sk-test");
      expect(result.execution.error_message).toContain("[redacted]");
    }
  });

  it("returns a safe message when no queued executions are ready", async () => {
    const result = await worker.processNext({ organizationId, actorUserId });

    expect(result).toEqual({
      ok: true,
      ran: false,
      message: "No queued agent executions are ready to run."
    });
  });
});

describe("sanitizeAgentErrorMessage", () => {
  it("redacts email addresses and token-like values", () => {
    expect(
      sanitizeAgentErrorMessage(
        "OpenAI failed for dean@school.edu using Bearer abc.def.ghi"
      )
    ).toBe("OpenAI failed for [redacted] using [redacted]");
  });
});
