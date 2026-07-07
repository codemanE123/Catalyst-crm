import type { FollowUp } from "@/lib/supabase";

export type FollowUpUrgency = "overdue" | "today" | "upcoming";

export type UpcomingFollowUpItem = {
  id: string;
  schoolId: string;
  schoolName: string;
  title: string;
  dueDate: string | null;
  owner: string | null;
  status: FollowUp["status"];
  urgency: FollowUpUrgency;
};

export type UpcomingFollowUpRecord = {
  id: string;
  school_id: string;
  title: string;
  due_date: string | null;
  status: FollowUp["status"];
  owner: string | null;
};

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function classifyFollowUpUrgency(
  dueDate: string | null,
  referenceDate: Date
): FollowUpUrgency {
  if (!dueDate) {
    return "upcoming";
  }

  const today = toDateString(referenceDate);

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "today";
  }

  return "upcoming";
}

const urgencyRank: Record<FollowUpUrgency, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2
};

export function compareUpcomingFollowUps(
  left: UpcomingFollowUpItem,
  right: UpcomingFollowUpItem
) {
  const urgencyDiff = urgencyRank[left.urgency] - urgencyRank[right.urgency];

  if (urgencyDiff !== 0) {
    return urgencyDiff;
  }

  if (!left.dueDate && !right.dueDate) {
    return left.schoolName.localeCompare(right.schoolName);
  }

  if (!left.dueDate) {
    return 1;
  }

  if (!right.dueDate) {
    return -1;
  }

  const dateDiff = left.dueDate.localeCompare(right.dueDate);

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return left.schoolName.localeCompare(right.schoolName);
}

export function sortUpcomingFollowUps(items: UpcomingFollowUpItem[]) {
  return [...items].sort(compareUpcomingFollowUps);
}

export function buildUpcomingFollowUpItems(
  followUps: UpcomingFollowUpRecord[],
  schoolNameById: Map<string, string>,
  referenceDate = new Date()
): UpcomingFollowUpItem[] {
  const items = followUps
    .filter((followUp) => followUp.status !== "Done")
    .map((followUp) => ({
      id: followUp.id,
      schoolId: followUp.school_id,
      schoolName: schoolNameById.get(followUp.school_id) ?? "Unknown school",
      title: followUp.title,
      dueDate: followUp.due_date,
      owner: followUp.owner,
      status: followUp.status,
      urgency: classifyFollowUpUrgency(followUp.due_date, referenceDate)
    }));

  return sortUpcomingFollowUps(items);
}

export function urgencyLabel(urgency: FollowUpUrgency) {
  switch (urgency) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Today";
    default:
      return "Upcoming";
  }
}
