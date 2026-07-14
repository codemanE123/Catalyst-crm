"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  activatePolicySetAction,
  archivePolicySetAction,
  createPolicyDraftAction,
  deprecatePolicySetAction,
  enableBreakGlassAction,
  previewPolicyActivationAction,
  rollbackPolicySetAction,
  updatePolicyDraftValuesAction,
  validatePolicyDraftAction
} from "@/lib/actions/agentPolicies";
import type {
  AgentPolicySet,
  AgentPolicyValue,
  PolicyChangePreview,
  PolicyDriftFlag,
  PolicyKeyDefinition,
  ResolvedAgentPolicy
} from "@/lib/agents/policies";

type Props = {
  sets: AgentPolicySet[];
  valuesBySet: Record<string, AgentPolicyValue[]>;
  resolved: ResolvedAgentPolicy | null;
  drift: PolicyDriftFlag[];
  categories: Record<string, PolicyKeyDefinition[]>;
  isSalesOnly: boolean;
  canManageGlobal: boolean;
  canBreakGlass: boolean;
  manageableOrganizationIds: string[];
  organizations: { id: string; name: string }[];
  systemDefaults: Record<string, unknown>;
};

const CATEGORY_LABELS: Record<string, string> = {
  features: "Features",
  human_review: "Human review",
  execution: "Execution limits",
  budgets: "Budgets",
  quality: "Quality",
  providers: "Providers / models",
  data_access: "Data access",
  autonomy: "Autonomy"
};

function riskClass(risk: string): string {
  if (risk === "prohibited") return "text-red-800";
  if (risk === "high_risk") return "text-amber-800";
  if (risk === "operational") return "text-slate-800";
  return "text-emerald-800";
}

