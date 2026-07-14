"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  cancelRolloutAction,
  createRolloutAction,
  pauseRolloutAction,
  promoteTreatmentAction,
  resumeRolloutAction,
  rollbackRolloutToControlAction,
  startRolloutAction
} from "@/lib/actions/agentRollouts";
import type { AgentPromptVersion } from "@/lib/agents/prompts";
import type {
  AgentRollout,
  VariantComparisonMetrics
} from "@/lib/agents/rollouts";

type Props = {
  rollouts: AgentRollout[];
  versions: AgentPromptVersion[];
  comparisonById: Record<
    string,
    { control: VariantComparisonMetrics; treatment: VariantComparisonMetrics }
  >;
  canManageGlobal: boolean;
  isSalesReadOnly: boolean;
};

function pct(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${(value * 100).toFixed(0)}%`;
}

function metricCell(value: number | null, digits = 2): string {
  if (value == null) {
    return "—";
  }
  return value.toFixed(digits);
}

export default function RolloutRegistryPanel({
  rollouts,
  versions,
  comparisonById,
  canManageGlobal,
  isSalesReadOnly
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [promptKey, setPromptKey] = useState(
    versions[0]?.prompt_key ?? "prospect.enrich"
  );
  const promptVersions = useMemo(
    () => versions.filter((row) => row.prompt_key === promptKey),
    [versions, promptKey]
  );
  const [controlId, setControlId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [percentage, setPercentage] = useState(10);
  const [rolloutType, setRolloutType] =
    useState<AgentRollout["rollout_type"]>("percentage");
  const [organizationId, setOrganizationId] = useState("");
  const [allowlist, setAllowlist] = useState("");

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
        return;
      }
      setMessage(result.message ?? "Done.");
      router.refresh();
    });
  }

  const selectedAgent =
    promptVersions[0]?.agent_name ?? "ProspectEnrichmentAgent";

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

      {!isSalesReadOnly ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-950">Create rollout</h2>
          <p className="mt-1 text-sm text-slate-600">
            Assignment is deterministic by organization_id by default. Treatment is never auto-promoted.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="font-medium text-slate-700">Prompt key</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={promptKey}
                onChange={(event) => {
                  setPromptKey(event.target.value);
                  setControlId("");
                  setTreatmentId("");
                }}
              >
                {[...new Set(versions.map((row) => row.prompt_key))].map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Control version</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={controlId}
                onChange={(event) => setControlId(event.target.value)}
              >
                <option value="">Select…</option>
                {promptVersions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.version} ({row.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Treatment version</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={treatmentId}
                onChange={(event) => setTreatmentId(event.target.value)}
              >
                <option value="">Select…</option>
                {promptVersions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.version} ({row.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Type</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={rolloutType}
                onChange={(event) =>
                  setRolloutType(event.target.value as AgentRollout["rollout_type"])
                }
              >
                <option value="percentage">percentage</option>
                <option value="organization_allowlist">organization_allowlist</option>
                <option value="user_allowlist">user_allowlist</option>
                <option value="fixed_control">fixed_control</option>
                <option value="fixed_treatment">fixed_treatment</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Percentage</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={percentage}
                onChange={(event) => setPercentage(Number(event.target.value))}
              >
                {[0, 10, 25, 50, 100].map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">
                Scope {canManageGlobal ? "(blank = global)" : ""}
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={organizationId}
                placeholder="organization uuid"
                onChange={(event) => setOrganizationId(event.target.value)}
              />
            </label>
            {rolloutType.includes("allowlist") ? (
              <label className="text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Allowlist (comma-separated ids)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={allowlist}
                  onChange={(event) => setAllowlist(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          <button
            type="button"
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={pending || !controlId || !treatmentId}
            onClick={() =>
              run(() =>
                createRolloutAction({
                  organizationId: organizationId || null,
                  agentName: String(selectedAgent),
                  promptKey,
                  controlPromptVersionId: controlId,
                  treatmentPromptVersionId: treatmentId,
                  rolloutType,
                  rolloutPercentage: percentage,
                  allowlist: allowlist
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                })
              )
            }
          >
            Create draft rollout
          </button>
        </section>
      ) : null}

      <section className="space-y-4">
        {rollouts.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            No rollouts yet.
          </p>
        ) : (
          rollouts.map((rollout) => {
            const metrics = comparisonById[rollout.id];
            const control = versions.find(
              (row) => row.id === rollout.control_prompt_version_id
            );
            const treatment = versions.find(
              (row) => row.id === rollout.treatment_prompt_version_id
            );

            return (
              <article
                key={rollout.id}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">
                      {rollout.agent_name} · {rollout.prompt_key}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {rollout.rollout_type}
                      {rollout.rollout_type === "percentage"
                        ? ` @ ${rollout.rollout_percentage}%`
                        : ""}{" "}
                      · {rollout.status}
                      {rollout.organization_id
                        ? ` · org ${rollout.organization_id.slice(0, 8)}`
                        : " · global"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Control: {control?.version ?? rollout.control_prompt_version_id} · Treatment:{" "}
                      {treatment?.version ?? rollout.treatment_prompt_version_id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {rollout.started_at
                        ? `Started ${new Date(rollout.started_at).toLocaleString()}`
                        : "Not started"}
                      {rollout.ended_at
                        ? ` · Ended ${new Date(rollout.ended_at).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  {!isSalesReadOnly ? (
                    <div className="flex flex-wrap gap-1">
                      {rollout.status === "draft" || rollout.status === "paused" ? (
                        <button
                          type="button"
                          className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-800"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              rollout.status === "paused"
                                ? resumeRolloutAction(rollout.id)
                                : startRolloutAction(rollout.id)
                            )
                          }
                        >
                          {rollout.status === "paused" ? "Resume" : "Start"}
                        </button>
                      ) : null}
                      {rollout.status === "active" ? (
                        <button
                          type="button"
                          className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-800"
                          disabled={pending}
                          onClick={() => run(() => pauseRolloutAction(rollout.id))}
                        >
                          Pause
                        </button>
                      ) : null}
                      {rollout.status === "active" || rollout.status === "paused" ? (
                        <>
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-xs"
                            disabled={pending}
                            onClick={() => run(() => cancelRolloutAction(rollout.id))}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded border border-cyan-200 px-2 py-1 text-xs text-cyan-800"
                            disabled={pending}
                            onClick={() =>
                              run(() => promoteTreatmentAction(rollout.id))
                            }
                          >
                            Promote treatment
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-xs"
                            disabled={pending}
                            onClick={() =>
                              run(() => rollbackRolloutToControlAction(rollout.id))
                            }
                          >
                            Roll back to control
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {metrics ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {([metrics.control, metrics.treatment] as const).map((column) => (
                      <div
                        key={column.variant}
                        className="rounded-xl bg-slate-50 p-4 text-sm"
                      >
                        <h4 className="font-semibold capitalize text-slate-900">
                          {column.variant} ({column.sample_count})
                        </h4>
                        <ul className="mt-2 space-y-1 text-slate-700">
                          <li>Avg quality: {metricCell(column.average_quality_score)}</li>
                          <li>Acceptance: {pct(column.acceptance_rate)}</li>
                          <li>Rejection: {pct(column.rejection_rate)}</li>
                          <li>Needs revision: {pct(column.needs_revision_rate)}</li>
                          <li>
                            Cost / accepted: {metricCell(column.cost_per_accepted_output, 4)}
                          </li>
                          <li>Latency ms: {metricCell(column.average_latency_ms, 0)}</li>
                          <li>Safety flags: {pct(column.safety_flag_rate)}</li>
                          <li>Citations: {pct(column.source_citation_rate)}</li>
                          <li>
                            High-conf reject: {pct(column.high_confidence_rejection_rate)}
                          </li>
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
