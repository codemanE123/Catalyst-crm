"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  activatePromptVersionAction,
  archivePromptVersionAction,
  clonePromptVersionAction,
  createPromptDraftAction,
  deprecatePromptVersionAction,
  rollbackPromptVersionAction,
  validatePromptVersionAction
} from "@/lib/actions/agentPrompts";
import type { AgentPromptVersion } from "@/lib/agents/prompts";
import type { PromptCatalogEntry } from "@/lib/agents/prompts";

type Props = {
  versions: AgentPromptVersion[];
  catalog: PromptCatalogEntry[];
  canManageGlobal: boolean;
  manageableOrganizationIds: string[];
  isSalesReadOnly: boolean;
  organizations: { id: string; name: string }[];
};

export default function PromptRegistryPanel({
  versions,
  catalog,
  canManageGlobal,
  manageableOrganizationIds,
  isSalesReadOnly,
  organizations
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptKey, setPromptKey] = useState(catalog[0]?.prompt_key ?? "");
  const [version, setVersion] = useState("v1");
  const [organizationId, setOrganizationId] = useState<string>(
    canManageGlobal ? "" : manageableOrganizationIds[0] ?? ""
  );

  const canCreate =
    !isSalesReadOnly &&
    (canManageGlobal || manageableOrganizationIds.length > 0);

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

      {canCreate ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-950">Create draft version</h2>
          <p className="mt-1 text-sm text-slate-600">
            Seeds from the catalog. Active versions are immutable after activation.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="font-medium text-slate-700">Prompt key</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={promptKey}
                onChange={(event) => setPromptKey(event.target.value)}
              >
                {catalog.map((entry) => (
                  <option key={entry.prompt_key} value={entry.prompt_key}>
                    {entry.prompt_key}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Version</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Scope</span>
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
                {!canManageGlobal
                  ? manageableOrganizationIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))
                  : null}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() =>
                  run(() =>
                    createPromptDraftAction({
                      organizationId: organizationId || null,
                      promptKey,
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
          Sales roles can view prompt metadata only. Ask an admin to change drafts or activations.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Prompt</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Provider / model</th>
              <th className="px-4 py-3">Schema</th>
              <th className="px-4 py-3">Safety</th>
              <th className="px-4 py-3">Change</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={9}>
                  No prompt versions yet.
                </td>
              </tr>
            ) : (
              versions.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {row.prompt_key}
                    <div className="text-xs font-normal text-slate-500">
                      {row.organization_id ? "org" : "global"}
                    </div>
                  </td>
                  <td className="px-4 py-3">{row.agent_name}</td>
                  <td className="px-4 py-3">{row.version}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">
                    {row.provider} / {row.model}
                  </td>
                  <td className="px-4 py-3">{row.output_schema_version}</td>
                  <td className="px-4 py-3">{row.safety_policy_version}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                    {row.change_summary ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isSalesReadOnly ? (
                      <span className="text-xs text-slate-500">Read only</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(() => validatePromptVersionAction({ id: row.id }))
                          }
                        >
                          Validate
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              clonePromptVersionAction({
                                sourceId: row.id,
                                newVersion: `${row.version}-clone`
                              })
                            )
                          }
                        >
                          Clone
                        </button>
                        {row.status === "draft" || row.status === "deprecated" ? (
                          <button
                            type="button"
                            className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-800"
                            disabled={pending}
                            onClick={() =>
                              run(() => activatePromptVersionAction({ id: row.id }))
                            }
                          >
                            Activate
                          </button>
                        ) : null}
                        {row.status === "active" ? (
                          <button
                            type="button"
                            className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-800"
                            disabled={pending}
                            onClick={() =>
                              run(() => deprecatePromptVersionAction({ id: row.id }))
                            }
                          >
                            Deprecate
                          </button>
                        ) : null}
                        {row.status !== "active" && row.status !== "archived" ? (
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-xs"
                            disabled={pending}
                            onClick={() =>
                              run(() => archivePromptVersionAction({ id: row.id }))
                            }
                          >
                            Archive
                          </button>
                        ) : null}
                        {row.status !== "active" ? (
                          <button
                            type="button"
                            className="rounded border border-cyan-200 px-2 py-1 text-xs text-cyan-800"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                rollbackPromptVersionAction({ toVersionId: row.id })
                              )
                            }
                          >
                            Rollback here
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
    </div>
  );
}
