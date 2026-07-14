import {
  canViewAgentOperations,
  canViewProspectGeneration,
  getMembershipsForUser
} from "@/lib/authz";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import type { Metadata } from "next";
import Link from "next/link";
import GlobalSearch from "./components/GlobalSearch";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catalyst CRM",
  description: "First-version school outreach dashboard"
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
  const showProspectsNav = user && canViewProspectGeneration(memberships);
  const showAgentsNav = user && canViewAgentOperations(memberships);

  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white px-6 py-3">
          <div className="mx-auto flex max-w-7xl items-center gap-4">
            <Link className="shrink-0 font-semibold text-slate-950" href="/" prefetch={false}>
              Catalyst CRM
            </Link>
            {user ? (
              <div className="min-w-0 flex-1">
                <GlobalSearch />
              </div>
            ) : (
              <div className="flex-1" />
            )}
            {showProspectsNav ? (
              <Link
                className="shrink-0 text-sm text-slate-600 hover:text-slate-950"
                href="/prospects/generate"
                prefetch={false}
              >
                Generate prospects
              </Link>
            ) : null}
            {showAgentsNav ? (
              <Link
                className="shrink-0 text-sm text-slate-600 hover:text-slate-950"
                href="/agents"
                prefetch={false}
              >
                Agents
              </Link>
            ) : null}
            {user ? (
              <a
                className="shrink-0 text-sm text-slate-600 hover:text-slate-950"
                href="/logout"
              >
                Sign out
              </a>
            ) : (
              <Link
                className="shrink-0 text-sm text-slate-600 hover:text-slate-950"
                href="/login"
                prefetch={false}
              >
                Sign in
              </Link>
            )}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
