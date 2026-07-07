export const PROSPECT_SCHOOL_TYPES = [
  "hbcu",
  "cae",
  "state_university",
  "community_college",
  "workforce_cyber"
] as const;

export type ProspectSchoolType = (typeof PROSPECT_SCHOOL_TYPES)[number];

export const PROSPECT_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed"
] as const;

export type ProspectJobStatus = (typeof PROSPECT_JOB_STATUSES)[number];

export const PROSPECT_CANDIDATE_STATUSES = [
  "pending_review",
  "approved",
  "rejected"
] as const;

export type ProspectCandidateStatus =
  (typeof PROSPECT_CANDIDATE_STATUSES)[number];

export type ProspectGenerationInput = {
  geography: string;
  schoolTypes: ProspectSchoolType[];
  keywords: string;
  maxResults: number;
};

export type ProspectGenerationJob = {
  id: string;
  organization_id: string;
  created_by: string;
  job_type: "discover_prospects";
  status: ProspectJobStatus;
  input: ProspectGenerationInput;
  summary: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProspectCandidate = {
  id: string;
  organization_id: string;
  job_id: string;
  status: ProspectCandidateStatus;
  name: string;
  website: string | null;
  district: string | null;
  location: string | null;
  rationale: string | null;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
};

export const PROSPECT_SCHOOL_TYPE_LABELS: Record<ProspectSchoolType, string> = {
  hbcu: "HBCU",
  cae: "Cybersecurity CAE",
  state_university: "State university",
  community_college: "Community college",
  workforce_cyber: "Workforce / cybersecurity programs"
};

export const PROSPECT_JOB_STATUS_LABELS: Record<ProspectJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed"
};

const MAX_RESULTS_MIN = 1;
const MAX_RESULTS_MAX = 100;
const MAX_RESULTS_DEFAULT = 25;

export function parseProspectSchoolTypes(
  values: string[]
): ProspectSchoolType[] | null {
  const selected = values.filter((value) =>
    PROSPECT_SCHOOL_TYPES.includes(value as ProspectSchoolType)
  ) as ProspectSchoolType[];

  if (selected.length === 0) {
    return null;
  }

  return [...new Set(selected)];
}

export function parseProspectGenerationInput(formData: FormData):
  | { ok: true; input: ProspectGenerationInput }
  | { ok: false; error: string } {
  const geography = String(formData.get("geography") ?? "").trim();

  if (!geography) {
    return { ok: false, error: "Geography is required." };
  }

  const schoolTypes = parseProspectSchoolTypes(
    formData.getAll("school_types").map((value) => String(value))
  );

  if (!schoolTypes) {
    return { ok: false, error: "Select at least one school type." };
  }

  const keywords = String(formData.get("keywords") ?? "").trim();
  const maxResultsRaw = String(formData.get("max_results") ?? "").trim();
  const maxResults = maxResultsRaw
    ? Number.parseInt(maxResultsRaw, 10)
    : MAX_RESULTS_DEFAULT;

  if (!Number.isFinite(maxResults)) {
    return { ok: false, error: "Maximum results must be a number." };
  }

  if (maxResults < MAX_RESULTS_MIN || maxResults > MAX_RESULTS_MAX) {
    return {
      ok: false,
      error: `Maximum results must be between ${MAX_RESULTS_MIN} and ${MAX_RESULTS_MAX}.`
    };
  }

  return {
    ok: true,
    input: {
      geography,
      schoolTypes,
      keywords,
      maxResults
    }
  };
}

export function formatProspectSchoolTypes(
  schoolTypes: ProspectSchoolType[]
): string {
  return schoolTypes.map((type) => PROSPECT_SCHOOL_TYPE_LABELS[type]).join(", ");
}

export function summarizeProspectJobInput(input: ProspectGenerationInput): string {
  const parts = [
    input.geography,
    formatProspectSchoolTypes(input.schoolTypes)
  ];

  if (input.keywords) {
    parts.push(input.keywords);
  }

  parts.push(`max ${input.maxResults}`);

  return parts.join(" · ");
}
