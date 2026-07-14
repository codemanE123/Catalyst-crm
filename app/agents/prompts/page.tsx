import Link from "next/link";
import { redirect } from "next/navigation";

import PromptRegistryPanel from "@/app/components/PromptRegistryPanel";
import { loadPromptRegistryPage } from "@/lib/actions/agentPrompts";
import {
  canViewPromptRegistry,
  getMembershipsForUser
} from "@/lib/authz";
import { getServerSupabaseClient, requireUser } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function AgentPromptsPage() {
  const user = await requireUser();
  if (!user) {
    redirect("/login?next=/agents/prompts");
  }

  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    redirect("/login?next=/agents/prompts");
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewPromptRegistry(memberships)) {
    redirect("/");
  }

  const data = await loadPromptRegistryPage();
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
            href="/agents/rollouts"
          >
            Rollouts
          </Link>
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Prompt registry</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Versioned prompts, schemas, and safety policy references. Active versions are immutable;
          activations require validation gates. Raw system instructions stay server-side.
        </p>
        <div className="mt-8">
          <PromptRegistryPanel
            versions={data.versions}
            catalog={data.catalog}
            canManageGlobal={data.canManageGlobal}
            manageableOrganizationIds={data.manageableOrganizationIds}
            isSalesReadOnly={data.isSalesReadOnly}
            organizations={data.organizations}
          />
        </div>
      </div>
    </main>
  );
}
