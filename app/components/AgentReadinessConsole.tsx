"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  approveReadinessCertificationAction,
  createReadinessCertificationAction,
  exportReadinessCertificationAction,
  rejectReadinessCertificationAction,
  renewReadinessCertificationAction,
  revokeReadinessCertificationAction,
  runReadinessEvaluationAction,
  submitReadinessCertificationAction
} from "@/lib/actions/agentReadiness";
import type {
  AgentReadinessCertification,
  ReadinessEnvironment,
  ReadinessEvaluation
} from "@/lib/agents/readiness";

type Props = {
  certifications: AgentReadinessCertification[];
  environment: ReadinessEnvironment;
  agentNames: string[];
  isSalesOnly: boolean;
  canApproveProduction: boolean;
  canManageGlobal: boolean;
  manageableOrganizationIds: string[];
};

function daysUntil(expiresAt: string | null): number | null {
  if (!expiresAt) {
    return null;
  }
  return Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

export default function AgentReadinessConsole({
  certifications,
  environment,
  agentNames,
  isSalesOnly,
  canApproveProduction,
  canManageGlobal,
  manageableOrganizationIds
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<ReadinessEvaluation | null>(
    null
  );
  const [exportPayload, setExportPayload] = useState<string | null>(null);
  const [agentName, setAgentName] = useState(
    agentNames[0] ?? "ProspectEnrichmentAgent"
  );
  const [version, setVersion] = useState("v1");
  const [organizationId, setOrganizationId] = useState(
    canManageGlobal ? "" : manageableOrganizationIds[0] ?? ""
  );
  const [selectedId, setSelectedId] = useState(certifications[0]?.id ?? "");

  const selected = useMemo(
    () => certifications.find((row) => row.id === selectedId) ?? null,
    [certifications, selectedId]
  );

  const blockerCount = certifications.filter(
    (row) =>
      row.status === "revoked" ||
      row.status === "expired" ||
      (row.evaluation?.blocker_count ?? 0) > 0
  ).length;

  function run(
    action: () => Promise<{
      ok: boolean;
      message?: string;
      error?: string;
      payload?: string;
    }>
  ) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
        return;
      }
      if (result.payload) {
        setExportPayload(result.payload);
      }
      setMessage(result.message ?? "Done.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Environment</p>
          <p className="mt-1 text-lg font-semibold">{environment}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Certifications</p>
          <p className="mt-1 text-lg font-semibold">{certifications.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Blocked / expired</p>
          <p className="mt-1 text-lg font-semibold text-amber-800">{blockerCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Selected status</p>
          <p className="mt-1 text-lg font-semibold">{selected?.status ?? "—"}</p>
        </div>
      </section>

      {!isSalesOnly ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Run readiness evaluation</h2>
          <p className="mt-1 text-sm text-slate-600">
            WARNING is not treated as PASS. Production approval requires super_admin.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="font-medium">Agent</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
              >
                {agentNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium">Version</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Scope</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
              >
                {canManageGlobal ? <option value="">Global</option> : null}
                {manageableOrganizationIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    const result = await runReadinessEvaluationAction({
                      organizationId: organizationId || null,
                      agentName,
                      environment
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setEvaluation(result.evaluation);
                    setMessage(
                      `Evaluation ${result.evaluation.overall_status} (${result.evaluation.blocker_count} blockers).`
                    );
                  })
                }
              >
                Evaluate
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                onClick={() =>
                  run(() =>
                    createReadinessCertificationAction({
                      organizationId: organizationId || null,
                      agentName,
                      environment,
                      version
                    })
                  )
                }
              >
                Create draft
              </button>
            </div>
          </div>
        </section>
      ) : (
        <p className="text-sm text-slate-600">
          Sales roles can view readiness status only.
        </p>
      )}

      {evaluation ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">
            Evaluation · {evaluation.overall_status}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{evaluation.risk_summary}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {evaluation.checks.map((check) => (
              <li key={check.id} className="rounded-lg bg-slate-50 p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {check.name} · {check.status}
                    {check.blocking ? " (blocking)" : ""}
                  </span>
                  <span className="text-xs text-slate-500">{check.category}</span>
                </div>
                <p className="mt-1 text-slate-700">{check.evidence}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Source: {check.source} · Remediation: {check.remediation}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Env</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Approver</th>
              <th className="px-4 py-3">Blockers</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {certifications.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={8}>
                  No certifications yet.
                </td>
              </tr>
            ) : (
              certifications.map((row) => {
                const days = daysUntil(row.expires_at);
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-slate-100 ${
                      selectedId === row.id ? "bg-cyan-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="font-medium underline-offset-2 hover:underline"
                        onClick={() => setSelectedId(row.id)}
                      >
                        {row.agent_name}
                      </button>
                      <div className="text-xs text-slate-500">
                        {row.organization_id ? "org" : "global"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.environment}</td>
                    <td className="px-4 py-3">{row.version}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">
                      {row.expires_at
                        ? `${new Date(row.expires_at).toLocaleDateString()}${
                            days != null ? ` (${days}d)` : ""
                          }`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.approved_by?.slice(0, 8) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.blockers.length}/{row.warnings.length}
                    </td>
                    <td className="px-4 py-3">
                      {isSalesOnly ? (
                        <span className="text-xs text-slate-500">View only</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(row.status === "draft" ||
                            row.status === "rejected") && (
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs"
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  submitReadinessCertificationAction({
                                    id: row.id
                                  })
                                )
                              }
                            >
                              Submit
                            </button>
                          )}
                          {row.status === "in_review" &&
                          canApproveProduction ? (
                            <>
                              <button
                                type="button"
                                className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-800"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    approveReadinessCertificationAction({
                                      id: row.id
                                    })
                                  )
                                }
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="rounded border px-2 py-1 text-xs"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    rejectReadinessCertificationAction({
                                      id: row.id,
                                      reason: "Failed go/no-go review."
                                    })
                                  )
                                }
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {row.status === "approved" && canApproveProduction ? (
                            <button
                              type="button"
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-800"
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  revokeReadinessCertificationAction({
                                    id: row.id,
                                    reason:
                                      "Manual revoke from readiness console."
                                  })
                                )
                              }
                            >
                              Revoke
                            </button>
                          ) : null}
                          {(row.status === "expired" ||
                            row.status === "revoked") && (
                            <button
                              type="button"
                              className="rounded border border-cyan-200 px-2 py-1 text-xs text-cyan-800"
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  renewReadinessCertificationAction({
                                    id: row.id
                                  })
                                )
                              }
                            >
                              Renew
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                exportReadinessCertificationAction({
                                  id: row.id,
                                  format: "markdown"
                                })
                              )
                            }
                          >
                            Export
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {selected?.evaluation ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">
            Check details · {selected.agent_name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Last evaluated: {selected.evaluation.evaluated_at}
            {selected.revoke_reason
              ? ` · Revoke reason: ${selected.revoke_reason}`
              : ""}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {selected.evaluation.checks.map((check) => (
              <li key={check.id} className="border-b border-slate-100 pb-2">
                <strong>
                  [{check.status}] {check.name}
                </strong>{" "}
                — {check.evidence}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {exportPayload ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Export preview</h2>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-50 p-4 text-xs">
            {exportPayload}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
