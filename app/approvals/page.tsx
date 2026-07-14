import Link from "next/link";

import ApprovalFilters from "@/app/components/ApprovalFilters";
import ApprovalItemsList from "@/app/components/ApprovalItemsList";
import ApprovalMetricsGrid from "@/app/components/ApprovalMetricsGrid";
import { loadApprovalsDashboard } from "@/lib/approvals/actions";
import { canViewApprovals } from "@/lib/approvals/permissions";
import { getMembershipsForUser } from "@/lib/authz";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type ApprovalsPageProps = {
  searchParams: Promise<{
    approvalType?: string;
    status?: string;
    priority?: string;
    sort?: string;
    targetQuery?: string;
    staleDaysMin?: string;
    assignedToMe?: string;
    organizationId?: string;
    createdFrom?: string;
    createdTo?: string;
    confidenceMin?: string;
    confidenceMax?: string;
    page?: string;
  }>;
};

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const user = await requireUser();

  if (!user) {
    redirect("/login?next=/approvals");
  }

  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    redirect("/login?next=/approvals");
  }

  const memberships = await getMembershipsForUser(supabase, user.id);

  if (!canViewApprovals(memberships)) {
    redirect("/");
  }

  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const dashboard = await loadApprovalsDashboard({
    approvalType: params.approvalType ?? null,
    status: params.status ?? "pending",
    priority: params.priority ?? null,
    sort: params.sort ?? "default",
    targetQuery: params.targetQuery ?? null,
    staleDaysMin: params.staleDaysMin ?? null,
    assignedToMe: params.assignedToMe === "1",
    organizationId: params.organizationId ?? null,
    createdFrom: params.createdFrom ?? null,
    createdTo: params.createdTo ?? null,
    confidenceMin: params.confidenceMin ?? null,
    confidenceMax: params.confidenceMax ?? null,
    page: Number.isFinite(page) ? page : 1
  });

  if (!dashboard.ok) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <Link className="text-sm font-semibold text-cyan-700 hover:text-cyan-900" href="/">
            Back to dashboard
          </Link>
          <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-8">
            <h1 className="text-2xl font-semibold text-red-950">Approvals</h1>
            <p className="mt-3 text-sm text-red-800" role="alert">
              {dashboard.error === "You do not have permission to manage approval items."
                ? dashboard.error
                : "Approval items could not be loaded. Try again."}
            </p>
          </section>
        </div>
      </main>
    );
  }

  const query = new URLSearchParams();
  if (params.approvalType) query.set("approvalType", params.approvalType);
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  if (params.sort) query.set("sort", params.sort);
  if (params.targetQuery) query.set("targetQuery", params.targetQuery);
  if (params.staleDaysMin) query.set("staleDaysMin", params.staleDaysMin);
  if (params.assignedToMe === "1") query.set("assignedToMe", "1");
  if (params.organizationId) query.set("organizationId", params.organizationId);
  if (params.createdFrom) query.set("createdFrom", params.createdFrom);
  if (params.createdTo) query.set("createdTo", params.createdTo);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link className="text-sm font-semibold text-cyan-700 hover:text-cyan-900" href="/">
              Back to dashboard
            </Link>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Human Approval Center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Review AI-assisted and agent-generated work before it affects the CRM or is used
              externally. Source records remain authoritative — this view aggregates them.
            </p>
          </div>
          {!dashboard.canAct ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              View only
            </span>
          ) : null}
        </div>

        <ApprovalMetricsGrid metrics={dashboard.metrics} />

        <ApprovalFilters
          approvalType={params.approvalType ?? ""}
          assignedToMe={params.assignedToMe === "1"}
          createdFrom={params.createdFrom ?? ""}
          createdTo={params.createdTo ?? ""}
          isSuperAdmin={dashboard.isSuperAdmin}
          organizationId={params.organizationId ?? ""}
          organizations={dashboard.organizations}
          priority={params.priority ?? ""}
          sort={params.sort ?? "default"}
          staleDaysMin={params.staleDaysMin ?? ""}
          status={params.status ?? "pending"}
          targetQuery={params.targetQuery ?? ""}
        />

        <ApprovalItemsList
          canAct={dashboard.canAct}
          items={dashboard.list.items}
          page={dashboard.list.page}
          pageSize={dashboard.list.pageSize}
          queryString={query.toString()}
          total={dashboard.list.total}
        />
      </div>
    </main>
  );
}
