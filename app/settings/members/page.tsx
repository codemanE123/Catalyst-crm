import MembersSettingsPanel from "./MembersSettingsPanel";
import {
  getManageableOrganizations,
  getOrganizationMembers
} from "@/lib/actions/memberships";
import {
  canAccessSettingsRoutes,
  getMembershipsForUser,
  isSuperAdmin
} from "@/lib/authz";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";
import Link from "next/link";
import { redirect } from "next/navigation";

type MembersPageProps = {
  searchParams: Promise<{ organization_id?: string }>;
};

export default async function MembersSettingsPage({
  searchParams
}: MembersPageProps) {
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    redirect("/login");
  }

  const memberships = await getMembershipsForUser(supabase, user.id);

  if (!canAccessSettingsRoutes(memberships)) {
    redirect("/");
  }

  const { organizations, defaultOrganizationId } =
    await getManageableOrganizations();

  if (!organizations.length || !defaultOrganizationId) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/"
            className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
          >
            Back to dashboard
          </Link>
          <h1 className="mt-6 text-3xl font-semibold">Organization members</h1>
          <p className="mt-4 text-slate-600">
            No manageable organizations were found for your account.
          </p>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const selectedOrganizationId =
    organizations.find(
      (organization) => organization.id === params.organization_id
    )?.id ?? defaultOrganizationId;

  const members = await getOrganizationMembers(selectedOrganizationId);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <Link
          href="/"
          className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
        >
          Back to dashboard
        </Link>

        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Settings
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Organization members
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            List members, change roles, and remove access for your organization.
            Only admin and super_admin users can manage memberships.
          </p>
        </section>

        <MembersSettingsPanel
          organizations={organizations}
          initialOrganizationId={selectedOrganizationId}
          initialMembers={members}
          actorIsSuperAdmin={isSuperAdmin(memberships)}
        />
      </div>
    </main>
  );
}
