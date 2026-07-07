import { describe, expect, it } from "vitest";

import { buildMeetingPrepContextFromCandidate } from "@/lib/meetingPrep/context";
import { generateMeetingPrepBrief } from "@/lib/meetingPrep/generateBrief";
import { meetingPrepBriefSchema } from "@/lib/meetingPrep/types";

describe("generateMeetingPrepBrief", () => {
  it("returns all required meeting prep output fields", () => {
    const context = buildMeetingPrepContextFromCandidate({
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
      contact_role_titles: ["Corporate Partnerships Director"],
      outreach_summaries: [
        {
          channel: "Email",
          subject: "Partnership intro",
          outcome: "Awaiting reply",
          outreach_date: "2026-07-01"
        }
      ],
      follow_up_summaries: [
        {
          title: "Discovery call",
          status: "Open",
          due_date: "2026-07-15"
        }
      ],
      interview_summaries: []
    });

    const brief = generateMeetingPrepBrief(context);
    const parsed = meetingPrepBriefSchema.parse(brief);

    expect(parsed.meeting_objective.length).toBeGreaterThan(20);
    expect(parsed.key_context.length).toBeGreaterThan(0);
    expect(parsed.likely_priorities.length).toBeGreaterThan(0);
    expect(parsed.suggested_questions.length).toBeGreaterThanOrEqual(3);
    expect(parsed.recommended_securecell_offering.length).toBeGreaterThan(20);
    expect(parsed.objections_to_prepare_for.length).toBeGreaterThan(0);
    expect(parsed.next_step_recommendation.length).toBeGreaterThan(20);
    expect(parsed.confidence_score).toBeGreaterThan(0);
  });

  it("does not include email addresses or raw note markers in generated brief", () => {
    const brief = generateMeetingPrepBrief({
      organization_name: "Example University",
      website: "https://example.edu",
      city: "Austin",
      state: "TX",
      status: "Contacted",
      fit_score: 0.7,
      confidence_score: 0.7,
      enrichment_summary: "Cybersecurity programs listed publicly.",
      outreach_angle: "Workforce partnership.",
      recommended_next_step: "Confirm attendees.",
      contact_role_titles: ["Career Services Director"],
      outreach_summaries: [],
      follow_up_summaries: [],
      interview_summaries: [],
      cyber_programs: "Cybersecurity",
      workforce_signals: "Workforce development office"
    });

    const serialized = JSON.stringify(brief);
    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toContain("raw_notes");
    expect(serialized).not.toMatch(/student@\w+/);
  });
});

describe("buildMeetingPrepContextFromCandidate", () => {
  it("uses only safe public and CRM summary fields", () => {
    const context = buildMeetingPrepContextFromCandidate({
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
      contact_role_titles: ["Provost"],
      outreach_summaries: [],
      follow_up_summaries: [],
      interview_summaries: []
    });

    expect(context.organization_name).toBe("Example University");
    expect(JSON.stringify(context)).not.toContain("notes");
    expect(JSON.stringify(context)).not.toContain("email");
  });
});
