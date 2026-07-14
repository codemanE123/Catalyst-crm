import type { AgentQualityDashboardMetrics } from "@/lib/agents/evaluation";

function pct(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return `${Math.round(value * 100)}%`;
}

function score(value: number | null): string {
  return value == null ? "—" : value.toFixed(2);
}

export default function AgentQualityPanel({
  metrics
}: {
  metrics: AgentQualityDashboardMetrics;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Agent quality</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Scores use a 1–5 scale per dimension. Overall is the average of submitted dimensions.
          Missing cost data shows as unknown — never as zero. Prompts and raw model output are not
          stored in evaluations.
        </p>
      </div>

      {metrics.alerts.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {metrics.alerts.map((alert) => (
            <li
              key={alert}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            >
              {alert}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Avg overall quality" value={score(metrics.average_overall_quality_score)} />
        <Stat label="Acceptance rate" value={pct(metrics.acceptance_rate)} />
        <Stat label="Rejection rate" value={pct(metrics.rejection_rate)} />
        <Stat label="Needs-revision rate" value={pct(metrics.needs_revision_rate)} />
        <Stat
          label="Accepted with edits"
          value={pct(metrics.accepted_with_edits_rate)}
        />
        <Stat
          label="Low-quality (7 days)"
          value={String(metrics.low_quality_last_7_days)}
        />
        <Stat
          label="High-confidence rejected"
          value={String(metrics.high_confidence_rejected)}
        />
        <Stat
          label="Without citations"
          value={String(metrics.outputs_without_citations)}
        />
        <Stat
          label="Avg revision %"
          value={
            metrics.average_revision_percentage == null
              ? "—"
              : `${metrics.average_revision_percentage.toFixed(1)}%`
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Breakdown
          empty="No agent scores yet."
          title="Average score by agent"
          rows={metrics.average_score_by_agent.map((row) => ({
            key: row.agent_name,
            title: row.agent_name,
            subtitle: `${row.average_score.toFixed(2)} · ${row.evaluations} evals`
          }))}
        />
        <Breakdown
          empty="No model scores yet."
          title="Average score by model"
          rows={metrics.average_score_by_model.map((row) => ({
            key: row.model,
            title: row.model,
            subtitle: `${row.average_score.toFixed(2)} · ${row.evaluations} evals`
          }))}
        />
        <Breakdown
          empty="No approval-type scores yet."
          title="Average score by approval type"
          rows={metrics.average_score_by_approval_type.map((row) => ({
            key: row.approval_type,
            title: row.approval_type,
            subtitle: `${row.average_score.toFixed(2)} · ${row.evaluations} evals`
          }))}
        />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  empty,
  rows
}: {
  title: string;
  empty: string;
  rows: Array<{ key: string; title: string; subtitle: string }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <p className="text-sm font-medium text-slate-900">{row.title}</p>
              <p className="text-xs text-slate-600">{row.subtitle}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
