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
  followUps,
  limit,
  compact = false,
  showViewAll = false
}: {
  followUps: UpcomingFollowUpItem[];
  limit?: number;
  compact?: boolean;
  showViewAll?: boolean;
}) {
  const rows = typeof limit === "number" ? followUps.slice(0, limit) : followUps;

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[var(--app-panel)] shadow-sm ${
        compact ? "" : ""
      }`}
    >
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {compact ? "Upcoming follow-ups" : "Follow-up queue"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Open follow-ups sorted by urgency.
            </p>
          </div>
          {showViewAll ? (
            <Link
              href="/follow-ups"
              prefetch={false}
              className="text-sm font-semibold text-blue-300 hover:text-blue-200"
            >
              View all
            </Link>
          ) : null}
        </div>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">School</th>
                <th className="px-6 py-4 font-semibold">Follow-up</th>
                <th className="px-6 py-4 font-semibold">Due date</th>
                <th className="px-6 py-4 font-semibold">Owner</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((followUp) => (
                <tr key={followUp.id} className="align-top">
                  <td className="px-6 py-4">
                    <Link
                      href={`/schools/${followUp.schoolId}`}
                      prefetch={false}
                      className="font-semibold text-white transition hover:text-blue-300"
                    >
                      {followUp.schoolName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{followUp.title}</td>
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
