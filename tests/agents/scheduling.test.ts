import { beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_AUDIT_ACTIONS,
  AgentOrchestrator,
  computeRetryBackoffMs,
  createAgentHandlerRegistry,
  decideAgentRetry,
  InMemoryAgentExecutionStore,
  processAgentExecutionBatch,
  validateAgentCronSecret,
  type AgentAuditEventInput,
  type AgentExecutor,
  type AgentName
} from "@/lib/agents";
import { classifyAgentFailure } from "@/lib/agents/failureClassification";

describe("validateAgentCronSecret", () => {
  it("accepts matching secrets", () => {
    expect(validateAgentCronSecret("cron-secret", "cron-secret")).toBe(true);
  });

  it("rejects missing or invalid secrets", () => {
    expect(validateAgentCronSecret(null, "cron-secret")).toBe(false);
    expect(validateAgentCronSecret("wrong", "cron-secret")).toBe(false);
    expect(validateAgentCronSecret("cron-secret", null)).toBe(false);
  });
});

describe("failure classification and retry policy", () => {
  it("classifies configuration and permanent failures", () => {
    expect(classifyAgentFailure("LLM enrichment is disabled.")).toBe("configuration");
    expect(classifyAgentFailure("Validation failed.")).toBe("permanent");
    expect(classifyAgentFailure("Provider unavailable.")).toBe("transient");
    expect(classifyAgentFailure("Cancelled by user.")).toBe("cancelled");
  });

  it("schedules transient retries with exponential backoff", () => {
    const decision = decideAgentRetry({
      attemptCount: 1,
      maxAttempts: 3,
      errorMessage: "timeout",
      errorCode: "transient"
    });

    expect(decision.shouldRetry).toBe(true);
    if (decision.shouldRetry) {
      expect(decision.nextRetryAt).toBeTruthy();
    }

    expect(computeRetryBackoffMs(1)).toBe(30_000);
    expect(computeRetryBackoffMs(2)).toBe(60_000);
    expect(computeRetryBackoffMs(3)).toBe(120_000);
  });

  it("does not retry permanent failures", () => {
    const decision = decideAgentRetry({
      attemptCount: 1,
      maxAttempts: 3,
      errorMessage: "Validation failed.",
      errorCode: "permanent"
    });

    expect(decision.shouldRetry).toBe(false);
    if (!decision.shouldRetry) {
      expect(decision.exhausted).toBe(false);
    }
  });

  it("marks retry exhaustion for transient failures at max attempts", () => {
    const decision = decideAgentRetry({
      attemptCount: 3,
      maxAttempts: 3,
      errorMessage: "timeout",
      errorCode: "transient"
    });

    expect(decision.shouldRetry).toBe(false);
    if (!decision.shouldRetry) {
      expect(decision.exhausted).toBe(true);
    }
  });
});

describe("processAgentExecutionBatch", () => {
  const organizationId = "org-1";
  const actorUserId = "cron-user";
  let store: InMemoryAgentExecutionStore;
  let auditEvents: AgentAuditEventInput[];

  beforeEach(() => {
    store = new InMemoryAgentExecutionStore();
    auditEvents = [];
  });

  it("processes a bounded batch only", async () => {
    for (let index = 0; index < 4; index += 1) {
      await store.insert({
        organization_id: organizationId,
        agent_name: "ProspectGenerationAgent",
        target_type: "prospect_generation_job",
        target_id: `job-${index}`,
        status: "queued"
      });
    }

    const orchestrator = new AgentOrchestrator(
      store,
      createAgentHandlerRegistry(),
      async (event) => {
        auditEvents.push(event);
      }
    );

    const summary = await processAgentExecutionBatch({
      store,
      orchestrator,
      actorUserId,
      batchSize: 2
    });

    expect(summary.processed).toBe(2);
    expect(summary.completed).toBe(2);
    expect(store.snapshot().filter((row) => row.status === "queued")).toHaveLength(2);
  });

  it("protects against duplicate claims", async () => {
    await store.insert({
      organization_id: organizationId,
      agent_name: "ProspectGenerationAgent",
      target_type: "prospect_generation_job",
      target_id: "job-1",
      status: "queued"
    });

    const first = await store.claimNext(organizationId);
    const second = await store.claimNext(organizationId);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("recovers stale running executions", async () => {
    const inserted = await store.insert({
      organization_id: organizationId,
      agent_name: "ProspectGenerationAgent",
      target_type: "prospect_generation_job",
      target_id: "job-1",
      status: "queued"
    });

    await store.update(inserted.id, organizationId, {
      status: "running",
      started_at: "2026-07-14T08:00:00.000Z",
      attempt_count: 1
    });

    const recovered = await store.recoverStaleRunning(
      15,
      new Date("2026-07-14T09:00:00.000Z")
    );

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.status).toBe("queued");
    expect(recovered[0]?.last_error_code).toBe("stale_running");
  });

  it("exhausts transient retries and audits exhaustion", async () => {
    const handlers = new Map<AgentName, AgentExecutor>();
    handlers.set("ProspectEnrichmentAgent", async () => ({
      ok: false,
      error_message: "Provider unavailable.",
      error_code: "transient"
    }));

    const orchestrator = new AgentOrchestrator(
      store,
      handlers,
      async (event) => {
        auditEvents.push(event);
      }
    );

    await store.insert({
      organization_id: organizationId,
      agent_name: "ProspectEnrichmentAgent",
      target_type: "prospect_candidate",
      target_id: "candidate-1",
      status: "queued",
      max_attempts: 2
    });

    const first = await processAgentExecutionBatch({
      store,
      orchestrator,
      actorUserId,
      batchSize: 1
    });
    expect(first.retried).toBe(1);

    const waiting = store.snapshot()[0]!;
    await store.update(waiting.id, organizationId, {
      next_retry_at: null
    });

    const second = await processAgentExecutionBatch({
      store,
      orchestrator,
      actorUserId,
      batchSize: 1
    });

    expect(second.failed).toBe(1);
    expect(
      auditEvents.some((event) => event.action === AGENT_AUDIT_ACTIONS.retryExhausted)
    ).toBe(true);
  });
});
