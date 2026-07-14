import UpcomingFollowUps from "@/app/components/UpcomingFollowUps";
import { PageHeader, Panel } from "@/app/components/ui";
import { getDashboardData } from "@/lib/supabase";
import {
  classifyFollowUpUrgency,
  type UpcomingFollowUpItem
} from "@/lib/upcomingFollowUps";

export const dynamic = "force-dynamic";

function startOfWeek(date: Date): string {
  const normalized = new Date(date);
  const day = normalized.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + mondayOffset);
  return normalized.toISOString().slice(0, 10);
}

function endOfWeek(date: Date): string {
  const start = new Date(startOfWeek(date));
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}

function bucketFollowUps(items: UpcomingFollowUpItem[], reference = new Date()) {
  const today = reference.toISOString().slice(0, 10);
  const weekStart = startOfWeek(reference);
  const weekEnd = endOfWeek(reference);

  const overdue: UpcomingFollowUpItem[] = [];
  const dueToday: UpcomingFollowUpItem[] = [];
  const thisWeek: UpcomingFollowUpItem[] = [];
  const later: UpcomingFollowUpItem[] = [];

  for (const item of items) {
    const urgency = classifyFollowUpUrgency(item.dueDate, reference);
    if (urgency === "overdue") {
      overdue.push(item);
      continue;
    }
    if (urgency === "today") {
      dueToday.push(item);
      continue;
    }
    if (
      item.dueDate &&
      item.dueDate > today &&
      item.dueDate >= weekStart &&
      item.dueDate <= weekEnd
    ) {
      thisWeek.push(item);
      continue;
    }
    later.push(item);
  }

  return { overdue, dueToday, thisWeek, later };
}

export default async function FollowUpsPage() {
  const { upcomingFollowUps } = await getDashboardData();
  const buckets = bucketFollowUps(upcomingFollowUps);

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle="Open follow-ups across your organization, grouped by due window."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CountCard label="Overdue" value={buckets.overdue.length} tone="rose" />
        <CountCard label="Due today" value={buckets.dueToday.length} tone="amber" />
        <CountCard label="This week" value={buckets.thisWeek.length} />
        <CountCard label="Later" value={buckets.later.length} />
      </div>

      <div className="mt-6 space-y-6">
        <Bucket title="Overdue" items={buckets.overdue} />
        <Bucket title="Due today" items={buckets.dueToday} />
        <Bucket title="This week" items={buckets.thisWeek} />
        <Bucket title="Later" items={buckets.later} />
      </div>
    </div>
  );
}

function Bucket({
  title,
  items
}: {
  title: string;
  items: UpcomingFollowUpItem[];
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-white">
        {title}{" "}
        <span className="text-sm font-normal text-slate-400">({items.length})</span>
      </h2>
      {items.length ? (
        <UpcomingFollowUps followUps={items} compact />
      ) : (
        <Panel>
          <p className="text-sm text-slate-400">Nothing in this bucket.</p>
        </Panel>
      )}
    </div>
  );
}

function CountCard({
  label,
  value,
  tone = "slate"
}: {
  label: string;
  value: number;
  tone?: "slate" | "amber" | "rose";
}) {
  const colors = {
    slate: "text-white",
    amber: "text-amber-200",
    rose: "text-rose-300"
  } as const;

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--app-panel)] p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}
