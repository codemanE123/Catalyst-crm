import Link from "next/link";
import { redirect } from "next/navigation";

import AgentPolicyConsole from "@/app/components/AgentPolicyConsole";
import { loadAgentPoliciesPage } from "@/lib/actions/agentPolicies";
import {
  canViewAgentPolicies,
  getMembershipsForUser
} from "@/lib/authz";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ organizationId?: string }>;
};

export default async function AgentPoliciesPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!user) {
    redirect("/login?next=/agents/policies");
  }

  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    redirect("/login?next=/agents/policies");
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewAgentPolicies(memberships)) {
    redirect("/");
  }

  const params = await searchParams;
  const data = await loadAgentPoliciesPage(params.organizationId ?? null);
  if (!data.ok) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-8">
        <p className="text-red-800" role="alert">
          {data.error}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents">
            Agent operations
          </Link>
          <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/prompts">
            Prompts
          </Link>
          <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/rollouts">
            Rollouts
          </Link>
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Agent policy console
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Manage feature flags, limits, budgets, quality thresholds, data access,
          and autonomy controls. Active policy sets are immutable. Autonomous
          sending stays disabled by default.
        </p>
        <div className="mt-8">
          <AgentPolicyConsole
            sets={data.sets}
            valuesBySet={data.valuesBySet}
            resolved={data.resolved}
            drift={data.drift}
            categories={data.categories}
            isSalesOnly={data.isSalesOnly}
            canManageGlobal={data.canManageGlobal}
            canBreakGlass={data.canBreakGlass}
            manageableOrganizationIds={data.manageableOrganizationIds}
            organizations={data.organizations}
            systemDefaults={data.systemDefaults}
          />
        </div>
      </div>
    </main>
  );
}
