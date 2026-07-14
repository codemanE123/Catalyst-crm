import type { AgentName } from "../types";
import type { AgentPromptVersion, KnownPromptKey } from "./types";

export type PromptCatalogEntry = {
  prompt_key: KnownPromptKey | string;
  agent_name: AgentName | string;
  description: string;
  default_output_schema_version: string;
  default_safety_policy_version: string;
  required_placeholders: string[];
  default_provider: string;
  default_model: string;
  default_system_prompt: string;
  default_user_prompt_template: string;
};

/**
 * Code-defined catalog for registering future agent prompts.
 * DB rows version these definitions; do not invent a second orchestrator.
 */
export const PROMPT_CATALOG: PromptCatalogEntry[] = [
  {
    prompt_key: "prospect.enrich",
    agent_name: "ProspectEnrichmentAgent",
    description: "Public institution enrichment for prospect review",
    default_output_schema_version: "prospect.enrich.output.v1",
    default_safety_policy_version: "safety.policy.v1",
    required_placeholders: ["institution_name", "icp_geography"],
    default_provider: "openai",
    default_model: "gpt-4o-mini",
    default_system_prompt:
      "You are an assistant for a B2B university partnership CRM. Use ONLY public facts provided. Do not invent contacts or private data. Return valid JSON only.",
    default_user_prompt_template: [
      "Analyze {{institution_name}} in {{institution_city}}, {{institution_state}}.",
      "Website: {{institution_website_domain}}",
      "Categories: {{institution_categories}}",
      "Enrollment: {{institution_enrollment_band}}",
      "Programs: {{institution_program_highlights}}",
      "ICP geography: {{icp_geography}}",
      "ICP school types: {{icp_school_types}}",
      "ICP keywords: {{icp_keywords}}",
      "Sources: {{source_names}} {{source_urls}}"
    ].join("\n")
  },
  {
    prompt_key: "prospect.outreach_draft",
    agent_name: "OutreachDraftAgent",
    description: "First-touch outreach draft for human review",
    default_output_schema_version: "prospect.outreach_draft.output.v1",
    default_safety_policy_version: "safety.policy.v1",
    required_placeholders: ["institution_name", "public_summary"],
    default_provider: "openai",
    default_model: "gpt-4o-mini",
    default_system_prompt:
      "Draft a short professional B2B outreach email using only provided public facts. Do not claim personal relationships. Return valid JSON only.",
    default_user_prompt_template: [
      "School: {{institution_name}}",
      "Summary: {{public_summary}}",
      "Fit: {{fit_rationale}}",
      "Angle: {{outreach_angle}}"
    ].join("\n")
  },
  {
    prompt_key: "meeting_prep.brief",
    agent_name: "MeetingPrepAgent",
    description: "Meeting preparation brief",
    default_output_schema_version: "meeting_prep.brief.output.v1",
    default_safety_policy_version: "safety.policy.v1",
    required_placeholders: ["school_name"],
    default_provider: "openai",
    default_model: "gpt-4o-mini",
    default_system_prompt:
      "Prepare a concise meeting brief from public partnership context. Do not include student PII.",
    default_user_prompt_template: "Prepare a brief for {{school_name}}."
  },
  {
    prompt_key: "proposal.draft",
    agent_name: "ProposalGenerationAgent",
    description: "Partnership proposal draft",
    default_output_schema_version: "proposal.draft.output.v1",
    default_safety_policy_version: "safety.policy.v1",
    required_placeholders: ["school_name"],
    default_provider: "openai",
    default_model: "gpt-4o-mini",
    default_system_prompt:
      "Draft a partnership proposal for human review. Never send autonomously.",
    default_user_prompt_template: "Draft a proposal outline for {{school_name}}."
  },
  {
    prompt_key: "contact_discovery.roles",
    agent_name: "ContactDiscoveryAgent",
    description: "Suggested public contact roles",
    default_output_schema_version: "contact_discovery.roles.output.v1",
    default_safety_policy_version: "safety.policy.v1",
    required_placeholders: ["school_name"],
    default_provider: "openai",
    default_model: "gpt-4o-mini",
    default_system_prompt:
      "Suggest likely public partnership contact roles. Do not invent personal emails.",
    default_user_prompt_template:
      "Suggest roles for {{school_name}}. Hints: {{job_title_hints}}"
  }
];

const catalogByKey = new Map(
  PROMPT_CATALOG.map((entry) => [entry.prompt_key, entry])
);

export function getPromptCatalogEntry(
  promptKey: string
): PromptCatalogEntry | null {
  return catalogByKey.get(promptKey) ?? null;
}

export function listPromptCatalog(): PromptCatalogEntry[] {
  return [...PROMPT_CATALOG];
}

export function buildSeedDraftFromCatalog(params: {
  promptKey: string;
  version: string;
  organizationId: string | null;
  createdBy: string | null;
  changeSummary?: string;
}): Omit<AgentPromptVersion, "id" | "created_at"> | null {
  const entry = getPromptCatalogEntry(params.promptKey);
  if (!entry) {
    return null;
  }

  return {
    organization_id: params.organizationId,
    prompt_key: entry.prompt_key,
    version: params.version,
    agent_name: entry.agent_name,
    status: "draft",
    description: entry.description,
    system_prompt: entry.default_system_prompt,
    user_prompt_template: entry.default_user_prompt_template,
    output_schema_version: entry.default_output_schema_version,
    provider: entry.default_provider,
    model: entry.default_model,
    temperature: 0.2,
    max_output_tokens: 1200,
    safety_policy_version: entry.default_safety_policy_version,
    change_summary: params.changeSummary ?? "Seed draft from catalog",
    created_by: params.createdBy,
    activated_at: null,
    deprecated_at: null
  };
}
