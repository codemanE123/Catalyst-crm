import Link from "next/link";

import type { UpcomingFollowUpItem } from "@/lib/upcomingFollowUps";
import { urgencyLabel } from "@/lib/upcomingFollowUps";

const urgencyStyles = {
  overdue: "bg-rose-100 text-rose-800 ring-rose-200",
  today: "bg-amber-100 text-amber-900 ring-amber-200",
  upcoming: "bg-slate-100 text-slate-700 ring-slate-200"
} as const;

const statusStyles = {
  Open: "bg-sky-100 text-sky-800 ring-sky-200",
  Scheduled: "bg-violet-100 text-violet-800 ring-violet-200",
  Done: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Blocked: "bg-slate-200 text-slate-800 ring-slate-300"
} as const;

function formatDueDate(value: string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export default function UpcomingFollowUps({
  followUps
}: {
  followUps: UpcomingFollowUpItem[];
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Task queue
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">
          Upcoming follow-ups
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Open follow-ups across your organization, sorted by urgency.
        </p>
      </div>

      {followUps.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">School</th>
                <th className="px-6 py-4 font-semibold">Follow-up</th>
                <th className="px-6 py-4 font-semibold">Due date</th>
                <th className="px-6 py-4 font-semibold">Owner</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {followUps.map((followUp) => (
                <tr key={followUp.id} className="align-top">
                  <td className="px-6 py-5">
                    <Link
                      href={`/schools/${followUp.schoolId}`}
                      prefetch={false}
                      className="font-semibold text-slate-950 transition hover:text-cyan-700"
                    >
                      {followUp.schoolName}
                    </Link>
                  </td>
                  <td className="px-6 py-5 text-slate-600">{followUp.title}</td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-2">
                      <span
                        className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${urgencyStyles[followUp.urgency]}`}
                      >
                        {urgencyLabel(followUp.urgency)}
                      </span>
                      <span className="text-slate-600">
                        {formatDueDate(followUp.dueDate)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-slate-600">
                    {followUp.owner ?? "Unassigned"}
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[followUp.status]}`}
                    >
                      {followUp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-sm text-slate-500">
          No open follow-ups across your pipeline.
        </p>
      )}
    </section>
  );
}
