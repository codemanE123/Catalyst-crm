import {
  PageHeader,
  Panel,
  statusPillStyles
} from "@/app/components/ui";
import { getDashboardData } from "@/lib/supabase";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ContactsPageProps = {
  searchParams: Promise<{
    q?: string;
    school?: string;
    role?: string;
    touch?: string;
  }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const params = await searchParams;
  const { contacts, schools } = await getDashboardData();
  const query = (params.q ?? "").trim().toLowerCase();
  const school = params.school ?? "all";
  const role = (params.role ?? "").trim().toLowerCase();
  const touch = params.touch ?? "all";
  const today = new Date().toISOString().slice(0, 10);

  const filtered = contacts.filter((contact) => {
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

  void today;

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Decision-maker relationships across your school pipeline."
      />

      <Panel className="mb-6">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Search</span>
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Name, role, school, email"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">School</span>
            <select
              name="school"
              defaultValue={school}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none ring-blue-500 focus:ring-2"
            >
              <option value="all">All schools</option>
              {schools.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Role</span>
            <input
              name="role"
              defaultValue={params.role ?? ""}
              placeholder="Principal, counselor…"
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
          <div className="flex items-end gap-2 xl:col-span-4">
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">School</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Last touch</th>
                <th className="px-5 py-3 font-semibold">Relationship</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((contact) => (
                <tr key={contact.id}>
                  <td className="px-5 py-4 font-semibold text-white">
                    {contact.name}
                  </td>
                  <td className="px-5 py-4 text-slate-300">{contact.role}</td>
                  <td className="px-5 py-4">
                    {contact.schoolId ? (
                      <Link
                        href={`/schools/${contact.schoolId}`}
                        prefetch={false}
                        className="font-medium text-blue-300 hover:text-blue-200"
                      >
                        {contact.school}
                      </Link>
                    ) : (
                      <span className="text-slate-300">{contact.school}</span>
                    )}
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
