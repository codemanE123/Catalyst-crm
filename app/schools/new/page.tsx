import SchoolForm from "@/app/components/SchoolForm";
import { PageHeader, SecondaryButtonLink } from "@/app/components/ui";
import { createSchool } from "@/lib/actions/schools";
import { canManageSchools, getMembershipsForUser } from "@/lib/authz";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewSchoolPage() {
  const user = await requireUser();
  const supabase = await getServerSupabaseClient();

  if (!user) {
    redirect("/login?next=/schools/new");
  }

  const memberships = supabase
    ? await getMembershipsForUser(supabase, user.id)
    : [];

  if (!canManageSchools(memberships)) {
    redirect("/schools");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add school"
        subtitle="Create a target account in your organization pipeline."
        actions={<SecondaryButtonLink href="/schools">Back to schools</SecondaryButtonLink>}
      />
      <SchoolForm mode="create" schools={[]} createAction={createSchool} />
    </div>
  );
}
