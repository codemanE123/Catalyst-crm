import Link from "next/link";
import { redirect } from "next/navigation";

import RolloutRegistryPanel from "@/app/components/RolloutRegistryPanel";
import { loadRolloutsPage } from "@/lib/actions/agentRollouts";
import {
  canViewPromptRegistry,
  getMembershipsForUser
} from "@/lib/authz";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function AgentRolloutsPage() {
  const user = await requireUser();
  if (!user) {
    redirect("/login?next=/agents/rollouts");
  }

  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    redirect("/login?next=/agents/rollouts");
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewPromptRegistry(memberships)) {
    redirect("/");
  }

  const data = await loadRolloutsPage();
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
        <div className="flex flex-wrap items-center gap-4">
          <Link className="text-sm font-semibold text-cyan-700 hover:text-cyan-900" href="/agents">
            Agent operations
          </Link>
          <Link
            className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
            href="/agents/prompts"
          >
            Prompts
          </Link>
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Prompt rollouts</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Controlled percentage and allowlist experiments. Compare control vs treatment quality;
          promote or roll back manually.
        </p>
        <div className="mt-8">
          <RolloutRegistryPanel
            rollouts={data.rollouts}
            versions={data.versions}
            comparisonById={data.comparisonById}
            canManageGlobal={data.canManageGlobal}
            isSalesReadOnly={data.isSalesReadOnly}
          />
        </div>
      </div>
    </main>
  );
}
