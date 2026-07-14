import { z } from "zod";

import { prospectEnrichmentOutputSchema } from "@/lib/llm/types";
import { prospectOutreachDraftOutputSchema } from "@/lib/llm/outreachDraftTypes";

import type {
  OutputSchemaDefinition,
  SchemaValidationResult
} from "./types";

const meetingPrepBriefSchema = z.object({
  executive_summary: z.string().trim().min(20).max(2000),
  talking_points: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
  risk_notes: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
  sources: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        url: z.string().trim().url().max(500)
      })
    )
    .max(10)
    .optional()
});

const proposalDraftSchema = z.object({
  title: z.string().trim().min(5).max(200),
  summary: z.string().trim().min(20).max(2000),
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(4000)
      })
    )
    .min(1)
    .max(12)
});

const contactDiscoverySchema = z.object({
  recommendations: z
    .array(
      z.object({
        suggested_title: z.string().trim().min(1).max(120),
        rationale: z.string().trim().min(1).max(500),
        confidence: z.number().min(0).max(1)
      })
    )
    .min(1)
    .max(20)
});

const OUTPUT_SCHEMAS: OutputSchemaDefinition[] = [
  {
    version: "prospect.enrich.output.v1",
    prompt_key: "prospect.enrich",
    description: "Prospect enrichment structured output",
    schema: prospectEnrichmentOutputSchema
  },
  {
    version: "prospect.outreach_draft.output.v1",
    prompt_key: "prospect.outreach_draft",
    description: "Outreach draft structured output",
    schema: prospectOutreachDraftOutputSchema
  },
  {
    version: "meeting_prep.brief.output.v1",
    prompt_key: "meeting_prep.brief",
    description: "Meeting prep brief output",
    schema: meetingPrepBriefSchema
  },
  {
    version: "proposal.draft.output.v1",
    prompt_key: "proposal.draft",
    description: "Proposal draft output",
    schema: proposalDraftSchema
  },
  {
    version: "contact_discovery.roles.output.v1",
    prompt_key: "contact_discovery.roles",
    description: "Contact role recommendations",
    schema: contactDiscoverySchema
  }
];

const byVersion = new Map(
  OUTPUT_SCHEMAS.map((definition) => [definition.version, definition])
);

export function listOutputSchemas(): OutputSchemaDefinition[] {
  return [...OUTPUT_SCHEMAS];
}

export function getOutputSchema(
  version: string
): OutputSchemaDefinition | null {
  return byVersion.get(version) ?? null;
}

export function outputSchemaExists(version: string): boolean {
  return byVersion.has(version);
}

/**
 * Validate provider output against the schema tied to a prompt version.
 * Does not silently coerce materially invalid output.
 */
export function validateOutputAgainstSchema(
  schemaVersion: string,
  output: unknown
): SchemaValidationResult {
  const definition = getOutputSchema(schemaVersion);
  if (!definition) {
    return {
      ok: false,
      error: `Unknown output schema version: ${schemaVersion}.`,
      issues: ["schema_not_found"]
    };
  }

  const parsed = definition.schema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Provider output failed schema validation.",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "root"}: ${issue.message}`
      )
    };
  }

  return { ok: true, data: parsed.data };
}
