import { notFound, redirect } from "next/navigation";

import ProspectReviewQueue from "@/app/components/ProspectReviewQueue";
import {
  approveProspectCandidate,
  enrichProspectCandidate,
  generateProspectOutreachDraft,
  rejectProspectCandidate,
  saveProspectOutreachDraft
} from "@/lib/actions/prospectCandidates";
import {
  runContactDiscoveryForCandidate
} from "@/lib/actions/contactDiscovery";
import { fetchContactRecommendationsForCandidates } from "@/lib/contactDiscovery/execute";
import {
  canEnqueueProspectGeneration,
  canViewProspectGeneration,
  getMembershipsForUser
} from "@/lib/authz";
import { getLlmEnrichmentStatus } from "@/lib/llm";
import { getProspectOutreachDraftStatus } from "@/lib/llm/outreachDraft";
import {
  fetchProspectCandidatesForJob,
  fetchProspectGenerationJob
} from "@/lib/prospectGenerationData";
import { getRecordOwnershipFields } from "@/lib/supabase";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function ProspectReviewPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  if (!user) {
    redirect(`/login?next=/prospects/jobs/${id}/review`);
  }

  const supabase = await getServerSupabaseClient();
  const memberships = supabase
    ? await getMembershipsForUser(supabase, user.id)
    : [];

  if (!canViewProspectGeneration(memberships)) {
    redirect("/");
  }

  const ownership = await getRecordOwnershipFields();
  const organizationId = ownership?.organization_id ?? "sample-org";
  const job = await fetchProspectGenerationJob(organizationId, id);

  if (!job) {
    notFound();
  }

  if (job.status !== "completed") {
    redirect("/prospects/generate");
  }

  const { candidates, source } = await fetchProspectCandidatesForJob(
    organizationId,
    id
  );
  const llmStatus = getLlmEnrichmentStatus();
  const outreachDraftStatus = getProspectOutreachDraftStatus();
  const contactRecommendationsByCandidateId =
    supabase && source === "supabase"
      ? Object.fromEntries(
          (
            await fetchContactRecommendationsForCandidates(
              supabase,
              organizationId,
              candidates.map((candidate) => candidate.id)
            )
          ).entries()
        )
      : {};

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <ProspectReviewQueue
        approveAction={approveProspectCandidate}
        canReview={canEnqueueProspectGeneration(memberships)}
        candidates={candidates}
        contactRecommendationsByCandidateId={contactRecommendationsByCandidateId}
        discoverContactRolesAction={runContactDiscoveryForCandidate}
        enrichAction={enrichProspectCandidate}
        generateDraftAction={generateProspectOutreachDraft}
        job={job}
        llmEnrichmentDisabledReason={llmStatus.reason}
        llmEnrichmentEnabled={llmStatus.enabled}
        outreachDraftDisabledReason={outreachDraftStatus.reason}
        outreachDraftEnabled={outreachDraftStatus.enabled}
        rejectAction={rejectProspectCandidate}
        saveDraftAction={saveProspectOutreachDraft}
        source={source}
      />
    </main>
  );
}
