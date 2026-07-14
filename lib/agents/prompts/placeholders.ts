/**
 * Allowlisted template placeholders. Unknown {{vars}} are rejected.
 * Values are always string-serialized; no code execution.
 */
export const PROMPT_ALLOWED_PLACEHOLDERS = [
  "institution_name",
  "institution_city",
  "institution_state",
  "institution_website_domain",
  "institution_categories",
  "institution_enrollment_band",
  "institution_program_highlights",
  "icp_geography",
  "icp_school_types",
  "icp_keywords",
  "source_names",
  "source_urls",
  "public_summary",
  "fit_rationale",
  "outreach_angle",
  "school_name",
  "job_title_hints",
  "organization_id",
  "candidate_id",
  "job_id",
  "target_type",
  "target_id"
] as const;

export type PromptAllowedPlaceholder =
  (typeof PROMPT_ALLOWED_PLACEHOLDERS)[number];

export const PROMPT_ALLOWED_PLACEHOLDER_SET = new Set<string>(
  PROMPT_ALLOWED_PLACEHOLDERS
);

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    if (match[1]) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

export function findUnknownPlaceholders(template: string): string[] {
  return extractPlaceholders(template).filter(
    (name) => !PROMPT_ALLOWED_PLACEHOLDER_SET.has(name)
  );
}
