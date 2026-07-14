import { describe, expect, it } from "vitest";

import {
  evaluateLlmProductionGates,
  resolveApprovedModelFromPolicy
} from "@/lib/llm/productionContext";

describe("evaluateLlmProductionGates", () => {
  const baseUsage = {
    llmCallsToday: 1,
    estimatedSpendTodayUsd: 0.01,
    estimatedSpendMonthUsd: 0.05
  };

  it("approves an allowlisted policy model", () => {
    const result = evaluateLlmProductionGates({
      agentName: "ProspectEnrichmentAgent",
      usage: baseUsage,
      policyFlat: {
        default_provider: "openai",
        default_model: "gpt-4o-mini",
        require_prospect_approval: true,
        max_llm_calls_per_day: 200,
        daily_budget_usd: 25,
        monthly_budget_usd: 250,
        automated_worker_enabled: true
      },
      skipReadinessCheck: true,
      env: {
        AGENT_FEATURE_ENABLED: "true",
        LLM_MAX_CALLS_PER_DAY: "200",
        LLM_DAILY_BUDGET_USD: "25",
        LLM_MONTHLY_BUDGET_USD: "250"
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.model).toBe("gpt-4o-mini");
    }
  });

  it("denies unapproved models", () => {
    const result = evaluateLlmProductionGates({
      agentName: "ProspectEnrichmentAgent",
      usage: baseUsage,
      policyFlat: {
        default_provider: "openai",
        default_model: "gpt-secret-custom",
        require_prospect_approval: true
      },
      skipReadinessCheck: true,
      env: { AGENT_FEATURE_ENABLED: "true" }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason_code).toBe("model_not_approved");
    }
  });

  it("denies when provider is none", () => {
    const result = evaluateLlmProductionGates({
      agentName: "OutreachDraftAgent",
      usage: baseUsage,
      policyFlat: {
        default_provider: "none",
        default_model: "gpt-4o-mini",
        require_outreach_review: true
      },
      skipReadinessCheck: true
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason_code).toBe("provider_disabled");
    }
  });

  it("denies over budget", () => {
    const result = evaluateLlmProductionGates({
      agentName: "ProspectEnrichmentAgent",
      usage: {
        llmCallsToday: 1,
        estimatedSpendTodayUsd: 30,
        estimatedSpendMonthUsd: 30
      },
      policyFlat: {
        default_provider: "openai",
        default_model: "gpt-4o-mini",
        require_prospect_approval: true,
        daily_budget_usd: 25,
        monthly_budget_usd: 250,
        max_llm_calls_per_day: 200,
        automated_worker_enabled: true
      },
      skipReadinessCheck: true,
      env: { AGENT_FEATURE_ENABLED: "true" }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason_code).toBe("daily_budget_limit");
    }
  });

  it("denies when production certification is required and missing", () => {
    const result = evaluateLlmProductionGates({
      agentName: "ProspectEnrichmentAgent",
      usage: baseUsage,
      policyFlat: {
        default_provider: "openai",
        default_model: "gpt-4o-mini",
        require_prospect_approval: true,
        automated_worker_enabled: true
      },
      certification: null,
      env: {
        AGENT_FEATURE_ENABLED: "true",
        AGENT_READINESS_ENABLED: "true",
        AGENT_READINESS_PRODUCTION_REQUIRED: "true",
        AGENT_READINESS_ENVIRONMENT: "production"
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason_code).toBe("certification_denied");
    }
  });

  it("denies chain-depth overflow", () => {
    const result = evaluateLlmProductionGates({
      agentName: "OutreachDraftAgent",
      usage: baseUsage,
      chainDepth: 99,
      policyFlat: {
        default_provider: "openai",
        default_model: "gpt-4o-mini",
        require_outreach_review: true,
        max_chain_depth: 5,
        automated_worker_enabled: true
      },
      skipReadinessCheck: true,
      env: { AGENT_FEATURE_ENABLED: "true" }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason_code).toBe("chain_depth_exceeded");
    }
  });

  it("denies when required human review flag is disabled", () => {
    const result = evaluateLlmProductionGates({
      agentName: "OutreachDraftAgent",
      usage: baseUsage,
      policyFlat: {
        default_provider: "openai",
        default_model: "gpt-4o-mini",
        require_outreach_review: false,
        automated_worker_enabled: true
      },
      skipReadinessCheck: true,
      env: { AGENT_FEATURE_ENABLED: "true" }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason_code).toBe("human_review_required_disabled");
    }
  });
});

describe("resolveApprovedModelFromPolicy", () => {
  it("prefers prompt stamp model when approved", () => {
    expect(
      resolveApprovedModelFromPolicy(
        { default_model: "gpt-4o" },
        {
          prompt_key: "prospect.enrich",
          prompt_version: "1",
          prompt_version_id: "pv-1",
          output_schema_version: "v1",
          provider: "openai",
          model: "gpt-4o-mini",
          rollout_id: null,
          experiment_variant: "treatment"
        }
      )
    ).toBe("gpt-4o-mini");
  });
});
