import type { SupabaseClient } from "@supabase/supabase-js";

import type { FollowUp, OutreachActivity, School } from "@/lib/supabase";

export type DashboardMetricKey =
  | "total_schools"
  | "prospects"
  | "meetings_scheduled"
  | "proposals_sent"
  | "closed_won"
  | "follow_ups_due_today"
  | "overdue_follow_ups"
  | "contacts"
  | "outreach_logged_this_week";

export type DashboardMetric = {
  key: DashboardMetricKey;
  label: string;
  value: number;
  detail: string;
};

type FollowUpRecord = Pick<FollowUp, "title" | "due_date" | "status">;
type OutreachRecord = Pick<OutreachActivity, "channel" | "subject" | "outreach_date">;

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(date: Date): string {
  const normalized = new Date(date);
  const day = normalized.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + mondayOffset);
  return toDateString(normalized);
}

function isOpenFollowUp(followUp: FollowUpRecord): boolean {
  return followUp.status !== "Done";
}

function isProposalSent(record: {
  title?: string | null;
  subject?: string | null;
}): boolean {
  const value = `${record.title ?? ""} ${record.subject ?? ""}`.toLowerCase();
  return (
    value.includes("proposal") ||
    value.includes("pilot plan") ||
    value.includes("overview") ||
    value.includes("deck")
  );
}

export function buildDashboardMetricsFromRecords(
  schools: School[],
  contactsCount: number,
  followUps: FollowUpRecord[],
  outreach: OutreachRecord[],
  referenceDate = new Date()
): DashboardMetric[] {
  const today = toDateString(referenceDate);
  const weekStart = startOfWeek(referenceDate);
  const openFollowUps = followUps.filter(isOpenFollowUp);

  const meetingsScheduled = openFollowUps.filter(
    (followUp) => followUp.status === "Scheduled"
  ).length;

  const proposalsSent = outreach.filter((activity) =>
    isProposalSent({ subject: activity.subject })
  ).length;

  const followUpsDueToday = openFollowUps.filter(
    (followUp) => followUp.due_date === today
  ).length;

  const overdueFollowUps = openFollowUps.filter(
    (followUp) => Boolean(followUp.due_date && followUp.due_date < today)
  ).length;

  const outreachLoggedThisWeek = outreach.filter(
    (activity) =>
      activity.outreach_date >= weekStart && activity.outreach_date <= today
  ).length;

  return [
    {
      key: "total_schools",
      label: "Total Schools",
      value: schools.length,
      detail: "Accounts in your organization"
    },
    {
      key: "prospects",
      label: "Prospects",
      value: schools.filter((school) => school.status === "Prospect").length,
      detail: "Schools in Prospect stage"
    },
    {
      key: "meetings_scheduled",
      label: "Meetings Scheduled",
      value: meetingsScheduled,
      detail: "Open follow-ups with Scheduled status"
    },
    {
      key: "proposals_sent",
      label: "Proposals Sent",
      value: proposalsSent,
      detail: "Proposal, overview, or pilot plan outreach logged"
    },
    {
      key: "closed_won",
      label: "Closed Won",
      value: schools.filter((school) => school.status === "Partner").length,
      detail: "Schools in Partner stage"
    },
    {
      key: "follow_ups_due_today",
      label: "Follow-ups Due Today",
      value: followUpsDueToday,
      detail: "Open follow-ups due today"
    },
    {
      key: "overdue_follow_ups",
      label: "Overdue Follow-ups",
      value: overdueFollowUps,
      detail: "Open follow-ups past due date"
    },
    {
      key: "contacts",
      label: "Contacts",
      value: contactsCount,
      detail: "Decision-makers tracked"
    },
    {
      key: "outreach_logged_this_week",
      label: "Outreach Logged This Week",
      value: outreachLoggedThisWeek,
      detail: "Touchpoints logged since Monday"
    }
  ];
}

function countOrZero(count: number | null | undefined): number {
  return count ?? 0;
}

export async function buildDashboardMetricsFromSupabase(
  supabase: SupabaseClient,
  schools: School[],
  contactsCount: number,
  referenceDate = new Date()
): Promise<DashboardMetric[]> {
  const today = toDateString(referenceDate);
  const weekStart = startOfWeek(referenceDate);

  const [
    meetingsScheduled,
    proposalOutreach,
    followUpsDueToday,
    overdueFollowUps,
    outreachLoggedThisWeek
  ] = await Promise.all([
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("status", "Scheduled"),
    supabase
      .from("outreach")
      .select("id", { count: "exact", head: true })
      .or(
        "subject.ilike.%proposal%,subject.ilike.%pilot plan%,subject.ilike.%overview%,subject.ilike.%deck%"
      ),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("due_date", today)
      .neq("status", "Done"),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .lt("due_date", today)
      .neq("status", "Done"),
    supabase
      .from("outreach")
      .select("id", { count: "exact", head: true })
      .gte("outreach_date", weekStart)
      .lte("outreach_date", today)
  ]);

  const baseMetrics = buildDashboardMetricsFromRecords(
    schools,
    contactsCount,
    [],
    [],
    referenceDate
  );

  return baseMetrics.map((metric) => {
    switch (metric.key) {
      case "contacts":
        return { ...metric, value: contactsCount };
      case "meetings_scheduled":
        return {
          ...metric,
          value: countOrZero(meetingsScheduled.count)
        };
      case "proposals_sent":
        return {
          ...metric,
          value: countOrZero(proposalOutreach.count)
        };
      case "follow_ups_due_today":
        return {
          ...metric,
          value: countOrZero(followUpsDueToday.count)
        };
      case "overdue_follow_ups":
        return {
          ...metric,
          value: countOrZero(overdueFollowUps.count)
        };
      case "outreach_logged_this_week":
        return {
          ...metric,
          value: countOrZero(outreachLoggedThisWeek.count)
        };
      default:
        return metric;
    }
  });
}
