import AppShell from "@/app/components/AppShell";
import {
  canAccessSettingsRoutes,
  canViewAgentOperations,
  canViewProspectGeneration,
  getMembershipsForUser
} from "@/lib/authz";
import {
  canViewApprovals,
  getAccessibleApprovalOrganizationIds
} from "@/lib/approvals/permissions";
import { countAwaitingHumanReview } from "@/lib/approvals/data";
import { buildAppNavGroups, type AppNavVisibility } from "@/lib/appNav";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catalyst CRM",
  description: "School partnership CRM and agent operations"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const supabase = await getServerSupabaseClient();
  const memberships =
    user && supabase ? await getMembershipsForUser(supabase, user.id) : [];

  const visibility: AppNavVisibility = user
    ? {
        showProspects: canViewProspectGeneration(memberships),
        showApprovals: canViewApprovals(memberships),
        showAgents: canViewAgentOperations(memberships),
        showSettings: canAccessSettingsRoutes(memberships)
      }
    : {
        showProspects: false,
        showApprovals: false,
        showAgents: false,
        showSettings: false
      };

  const groups = buildAppNavGroups(visibility);
  let pendingApprovalsCount = 0;
  if (user && supabase && visibility.showApprovals) {
    try {
      pendingApprovalsCount = await countAwaitingHumanReview(
        supabase,
        getAccessibleApprovalOrganizationIds(memberships)
      );
    } catch {
      pendingApprovalsCount = 0;
    }
  }

  if (!user) {
    return (
      <html lang="en">
        <body>
          <header className="border-b border-white/10 bg-[var(--app-sidebar)] px-6 py-3">
            <div className="mx-auto flex max-w-5xl items-center justify-between">
              <Link className="font-semibold text-white" href="/" prefetch={false}>
                Catalyst CRM
              </Link>
              <Link
                className="text-sm text-slate-300 hover:text-white"
                href="/login"
                prefetch={false}
              >
                Sign in
              </Link>
            </div>
          </header>
          {children}
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <AppShell
          groups={groups}
          pendingApprovalsCount={pendingApprovalsCount}
          userLabel={user.email ?? user.id}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
