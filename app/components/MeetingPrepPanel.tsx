"use client";

import type { MeetingPrepActionResult } from "@/lib/actions/meetingPrep";
import {
  MEETING_PREP_REVIEW_WARNING,
  type MeetingPrepBrief
} from "@/lib/meetingPrep/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

function formatConfidence(score: number) {
  return `${Math.round(score * 100)}%`;
}

function BriefList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-slate-500">None listed.</p>;
  }

  return (
    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function MeetingPrepPanel({
  targetLabel,
  brief,
  canGenerate,
  actionsEnabled,
  generateAction
}: {
  targetLabel: string;
  brief: MeetingPrepBrief | null;
  canGenerate: boolean;
  actionsEnabled: boolean;
  generateAction: () => Promise<MeetingPrepActionResult>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await generateAction();

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
        <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 ring-1 ring-teal-200">
          Meeting prep
        </span>
        <span className="text-xs text-slate-500">{targetLabel}</span>
      </div>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
        {MEETING_PREP_REVIEW_WARNING}
      </p>

      {!brief ? (
        <p className="text-xs text-slate-600">
          No meeting brief yet. Generate an internal draft from safe CRM and public context.
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
              {formatConfidence(brief.confidence_score)} confidence
            </span>
            <span className="text-[11px] text-slate-500">
              Updated {new Date(brief.updated_at).toLocaleString()}
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Meeting objective
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-800">{brief.meeting_objective}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Key context
            </p>
            <BriefList items={brief.key_context} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Likely priorities
            </p>
            <BriefList items={brief.likely_priorities} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Suggested questions
            </p>
            <BriefList items={brief.suggested_questions} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recommended SecureCell offering
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-800">
              {brief.recommended_securecell_offering}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Objections to prepare for
            </p>
            <BriefList items={brief.objections_to_prepare_for} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Next step recommendation
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-800">
              {brief.next_step_recommendation}
            </p>
          </div>
        </div>
      )}

      {canGenerate ? (
        <button
          className="rounded-full border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 disabled:opacity-60"
          disabled={!actionsEnabled || isPending}
          onClick={handleGenerate}
          type="button"
        >
          {isPending ? "Generating brief…" : brief ? "Refresh meeting brief" : "Generate meeting brief"}
        </button>
      ) : null}

      {!actionsEnabled ? (
        <p className="text-xs text-amber-700">Connect Supabase to generate meeting prep.</p>
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
