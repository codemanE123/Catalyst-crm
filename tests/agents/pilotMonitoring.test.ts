import { describe, expect, it } from "vitest";

import {
  buildPilotFeedbackPayload,
  calculateAgentPilotMonitoringMetrics,
  normalizeSavedTimeMinutes,
  sanitizePilotFeedbackCategories,
  scrubEvaluationFeedback,
  type AgentEvaluation
} from "@/lib/agents/evaluation";

function evaluation(overrides: Partial<AgentEvaluation> = {}): AgentEvaluation {
  return {
    id: "eval-1",
    organization_id: "org-1",
    agent_execution_id: null,
    agent_name: "ProspectEnrichmentAgent",
    target_type: "prospect_enrichment",
    target_id: "candidate-1",
    evaluation_type: "human_review",
    evaluator_type: "human",
    evaluator_user_id: "user-1",
    score: 4,
    outcome: "accepted",
    feedback: null,
    metadata: {
      approval_type: "prospect_enrichment",
      feedback_categories: ["useful"],
      saved_time_minutes: 15
    },
    created_at: "2026-07-14T12:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z",
    ...overrides
  };
}

describe("pilot feedback controls", () => {
  it("maps UI controls to structured outcomes and categories", () => {
    expect(
      buildPilotFeedbackPayload({
        outcomeControlId: "accepted_as_is",
        categories: ["useful", "incorrect", "not_relevant"],
        savedTimeMinutes: 30,
        usefulnessScore: 5
      })
    ).toEqual({
      outcome: "accepted",
      feedbackCategories: ["useful", "incorrect_facts", "not_relevant"],
      usefulnessScore: 5,
      savedTimeMinutes: 30
    });

    expect(
      buildPilotFeedbackPayload({
        outcomeControlId: "accepted_with_edits",
        categories: ["weak_sources"]
      })
    ).toMatchObject({
      outcome: "approved_with_edits",
      feedbackCategories: ["weak_sources"]
    });
  });

  it("sanitizes unknown categories and clamps saved time", () => {
    expect(
      sanitizePilotFeedbackCategories(["useful", "secret_note", "weak_sources"])
    ).toEqual(["useful", "weak_sources"]);
    expect(normalizeSavedTimeMinutes(999)).toBe(480);
    expect(normalizeSavedTimeMinutes(-1)).toBe(null);
  });

  it("scrubs private free-text if provided while preferring tags", () => {
    const scrubbed = scrubEvaluationFeedback(
      "Contact person@example.com about the draft"
    );
    expect(scrubbed.ok).toBe(true);
    if (!scrubbed.ok) {
      throw new Error("expected scrub success");
    }
    expect(scrubbed.feedback).not.toMatch(/@/);
  });
});

describe("calculateAgentPilotMonitoringMetrics", () => {
  it("computes approval, enrichment, outreach, cost, and denial metrics", () => {
    const metrics = calculateAgentPilotMonitoringMetrics({
      candidatesApproved: 8,
      candidatesRejected: 2,
      enrichmentAccepted: 3,
      enrichmentRejected: 1,
      outreachDraftsGenerated: 10,
      outreachDraftsSaved: 4,
      failedJobs: 2,
      policyDenials: 1,
      budgetDenials: 3,
      averageQualityScore: 3.75,
      prospectGenerationSpendUsd: 16,
      outreachDraftSpendUsd: 8,
      evaluations: [
        evaluation(),
        evaluation({
          id: "eval-2",
          metadata: {
            feedback_categories: ["weak_sources", "useful"],
            saved_time_minutes: 45
          }
        })
      ]
    });

    expect(metrics.candidate_approval_rate).toBe(0.8);
    expect(metrics.enrichment_acceptance_rate).toBe(0.75);
    expect(metrics.outreach_draft_use_rate).toBe(0.4);
    expect(metrics.average_quality_score).toBe(3.75);
    expect(metrics.cost_per_approved_prospect_usd).toBe(2);
    expect(metrics.cost_per_saved_outreach_draft_usd).toBe(2);
    expect(metrics.failed_jobs).toBe(2);
    expect(metrics.policy_denials).toBe(1);
    expect(metrics.budget_denials).toBe(3);
    expect(metrics.average_saved_time_minutes).toBe(30);
    expect(metrics.feedback_category_counts[0]?.category).toBe("useful");
  });

  it("returns unknown cost when spend data is missing", () => {
    const metrics = calculateAgentPilotMonitoringMetrics({
      candidatesApproved: 2,
      candidatesRejected: 0,
      enrichmentAccepted: 0,
      enrichmentRejected: 0,
      outreachDraftsGenerated: 0,
      outreachDraftsSaved: 0,
      failedJobs: 0,
      policyDenials: 0,
      budgetDenials: 0,
      averageQualityScore: null,
      prospectGenerationSpendUsd: null,
      outreachDraftSpendUsd: null
    });

    expect(metrics.cost_per_approved_prospect_usd).toBe("unknown");
    expect(metrics.cost_per_saved_outreach_draft_usd).toBe("unknown");
  });
});
