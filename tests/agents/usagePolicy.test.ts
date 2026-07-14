import { beforeEach, describe, expect, it } from "vitest";

import {
  AgentOrchestrator,
  InMemoryAgentExecutionStore,
  InMemoryAgentUsageStore,
  AGENT_AUTONOMY_GUARDS,
  assertNoAutonomousExternalAction,
  buildSafeUsageEventInsert,
  classifyAgentFailure,
  createAgentHandlerRegistry,
  decideAgentRetry,
  enforceCandidateBatchSize,
  evaluateAgentPolicy,
  recordLlmUsageEvent,
  resolveAgentSafetyLimits,
  usageEventContainsDisallowedPayload
} from "@/lib/agents";
import { estimateLlmCostUsd, getModelPricing } from "@/lib/llm/pricing";
import { canManageAgentExecutions, canViewAgentOperations } from "@/lib/authz";
import type { OrganizationMember } from "@/lib/supabase";

function member(
  role: OrganizationMember["role"],
  organizationId = "org-1"
): OrganizationMember {
  return {
    id: `${role}-${organizationId}`,
    organization_id: organizationId,
    user_id: "user-1",
    role,
    created_at: "2026-07-14T12:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z"
  };
}

describe("model pricing", () => {
  it("calculates known model cost from token usage", () => {
    const cost = estimateLlmCostUsd({
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    });

    expect(cost).toBeCloseTo(0.75, 6);
    expect(getModelPricing("unknown-model-xyz")).toBeNull();
    expect(
      estimateLlmCostUsd({
        model: "unknown-model-xyz",
        inputTokens: 100,
        outputTokens: 50
      })
    ).toBeNull();
  });

  it("returns null cost when tokens are missing", () => {
    expect(
      estimateLlmCostUsd({
        model: "gpt-4o-mini",
        inputTokens: null,
        outputTokens: 10
      })
    ).toBeNull();
  });
});

describe("agent policy limits", () => {
  const baseUsage = {
    executionsLastHour: 0,
    runningCount: 0,
    llmCallsToday: 0,
    estimatedSpendTodayUsd: 0,
    estimatedSpendMonthUsd: 0
  };

  it("allows execution under defaults", () => {
    expect(evaluateAgentPolicy({ usage: baseUsage }).allowed).toBe(true);
  });

  it("denies hourly execution limit", () => {
    const limits = resolveAgentSafetyLimits({
      AGENT_MAX_EXECUTIONS_PER_HOUR: "2"
    });
    const decision = evaluateAgentPolicy({
      usage: { ...baseUsage, executionsLastHour: 2 },
      limits,
      checkLlmBudget: false
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason_code).toBe("hourly_execution_limit");
      expect(decision.user_safe_message).toContain("Too many agent jobs");
    }
  });

  it("denies daily LLM call limit", () => {
    const limits = resolveAgentSafetyLimits({ LLM_MAX_CALLS_PER_DAY: "3" });
    const decision = evaluateAgentPolicy({
      usage: { ...baseUsage, llmCallsToday: 3 },
      limits,
      checkLlmBudget: true
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason_code).toBe("daily_llm_limit");
    }
  });

  it("denies daily and monthly budget limits", () => {
    const limits = resolveAgentSafetyLimits({
      LLM_DAILY_BUDGET_USD: "1",
      LLM_MONTHLY_BUDGET_USD: "5"
    });

    expect(
      evaluateAgentPolicy({
        usage: { ...baseUsage, estimatedSpendTodayUsd: 1 },
        limits
      }).allowed
    ).toBe(false);

    expect(
      evaluateAgentPolicy({
        usage: { ...baseUsage, estimatedSpendMonthUsd: 5 },
        limits
      }).allowed
    ).toBe(false);
  });

  it("denies concurrency limit", () => {
    const limits = resolveAgentSafetyLimits({
      AGENT_MAX_CONCURRENT_EXECUTIONS: "2"
    });
    const decision = evaluateAgentPolicy({
      usage: { ...baseUsage, runningCount: 3 },
      limits,
      checkLlmBudget: false
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason_code).toBe("concurrency_limit");
    }
  });

  it("denies candidate batch and chain depth limits", () => {
    const limits = resolveAgentSafetyLimits({
      AGENT_MAX_CANDIDATE_BATCH_SIZE: "10",
      AGENT_MAX_CHAIN_DEPTH: "2"
    });

    expect(
      evaluateAgentPolicy({
        usage: baseUsage,
        limits,
        candidateBatchSize: 11,
        checkLlmBudget: false
      }).allowed
    ).toBe(false);

    expect(
      evaluateAgentPolicy({
        usage: baseUsage,
        limits,
        chainDepth: 3,
        checkLlmBudget: false
      }).allowed
    ).toBe(false);

    expect(
      enforceCandidateBatchSize(11, { AGENT_MAX_CANDIDATE_BATCH_SIZE: "10" }).ok
    ).toBe(false);
  });
});

