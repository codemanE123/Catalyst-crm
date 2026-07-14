import type { AgentPilotMonitoringMetrics } from "@/lib/agents/evaluation";

function pct(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return `${Math.round(value * 100)}%`;
}

function money(value: number | null | "unknown"): string {
  if (value === "unknown") {
    return "unknown";
  }

  if (value == null) {
    return "—";
  }

  return `$${value.toFixed(2)}`;
}

export default function AgentPilotMonitoringPanel({
  metrics
}: {
  metrics: AgentPilotMonitoringMetrics;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">
          Pilot monitoring and feedback
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Measures whether reviewers find agent outputs useful. Metrics use structured
          outcomes, category tags, and spend estimates — not private free-text notes or
          raw model output.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Candidate approval rate"
          value={pct(metrics.candidate_approval_rate)}
          hint={`${metrics.candidates_approved} approved · ${metrics.candidates_rejected} rejected`}
        />
        <Stat
          label="Enrichment acceptance rate"
          value={pct(metrics.enrichment_acceptance_rate)}
          hint={`${metrics.enrichment_accepted} accepted · ${metrics.enrichment_rejected} rejected`}
        />
        <Stat
          label="Outreach draft use rate"
          value={pct(metrics.outreach_draft_use_rate)}
          hint={`${metrics.outreach_drafts_saved} saved · ${metrics.outreach_drafts_generated} generated`}
        />
        <Stat
          label="Average quality score"
          value={
            metrics.average_quality_score == null
              ? "—"
              : metrics.average_quality_score.toFixed(2)
          }
        />
        <Stat
          label="Cost / approved prospect"
          value={money(metrics.cost_per_approved_prospect_usd)}
        />
        <Stat
          label="Cost / saved outreach draft"
          value={money(metrics.cost_per_saved_outreach_draft_usd)}
        />
        <Stat label="Failed jobs (today)" value={String(metrics.failed_jobs)} />
        <Stat label="Policy denials" value={String(metrics.policy_denials)} />
        <Stat label="Budget denials" value={String(metrics.budget_denials)} />
        <Stat
          label="Avg time saved"
          value={
            metrics.average_saved_time_minutes == null
              ? "—"
              : `${metrics.average_saved_time_minutes} min`
          }
        />
      </div>

      {metrics.feedback_category_counts.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900">
            Top feedback tags
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {metrics.feedback_category_counts.map((row) => (
              <li
                key={row.category}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200"
              >
                {row.category.replaceAll("_", " ")} · {row.count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
