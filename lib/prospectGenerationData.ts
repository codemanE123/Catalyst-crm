import {
  type ProspectCandidate,
  type ProspectGenerationInput,
  type ProspectGenerationJob,
  type ProspectJobStatus
} from "./prospectGeneration";
import { isDevelopmentEnvironment } from "./supabaseServer";
import { getServerSupabaseClient } from "./supabaseServer";

type ProspectGenerationJobRow = {
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

type ProspectCandidateRow = {
  id: string;
  organization_id: string;
  job_id: string;
  status: ProspectCandidate["status"];
  name: string;
  website: string | null;
  district: string | null;
  location: string | null;
  rationale: string | null;
  confidence_score: number | null;
  source_name: string | null;
  source_url: string | null;
  discovery_method: string | null;
  retrieved_at: string | null;
  promoted_school_id: string | null;
  enrichment_summary: string | null;
  outreach_angle: string | null;
  recommended_next_step: string | null;
  enrichment_status: ProspectCandidate["enrichment_status"];
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
};

const sampleProspectJobs: ProspectGenerationJob[] = [
  {
    id: "sample-job-completed",
    organization_id: "sample-org",
    created_by: "sample-user",
    job_type: "discover_prospects",
    status: "completed",
    input: {
      geography: "Southeast US",
      schoolTypes: ["hbcu", "cae"],
      keywords: "cybersecurity, workforce development",
      maxResults: 25
    },
    summary: { candidate_count: 2 },
    error_code: null,
    error_message: null,
    started_at: "2026-07-06T14:00:00.000Z",
    completed_at: "2026-07-06T14:05:00.000Z",
    created_at: "2026-07-06T14:00:00.000Z",
    updated_at: "2026-07-06T14:05:00.000Z"
  },
  {
    id: "sample-job-queued",
    organization_id: "sample-org",
    created_by: "sample-user",
    job_type: "discover_prospects",
    status: "queued",
    input: {
      geography: "Texas",
      schoolTypes: ["state_university", "community_college"],
      keywords: "cybersecurity",
      maxResults: 50
    },
    summary: null,
    error_code: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-07-07T10:00:00.000Z",
    updated_at: "2026-07-07T10:00:00.000Z"
  }
];

const sampleProspectCandidates: ProspectCandidate[] = [
  {
    id: "sample-candidate-1",
    organization_id: "sample-org",
    job_id: "sample-job-completed",
    status: "pending_review",
    name: "Howard University",
    website: "https://www.howard.edu",
    district: "Washington, DC",
    location: "Washington, DC",
    rationale: "HBCU with NSA CAE-designated cybersecurity programs. Source: U.S. Department of Education College Scorecard.",
    confidence_score: 0.91,
    source_name: "U.S. Department of Education College Scorecard",
    source_url: "https://collegescorecard.ed.gov/data/api/",
    discovery_method: "college_scorecard",
    retrieved_at: "2026-07-06T14:05:00.000Z",
    promoted_school_id: null,
    enrichment_summary:
      "Howard University is a historically Black university in Washington, DC with public cybersecurity-related program signals.",
    outreach_angle:
      "Lead with workforce development and cybersecurity program alignment for institutional partnerships.",
    recommended_next_step: "Initial outreach - cyber workforce program",
    enrichment_status: "enriched",
    enriched_at: "2026-07-06T15:00:00.000Z",
    created_at: "2026-07-06T14:05:00.000Z",
    updated_at: "2026-07-06T15:00:00.000Z"
  },
  {
    id: "sample-candidate-2",
    organization_id: "sample-org",
    job_id: "sample-job-completed",
    status: "pending_review",
    name: "North Carolina A&T State University",
    website: "https://www.ncat.edu",
    district: "Greensboro, NC",
    location: "Greensboro, NC",
    rationale: "HBCU and state university with cybersecurity workforce programs. Source: Catalyst stub generator.",
    confidence_score: 0.88,
    source_name: "Catalyst stub generator (curated public institutions)",
    source_url: "https://collegescorecard.ed.gov/data/api/",
    discovery_method: "stub_generator",
    retrieved_at: "2026-07-06T14:05:00.000Z",
    promoted_school_id: null,
    enrichment_summary: null,
    outreach_angle: null,
    recommended_next_step: null,
    enrichment_status: "not_enriched",
    enriched_at: null,
    created_at: "2026-07-06T14:05:00.000Z",
    updated_at: "2026-07-06T14:05:00.000Z"
  }
];

function mapJobRow(row: ProspectGenerationJobRow): ProspectGenerationJob {
  return {
    id: row.id,
    organization_id: row.organization_id,
    created_by: row.created_by,
    job_type: row.job_type,
    status: row.status,
    input: row.input,
    summary: row.summary,
    error_code: row.error_code,
    error_message: row.error_message,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapCandidateRow(row: ProspectCandidateRow): ProspectCandidate {
  return {
    id: row.id,
    organization_id: row.organization_id,
    job_id: row.job_id,
    status: row.status,
    name: row.name,
    website: row.website,
    district: row.district,
    location: row.location,
    rationale: row.rationale,
    confidence_score: row.confidence_score,
    source_name: row.source_name,
    source_url: row.source_url,
    discovery_method: row.discovery_method ?? null,
    retrieved_at: row.retrieved_at ?? null,
    promoted_school_id: row.promoted_school_id,
    enrichment_summary: row.enrichment_summary,
    outreach_angle: row.outreach_angle,
    recommended_next_step: row.recommended_next_step,
    enrichment_status: row.enrichment_status,
    enriched_at: row.enriched_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function fetchProspectGenerationJobs(
  organizationId: string
): Promise<{ jobs: ProspectGenerationJob[]; source: "supabase" | "sample" }> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return {
      jobs: sampleProspectJobs,
      source: "sample"
    };
  }

  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    if (!isDevelopmentEnvironment()) {
      throw new Error("Could not load prospect generation jobs.");
    }

    return {
      jobs: sampleProspectJobs,
      source: "sample"
    };
  }

  return {
    jobs: (data ?? []).map((row) => mapJobRow(row as ProspectGenerationJobRow)),
    source: "supabase"
  };
}

export async function fetchProspectGenerationJob(
  organizationId: string,
  jobId: string
): Promise<ProspectGenerationJob | null> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return (
      sampleProspectJobs.find(
        (job) => job.id === jobId && job.organization_id === organizationId
      ) ??
      sampleProspectJobs.find((job) => job.id === jobId) ??
      null
    );
  }

  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    if (!isDevelopmentEnvironment()) {
      return null;
    }

    return (
      sampleProspectJobs.find((job) => job.id === jobId) ?? null
    );
  }

  return mapJobRow(data as ProspectGenerationJobRow);
}

export async function fetchProspectCandidatesForJob(
  organizationId: string,
  jobId: string
): Promise<{ candidates: ProspectCandidate[]; source: "supabase" | "sample" }> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return {
      candidates: sampleProspectCandidates.filter(
        (candidate) => candidate.job_id === jobId
      ),
      source: "sample"
    };
  }

  const { data, error } = await supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,job_id,status,name,website,district,location,rationale,confidence_score,source_name,source_url,discovery_method,retrieved_at,promoted_school_id,enrichment_summary,outreach_angle,recommended_next_step,enrichment_status,enriched_at,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("job_id", jobId)
    .order("confidence_score", { ascending: false, nullsFirst: false })
    .order("name");

  if (error) {
    if (!isDevelopmentEnvironment()) {
      throw new Error("Could not load prospect candidates.");
    }

    return {
      candidates: sampleProspectCandidates.filter(
        (candidate) => candidate.job_id === jobId
      ),
      source: "sample"
    };
  }

  return {
    candidates: (data ?? []).map((row) =>
      mapCandidateRow(row as ProspectCandidateRow)
    ),
    source: "supabase"
  };
}
