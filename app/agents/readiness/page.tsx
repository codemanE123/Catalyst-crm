import Link from "next/link";
import { redirect } from "next/navigation";

import AgentReadinessConsole from "@/app/components/AgentReadinessConsole";
import { loadReadinessPage } from "@/lib/actions/agentReadiness";
import {
  canViewAgentReadiness,
  getMembershipsForUser
} from "@/lib/authz";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function AgentReadinessPage() {
  const user = await requireUser();
  if (!user) {
    redirect("/login?next=/agents/readiness");
  }

  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    redirect("/login?next=/agents/readiness");
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewAgentReadiness(memberships)) {
    redirect("/");
  }

  const data = await loadReadinessPage();
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
          <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/policies">
            Policies
          </Link>
          <Link className="font-semibold text-cyan-700 hover:text-cyan-900" href="/agents/prompts">
            Prompts
          </Link>
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Agent readiness certification
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Formal go/no-go gate for enabling agents in staging or production.
          Certifications expire, revoke on critical changes, and block uncertified
          production execution/rollouts.
        </p>
        <div className="mt-8">
          <AgentReadinessConsole
            certifications={data.certifications}
            environment={data.environment}
            agentNames={data.agentNames}
            isSalesOnly={data.isSalesOnly}
            canApproveProduction={data.canApproveProduction}
            canManageGlobal={data.canManageGlobal}
            manageableOrganizationIds={data.manageableOrganizationIds}
          />
        </div>
      </div>
    </main>
  );
}
