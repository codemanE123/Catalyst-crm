import ProspectJobHistory from "@/app/components/ProspectJobHistory";
import { PageHeader, SecondaryButtonLink } from "@/app/components/ui";
import { processProspectGenerationJob } from "@/lib/actions/prospectGeneration";
import {
  canEnqueueProspectGeneration,
  canViewProspectGeneration,
  getMembershipsForUser
} from "@/lib/authz";
import { fetchProspectGenerationJobs } from "@/lib/prospectGenerationData";
import { getRecordOwnershipFields } from "@/lib/supabase";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProspectJobsPage() {
  const user = await requireUser();

  if (!user) {
    redirect("/login?next=/prospects/jobs");
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
    <div>
      <PageHeader
        title="Prospect jobs"
        subtitle="Queued and completed discovery jobs for your organization."
        actions={
          <SecondaryButtonLink href="/prospects/generate">
            Generate prospects
          </SecondaryButtonLink>
        }
      />
      <ProspectJobHistory
        canProcess={canEnqueueProspectGeneration(memberships)}
        jobs={jobs}
        processAction={processProspectGenerationJob}
        source={source}
      />
    </div>
  );
}
