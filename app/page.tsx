import {
  CeoMetric,
  createInterviewNote,
  getDashboardData,
  School
} from "@/lib/supabase";

const statusStyles: Record<School["status"], string> = {
  Prospect: "bg-slate-100 text-slate-700 ring-slate-200",
  Contacted: "bg-sky-100 text-sky-700 ring-sky-200",
  Interviewing: "bg-amber-100 text-amber-800 ring-amber-200",
  Partner: "bg-emerald-100 text-emerald-700 ring-emerald-200"
};

export default async function Dashboard() {
  const { schools, contacts, pipeline, ceoMetrics, source } =
    await getDashboardData();
  const activeSchools = schools.filter((school) => school.status !== "Partner");
  const totalPipeline = pipeline.reduce((total, stage) => total + stage.count, 0);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-xl shadow-slate-200">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
                Catalyst CRM
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                School partnership pipeline dashboard
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                Track target schools, decision-maker relationships, interview
                notes, and pipeline health from one first-version workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4">
              <p className="text-sm text-slate-300">Data source</p>
              <p className="mt-1 text-lg font-semibold">
                {source === "supabase" ? "Supabase connected" : "Sample data"}
              </p>
            </div>
          </div>
        </section>

        <CeoDashboard metrics={ceoMetrics} />

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Operations snapshot
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <MetricCard label="Schools tracked" value={schools.length} />
            <MetricCard label="Active opportunities" value={activeSchools.length} />
            <MetricCard label="Known contacts" value={contacts.length} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Pipeline status
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                School outreach stages
              </h2>
            </div>
            <p className="text-sm text-slate-500">{totalPipeline} total schools</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {pipeline.map((stage) => (
              <div key={stage.name} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{stage.name}</span>
                  <span className="text-2xl font-semibold text-slate-950">
                    {stage.count}
                  </span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full ${stage.color}`}
                    style={{
                      width: `${totalPipeline ? (stage.count / totalPipeline) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.4fr_0.8fr]">
          <SchoolsTable schools={schools} />
          <InterviewNotesForm schools={schools} />
        </section>

        <ContactsTable contacts={contacts} />
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function CeoDashboard({ metrics }: { metrics: CeoMetric[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            CEO dashboard
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">
            Growth funnel snapshot
          </h2>
        </div>
        <p className="text-sm text-slate-500">
          Schools to paid-pilot conversion
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-5"
          >
            <p className="text-sm font-medium text-slate-500">{metric.label}</p>
            <p className="mt-3 text-4xl font-semibold text-slate-950">
              {metric.value.toLocaleString()}
            </p>
            <p className="mt-2 text-sm text-slate-500">{metric.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SchoolsTable({ schools }: { schools: School[] }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Schools
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">
          Target accounts
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-4 font-semibold">School</th>
              <th className="px-6 py-4 font-semibold">District</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold">Owner</th>
              <th className="px-6 py-4 font-semibold">Next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schools.map((school) => (
              <tr key={school.id} className="align-top">
                <td className="px-6 py-5">
                  <p className="font-semibold text-slate-950">{school.name}</p>
                  <p className="mt-1 text-slate-500">{school.location}</p>
                </td>
                <td className="px-6 py-5 text-slate-600">{school.district}</td>
                <td className="px-6 py-5">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[school.status]}`}
                  >
                    {school.status}
                  </span>
                </td>
                <td className="px-6 py-5 text-slate-600">{school.owner}</td>
                <td className="px-6 py-5 text-slate-600">{school.next_step}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InterviewNotesForm({ schools }: { schools: School[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Interview notes
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Capture a school interview
      </h2>
      <form action={createInterviewNote} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">School</span>
          <select
            name="school_id"
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            defaultValue=""
          >
            <option value="" disabled>
              Select school
            </option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Interviewer</span>
            <input
              name="interviewer"
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="Team member"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date</span>
            <input
              name="interview_date"
              type="date"
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Sentiment</span>
          <select
            name="sentiment"
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            defaultValue="Warm"
          >
            <option>Strong fit</option>
            <option>Warm</option>
            <option>Needs nurturing</option>
            <option>Not a fit</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            name="notes"
            required
            rows={5}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Key needs, objections, buying committee, and program fit"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Follow-up</span>
          <input
            name="follow_up"
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Next action"
          />
        </label>
        <button className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
          Save interview note
        </button>
      </form>
    </section>
  );
}

function ContactsTable({
  contacts
}: {
  contacts: Awaited<ReturnType<typeof getDashboardData>>["contacts"];
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Contacts
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">
          Decision-maker relationships
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-4 font-semibold">Name</th>
              <th className="px-6 py-4 font-semibold">Role</th>
              <th className="px-6 py-4 font-semibold">School</th>
              <th className="px-6 py-4 font-semibold">Email</th>
              <th className="px-6 py-4 font-semibold">Last touch</th>
              <th className="px-6 py-4 font-semibold">Relationship</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td className="px-6 py-5 font-semibold text-slate-950">
                  {contact.name}
                </td>
                <td className="px-6 py-5 text-slate-600">{contact.role}</td>
                <td className="px-6 py-5 text-slate-600">{contact.school}</td>
                <td className="px-6 py-5 text-slate-600">{contact.email}</td>
                <td className="px-6 py-5 text-slate-600">
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  }).format(new Date(contact.last_touch))}
                </td>
                <td className="px-6 py-5">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                    {contact.relationship}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
