import ContactsCreatePanel from "@/app/components/ContactsCreatePanel";
import {
  PageHeader,
  Panel,
  PanelTitle,
  statusPillStyles
} from "@/app/components/ui";
import { listPartnersForOrganization } from "@/lib/actions/partners";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { getDashboardData, getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ContactsPageProps = {
  searchParams: Promise<{
    q?: string;
    school?: string;
    role?: string;
    touch?: string;
    affiliation?: string;
  }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const params = await searchParams;
  const { contacts, schools } = await getDashboardData();
  const query = (params.q ?? "").trim().toLowerCase();
  const school = params.school ?? "all";
  const role = (params.role ?? "").trim().toLowerCase();
  const touch = params.touch ?? "all";
  const affiliation = params.affiliation ?? "all";

  const user = await requireUser();
  const ownership = await getRecordOwnershipFields();
  const supabase = await getServerSupabaseClient();
  const canAct =
    user && ownership
      ? Boolean(await requireRole(user, MUTATION_ROLES, ownership.organization_id))
      : false;
  const partners =
    ownership && supabase
      ? await listPartnersForOrganization(ownership.organization_id)
      : [];

  const filtered = contacts.filter((contact) => {
    if (affiliation === "school" && contact.affiliation !== "school") return false;
    if (affiliation === "partner" && contact.affiliation !== "partner") return false;
    if (school !== "all" && contact.school !== school) return false;
    if (role && !contact.role.toLowerCase().includes(role)) return false;
    if (touch === "7d") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      if (contact.last_touch < cutoff.toISOString().slice(0, 10)) return false;
    }
    if (touch === "30d") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      if (contact.last_touch < cutoff.toISOString().slice(0, 10)) return false;
    }
    if (touch === "stale") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      if (contact.last_touch >= cutoff.toISOString().slice(0, 10)) return false;
    }
    if (!query) return true;
    const haystack =
      `${contact.name} ${contact.role} ${contact.school} ${contact.email}`.toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="School and corporate / industry partner relationships in one directory. Open a contact to browse Previous / Next."
      />

      {canAct ? (
        <Panel className="mb-6">
          <PanelTitle
            title="Add partners and people"
            description="Create a partner organization, then add contacts. Partner contacts can also link to a school."
          />
          <ContactsCreatePanel
            canAct={canAct}
            partners={partners}
            schools={schools.map((item) => ({ id: item.id, name: item.name }))}
          />
        </Panel>
      ) : null}

      <Panel className="mb-6">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Search</span>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Name, role, org, email"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Type</span>
            <select
              name="affiliation"
              defaultValue={affiliation}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            >
              <option value="all">Schools + partners</option>
              <option value="school">Schools only</option>
              <option value="partner">Partners only</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Organization</span>
            <select
              name="school"
              defaultValue={school}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            >
              <option value="all">All organizations</option>
              {Array.from(new Set(contacts.map((item) => item.school)))
                .sort()
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Role</span>
            <input
              name="role"
              defaultValue={params.role ?? ""}
              placeholder="Principal, VP…"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Last touch</span>
            <select
              name="touch"
              defaultValue={touch}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            >
              <option value="all">Any time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="stale">Older than 30 days</option>
            </select>
          </label>
          <div className="flex items-end gap-2 xl:col-span-5">
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Apply
            </button>
            <Link
              href="/contacts"
              prefetch={false}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5"
            >
              Reset
            </Link>
          </div>
        </form>
      </Panel>

      <Panel padding={false}>
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <p className="text-sm text-slate-400">
            Showing{" "}
            <span className="font-semibold text-slate-200">{filtered.length}</span>
            {filtered.length === contacts.length
              ? " contacts"
              : ` of ${contacts.length} contacts`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Organization</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Last touch</th>
                <th className="px-5 py-3 font-semibold">Relationship</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((contact) => (
                <tr key={contact.id} className="hover:bg-white/[0.03]">
                  <td className="px-5 py-4 font-semibold text-white">
                    <Link
                      href={`/contacts/${contact.id}`}
                      prefetch={false}
                      className="text-blue-300 hover:text-blue-200"
                    >
                      {contact.name}
                    </Link>
                    {contact.linkedinUrl ? (
                      <>
                        {" "}
                        <a
                          className="text-xs font-medium text-slate-400 hover:text-slate-200"
                          href={contact.linkedinUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          LinkedIn
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-slate-300">{contact.role}</td>
                  <td className="px-5 py-4">
                    <div className="text-slate-300">
                      <span className="mr-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {contact.affiliation === "partner" ? "Partner" : "School"}
                      </span>
                      {contact.schoolId ? (
                        <Link
                          href={`/schools/${contact.schoolId}`}
                          prefetch={false}
                          className="font-medium text-blue-300 hover:text-blue-200"
                        >
                          {contact.school}
                        </Link>
                      ) : (
                        <span>{contact.school}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-300">{contact.email}</td>
                  <td className="px-5 py-4 text-slate-300">
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                      year: "numeric"
                    }).format(new Date(contact.last_touch))}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                        statusPillStyles.Prospect
                      }`}
                    >
                      {contact.relationship}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? (
          <p className="p-6 text-sm text-slate-400">No contacts match these filters.</p>
        ) : null}
      </Panel>
    </div>
  );
}
