import type { ApprovalDashboardMetrics } from "@/lib/approvals/types";

const cards: Array<{ key: keyof ApprovalDashboardMetrics; label: string }> = [
  { key: "total_awaiting_review", label: "Total awaiting review" },
  { key: "high_priority_items", label: "High-priority items" },
  { key: "ai_generated_items", label: "AI-generated items" },
  { key: "assigned_to_me", label: "Assigned to me" },
  { key: "oldest_pending_age_hours", label: "Oldest pending (hours)" },
  { key: "approved_today", label: "Approved today" },
  { key: "rejected_today", label: "Rejected today" }
];

export default function ApprovalMetricsGrid({
  metrics
}: {
  metrics: ApprovalDashboardMetrics;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {metrics[card.key] == null ? "—" : metrics[card.key]}
          </p>
        </div>
      ))}
    </section>
  );
}
