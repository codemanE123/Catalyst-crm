import Link from "next/link";

import ProspectCandidateReviewRow from "@/app/components/ProspectCandidateReviewRow";
import type {
  ProspectCandidateActionResult,
  ProspectCandidateEnrichResult,
  ProspectOutreachDraftResult,
  ProspectOutreachDraftSaveResult
} from "@/lib/actions/prospectCandidates";
import {
  summarizeProspectJobInput,
  type ProspectCandidate,
  type ProspectGenerationJob
} from "@/lib/prospectGeneration";
import { PROSPECT_ENRICHMENT_QUEUE_WARNING } from "@/lib/prospectEnrichmentReview";

export default function ProspectReviewQueue({
  job,
  candidates,
  source,
  canReview,
  llmEnrichmentEnabled,
  llmEnrichmentDisabledReason,
  outreachDraftEnabled,
  outreachDraftDisabledReason,
  approveAction,
  rejectAction,
  enrichAction,
  generateDraftAction,
  saveDraftAction
}: {
  job: ProspectGenerationJob;
  candidates: ProspectCandidate[];
  source: "supabase" | "sample";
  canReview: boolean;
  llmEnrichmentEnabled: boolean;
  llmEnrichmentDisabledReason: string;
  outreachDraftEnabled: boolean;
  outreachDraftDisabledReason: string;
  approveAction: (formData: FormData) => Promise<ProspectCandidateActionResult>;
  rejectAction: (formData: FormData) => Promise<ProspectCandidateActionResult>;
  enrichAction: (candidateId: string) => Promise<ProspectCandidateEnrichResult>;
  generateDraftAction: (candidateId: string) => Promise<ProspectOutreachDraftResult>;
  saveDraftAction: (
    candidateId: string,
    draftText: string
  ) => Promise<ProspectOutreachDraftSaveResult>;
}) {
  const pendingCount = candidates.filter(
    (candidate) => candidate.status === "pending_review"
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Prospect review queue</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {summarizeProspectJobInput(job.input)}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Approve candidates to add them as Prospect schools in your CRM. Rejected candidates
              stay out of the pipeline. Enrichment is optional and never auto-creates schools.
            </p>
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              {PROSPECT_ENRICHMENT_QUEUE_WARNING}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {source === "sample" ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                Sample data
              </span>
            ) : null}
            <Link
              className="text-sm font-medium text-sky-700 hover:text-sky-900"
              href="/prospects/generate"
            >
              Back to jobs
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Candidates ({candidates.length})
          </h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200">
              {pendingCount} pending
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              Completed job
            </span>
          </div>
        </div>

        {!canReview ? (
          <p className="mt-4 text-sm text-slate-600">
            You have read-only access. Contact an admin to approve or reject candidates.
          </p>
        ) : null}

        {candidates.length === 0 ? (
          <p className="mt-6 text-sm text-slate-600">
            This completed job has no candidates yet. A background worker will populate this queue
            when agent processing is enabled.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[1500px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">School</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Website</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                  <th className="px-3 py-2 font-medium">Source rationale</th>
                  <th className="px-3 py-2 font-medium">AI enrichment review</th>
                  <th className="px-3 py-2 font-medium">Outreach draft</th>
                  <th className="px-3 py-2 font-medium">Review status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((candidate) => (
                  <ProspectCandidateReviewRow
                    key={candidate.id}
                    actionsEnabled={source === "supabase"}
                    approveAction={approveAction}
                    canReview={canReview}
                    candidate={candidate}
                    enrichAction={enrichAction}
                    generateDraftAction={generateDraftAction}
                    jobId={job.id}
                    llmEnrichmentDisabledReason={llmEnrichmentDisabledReason}
                    llmEnrichmentEnabled={llmEnrichmentEnabled}
                    outreachDraftDisabledReason={outreachDraftDisabledReason}
                    outreachDraftEnabled={outreachDraftEnabled}
                    rejectAction={rejectAction}
                    saveDraftAction={saveDraftAction}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
