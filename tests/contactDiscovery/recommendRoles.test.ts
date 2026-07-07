import { describe, expect, it } from "vitest";

import { buildContactDiscoveryContextFromCandidate } from "@/lib/contactDiscovery/context";
import { recommendContactRoles } from "@/lib/contactDiscovery/recommendRoles";
import {
  CONTACT_DISCOVERY_ROLE_CATALOG,
  contactRecommendationSchema
} from "@/lib/contactDiscovery/types";

describe("recommendContactRoles", () => {
  it("includes required role titles for cybersecurity-focused institutions", () => {
    const output = recommendContactRoles({
      organization_name: "Howard University",
      website: "https://www.howard.edu",
      city: "Washington",
      state: "DC",
      school_type_labels: ["Historically Black College or University"],
      program_keywords: ["cybersecurity", "workforce", "engineering"]
    });

    const titles = output.recommendations.map(
      (recommendation) => recommendation.recommended_title
    );

    expect(titles).toContain("Cybersecurity Program Director");
    expect(titles).toContain("Corporate Partnerships Director");
    expect(titles).toContain("Career Services Director");
    expect(titles).toContain("Workforce Development Director");
    expect(titles).toContain("Dean of Engineering / STEM");
  });

  it("does not invent personal names or email addresses", () => {
    const output = recommendContactRoles({
      organization_name: "State Tech College",
      website: "https://statetech.example.edu",
      city: "Austin",
      state: "TX",
      school_type_labels: ["Community college"],
      program_keywords: ["workforce", "career"]
    });

    for (const recommendation of output.recommendations) {
      const parsed = contactRecommendationSchema.parse(recommendation);
      expect(parsed.recommended_title).not.toMatch(/@/);
      expect(parsed.rationale).not.toMatch(/@/);
      expect(parsed.suggested_outreach_angle).not.toMatch(/@/);
      expect(parsed.recommended_title).not.toMatch(/\.(edu|com|org)$/i);
    }
  });

  it("returns output fields required for review", () => {
    const output = recommendContactRoles({
      organization_name: "Example University",
      website: null,
      city: null,
      state: "CA",
      school_type_labels: ["University / college partnership"],
      program_keywords: ["cybersecurity"]
    });

    expect(output.recommendations.length).toBeGreaterThan(0);

    for (const recommendation of output.recommendations) {
      expect(recommendation).toMatchObject({
        recommended_title: expect.any(String),
        department: expect.any(String),
        priority: expect.any(Number),
        rationale: expect.any(String),
        suggested_outreach_angle: expect.any(String),
        confidence_score: expect.any(Number)
      });
      expect(recommendation.confidence_score).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence_score).toBeLessThanOrEqual(1);
    }
  });

  it("covers the curated role catalog titles", () => {
    expect(
      CONTACT_DISCOVERY_ROLE_CATALOG.map((role) => role.recommended_title)
    ).toEqual([
      "President",
      "Provost",
      "CIO",
      "Dean of Engineering / STEM",
      "Cybersecurity Program Director",
      "Workforce Development Director",
      "Career Services Director",
      "Corporate Partnerships Director"
    ]);
  });
});

describe("buildContactDiscoveryContextFromCandidate", () => {
  it("uses public candidate and job fields only", () => {
    const context = buildContactDiscoveryContextFromCandidate({
      candidate: {
        name: "Example University",
        website: "https://example.edu",
        location: "Example City, CA",
        district: "Example City, CA",
        rationale: "Public cybersecurity workforce alignment.",
        enrichment_summary: "Public enrichment summary about STEM programs.",
        outreach_angle: "Partnership exploration."
      },
      jobInput: {
        geography: "West Coast",
        schoolTypes: ["hbcu", "cae"],
        keywords: "cybersecurity workforce",
        maxResults: 10
      }
    });

    expect(context.organization_name).toBe("Example University");
    expect(context.school_type_labels.length).toBeGreaterThan(0);
    expect(context.program_keywords).toEqual(
      expect.arrayContaining(["cybersecurity"])
    );
    expect(JSON.stringify(context)).not.toContain("notes");
    expect(JSON.stringify(context)).not.toContain("email");
  });
});
