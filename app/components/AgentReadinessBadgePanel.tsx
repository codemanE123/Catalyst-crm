import Link from "next/link";

import type { AgentReadinessCertification } from "@/lib/agents/readiness";

function daysUntil(expiresAt: string | null): number | null {
  if (!expiresAt) {
    return null;
  }
  return Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

export default function AgentReadinessBadgePanel({
  certifications
}: {
  certifications: AgentReadinessCertification[];
}) {
  const approved = certifications.filter((row) => row.status === "approved");
  const blocked = certifications.filter((row) =>
    ["revoked", "expired", "rejected"].includes(row.status)
  );
  const nearest = approved
    .map((row) => ({ row, days: daysUntil(row.expires_at) }))
    .filter((entry) => entry.days != null)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))[0];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Production readiness
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Certification gate status for agent production enablement.
          </p>
        </div>
        <Link
          href="/agents/readiness"
          className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
        >
          Open readiness
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-900 ring-1 ring-emerald-200">
          Approved: {approved.length}
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900 ring-1 ring-amber-200">
          Blocked/expired: {blocked.length}
        </span>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-slate-800 ring-1 ring-slate-200">
          Days to expiry: {nearest?.days ?? "—"}
        </span>
      </div>
      {blocked.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {blocked.slice(0, 5).map((row) => (
            <li key={row.id}>
              {row.agent_name} · {row.environment} · {row.status}
              {row.revoke_reason ? ` — ${row.revoke_reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
