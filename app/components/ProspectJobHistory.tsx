import ProspectJobHistoryRow from "@/app/components/ProspectJobHistoryRow";
import type { ProcessProspectGenerationJobResult } from "@/lib/actions/prospectGeneration";
import type { ProspectGenerationJob } from "@/lib/prospectGeneration";

export default function ProspectJobHistory({
  jobs,
  source,
  canProcess,
  discoveryConfigured,
  processAction
}: {
  jobs: ProspectGenerationJob[];
  source: "supabase" | "sample";
  canProcess: boolean;
  discoveryConfigured: boolean;
  processAction: (formData: FormData) => Promise<ProcessProspectGenerationJobResult>;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Job history</h2>
          <p className="text-sm text-slate-600">
            Track queued, running, completed, and failed prospect generation jobs. Generate
            candidates queues work for the background agent worker (College Scorecard first,
            then optional public-web discovery).
          </p>
        </div>
        {source === "sample" ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            Sample data
          </span>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">No prospect generation jobs yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Criteria</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <ProspectJobHistoryRow
                  key={job.id}
                  actionsEnabled={source === "supabase"}
                  canProcess={canProcess}
                  discoveryConfigured={discoveryConfigured}
                  job={job}
                  processAction={processAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
