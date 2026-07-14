import type { AgentName } from "../types";

export const PROMPT_VERSION_STATUSES = [
  "draft",
  "active",
  "deprecated",
  "archived"
] as const;

export type PromptVersionStatus = (typeof PROMPT_VERSION_STATUSES)[number];

export const PROMPT_PROVIDERS = ["openai", "none"] as const;
export type PromptProvider = (typeof PROMPT_PROVIDERS)[number];

export const KNOWN_PROMPT_KEYS = [
  "prospect.enrich",
  "prospect.outreach_draft",
  "meeting_prep.brief",
  "proposal.draft",
  "contact_discovery.roles"
] as const;

export type KnownPromptKey = (typeof KNOWN_PROMPT_KEYS)[number];

export type AgentPromptVersion = {
  id: string;
  organization_id: string | null;
  prompt_key: string;
  version: string;
  agent_name: AgentName | string;
  status: PromptVersionStatus;
  description: string | null;
  system_prompt: string;
  user_prompt_template: string;
  output_schema_version: string;
  provider: PromptProvider | string;
  model: string;
  temperature: number;
  max_output_tokens: number;
  safety_policy_version: string;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  deprecated_at: string | null;
};

export type PromptRenderVariables = Record<string, string | number | boolean | null>;

export type PromptRenderResult =
  | {
      ok: true;
      system_prompt: string;
      user_prompt: string;
      prompt_key: string;
      version: string;
      output_schema_version: string;
    }
  | {
      ok: false;
      error: string;
      reason_code:
        | "unknown_placeholder"
        | "missing_placeholder"
        | "template_too_long"
        | "forbidden_content"
        | "invalid_template";
    };

export type PromptActivationGateResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type PromptExecutionStamp = {
  prompt_key: string;
  prompt_version: string;
  prompt_version_id: string;
  output_schema_version: string;
  provider: string;
  model: string;
  rollout_id: string | null;
  experiment_variant: "control" | "treatment" | null;
};

export const AGENT_PROMPT_KEY_MAP: Partial<Record<AgentName, string>> = {
  ProspectEnrichmentAgent: "prospect.enrich",
  OutreachDraftAgent: "prospect.outreach_draft",
  MeetingPrepAgent: "meeting_prep.brief",
  ProposalGenerationAgent: "proposal.draft",
  ContactDiscoveryAgent: "contact_discovery.roles"
};
