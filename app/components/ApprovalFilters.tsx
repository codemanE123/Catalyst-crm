import type { ApprovalType } from "@/lib/approvals/types";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/types";

export default function ApprovalFilters({
  approvalType,
  status,
  priority,
  sort,
  targetQuery,
  staleDaysMin,
  assignedToMe,
  organizationId,
  createdFrom,
  createdTo,
  isSuperAdmin,
  organizations
}: {
  approvalType: string;
  status: string;
  priority: string;
  sort: string;
  targetQuery: string;
  staleDaysMin: string;
  assignedToMe: boolean;
  organizationId: string;
  createdFrom: string;
  createdTo: string;
  isSuperAdmin: boolean;
  organizations: Array<{ id: string; name: string }>;
}) {
  return (
    <form className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" method="get">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Type</span>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={approvalType}
            name="approvalType"
          >
            <option value="">All types</option>
            {(Object.keys(APPROVAL_TYPE_LABELS) as ApprovalType[]).map((type) => (
              <option key={type} value={type}>
                {APPROVAL_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Status</span>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={status || "pending"}
            name="status"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="needs_revision">Needs revision</option>
            <option value="">All statuses</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Priority</span>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={priority}
            name="priority"
          >
            <option value="">Any</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Sort</span>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={sort || "default"}
            name="sort"
          >
            <option value="default">Priority then oldest</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="highest_priority">Highest priority</option>
            <option value="highest_confidence">Highest confidence</option>
            <option value="lowest_confidence">Lowest confidence</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">School / prospect</span>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={targetQuery}
            name="targetQuery"
            placeholder="Search title or school"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">Stale</span>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={staleDaysMin}
            name="staleDaysMin"
          >
            <option value="">Any age</option>
            <option value="3">Stale 3+ days</option>
            <option value="7">Stale 7+ days</option>
          </select>
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">From</span>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={createdFrom}
            name="createdFrom"
            type="date"
          />
        </label>

        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium">To</span>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
            defaultValue={createdTo}
            name="createdTo"
            type="date"
          />
        </label>

        {isSuperAdmin ? (
          <label className="text-sm text-slate-700">
            <span className="mb-1 block font-medium">Organization</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
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
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            defaultChecked={assignedToMe}
            name="assignedToMe"
            type="checkbox"
            value="1"
          />
          Assigned to me
        </label>
        <button
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
