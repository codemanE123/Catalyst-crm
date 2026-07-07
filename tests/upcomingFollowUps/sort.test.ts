import { describe, expect, it } from "vitest";

import {
  buildUpcomingFollowUpItems,
  classifyFollowUpUrgency,
  sortUpcomingFollowUps,
  type UpcomingFollowUpItem
} from "@/lib/upcomingFollowUps";

const referenceDate = new Date("2026-07-06T12:00:00.000Z");

const schoolNameById = new Map([
  ["school-1", "Roosevelt High School"],
  ["school-2", "North Star Academy"],
  ["school-3", "Lakeview Middle School"]
]);

describe("classifyFollowUpUrgency", () => {
  it("classifies overdue, today, and upcoming due dates", () => {
    expect(classifyFollowUpUrgency("2026-07-05", referenceDate)).toBe("overdue");
    expect(classifyFollowUpUrgency("2026-07-06", referenceDate)).toBe("today");
    expect(classifyFollowUpUrgency("2026-07-08", referenceDate)).toBe("upcoming");
    expect(classifyFollowUpUrgency(null, referenceDate)).toBe("upcoming");
  });
});

describe("sortUpcomingFollowUps", () => {
  it("sorts overdue first, then today, then upcoming", () => {
    const items = buildUpcomingFollowUpItems(
      [
        {
          id: "follow-up-3",
          school_id: "school-3",
          title: "Check in with counseling lead",
          due_date: "2026-07-08",
          status: "Open",
          owner: "Priya Shah"
        },
        {
          id: "follow-up-2",
          school_id: "school-2",
          title: "Follow up on program overview",
          due_date: "2026-07-06",
          status: "Scheduled",
          owner: "Jon Bell"
        },
        {
          id: "follow-up-1",
          school_id: "school-1",
          title: "Send Roosevelt pilot plan",
          due_date: "2026-07-05",
          status: "Open",
          owner: "Maya Chen"
        }
      ],
      schoolNameById,
      referenceDate
    );

    expect(items.map((item) => item.urgency)).toEqual([
      "overdue",
      "today",
      "upcoming"
    ]);
    expect(items.map((item) => item.schoolName)).toEqual([
      "Roosevelt High School",
      "North Star Academy",
      "Lakeview Middle School"
    ]);
  });

  it("sorts by due date within the same urgency bucket", () => {
    const items: UpcomingFollowUpItem[] = [
      {
        id: "b",
        schoolId: "school-2",
        schoolName: "North Star Academy",
        title: "Later overdue",
        dueDate: "2026-07-04",
        owner: "Jon Bell",
        status: "Open",
        urgency: "overdue"
      },
      {
        id: "a",
        schoolId: "school-1",
        schoolName: "Roosevelt High School",
        title: "Earlier overdue",
        dueDate: "2026-07-03",
        owner: "Maya Chen",
        status: "Open",
        urgency: "overdue"
      }
    ];

    expect(sortUpcomingFollowUps(items).map((item) => item.id)).toEqual([
      "a",
      "b"
    ]);
  });

  it("excludes completed follow-ups", () => {
    const items = buildUpcomingFollowUpItems(
      [
        {
          id: "follow-up-done",
          school_id: "school-1",
          title: "Completed task",
          due_date: "2026-07-05",
          status: "Done",
          owner: "Maya Chen"
        },
        {
          id: "follow-up-open",
          school_id: "school-2",
          title: "Open task",
          due_date: "2026-07-08",
          status: "Open",
          owner: "Jon Bell"
        }
      ],
      schoolNameById,
      referenceDate
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("follow-up-open");
  });
});