describe("usage recording and isolation", () => {
  it("records token usage without prompts or raw responses", async () => {
    const store = new InMemoryAgentUsageStore();
    const event = await recordLlmUsageEvent(store, {
      organizationId: "org-1",
      agentExecutionId: "exec-1",
      agentName: "ProspectEnrichmentAgent",
      provider: "openai",
      model: "gpt-4o-mini",
      inputTokens: 100,
      outputTokens: 50,
      status: "success"
    });

    expect(event.input_tokens).toBe(100);
    expect(event.output_tokens).toBe(50);
    expect(event.total_tokens).toBe(150);
    expect(event.estimated_cost_usd).toBeGreaterThan(0);
    expect(
      usageEventContainsDisallowedPayload(event as unknown as Record<string, unknown>)
    ).toBe(false);

    const unsafe = buildSafeUsageEventInsert({
      organization_id: "org-1",
      status: "success",
      input_tokens: null,
      output_tokens: null,
      model: "gpt-4o-mini"
    });
    expect(unsafe.estimated_cost_usd).toBeNull();
    expect(unsafe).not.toHaveProperty("prompt");
  });

  it("keeps usage org-isolated in dashboard summaries", async () => {
    const store = new InMemoryAgentUsageStore();
    await recordLlmUsageEvent(store, {
      organizationId: "org-1",
      provider: "openai",
      model: "gpt-4o-mini",
      inputTokens: 10,
      outputTokens: 5,
      status: "success"
    });
    await recordLlmUsageEvent(store, {
      organizationId: "org-2",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      status: "success"
    });

    const summary = await store.summarizeForDashboard({
      organizationIds: ["org-1"],
      todayStartIso: new Date(0).toISOString(),
      monthStartIso: new Date(0).toISOString()
    });

    expect(summary.llm_calls_today).toBe(1);
    expect(summary.usage_by_model).toHaveLength(1);
    expect(summary.usage_by_model[0]?.model).toBe("gpt-4o-mini");
  });
});

describe("policy denial is permanent (not retried)", () => {
  it("classifies budget and rate denials as permanent", () => {
    expect(
      classifyAgentFailure("Organization AI budget limit reached.", "daily_budget_limit")
    ).toBe("permanent");

    const decision = decideAgentRetry({
      attemptCount: 1,
      maxAttempts: 3,
      errorMessage: "Daily AI usage limit reached.",
      errorCode: "daily_llm_limit"
    });

    expect(decision.shouldRetry).toBe(false);
  });

  it("fails claimed executions without transient retry when denied", async () => {
    const store = new InMemoryAgentExecutionStore();
    const usage = new InMemoryAgentUsageStore();
    const audits: string[] = [];

    const orchestrator = new AgentOrchestrator(
      store,
      createAgentHandlerRegistry({
        processProspectGenerationJob: async () => ({ ok: true })
      }),
      async (event) => {
        audits.push(event.action);
      },
      usage
    );

    const queued = await orchestrator.queueAgent({
      organizationId: "org-1",
      agentName: "ProspectGenerationAgent",
      targetType: "prospect_generation_job",
      targetId: "job-1",
      actorUserId: "user-1"
    });
    expect(queued.ok).toBe(true);

    for (let index = 0; index < 5; index += 1) {
      await store.insert({
        organization_id: "org-1",
        agent_name: "MeetingPrepAgent",
        target_type: "school",
        target_id: `school-${index}`,
        status: "running"
      });
    }

    const result = await orchestrator.runNextAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      env: { AGENT_MAX_CONCURRENT_EXECUTIONS: "5" }
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.ran && result.execution) {
      expect(result.execution.status).toBe("failed");
      expect(result.execution.next_retry_at).toBeNull();
      expect(result.execution.error_message).toContain("Too many agent jobs");
    }

    expect(
      audits.some(
        (action) => action.includes("policy") || action.includes("usage_limit")
      )
    ).toBe(true);
  });
});

describe("autonomy and dashboard auth", () => {
  it("blocks autonomous email, prospect approval, and proposal send", () => {
    expect(AGENT_AUTONOMY_GUARDS.mayAutonomouslySendEmail).toBe(false);
    expect(assertNoAutonomousExternalAction("send_email").ok).toBe(false);
    expect(assertNoAutonomousExternalAction("approve_prospect").ok).toBe(false);
    expect(assertNoAutonomousExternalAction("send_proposal").ok).toBe(false);
  });

  it("keeps Agent Ops usage visible to sales+ and denied for read_only", () => {
    expect(canViewAgentOperations([member("sales")])).toBe(true);
    expect(canViewAgentOperations([member("read_only")])).toBe(false);
    expect(canManageAgentExecutions([member("sales")])).toBe(false);
    expect(canManageAgentExecutions([member("admin")])).toBe(true);
  });
});

describe("orchestrator allowed path still works", () => {
  let store: InMemoryAgentExecutionStore;

  beforeEach(() => {
    store = new InMemoryAgentExecutionStore();
  });

  it("allows and completes a normal agent execution", async () => {
    const orchestrator = new AgentOrchestrator(
      store,
      createAgentHandlerRegistry({
        processProspectGenerationJob: async () => ({ ok: true })
      })
    );

    await orchestrator.queueAgent({
      organizationId: "org-1",
      agentName: "ProspectGenerationAgent",
      targetType: "prospect_generation_job",
      targetId: "job-1",
      actorUserId: "user-1"
    });

    const result = await orchestrator.runNextAgent({
      organizationId: "org-1",
      actorUserId: "user-1"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.ran && result.execution) {
      expect(result.execution.status).toBe("completed");
      expect(result.execution.chain_depth).toBe(1);
    }
  });
});
