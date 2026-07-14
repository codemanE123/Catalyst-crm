"use client";

import {
  setAgentPilotEnabled,
  setAgentPilotKillSwitch,
  setPilotOrganizationAllowlist,
  setPilotUserAllowlist
} from "@/lib/actions/agentPilot";
import type { AgentPilotStatusSummary } from "@/lib/agents/pilot";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function AgentPilotStatusPanel({
  status,
  canManage
}: {
  status: AgentPilotStatusSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [userOrgId, setUserOrgId] = useState("");

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
        return;
      }
      setMessage(result.message ?? "Updated.");
      router.refresh();
    });
  }

  const tone = status.kill_switch
    ? "border-red-300 bg-red-50"
    : status.enabled
      ? "border-emerald-200 bg-emerald-50"
      : "border-amber-200 bg-amber-50";

  return (
    <section className={`rounded-3xl border p-6 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Limited production pilot
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Real provider execution is deny-by-default. Only allowlisted orgs/users may run
            Scorecard generation, enrichment, and outreach drafts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Pilot: {status.enabled ? "enabled" : "disabled"}
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Kill switch: {status.kill_switch ? "ON" : "off"}
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Source: {status.source}
          </span>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-2xl bg-white/80 p-3 ring-1 ring-slate-200">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Organizations</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {status.organizations_enabled} / {status.organizations_max}
          </dd>
        </div>
        <div className="rounded-2xl bg-white/80 p-3 ring-1 ring-slate-200">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Users</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {status.users_enabled} / {status.users_max}
          </dd>
        </div>
        <div className="rounded-2xl bg-white/80 p-3 ring-1 ring-slate-200">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Daily jobs</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {status.daily_jobs_used} / {status.daily_jobs_max}
          </dd>
        </div>
        <div className="rounded-2xl bg-white/80 p-3 ring-1 ring-slate-200">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Daily spend</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            ${status.daily_spend_usd.toFixed(2)} / ${status.daily_spend_max_usd.toFixed(2)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 text-xs text-slate-700 sm:grid-cols-2">
        <p>
          <span className="font-semibold text-slate-900">Permitted:</span>{" "}
          {status.permitted_agents.join(", ")}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Kept disabled:</span>{" "}
          {status.disabled_capabilities.join(", ").replaceAll("_", " ")}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Max candidate batch:</span>{" "}
          {status.max_candidate_batch_size}
        </p>
      </div>

      {canManage ? (
        <div className="mt-5 space-y-4 border-t border-slate-200/80 pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              disabled={pending}
              onClick={() => run(() => setAgentPilotEnabled(!status.enabled))}
              type="button"
            >
              {status.enabled ? "Disable pilot" : "Enable pilot"}
            </button>
            <button
              className="rounded-full bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              disabled={pending}
              onClick={() => run(() => setAgentPilotKillSwitch(!status.kill_switch))}
              type="button"
            >
              {status.kill_switch ? "Clear kill switch" : "Emergency stop"}
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-700">
              Organization id
              <input
                className="mt-1 block w-72 rounded-lg border border-slate-300 px-2 py-1.5"
                onChange={(event) => setOrgId(event.target.value)}
                value={orgId}
              />
            </label>
            <button
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              disabled={pending || !orgId.trim()}
              onClick={() =>
                run(() =>
                  setPilotOrganizationAllowlist({
                    organizationId: orgId,
                    status: "enabled"
                  })
                )
              }
              type="button"
            >
              Allowlist org
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              disabled={pending || !orgId.trim()}
              onClick={() =>
                run(() =>
                  setPilotOrganizationAllowlist({
                    organizationId: orgId,
                    status: "disabled"
                  })
                )
              }
              type="button"
            >
              Disable org
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-700">
              User id
              <input
                className="mt-1 block w-72 rounded-lg border border-slate-300 px-2 py-1.5"
                onChange={(event) => setUserId(event.target.value)}
                value={userId}
              />
            </label>
            <label className="text-xs text-slate-700">
              User org id
              <input
                className="mt-1 block w-72 rounded-lg border border-slate-300 px-2 py-1.5"
                onChange={(event) => setUserOrgId(event.target.value)}
                value={userOrgId}
              />
            </label>
            <button
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              disabled={pending || !userId.trim() || !userOrgId.trim()}
              onClick={() =>
                run(() =>
                  setPilotUserAllowlist({
                    userId,
                    organizationId: userOrgId,
                    status: "enabled"
                  })
                )
              }
              type="button"
            >
              Allowlist user
            </button>
            <button
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              disabled={pending || !userId.trim() || !userOrgId.trim()}
              onClick={() =>
                run(() =>
                  setPilotUserAllowlist({
                    userId,
                    organizationId: userOrgId,
                    status: "disabled"
                  })
                )
              }
              type="button"
            >
              Disable user
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-600">
          Super admins can enable the pilot, manage allowlists, and flip the emergency kill
          switch.
        </p>
      )}

      {error ? (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-xs text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
