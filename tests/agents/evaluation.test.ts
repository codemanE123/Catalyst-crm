import { describe, expect, it } from "vitest";

import {
  buildConfidenceCalibrationReport,
  buildQualityResult,
  calculateAgentQualityDashboardMetrics,
  classifySourceQuality,
  collectLowQualityFlags,
  computeOverallQualityScore,
  computeRevisionSignal,
  InMemoryAgentEvaluationStore,
  runAutomatedQualityChecks,
  scrubEvaluationFeedback,
  summarizeAgentQuality,
  type AgentEvaluation
} from "@/lib/agents/evaluation";
import { canActOnApprovals, canViewApprovals } from "@/lib/approvals/permissions";
import { canViewAgentOperations, canManageAgentExecutions } from "@/lib/authz";
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

function evaluation(overrides: Partial<AgentEvaluation> = {}): AgentEvaluation {
  return {
    id: "eval-1",
    organization_id: "org-1",
    agent_execution_id: "exec-1",
    agent_name: "MeetingPrepAgent",
    target_type: "school",
    target_id: "school-1",
    evaluation_type: "human_review",
    evaluator_type: "human",
    evaluator_user_id: "user-1",
    score: 4,
    outcome: "accepted",
    feedback: "Useful brief",
    metadata: {
      overall_score: 4,
      dimensions: {
        accuracy_score: 4,
        completeness_score: 4,
        relevance_score: 4,
        usefulness_score: 4,
        source_quality_score: 5,
        confidence_calibration_score: null,
        safety_score: 5,
        actionability_score: 4
      },
      agent_confidence: 0.9
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

describe("quality scoring model", () => {
  it("computes overall from present dimensions only", () => {
    expect(
      computeOverallQualityScore({
        accuracy_score: 5,
        completeness_score: 3,
        safety_score: 4
      })
    ).toBeCloseTo(4, 5);

    const result = buildQualityResult({
      dimensions: { usefulness_score: 2, safety_score: 4 },
      outcome: "needs_revision",
      feedback: "Tighten claims"
    });

    expect(result.overall_score).toBe(3);
    expect(result.accuracy_score).toBeNull();
  });

  it("computes revision signals without storing full text", () => {
    const signal = computeRevisionSignal("hello world", "hello world!!!");
    expect(signal.changed).toBe(true);
    expect(signal.original_length).toBe(11);
    expect(signal.final_length).toBe(14);
    expect(signal.percentage_changed).toBeGreaterThan(0);
  });
});

describe("automated quality checks", () => {
  it("fails schema, citation, forbidden fields, and secrets", () => {
    const result = runAutomatedQualityChecks({
      schemaValid: false,
      citationPresent: false,
      forbiddenFieldPaths: ["notes.email"],
      outputText: "Contact us with sk-abcdefghijklmnopqrst and auto-send emails",
      confidenceScore: 1.5,
      env: {
        AGENT_REQUIRE_SOURCE_CITATIONS: "true"
      }
    });

    expect(result.passed).toBe(false);
    expect(result.findings.some((finding) => finding.code === "schema_invalid")).toBe(
      true
    );
    expect(result.findings.some((finding) => finding.code === "citation_present")).toBe(
      true
    );
    expect(result.findings.some((finding) => finding.code === "forbidden_fields")).toBe(
      true
    );
    expect(result.findings.some((finding) => finding.code === "no_secrets")).toBe(true);
    expect(result.safety_score).toBeLessThan(5);
  });

  it("passes a clean short-but-valid output", () => {
    const result = runAutomatedQualityChecks({
      schemaValid: true,
      citationPresent: true,
      confidenceScore: 0.7,
      outputText:
        "This university partnership brief summarizes published website facts for a human reviewer."
    });

    expect(result.passed).toBe(true);
  });
});

describe("source quality and calibration", () => {
  it("classifies known sources and keeps unknown unknown", () => {
    expect(
      classifySourceQuality({ sourceUrl: "https://example.edu/admissions" }).class
    ).toBe("official_institutional");
    expect(
      classifySourceQuality({ sourceUrl: "https://collegescorecard.ed.gov" }).class
    ).toBe("government_public_dataset");
    expect(classifySourceQuality({ sourceName: "random blog" }).class).toBe("unknown");
    expect(classifySourceQuality({}).score).toBeNull();
  });

  it("detects high-confidence rejection and low-confidence acceptance patterns", () => {
    const rows = [
      evaluation({
        id: "1",
        outcome: "rejected",
        metadata: { agent_confidence: 0.95 }
      }),
      evaluation({
        id: "2",
        outcome: "rejected",
        metadata: { agent_confidence: 0.92 }
      }),
      evaluation({
        id: "3",
        outcome: "rejected",
        metadata: { agent_confidence: 0.91 }
      }),
      evaluation({
        id: "4",
        outcome: "accepted",
        metadata: { agent_confidence: 0.2 }
      }),
      evaluation({
        id: "5",
        outcome: "accepted",
        metadata: { agent_confidence: 0.1 }
      }),
      evaluation({
        id: "6",
        outcome: "accepted",
        metadata: { agent_confidence: 0.15 }
      })
    ];

    const report = buildConfidenceCalibrationReport(rows);
    expect(report.patterns).toContain("high_confidence_frequent_rejection");
    expect(report.patterns).toContain("low_confidence_frequent_acceptance");
  });
});

describe("metrics and cost handling", () => {
  it("calculates acceptance rates and low-quality flags", () => {
    const rows = [
      evaluation({ outcome: "accepted", score: 4 }),
      evaluation({
        id: "r",
        outcome: "rejected",
        score: 1,
        metadata: {
          agent_confidence: 0.95,
          low_quality_flags: ["missing_citations"],
          overall_score: 1
        }
      }),
      evaluation({ id: "n", outcome: "needs_revision", score: 3 }),
      evaluation({ id: "e", outcome: "approved_with_edits", score: 4 })
    ];

    const metrics = calculateAgentQualityDashboardMetrics(rows, {
      since7DaysIso: new Date(0).toISOString(),
      env: { AGENT_QUALITY_LOW_SCORE_THRESHOLD: "2.5" }
    });

    expect(metrics.acceptance_rate).toBeCloseTo(0.5, 5);
    expect(metrics.rejection_rate).toBeCloseTo(0.25, 5);
    expect(metrics.needs_revision_rate).toBeCloseTo(0.25, 5);
    expect(metrics.high_confidence_rejected).toBe(1);
    expect(metrics.outputs_without_citations).toBe(1);
    expect(metrics.low_quality_last_7_days).toBeGreaterThanOrEqual(1);
  });

  it("treats missing cost as unknown, not zero", () => {
    const summary = summarizeAgentQuality("MeetingPrepAgent", [evaluation()]);
    expect(summary.cost_per_accepted_output_usd).toBe("unknown");

    const withCost = summarizeAgentQuality("MeetingPrepAgent", [evaluation()], {
      acceptedUsageCostUsd: 2,
      acceptedCountForCost: 2
    });
    expect(withCost.cost_per_accepted_output_usd).toBe(1);
  });
});

describe("privacy, auth, and store isolation", () => {
  it("scrubs feedback and enforces length", () => {
    const scrubbed = scrubEvaluationFeedback("Reach me at person@example.com please");
    expect(scrubbed.ok).toBe(true);
    if (scrubbed.ok) {
      expect(scrubbed.feedback).toContain("[REDACTED_EMAIL]");
    }

    const tooLong = scrubEvaluationFeedback("x".repeat(600), {
      AGENT_EVALUATION_FEEDBACK_MAX_LENGTH: "100"
    });
    expect(tooLong.ok).toBe(false);
  });

  it("keeps evaluation records org-isolated in memory store", async () => {
    const store = new InMemoryAgentEvaluationStore();
    await store.insert({
      organization_id: "org-1",
      evaluation_type: "human_review",
      evaluator_type: "human",
      outcome: "accepted",
      score: 4
    });
    await store.insert({
      organization_id: "org-2",
      evaluation_type: "human_review",
      evaluator_type: "human",
      outcome: "rejected",
      score: 2
    });

    const scoped = await store.listForOrganizations(["org-1"]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.organization_id).toBe("org-1");
  });

  it("denies read_only mutations and allows sales/admin views", () => {
    expect(canViewApprovals([member("read_only")])).toBe(true);
    expect(canActOnApprovals([member("read_only")])).toBe(false);
    expect(canViewAgentOperations([member("sales")])).toBe(true);
    expect(canManageAgentExecutions([member("admin")])).toBe(true);
    expect(canManageAgentExecutions([member("sales")])).toBe(false);
  });

  it("does not expose raw prompts or secrets in evaluation payloads", async () => {
    const store = new InMemoryAgentEvaluationStore();
    const row = await store.insert({
      organization_id: "org-1",
      evaluation_type: "automated_quality_check",
      evaluator_type: "system",
      metadata: {
        dimensions: { safety_score: 5 },
        overall_score: 5
      }
    });

    expect(JSON.stringify(row)).not.toMatch(/prompt|sk-|api_key/i);
    expect(collectLowQualityFlags({ overallScore: 1, env: {} })).toContain(
      "overall_score_below_threshold"
    );
  });
});
