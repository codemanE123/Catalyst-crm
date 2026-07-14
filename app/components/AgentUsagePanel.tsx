import type { AgentUsageTotals } from "@/lib/agents/usage";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(value);
}

export default function AgentUsagePanel({
  usage,
  showDetailedBreakdown
}: {
  usage: AgentUsageTotals;
  showDetailedBreakdown: boolean;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">AI usage and spend</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Estimated cost is calculated from known model list prices and provider-reported
            token counts. Missing token data yields no estimated cost. Prompts and raw model
            output are never shown here.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UsageStat label="LLM calls today" value={String(usage.llm_calls_today)} />
        <UsageStat
          label="Agent executions today"
          value={String(usage.agent_executions_today)}
        />
        <UsageStat
          label="Estimated spend today"
          value={formatUsd(usage.estimated_spend_today_usd)}
        />
        <UsageStat
          label="Estimated spend this month"
          value={formatUsd(usage.estimated_spend_month_usd)}
        />
      </div>

      {showDetailedBreakdown ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <BreakdownList
            empty="No agent usage today."
            items={usage.usage_by_agent.map((row) => ({
              key: row.agent_name,
              title: row.agent_name,
              subtitle: `${row.events} events · ${formatUsd(row.estimated_cost_usd)}`
            }))}
            title="Usage by agent"
          />
          <BreakdownList
            empty="No model usage today."
            items={usage.usage_by_model.map((row) => ({
              key: row.model,
              title: row.model,
              subtitle: `${row.events} events · ${formatUsd(row.estimated_cost_usd)}`
            }))}
            title="Usage by model"
          />
          <BreakdownList
            empty="No policy denials today."
            items={usage.denied_by_reason.map((row) => ({
              key: row.reason_code,
              title: row.reason_code,
              subtitle: `${row.count} denied`
            }))}
            title="Denied by reason"
          />
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-600">
          Detailed agent/model breakdowns are available to organization admins.
        </p>
      )}
    </section>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function BreakdownList({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; title: string; subtitle: string }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <p className="text-sm font-medium text-slate-900">{item.title}</p>
              <p className="text-xs text-slate-600">{item.subtitle}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
