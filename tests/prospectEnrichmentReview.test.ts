import { describe, expect, it } from "vitest";

import {
  formatProspectEnrichedAt,
  hasProspectEnrichmentContent,
  PROSPECT_ENRICHMENT_QUEUE_WARNING,
  PROSPECT_ENRICHMENT_REVIEW_WARNING,
  resolveProspectEnrichmentReviewState
} from "@/lib/prospectEnrichmentReview";

describe("resolveProspectEnrichmentReviewState", () => {
  it("returns enriching while a request is in flight", () => {
    expect(
      resolveProspectEnrichmentReviewState({
        enrichmentStatus: "not_enriched",
        llmEnrichmentEnabled: true,
        isEnriching: true
      })
    ).toBe("enriching");
  });

  it("returns enriched even when the feature flag is off", () => {
    expect(
      resolveProspectEnrichmentReviewState({
        enrichmentStatus: "enriched",
        llmEnrichmentEnabled: false,
        isEnriching: false
      })
    ).toBe("enriched");
  });

  it("returns enrichment disabled for candidates that have not been enriched", () => {
    expect(
      resolveProspectEnrichmentReviewState({
        enrichmentStatus: "not_enriched",
        llmEnrichmentEnabled: false,
        isEnriching: false
      })
    ).toBe("enrichment_disabled");
  });

  it("returns not enriched when enrichment is available", () => {
    expect(
      resolveProspectEnrichmentReviewState({
        enrichmentStatus: "not_enriched",
        llmEnrichmentEnabled: true,
        isEnriching: false
      })
    ).toBe("not_enriched");
  });

  it("returns failed for failed or blocked enrichment records", () => {
    expect(
      resolveProspectEnrichmentReviewState({
        enrichmentStatus: "failed",
        llmEnrichmentEnabled: true,
        isEnriching: false
      })
    ).toBe("failed");

    expect(
      resolveProspectEnrichmentReviewState({
        enrichmentStatus: "blocked",
        llmEnrichmentEnabled: true,
        isEnriching: false
      })
    ).toBe("failed");
  });
});

describe("formatProspectEnrichedAt", () => {
  it("formats valid timestamps for display", () => {
    const formatted = formatProspectEnrichedAt("2026-07-06T15:00:00.000Z");

    expect(formatted).not.toBe("—");
    expect(formatted).toContain("2026");
  });

  it("returns a dash for missing values", () => {
    expect(formatProspectEnrichedAt(null)).toBe("—");
    expect(formatProspectEnrichedAt("not-a-date")).toBe("—");
  });
});

describe("hasProspectEnrichmentContent", () => {
  it("detects when enrichment fields are present", () => {
    expect(
      hasProspectEnrichmentContent({
        enrichment_summary: "Public summary",
        outreach_angle: null,
        recommended_next_step: null
      })
    ).toBe(true);

    expect(
      hasProspectEnrichmentContent({
        enrichment_summary: null,
        outreach_angle: null,
        recommended_next_step: null
      })
    ).toBe(false);
  });
});

describe("safety copy", () => {
  it("warns reviewers to validate AI output before approval", () => {
    expect(PROSPECT_ENRICHMENT_REVIEW_WARNING).toMatch(/review/i);
    expect(PROSPECT_ENRICHMENT_REVIEW_WARNING).toMatch(/approving/i);
    expect(PROSPECT_ENRICHMENT_QUEUE_WARNING).toMatch(/human approval/i);
  });
});
