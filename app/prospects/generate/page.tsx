import { redirect } from "next/navigation";

import ProspectGenerationForm from "@/app/components/ProspectGenerationForm";
import ProspectJobHistory from "@/app/components/ProspectJobHistory";
import {
  createProspectGenerationJob,
  processProspectGenerationJob
} from "@/lib/actions/prospectGeneration";
import {
  canEnqueueProspectGeneration,
  canViewProspectGeneration,
  getMembershipsForUser
} from "@/lib/authz";
import { fetchProspectGenerationJobs } from "@/lib/prospectGenerationData";
import { getProspectDiscoveryProviderStatus } from "@/lib/prospectSources/discoveryReadiness";
import { getRecordOwnershipFields } from "@/lib/supabase";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function GenerateProspectsPage() {
  const user = await requireUser();

  if (!user) {
    redirect("/login?next=/prospects/generate");
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
  const { jobs, source } = await fetchProspectGenerationJobs(organizationId);
  const discovery = getProspectDiscoveryProviderStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Generate prospects</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Queue prospect discovery jobs, then click Generate candidates to enqueue background
          processing. College Scorecard runs first when configured; approved public-web discovery
          can fill remaining slots. Candidates stay pending review until a human approves them.
          No recursive crawling or personal contact collection.
        </p>
        {!discovery.anyReady ? (
          <p className="mt-3 max-w-3xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Discovery providers are not configured on this deployment. Set
            COLLEGE_SCORECARD_API_KEY and/or PUBLIC_WEB_DISCOVERY_ENABLED with
            WEB_SEARCH_API_KEY and WEB_SEARCH_ENGINE_ID, then redeploy.
          </p>
        ) : null}
      </div>

      <ProspectGenerationForm
        canEnqueue={canEnqueueProspectGeneration(memberships)}
        createAction={createProspectGenerationJob}
      />

      <ProspectJobHistory
        canProcess={canEnqueueProspectGeneration(memberships)}
        discoveryConfigured={discovery.anyReady}
        jobs={jobs}
        processAction={processProspectGenerationJob}
        source={source}
      />
    </div>
  );
}
