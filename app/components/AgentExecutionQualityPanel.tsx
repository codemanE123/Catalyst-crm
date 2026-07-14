"use client";

import type { AgentEvaluation } from "@/lib/agents/evaluation";

export default function AgentExecutionQualityPanel({
  evaluations,
  relatedApprovalHref
}: {
  evaluations: AgentEvaluation[];
  relatedApprovalHref?: string | null;
}) {
  if (evaluations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No quality evaluations recorded for this execution yet.
        {relatedApprovalHref ? (
          <>
            {" "}
            <a className="font-medium text-sky-700 hover:text-sky-900" href={relatedApprovalHref}>
              Open related approval
            </a>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {relatedApprovalHref ? (
        <a className="text-sm font-medium text-sky-700 hover:text-sky-900" href={relatedApprovalHref}>
          Open related approval
        </a>
      ) : null}
      {evaluations.map((evaluation) => (
        <article
          key={evaluation.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
        >
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>{evaluation.evaluation_type}</span>
            <span>{evaluation.evaluator_type}</span>
            {evaluation.outcome ? <span>{evaluation.outcome}</span> : null}
          </div>
          <p className="mt-2 font-semibold text-slate-950">
            Score: {evaluation.score == null ? "—" : evaluation.score.toFixed(2)}
          </p>
          {evaluation.metadata.dimensions ? (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              {Object.entries(evaluation.metadata.dimensions).map(([key, value]) =>
                value == null ? null : (
                  <div key={key}>
                    <dt className="text-slate-500">{key.replace(/_/g, " ")}</dt>
                    <dd>{value}</dd>
                  </div>
                )
              )}
            </dl>
          ) : null}
          {evaluation.metadata.automated_checks ? (
            <p className="mt-2 text-xs text-slate-600">
              Automated checks:{" "}
              {evaluation.metadata.automated_checks.passed ? "passed" : "failed"} (
              {evaluation.metadata.automated_checks.findings.filter((finding) => !finding.passed)
                .length}{" "}
              findings)
            </p>
          ) : null}
          {evaluation.metadata.source_quality_class ? (
            <p className="mt-1 text-xs text-slate-600">
              Source quality: {evaluation.metadata.source_quality_class}
            </p>
          ) : null}
          {evaluation.feedback ? (
            <p className="mt-2 text-xs text-slate-600">Feedback: {evaluation.feedback}</p>
          ) : null}
          {(evaluation.metadata.low_quality_flags ?? []).length > 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              Flags: {(evaluation.metadata.low_quality_flags ?? []).join(", ")}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
