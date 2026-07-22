import {
  PageHeader,
  Panel,
  PrimaryButtonLink,
  SecondaryButtonLink,
  statusPillStyles
} from "@/app/components/ui";
import { canManageSchools, getMembershipsForUser } from "@/lib/authz";
import { getDashboardData, type School } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SchoolsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    owner?: string;
    state?: string;
    sort?: string;
  }>;
};

function deriveCityState(school: School): { city: string; state: string } {
  const storedCity = school.city?.trim() ?? "";
  const storedState = school.state?.trim() ?? "";
  if (storedCity || storedState) {
    return { city: storedCity, state: storedState };
  }

  const location = (school.location ?? "").trim();
  if (!location) {
    return { city: "", state: "" };
  }

  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      city: parts.slice(0, -1).join(", "),
      state: parts[parts.length - 1] ?? ""
    };
  }

  return { city: location, state: "" };
}

function websiteHost(website: string | null | undefined): string {
  if (!website?.trim()) {
    return "";
  }

  try {
    const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(normalized).hostname.replace(/^www\./i, "");
  } catch {
    return website.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  }
}

export default async function SchoolsPage({ searchParams }: SchoolsPageProps) {
  const params = await searchParams;
  const { schools, upcomingFollowUps } = await getDashboardData();
  const canManage = await userCanManageSchools();

  const query = (params.q ?? "").trim().toLowerCase();
  const status = params.status ?? "all";
  const owner = params.owner ?? "all";
  const state = (params.state ?? "").trim().toLowerCase();
  const sort = params.sort ?? "name";

  const owners = Array.from(new Set(schools.map((school) => school.owner))).sort();
  const followUpBySchool = new Map(
    upcomingFollowUps.map((item) => [item.schoolId, item])
  );

  let filtered = schools.filter((school) => {
    if (status !== "all" && school.status !== status) return false;
    if (owner !== "all" && school.owner !== owner) return false;
    const { city, state: schoolState } = deriveCityState(school);
    if (
      state &&
      !(
        school.location ?? ""
      ).toLowerCase().includes(state) &&
      !schoolState.toLowerCase().includes(state) &&
      !city.toLowerCase().includes(state)
    ) {
      return false;
    }
    if (!query) return true;
    const haystack =
      `${school.name} ${school.location} ${school.district} ${school.owner} ${school.next_step} ${school.school_type ?? ""} ${school.priority_contact ?? ""} ${school.website ?? ""} ${city} ${schoolState}`.toLowerCase();
    return haystack.includes(query);
  });

  filtered = [...filtered].sort((left, right) => {
    if (sort === "status") return left.status.localeCompare(right.status);
    if (sort === "owner") return left.owner.localeCompare(right.owner);
    return left.name.localeCompare(right.name);
  });

  return (
    <div>
      <PageHeader
        title="Schools"
        subtitle="Search, filter, and open target accounts in your organization."
        actions={
          canManage ? (
            <>
              <PrimaryButtonLink href="/schools/new">Add School</PrimaryButtonLink>
              <SecondaryButtonLink href="/schools/import">
                Import CSV
              </SecondaryButtonLink>
            </>
          ) : null
        }
      />

      <Panel className="mb-6">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block xl:col-span-2">
            <span className="text-xs font-medium text-slate-400">Search</span>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Name, type, city, contact, website…"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Status</span>
            <select
              name="status"
              defaultValue={status}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            >
              <option value="all">All statuses</option>
              <option value="Prospect">Prospect</option>
              <option value="Contacted">Contacted</option>
              <option value="Interviewing">Interviewing</option>
              <option value="Partner">Partner</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Owner</span>
            <select
              name="owner"
              defaultValue={owner}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            >
              <option value="all">All owners</option>
              {owners.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">State / location</span>
            <input
              name="state"
              defaultValue={params.state ?? ""}
              placeholder="CA, TX, Denver…"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-5">
            <label className="block min-w-[160px]">
              <span className="text-xs font-medium text-slate-400">Sort</span>
              <select
                name="sort"
                defaultValue={sort}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
              >
                <option value="name">Name</option>
                <option value="status">Status</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Apply
            </button>
            <Link
              href="/schools"
              prefetch={false}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5"
            >
              Reset
            </Link>
          </div>
        </form>
      </Panel>

      <Panel padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">School</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">State</th>
                <th className="px-5 py-3 font-semibold">City</th>
                <th className="px-5 py-3 font-semibold">Website</th>
                <th className="px-5 py-3 font-semibold">Priority contact</th>
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Owner</th>
                <th className="px-5 py-3 font-semibold">Next step</th>
                <th className="px-5 py-3 font-semibold">Follow-up</th>
                <th className="px-5 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((school) => {
                const followUp = followUpBySchool.get(school.id);
                const { city, state: schoolState } = deriveCityState(school);
                const host = websiteHost(school.website);
                return (
                  <tr key={school.id}>
                    <td className="px-5 py-4">
                      <Link
                        href={`/schools/${school.id}`}
                        prefetch={false}
                        className="font-semibold text-white hover:text-blue-300"
                      >
                        {school.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-400">{school.district}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {school.school_type?.trim() || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {schoolState || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">{city || "—"}</td>
                    <td className="px-5 py-4 text-slate-300">
                      {school.website?.trim() ? (
                        <a
                          href={
                            /^https?:\/\//i.test(school.website)
                              ? school.website
                              : `https://${school.website}`
                          }
                          rel="noreferrer"
                          target="_blank"
                          className="text-blue-300 hover:text-blue-200"
                        >
                          {host || school.website}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {school.priority_contact?.trim() || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">{school.location}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          statusPillStyles[school.status]
                        }`}
                      >
                        {school.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{school.owner}</td>
                    <td className="px-5 py-4 text-slate-300">{school.next_step}</td>
                    <td className="px-5 py-4 text-slate-300">
                      {followUp ? (
                        <span>
                          {followUp.title}
                          {followUp.urgency === "overdue" ? (
                            <span className="ml-2 text-xs font-semibold text-rose-300">
                              Overdue
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/schools/${school.id}`}
                        prefetch={false}
                        className="text-sm font-semibold text-blue-300 hover:text-blue-200"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length ? (
          <p className="p-6 text-sm text-slate-400">
            No schools match the current filters.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

async function userCanManageSchools(): Promise<boolean> {
  const user = await requireUser();
  const supabase = await getServerSupabaseClient();
  if (!user || !supabase) return false;
  const memberships = await getMembershipsForUser(supabase, user.id);
  return canManageSchools(memberships);
}
