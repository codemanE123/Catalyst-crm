import Link from "next/link";

import AgentExecutionsTable from "@/app/components/AgentExecutionsTable";
import AgentOperationsFilters from "@/app/components/AgentOperationsFilters";
import AgentOperationsMetricsGrid from "@/app/components/AgentOperationsMetricsGrid";
import AgentQualityPanel from "@/app/components/AgentQualityPanel";
import AgentReadinessBadgePanel from "@/app/components/AgentReadinessBadgePanel";
import AgentUsagePanel from "@/app/components/AgentUsagePanel";
import { loadAgentOperationsDashboard } from "@/lib/actions/agentOperations";
import {
  canViewAgentOperations,
  getMembershipsForUser
} from "@/lib/authz";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AgentsPageProps = {
  searchParams: Promise<{
    status?: string;
    agentName?: string;
    organizationId?: string;
    createdFrom?: string;
    createdTo?: string;
    page?: string;
  }>;
};

export default async function AgentsOperationsPage({ searchParams }: AgentsPageProps) {
  const user = await requireUser();

  if (!user) {
    redirect("/login?next=/agents");
  }

  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    redirect("/login?next=/agents");
  }

  const memberships = await getMembershipsForUser(supabase, user.id);

  if (!canViewAgentOperations(memberships)) {
    redirect("/");
  }

  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const dashboard = await loadAgentOperationsDashboard({
    status: params.status ?? null,
    agentName: params.agentName ?? null,
    organizationId: params.organizationId ?? null,
    createdFrom: params.createdFrom ?? null,
    createdTo: params.createdTo ?? null,
    page: Number.isFinite(page) ? page : 1
  });

  if (!dashboard.ok) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <Link
            className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
            href="/"
          >
            Back to dashboard
          </Link>
          <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-8">
            <h1 className="text-2xl font-semibold text-red-950">Agent operations</h1>
            <p className="mt-3 text-sm text-red-800" role="alert">
              {dashboard.error}
            </p>
          </section>
        </div>
      </main>
    );
  }

  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.agentName) query.set("agentName", params.agentName);
  if (params.organizationId) query.set("organizationId", params.organizationId);
  if (params.createdFrom) query.set("createdFrom", params.createdFrom);
  if (params.createdTo) query.set("createdTo", params.createdTo);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
              href="/"
            >
              Back to dashboard
            </Link>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Agent operations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Monitor prospecting, enrichment, outreach drafting, contact discovery, meeting
              prep, and proposal generation activity. Operator actions stay within organization
              scope and are audited.
            </p>
            <div className="mt-3 flex gap-4 text-sm">
              <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/prompts">
                Prompt registry
              </Link>
              <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/rollouts">
                Rollouts
              </Link>
              <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/policies">
                Policies
              </Link>
              <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/readiness">
                Readiness
              </Link>
            </div>
          </div>
          {!dashboard.canManage ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              View only
            </span>
          ) : null}
        </div>

        <AgentOperationsMetricsGrid metrics={dashboard.metrics} />

        <AgentUsagePanel
          showDetailedBreakdown={dashboard.canManage || dashboard.isSuperAdmin}
          usage={dashboard.usage}
        />

        <AgentQualityPanel metrics={dashboard.quality} />

        <AgentReadinessBadgePanel
          certifications={dashboard.readinessCertifications}
        />

        <AgentOperationsFilters
          agentName={params.agentName ?? ""}
          createdFrom={params.createdFrom ?? ""}
          createdTo={params.createdTo ?? ""}
          isSuperAdmin={dashboard.isSuperAdmin}
          organizationId={params.organizationId ?? ""}
          organizations={dashboard.organizations}
          status={params.status ?? ""}
        />

        <AgentExecutionsTable
          canManage={dashboard.canManage}
          evaluationsByExecutionId={dashboard.evaluationsByExecutionId}
          executions={dashboard.executions}
          page={dashboard.page}
          pageSize={dashboard.pageSize}
          queryString={query.toString()}
          total={dashboard.total}
        />
      </div>
    </main>
  );
}
