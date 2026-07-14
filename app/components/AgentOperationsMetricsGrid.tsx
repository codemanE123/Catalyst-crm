import Link from "next/link";

import type { AgentOperationsMetrics } from "@/lib/agentOperations";

const metricCards: Array<{
  key: keyof AgentOperationsMetrics;
  label: string;
}> = [
  { key: "queued", label: "Queued executions" },
  { key: "running", label: "Running executions" },
  { key: "completed_today", label: "Completed today" },
  { key: "failed_today", label: "Failed today" },
  { key: "candidates_awaiting_review", label: "Candidates awaiting review" },
  { key: "enriched_candidates", label: "Enriched candidates" },
  { key: "outreach_drafts_generated", label: "Outreach drafts generated" },
  { key: "meeting_briefs_generated", label: "Meeting briefs generated" },
  { key: "proposal_drafts_generated", label: "Proposal drafts generated" }
];

export default function AgentOperationsMetricsGrid({
  metrics
}: {
  metrics: AgentOperationsMetrics;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metricCards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {metrics[card.key]}
          </p>
        </div>
      ))}
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 sm:col-span-2 xl:col-span-3">
        <p className="text-sm text-slate-600">
          Metrics and execution details stay inside your organization scope. Private notes,
          prompts, tokens, and personal contact fields are not shown on this dashboard.{" "}
          <Link className="font-medium text-sky-700 hover:text-sky-900" href="/prospects/generate">
            Open prospecting
          </Link>
        </p>
      </div>
    </section>
  );
}
