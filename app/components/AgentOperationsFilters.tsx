import Link from "next/link";

import { AGENT_NAMES, AGENT_EXECUTION_STATUSES } from "@/lib/agents/types";

export default function AgentOperationsFilters({
  status,
  agentName,
  organizationId,
  createdFrom,
  createdTo,
  organizations,
  isSuperAdmin
}: {
  status: string;
  agentName: string;
  organizationId: string;
  createdFrom: string;
  createdTo: string;
  organizations: Array<{ id: string; name: string }>;
  isSuperAdmin: boolean;
}) {
  return (
    <form
      action="/agents"
      className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 xl:grid-cols-5"
      method="get"
    >
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        <span className="font-medium">Status</span>
        <select
          className="rounded-xl border border-slate-300 px-3 py-2"
          defaultValue={status}
          name="status"
        >
          <option value="">All statuses</option>
          {AGENT_EXECUTION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        <span className="font-medium">Agent</span>
        <select
          className="rounded-xl border border-slate-300 px-3 py-2"
          defaultValue={agentName}
          name="agentName"
        >
          <option value="">All agents</option>
          {AGENT_NAMES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        <span className="font-medium">From</span>
        <input
          className="rounded-xl border border-slate-300 px-3 py-2"
          defaultValue={createdFrom}
          name="createdFrom"
          type="date"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        <span className="font-medium">To</span>
        <input
          className="rounded-xl border border-slate-300 px-3 py-2"
          defaultValue={createdTo}
          name="createdTo"
          type="date"
        />
      </label>

      {isSuperAdmin ? (
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Organization</span>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2"
            defaultValue={organizationId}
            name="organizationId"
          >
            <option value="">All organizations</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="flex items-end">
          <button
            className="w-full rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Apply filters
          </button>
        </div>
      )}

      {isSuperAdmin ? (
        <div className="flex items-end gap-2 xl:col-span-5">
          <button
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Apply filters
          </button>
          <Link
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            href="/agents"
          >
            Reset
          </Link>
        </div>
      ) : (
        <div className="md:col-span-2">
          <Link
            className="text-sm font-medium text-sky-700 hover:text-sky-900"
            href="/agents"
          >
            Reset filters
          </Link>
        </div>
      )}
    </form>
  );
}
