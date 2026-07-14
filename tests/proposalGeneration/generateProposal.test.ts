import { describe, expect, it } from "vitest";

import { buildProposalContextFromCandidate } from "@/lib/proposalGeneration/context";
import { generateProposalDraft } from "@/lib/proposalGeneration/generateProposal";
import { proposalDraftContentSchema } from "@/lib/proposalGeneration/types";

describe("generateProposalDraft", () => {
  it("returns all required proposal output fields", () => {
    const context = buildProposalContextFromCandidate({
      name: "Howard University",
      website: "https://www.howard.edu",
      location: "Washington, DC",
      district: "Washington, DC",
      status: "pending_review",
      confidence_score: 0.88,
      rationale: "Cybersecurity workforce alignment.",
      enrichment_summary: "Public STEM and cybersecurity program signals.",
      outreach_angle: "Partnership exploration for workforce pathways.",
      recommended_next_step: "Schedule discovery call with partnership office.",
      meeting_prep_brief: {
        id: "brief-1",
        organization_id: "org-1",
        target_type: "prospect_candidate",
        target_id: "candidate-1",
        prospect_candidate_id: "candidate-1",
        school_id: null,
        meeting_objective: "Prepare for discovery meeting.",
        key_context: ["Institution shows cybersecurity alignment."],
        likely_priorities: ["Workforce partnerships"],
        suggested_questions: ["Who owns partnerships?"],
        recommended_securecell_offering: "SecureCell cybersecurity workforce partnership",
        objections_to_prepare_for: ["Limited bandwidth"],
        next_step_recommendation: "Confirm attendees.",
        confidence_score: 0.82,
        review_status: "pending_review",
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z"
      }
    });

    const draft = generateProposalDraft(context);
    const parsed = proposalDraftContentSchema.parse(draft);

    expect(parsed.proposal_title).toContain("Howard University");
    expect(parsed.executive_summary.length).toBeGreaterThan(40);
    expect(parsed.implementation_plan.length).toBeGreaterThanOrEqual(2);
    expect(parsed.success_metrics.length).toBeGreaterThanOrEqual(2);
    expect(parsed.next_steps.length).toBeGreaterThanOrEqual(2);
    expect(parsed.confidence_score).toBeGreaterThan(0);
  });

  it("does not include email addresses in generated draft content", () => {
    const draft = generateProposalDraft({
      organization_name: "Example University",
      website: "https://example.edu",
      city: "Austin",
      state: "TX",
      status: "Contacted",
      fit_score: 0.7,
      enrichment_summary: "Cybersecurity programs listed publicly.",
      outreach_angle: "Workforce partnership.",
      recommended_next_step: "Confirm attendees.",
      public_institutional_context: "Cybersecurity workforce development.",
      meeting_prep_summary: null
    });

    expect(JSON.stringify(draft)).not.toMatch(/@/);
    expect(JSON.stringify(draft)).not.toContain("raw_notes");
  });
});

describe("buildProposalContextFromCandidate", () => {
  it("uses only safe public and CRM summary fields", () => {
    const context = buildProposalContextFromCandidate({
      name: "Example University",
      website: "https://example.edu",
      location: "Example, CA",
      district: "Example, CA",
      status: "pending_review",
      confidence_score: 0.8,
      rationale: "Public fit rationale.",
      enrichment_summary: "Public enrichment summary.",
      outreach_angle: "Outreach angle.",
      recommended_next_step: "Next step.",
      meeting_prep_brief: null
    });

    expect(context.organization_name).toBe("Example University");
    expect(JSON.stringify(context)).not.toContain("notes");
    expect(JSON.stringify(context)).not.toContain("email");
  });
});
