import SchoolImport from "@/app/components/SchoolImport";
import { PageHeader, SecondaryButtonLink } from "@/app/components/ui";
import {
  importSchoolsFromCsv,
  previewSchoolImport
} from "@/lib/actions/schoolImport";
import { canManageSchools, getMembershipsForUser } from "@/lib/authz";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ImportSchoolsPage() {
  const user = await requireUser();
  const supabase = await getServerSupabaseClient();

  if (!user) {
    redirect("/login?next=/schools/import");
  }

  const memberships = supabase
    ? await getMembershipsForUser(supabase, user.id)
    : [];

  if (!canManageSchools(memberships)) {
    redirect("/schools");
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Import schools"
        subtitle="Upload a CSV, preview valid/invalid/duplicate rows, then import into your organization."
        actions={<SecondaryButtonLink href="/schools">Back to schools</SecondaryButtonLink>}
      />
      <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        Use column headers that match the template expectations in the importer.
        Duplicates are detected by existing validation rules — review the preview
        summary before confirming import.
      </div>
      <SchoolImport
        previewAction={previewSchoolImport}
        importAction={importSchoolsFromCsv}
      />
    </div>
  );
}
