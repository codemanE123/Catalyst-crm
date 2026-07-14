"use client";

import GlobalSearch from "@/app/components/GlobalSearch";
import {
  isNavItemActive,
  type AppNavGroup,
  type AppNavIcon
} from "@/lib/appNav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const iconPaths: Record<AppNavIcon, string> = {
  dashboard: "M3 12l9-9 9 9M5 10v10h4v-6h6v6h4V10",
  schools: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  contacts: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  followups: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
  prospects: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16M11 8v6M8 11h6",
  jobs: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  approvals: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  agents: "M12 2a4 4 0 014 4v2h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2h2V6a4 4 0 014-4z",
  prompts: "M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
  rollouts: "M22 12h-4l-3 9L9 3l-3 9H2",
  policies: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  simulations: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  readiness: "M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
};

function NavIcon({ name }: { name: AppNavIcon }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function pageTitleFromPath(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/schools/import")) return "Import schools";
  if (pathname.startsWith("/schools/new")) return "Add school";
  if (pathname.startsWith("/schools/")) return "School profile";
  if (pathname.startsWith("/schools")) return "Schools";
  if (pathname.startsWith("/contacts")) return "Contacts";
  if (pathname.startsWith("/follow-ups")) return "Follow-ups";
  if (pathname.startsWith("/prospects/jobs")) return "Prospect jobs";
  if (pathname.startsWith("/prospects/generate")) return "Generate prospects";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/agents/prompts")) return "Prompts";
  if (pathname.startsWith("/agents/rollouts")) return "Rollouts";
  if (pathname.startsWith("/agents/policies")) return "Policies";
  if (pathname.startsWith("/agents/readiness")) return "Readiness";
  if (pathname.startsWith("/agents")) return "Agent operations";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Catalyst CRM";
}

export default function AppShell({
  children,
  groups,
  userLabel,
  pendingApprovalsCount
}: {
  children: React.ReactNode;
  groups: AppNavGroup[];
  userLabel: string;
  pendingApprovalsCount: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const title = pageTitleFromPath(pathname);

  function renderNav(compact: boolean) {
    return (
      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.id}>
            {!compact ? (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                const showBadge =
                  item.href === "/approvals" && pendingApprovalsCount > 0;

                return (
                  <li key={`${group.id}-${item.href}-${item.label}`}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      title={item.label}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? "bg-blue-600/20 text-blue-100 ring-1 ring-blue-500/40"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      } ${compact ? "justify-center px-2" : ""}`}
                    >
                      <NavIcon name={item.icon} />
                      {!compact ? <span className="flex-1">{item.label}</span> : null}
                      {!compact && showBadge ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/30">
                          {pendingApprovalsCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  const sidebarWidth = collapsed ? "w-[72px]" : "w-60";

  return (
    <div className="min-h-screen bg-[var(--app-canvas)] text-[var(--app-fg)]">
      {mobileOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          type="button"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/5 bg-[var(--app-sidebar)] transition-transform lg:translate-x-0 ${sidebarWidth} ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/5 px-4">
          <Link
            href="/"
            prefetch={false}
            className="truncate text-sm font-semibold tracking-tight text-white"
            onClick={() => setMobileOpen(false)}
          >
            {collapsed ? "C" : "Catalyst CRM"}
          </Link>
          <button
            type="button"
            className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
            </svg>
          </button>
        </div>

        {renderNav(collapsed)}

        <div className="border-t border-white/5 p-3">
          <div
            className={`rounded-xl bg-white/5 px-3 py-3 ${
              collapsed ? "text-center" : ""
            }`}
          >
            {!collapsed ? (
              <>
                <p className="truncate text-xs text-slate-400">Signed in</p>
                <p className="mt-1 truncate text-sm font-medium text-slate-100">
                  {userLabel}
                </p>
              </>
            ) : (
              <p className="text-xs font-semibold text-slate-200">
                {userLabel.slice(0, 1).toUpperCase()}
              </p>
            )}
            {!collapsed ? (
              <a
                href="/logout"
                className="mt-3 inline-flex text-xs font-semibold text-blue-300 hover:text-blue-200"
              >
                Sign out
              </a>
            ) : null}
          </div>
        </div>
      </aside>

      <div
        className={`min-h-screen transition-[padding] ${
          collapsed ? "lg:pl-[72px]" : "lg:pl-60"
        }`}
      >
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[var(--app-topbar)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              className="inline-flex rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white sm:text-base">
                {title}
              </p>
            </div>

            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3 sm:max-w-xl">
              <div className="hidden min-w-0 flex-1 md:block">
                <GlobalSearch />
              </div>
              {pendingApprovalsCount > 0 ? (
                <Link
                  href="/approvals"
                  prefetch={false}
                  className="hidden rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/30 sm:inline-flex"
                >
                  {pendingApprovalsCount} awaiting
                </Link>
              ) : null}
              <a
                href="/logout"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white sm:hidden"
              >
                Out
              </a>
            </div>
          </div>
          <div className="border-t border-white/5 px-4 py-2 md:hidden">
            <GlobalSearch />
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
