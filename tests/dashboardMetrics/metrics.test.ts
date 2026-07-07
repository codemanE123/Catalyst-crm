import { describe, expect, it } from "vitest";

import {
  buildDashboardMetricsFromRecords,
  startOfWeek
} from "@/lib/dashboardMetrics";
import type { School } from "@/lib/supabase";

const schools: School[] = [
  {
    id: "school-1",
    name: "Roosevelt High School",
    district: "Oak Valley USD",
    location: "Oak Valley, CA",
    status: "Interviewing",
    owner: "Maya Chen",
    next_step: "Principal interview on Friday",
    website: "https://www.roosevelths.example.edu"
  },
  {
    id: "school-2",
    name: "Lakeview Middle School",
    district: "Lakeview Schools",
    location: "Madison, WI",
    status: "Prospect",
    owner: "Priya Shah",
    next_step: "Find counseling lead",
    website: "https://www.lakeview.example.edu"
  },
  {
    id: "school-3",
    name: "Cedar Ridge Prep",
    district: "Independent",
    location: "Austin, TX",
    status: "Partner",
    owner: "Maya Chen",
    next_step: "Quarterly success review",
    website: "https://www.cedarridge.example.edu"
  }
];

const followUps = [
  {
    title: "Send Roosevelt pilot plan",
    due_date: "2026-07-05",
    status: "Open" as const
  },
  {
    title: "Follow up on program overview",
    due_date: "2026-07-06",
    status: "Scheduled" as const
  },
  {
    title: "Completed proposal follow-up",
    due_date: "2026-07-01",
    status: "Done" as const
  }
];

const outreach = [
  {
    channel: "Email" as const,
    subject: "Pilot overview for Roosevelt",
    outreach_date: "2026-07-06"
  },
  {
    channel: "Meeting" as const,
    subject: "Principal discovery",
    outreach_date: "2026-06-20"
  }
];

const referenceDate = new Date("2026-07-06T12:00:00.000Z");

function metricValue(
  metrics: ReturnType<typeof buildDashboardMetricsFromRecords>,
  key: string
) {
  return metrics.find((metric) => metric.key === key)?.value;
}

describe("startOfWeek", () => {
  it("returns the Monday of the current week", () => {
    expect(startOfWeek(new Date("2026-07-06T12:00:00.000Z"))).toBe("2026-07-06");
    expect(startOfWeek(new Date("2026-07-08T12:00:00.000Z"))).toBe("2026-07-06");
  });
});

describe("buildDashboardMetricsFromRecords", () => {
  it("returns all nine dashboard cards", () => {
    const metrics = buildDashboardMetricsFromRecords(
      schools,
      12,
      followUps,
      outreach,
      referenceDate
    );

    expect(metrics).toHaveLength(9);
    expect(metrics.map((metric) => metric.label)).toEqual([
      "Total Schools",
      "Prospects",
      "Meetings Scheduled",
      "Proposals Sent",
      "Closed Won",
      "Follow-ups Due Today",
      "Overdue Follow-ups",
      "Contacts",
      "Outreach Logged This Week"
    ]);
  });

  it("computes school and contact counts from existing records", () => {
    const metrics = buildDashboardMetricsFromRecords(
      schools,
      12,
      followUps,
      outreach,
      referenceDate
    );

    expect(metricValue(metrics, "total_schools")).toBe(3);
    expect(metricValue(metrics, "prospects")).toBe(1);
    expect(metricValue(metrics, "closed_won")).toBe(1);
    expect(metricValue(metrics, "contacts")).toBe(12);
  });

  it("computes follow-up and outreach activity metrics", () => {
    const metrics = buildDashboardMetricsFromRecords(
      schools,
      12,
      followUps,
      outreach,
      referenceDate
    );

    expect(metricValue(metrics, "meetings_scheduled")).toBe(1);
    expect(metricValue(metrics, "proposals_sent")).toBe(1);
    expect(metricValue(metrics, "follow_ups_due_today")).toBe(1);
    expect(metricValue(metrics, "overdue_follow_ups")).toBe(1);
    expect(metricValue(metrics, "outreach_logged_this_week")).toBe(1);
  });
});