export default function AgentPolicyConsole({
  sets,
  valuesBySet,
  resolved,
  drift,
  categories,
  isSalesOnly,
  canManageGlobal,
  canBreakGlass,
  manageableOrganizationIds,
  organizations,
  systemDefaults
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PolicyChangePreview[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>(sets[0]?.id ?? "");
  const [name, setName] = useState("Org policy");
  const [version, setVersion] = useState("v1");
  const [organizationId, setOrganizationId] = useState(
    canManageGlobal ? "" : manageableOrganizationIds[0] ?? ""
  );
  const [breakGlassKey, setBreakGlassKey] = useState(
    "allow_private_crm_context"
  );
  const [breakGlassReason, setBreakGlassReason] = useState("");
  const [breakGlassConfirm, setBreakGlassConfirm] = useState("");
  const [breakGlassHours, setBreakGlassHours] = useState(4);

  const selected = useMemo(
    () => sets.find((row) => row.id === selectedId) ?? null,
    [sets, selectedId]
  );
  const selectedValues = valuesBySet[selectedId] ?? [];

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string }>
  ) {
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

      {drift.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-950">Configuration drift</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {drift.map((flag) => (
              <li key={`${flag.code}-${flag.message}`}>
                [{flag.severity}] {flag.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {resolved ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Resolved policy</h2>
          <p className="mt-1 text-sm text-slate-600">
            Scope: {resolved.policy_scope} · Version:{" "}
            {resolved.policy_version ?? "system"} · Hash:{" "}
            {resolved.resolved_policy_hash}
          </p>
          {isSalesOnly ? (
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <li>
                Worker:{" "}
                {String(resolved.flat.automated_worker_enabled)}
              </li>
              <li>
                Enrichment:{" "}
                {String(resolved.flat.prospect_enrichment_enabled)}
              </li>
              <li>
                Daily budget: ${String(resolved.flat.daily_budget_usd)}
              </li>
              <li>
                Max concurrency:{" "}
                {String(resolved.flat.max_concurrent_executions)}
              </li>
              <li>
                Require prospect approval:{" "}
                {String(resolved.flat.require_prospect_approval)}
              </li>
              <li>
                Source citations:{" "}
                {String(resolved.flat.require_source_citations)}
              </li>
            </ul>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {Object.entries(categories).map(([category, keys]) => (
                <div key={category} className="rounded-xl bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {CATEGORY_LABELS[category] ?? category}
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {keys.map((key) => {
                      const entry = resolved.values[key.key];
                      return (
                        <li key={key.key} className="flex justify-between gap-2">
                          <span>{key.key}</span>
                          <span className="text-right text-slate-500">
                            {String(entry?.value ?? systemDefaults[key.key])} (
                            {entry?.source ?? "system_default"})
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!isSalesOnly ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Create draft policy set</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="font-medium">Name</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
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
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={() =>
                  run(() =>
                    createPolicyDraftAction({
                      organizationId: organizationId || null,
                      name,
                      version
                    })
                  )
                }
              >
                Create draft
              </button>
              <button
                type="button"
                disabled={pending || !selectedId}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
                onClick={() =>
                  run(() =>
                    createPolicyDraftAction({
                      organizationId: organizationId || null,
                      name: `${name} clone`,
                      version: `${version}-clone`,
                      cloneFromId: selectedId || undefined
                    })
                  )
                }
              >
                Clone selected
              </button>
            </div>
          </div>
        </section>
      ) : (
        <p className="text-sm text-slate-600">
          Sales roles see enabled features and limits only. Ask an admin to change policies.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Policy set</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sets.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={7}>
                  No policy sets yet. System defaults apply.
                </td>
              </tr>
            ) : (
              sets.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-slate-100 ${
                    selectedId === row.id ? "bg-cyan-50/40" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      onClick={() => setSelectedId(row.id)}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {row.organization_id ? "organization" : "global"}
                  </td>
                  <td className="px-4 py-3">{row.version}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">
                    {new Date(row.updated_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {row.created_by?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isSalesOnly ? (
                      <span className="text-xs text-slate-500">View only</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              validatePolicyDraftAction({ policySetId: row.id })
                            )
                          }
                        >
                          Validate
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await previewPolicyActivationAction({
                                policySetId: row.id
                              });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setSelectedId(row.id);
                              setPreview(result.changes);
                            })
                          }
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-800"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              activatePolicySetAction({ policySetId: row.id })
                            )
                          }
                        >
                          Activate
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              deprecatePolicySetAction({ policySetId: row.id })
                            )
                          }
                        >
                          Deprecate
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              archivePolicySetAction({ policySetId: row.id })
                            )
                          }
                        >
                          Archive
                        </button>
                        {row.status !== "active" ? (
                          <button
                            type="button"
                            className="rounded border border-cyan-200 px-2 py-1 text-xs text-cyan-800"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                rollbackPolicySetAction({
                                  toPolicySetId: row.id
                                })
                              )
                            }
                          >
                            Restore
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {selected && !isSalesOnly ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">
            Values · {selected.name} ({selected.version})
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {selected.status === "draft"
              ? "Draft values are editable. Active versions are immutable."
              : "This version is immutable."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {selectedValues.map((value) => (
              <label key={value.id} className="text-sm">
                <span className="font-medium text-slate-800">
                  {value.policy_key}
                </span>
                <span className="ml-2 text-xs text-slate-500">{value.source}</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                  disabled={selected.status !== "draft" || pending}
                  defaultValue={
                    typeof value.value_json === "string" ||
                    typeof value.value_json === "number" ||
                    typeof value.value_json === "boolean"
                      ? String(value.value_json)
                      : JSON.stringify(value.value_json)
                  }
                  onBlur={(event) => {
                    if (selected.status !== "draft") {
                      return;
                    }
                    const raw = event.target.value;
                    let parsed: unknown = raw;
                    if (raw === "true") parsed = true;
                    else if (raw === "false") parsed = false;
                    else if (/^-?\d+(\.\d+)?$/.test(raw)) parsed = Number(raw);
                    run(() =>
                      updatePolicyDraftValuesAction({
                        policySetId: selected.id,
                        values: { [value.policy_key]: parsed }
                      })
                    );
                  }}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Activation impact preview</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {preview.length === 0 ? (
              <li className="text-slate-500">No differences.</li>
            ) : (
              preview.map((change) => (
                <li key={change.key} className={riskClass(change.risk)}>
                  [{change.risk}] {change.summary}
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}

      {canBreakGlass ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-950">Break-glass controls</h2>
          <p className="mt-1 text-sm text-red-900">
            Super-admin only. Enables temporary high-risk policy exceptions with
            mandatory reason, confirmation, expiration, and audit. Autonomic
            sending remains blocked by product code paths.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium">Policy key</span>
              <input
                className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2"
                value={breakGlassKey}
                onChange={(event) => setBreakGlassKey(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Expires in hours</span>
              <input
                type="number"
                min={1}
                max={168}
                className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2"
                value={breakGlassHours}
                onChange={(event) =>
                  setBreakGlassHours(Number(event.target.value))
                }
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="font-medium">Reason (min 20 chars)</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2"
                rows={3}
                value={breakGlassReason}
                onChange={(event) => setBreakGlassReason(event.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="font-medium">Type BREAK GLASS to confirm</span>
              <input
                className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2"
                value={breakGlassConfirm}
                onChange={(event) => setBreakGlassConfirm(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-4 rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              const expires = new Date(
                Date.now() + breakGlassHours * 60 * 60 * 1000
              ).toISOString();
              run(() =>
                enableBreakGlassAction({
                  organizationId: organizationId || null,
                  policyKey: breakGlassKey,
                  reason: breakGlassReason,
                  expiresAt: expires,
                  confirmation: breakGlassConfirm
                })
              );
            }}
          >
            Enable break-glass
          </button>
        </section>
      ) : null}
    </div>
  );
}
