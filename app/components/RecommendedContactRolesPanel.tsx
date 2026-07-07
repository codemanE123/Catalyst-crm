"use client";

import {
  CONTACT_DISCOVERY_PRIORITY_LABELS,
  CONTACT_DISCOVERY_REVIEW_WARNING,
  type ProspectContactRecommendation
} from "@/lib/contactDiscovery/types";
import type { ContactDiscoveryActionResult } from "@/lib/actions/contactDiscovery";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

function formatConfidence(score: number) {
  return `${Math.round(score * 100)}%`;
}

export default function RecommendedContactRolesPanel({
  targetLabel,
  recommendations,
  canDiscover,
  actionsEnabled,
  discoverAction
}: {
  targetLabel: string;
  recommendations: ProspectContactRecommendation[];
  canDiscover: boolean;
  actionsEnabled: boolean;
  discoverAction: () => Promise<ContactDiscoveryActionResult>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDiscover() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await discoverAction();

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="max-w-md space-y-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-900 ring-1 ring-indigo-200">
          Recommended contact roles
        </span>
        <span className="text-xs text-slate-500">{targetLabel}</span>
      </div>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
        {CONTACT_DISCOVERY_REVIEW_WARNING}
      </p>

      {recommendations.length === 0 ? (
        <p className="text-xs text-slate-600">
          No role recommendations yet. Discover roles from public institutional context only.
        </p>
      ) : (
        <ul className="space-y-3">
          {recommendations.map((recommendation) => (
            <li
              key={recommendation.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-950">
                  {recommendation.recommended_title}
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                  {CONTACT_DISCOVERY_PRIORITY_LABELS[recommendation.priority] ??
                    `Priority ${recommendation.priority}`}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                  {formatConfidence(recommendation.confidence_score)} confidence
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{recommendation.department}</p>
              <p className="mt-2 text-xs leading-5 text-slate-700">
                {recommendation.rationale}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                <span className="font-medium text-slate-800">Outreach angle:</span>{" "}
                {recommendation.suggested_outreach_angle}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canDiscover ? (
        <button
          className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 disabled:opacity-60"
          disabled={!actionsEnabled || isPending}
          onClick={handleDiscover}
          type="button"
        >
          {isPending ? "Discovering roles…" : "Discover contact roles"}
        </button>
      ) : null}

      {!actionsEnabled ? (
        <p className="text-xs text-amber-700">Connect Supabase to run contact discovery.</p>
      ) : null}

      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-xs text-emerald-700" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
