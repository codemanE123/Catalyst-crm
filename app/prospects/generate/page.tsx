import { redirect } from "next/navigation";

import ProspectGenerationForm from "@/app/components/ProspectGenerationForm";
import ProspectJobHistory from "@/app/components/ProspectJobHistory";
import { createProspectGenerationJob, processProspectGenerationJob } from "@/lib/actions/prospectGeneration";
import {
  canEnqueueProspectGeneration,
  canViewProspectGeneration,
  getMembershipsForUser
} from "@/lib/authz";
import { fetchProspectGenerationJobs } from "@/lib/prospectGenerationData";
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

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold text-slate-950">Generate prospects</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Queue prospect discovery jobs, then run them against the College Scorecard
          API (when enabled and configured). Candidates stay pending review until a
          human approves them into CRM schools. No scraping or personal contact
          collection.
        </p>
      </div>

      <ProspectGenerationForm
        canEnqueue={canEnqueueProspectGeneration(memberships)}
        createAction={createProspectGenerationJob}
      />

      <ProspectJobHistory
        canProcess={canEnqueueProspectGeneration(memberships)}
        jobs={jobs}
        processAction={processProspectGenerationJob}
        source={source}
      />
    </main>
  );
}
