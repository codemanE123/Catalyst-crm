import { redirect } from "next/navigation";

import ManualMeetingImportForm from "@/app/components/ManualMeetingImportForm";
import MeetingImportReviewList from "@/app/components/MeetingImportReviewList";
import { PageHeader, Panel, PanelTitle } from "@/app/components/ui";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { isFirefliesImportReady } from "@/lib/meetingImports/config";
import { listPendingMeetingImports } from "@/lib/meetingImports/service";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function MeetingImportsPage() {
  const user = await requireUser();
  if (!user) {
    redirect("/login?next=/meeting-imports");
  }

  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    redirect("/login?next=/meeting-imports");
  }

  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    redirect("/");
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    ownership.organization_id
  );
  const canAct = Boolean(membership);

  const [imports, schoolsResponse] = await Promise.all([
    listPendingMeetingImports({
      supabase,
      organizationId: ownership.organization_id,
      limit: 75
    }),
    supabase
      .from("schools")
      .select("id,name")
      .eq("organization_id", ownership.organization_id)
      .order("name")
  ]);

  const schools = (schoolsResponse.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const importReady = isFirefliesImportReady();

  return (
    <div>
      <PageHeader
        title="Meeting imports"
        subtitle="Paste a digest, parse structured fields, then Accept to create discovery notes."
      />

      <Panel className="mb-6">
        <PanelTitle
          title="Paste meeting digest"
          description="Stage notes for review. Use Parse digest to extract CRM fields, then Accept."
        />
        <ManualMeetingImportForm canAct={canAct} schools={schools} />
      </Panel>

      {!importReady ? (
        <Panel className="mb-6 border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-100">
            Fireflies auto-import is optional. Paste digests above anytime. To
            enable webhooks, set{" "}
            <code className="text-amber-50">MEETING_IMPORT_ENABLED=true</code>{" "}
            and{" "}
            <code className="text-amber-50">FIREFLIES_WEBHOOK_SECRET</code>.
          </p>
        </Panel>
      ) : null}

      <Panel>
        <PanelTitle
          title="Pending review"
          description="Link a school if needed, then Accept to populate discovery notes."
        />
        <MeetingImportReviewList
          canAct={canAct}
          imports={imports}
          schools={schools}
        />
      </Panel>
    </div>
  );
}
