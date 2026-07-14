import UpcomingFollowUps from "@/app/components/UpcomingFollowUps";
import {
  PageHeader,
  Panel,
  PanelTitle,
  PrimaryButtonLink,
  SecondaryButtonLink,
  statusPillStyles
} from "@/app/components/ui";
import { loadAgentOperationsDashboard } from "@/lib/actions/agentOperations";
import {
  canManageSchools,
  canViewAgentOperations,
  canViewProspectGeneration,
  getMembershipsForUser
} from "@/lib/authz";
import {
  canViewApprovals,
  getAccessibleApprovalOrganizationIds
} from "@/lib/approvals/permissions";
import { countAwaitingHumanReview } from "@/lib/approvals/data";
import { getDashboardData, type School } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  requireUser
} from "@/lib/supabaseServer";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { schools, contacts, pipeline, dashboardMetrics, upcomingFollowUps, source } =
    await getDashboardData();
  const user = await requireUser();
  const supabase = await getServerSupabaseClient();
  const memberships =
    user && supabase ? await getMembershipsForUser(supabase, user.id) : [];
  const manageSchools = Boolean(user && canManageSchools(memberships));
  const showProspects = Boolean(user && canViewProspectGeneration(memberships));
  const showApprovals = Boolean(user && canViewApprovals(memberships));
  const showAgents = Boolean(user && canViewAgentOperations(memberships));

  const awaitingApproval =
    user && supabase && showApprovals
      ? await countAwaitingHumanReview(
          supabase,
          getAccessibleApprovalOrganizationIds(memberships)
        )
      : 0;

  const prospects =
    dashboardMetrics.find((metric) => metric.key === "prospects")?.value ??
    schools.filter((school) => school.status === "Prospect").length;
  const followUpsDue =
    (dashboardMetrics.find((metric) => metric.key === "follow_ups_due_today")
      ?.value ?? 0) +
    (dashboardMetrics.find((metric) => metric.key === "overdue_follow_ups")
      ?.value ?? 0);
  const activeOpportunities = schools.filter(
    (school) => school.status !== "Partner"
  ).length;
  const totalPipeline = pipeline.reduce((total, stage) => total + stage.count, 0);
  const prioritySchools = prioritizeSchools(schools).slice(0, 6);
  const recentActivity = contacts.slice(0, 6);

  let agentMetrics: {
    queued: number;
    running: number;
    awaiting_human_review: number;
    failed_today: number;
  } | null = null;

  if (user && supabase && showAgents) {
    const dashboard = await loadAgentOperationsDashboard({
      page: 1
    });
    if (dashboard.ok) {
      agentMetrics = dashboard.metrics;
    }
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`What needs attention today · ${
          source === "supabase" ? "Live org data" : "Sample data"
        }`}
        actions={
          <>
            {showProspects ? (
              <PrimaryButtonLink href="/prospects/generate">
                Generate Prospects
              </PrimaryButtonLink>
            ) : null}
            {manageSchools ? (
              <SecondaryButtonLink href="/schools/new">Add School</SecondaryButtonLink>
            ) : (
              <SecondaryButtonLink href="/schools">View Schools</SecondaryButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active Prospects" value={prospects} href="/schools?status=Prospect" />
        <KpiCard label="Follow-ups Due" value={followUpsDue} href="/follow-ups" tone="amber" />
        <KpiCard
          label="Awaiting Approval"
          value={awaitingApproval}
          href={showApprovals ? "/approvals" : undefined}
          tone="violet"
        />
        <KpiCard
          label="Active Opportunities"
          value={activeOpportunities}
          href="/schools"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelTitle
            title="Pipeline overview"
            description={`${totalPipeline} schools across stages`}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map((stage) => (
              <div
                key={stage.name}
                className="rounded-xl border border-white/10 bg-slate-950/40 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-300">{stage.name}</span>
                  <span className="text-2xl font-semibold text-white">{stage.count}</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10">
                  <div
                    className={`h-1.5 rounded-full ${stage.color}`}
                    style={{
                      width: `${
                        totalPipeline ? (stage.count / totalPipeline) * 100 : 0
                      }%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <UpcomingFollowUps
          compact
          followUps={upcomingFollowUps}
          limit={5}
          showViewAll
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" padding={false}>
          <div className="border-b border-white/10 p-5 sm:p-6">
            <PanelTitle
              title="Priority schools"
              description="Highest-attention accounts in your pipeline"
              action={
                <Link
                  href="/schools"
                  prefetch={false}
                  className="text-sm font-semibold text-blue-300 hover:text-blue-200"
                >
                  View all schools
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">School</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Owner</th>
                  <th className="px-5 py-3 font-semibold">Next step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {prioritySchools.map((school) => (
                  <tr key={school.id}>
                    <td className="px-5 py-4">
                      <Link
                        href={`/schools/${school.id}`}
                        prefetch={false}
                        className="font-semibold text-white hover:text-blue-300"
                      >
                        {school.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-400">{school.location}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          statusPillStyles[school.status]
                        }`}
                      >
                        {school.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{school.owner}</td>
                    <td className="px-5 py-4 text-slate-300">{school.next_step}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <PanelTitle
            title="Recent activity"
            description="Latest contact touches"
            action={
              <Link
                href="/contacts"
                prefetch={false}
                className="text-sm font-semibold text-blue-300 hover:text-blue-200"
              >
                View all
              </Link>
            }
          />
          {recentActivity.length ? (
            <ul className="space-y-3">
              {recentActivity.map((contact) => (
                <li
                  key={contact.id}
                  className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-3"
                >
                  <p className="text-sm font-medium text-white">{contact.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {contact.school} · {contact.relationship}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Last touch{" "}
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric"
                    }).format(new Date(contact.last_touch))}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No recent contact activity.</p>
          )}
        </Panel>
      </div>

      {agentMetrics ? (
        <Panel className="mt-6">
          <PanelTitle
            title="Agent operations"
            description="Current execution pressure across authorized orgs"
            action={
              <Link
                href="/agents"
                prefetch={false}
                className="text-sm font-semibold text-blue-300 hover:text-blue-200"
              >
                Open Agent Operations
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Queued" value={agentMetrics.queued} />
            <MiniStat label="Running" value={agentMetrics.running} />
            <MiniStat
              label="Awaiting review"
              value={agentMetrics.awaiting_human_review}
            />
            <MiniStat label="Failed today" value={agentMetrics.failed_today} tone="rose" />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function prioritizeSchools(schools: School[]): School[] {
  const rank: Record<School["status"], number> = {
    Interviewing: 0,
    Contacted: 1,
    Prospect: 2,
    Partner: 3
  };

  return [...schools].sort((left, right) => {
    const statusDiff = rank[left.status] - rank[right.status];
    if (statusDiff !== 0) return statusDiff;
    return left.name.localeCompare(right.name);
  });
}

function KpiCard({
  label,
  value,
  href,
  tone = "blue"
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "blue" | "amber" | "violet";
}) {
  const tones = {
    blue: "from-blue-600/20 to-transparent",
    amber: "from-amber-500/20 to-transparent",
    violet: "from-violet-500/20 to-transparent"
  } as const;

  const content = (
    <div
      className={`rounded-2xl border border-white/10 bg-gradient-to-br ${tones[tone]} bg-[var(--app-panel)] p-5 shadow-sm shadow-black/20`}
    >
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} prefetch={false} className="block transition hover:opacity-95">
      {content}
    </Link>
  );
}

function MiniStat({
  label,
  value,
  tone = "slate"
}: {
  label: string;
  value: number;
  tone?: "slate" | "rose";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "rose" ? "text-rose-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
