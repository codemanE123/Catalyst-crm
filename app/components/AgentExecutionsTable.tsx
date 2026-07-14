"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";

import {
  cancelAgentExecution,
  retryAgentExecution
} from "@/lib/actions/agentOperations";
import type { AgentExecutionListItem } from "@/lib/agentOperationsData";
import type { AgentEvaluation } from "@/lib/agents/evaluation";
import AgentExecutionQualityPanel from "@/app/components/AgentExecutionQualityPanel";

const statusStyles: Record<string, string> = {
  queued: "bg-slate-100 text-slate-800 ring-slate-200",
  running: "bg-sky-100 text-sky-800 ring-sky-200",
  completed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  failed: "bg-red-100 text-red-800 ring-red-200",
  cancelled: "bg-amber-100 text-amber-900 ring-amber-200"
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export default function AgentExecutionsTable({
  executions,
  canManage,
  page,
  pageSize,
  total,
  queryString,
  evaluationsByExecutionId = {}
}: {
  executions: AgentExecutionListItem[];
  canManage: boolean;
  page: number;
  pageSize: number;
  total: number;
  queryString: string;
  evaluationsByExecutionId?: Record<string, AgentEvaluation[]>;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function withPage(nextPage: number) {
    const params = new URLSearchParams(queryString);
    params.set("page", String(nextPage));
    return `/agents?${params.toString()}`;
  }

  function handleRetry(execution: AgentExecutionListItem) {
    setMessage(null);
    setError(null);
    setPendingId(execution.id);

    startTransition(async () => {
      try {
        const result = await retryAgentExecution({
          executionId: execution.id,
          organizationId: execution.organization_id
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessage(result.message);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleCancel(execution: AgentExecutionListItem) {
    setMessage(null);
    setError(null);
    setPendingId(execution.id);

    startTransition(async () => {
      try {
        const result = await cancelAgentExecution({
          executionId: execution.id,
          organizationId: execution.organization_id
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessage(result.message);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  if (executions.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Recent executions</h2>
        <p className="mt-4 text-sm text-slate-600">
          No agent executions match the current filters. Queue an agent from prospecting or
          school workflows, then return here to monitor activity.
        </p>
      </section>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Recent executions</h2>
        <p className="text-sm text-slate-500">
          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
        </p>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 text-sm text-emerald-700" role="status">
          {message}
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-[1200px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Completed</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">Error</th>
              <th className="px-3 py-2 font-medium">Organization</th>
              <th className="px-3 py-2 font-medium">Quality</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {executions.map((execution) => {
              const busy = isPending && pendingId === execution.id;
              const evaluations = evaluationsByExecutionId[execution.id] ?? [];
              const latestScore = evaluations[0]?.score;

              return (
                <Fragment key={execution.id}>
                <tr>
                  <td className="px-3 py-3 font-medium text-slate-950">
                    {execution.agent_name}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    <p>{execution.target_type}</p>
                    <p className="text-xs text-slate-500">{shortId(execution.target_id)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                        statusStyles[execution.status] ?? statusStyles.queued
                      }`}
                    >
                      {execution.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {formatDate(execution.started_at)}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {formatDate(execution.completed_at)}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {execution.duration_ms == null ? "—" : `${execution.duration_ms} ms`}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    <p className="max-w-xs text-xs leading-5">
                      {execution.sanitized_error_message ?? "—"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{execution.organization_name}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {latestScore == null ? "—" : latestScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-2">
                      {execution.target_href ? (
                        <Link
                          className="text-xs font-medium text-sky-700 hover:text-sky-900"
                          href={execution.target_href}
                        >
                          Open related
                        </Link>
                      ) : null}
                      <Link
                        className="text-xs font-medium text-sky-700 hover:text-sky-900"
                        href="/approvals"
                      >
                        Approvals
                      </Link>
                      {canManage && execution.status === "failed" ? (
                        <button
                          className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => handleRetry(execution)}
                          type="button"
                        >
                          {busy ? "Retrying…" : "Retry"}
                        </button>
                      ) : null}
                      {canManage &&
                      (execution.status === "queued" || execution.status === "running") ? (
                        <button
                          className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => handleCancel(execution)}
                          type="button"
                        >
                          {busy ? "Cancelling…" : "Cancel"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {evaluations.length > 0 ? (
                  <tr>
                    <td className="bg-slate-50 px-3 py-3" colSpan={10}>
                      <AgentExecutionQualityPanel
                        evaluations={evaluations}
                        relatedApprovalHref="/approvals"
                      />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        {page > 1 ? (
          <Link
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            href={withPage(page - 1)}
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <p className="text-sm text-slate-500">
          Page {page} of {totalPages}
        </p>
        {page < totalPages ? (
          <Link
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            href={withPage(page + 1)}
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </div>
    </section>
  );
}
