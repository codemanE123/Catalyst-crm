"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acceptMeetingImport,
  linkMeetingImportToSchool,
  rejectMeetingImport
} from "@/lib/actions/meetingImports";
import type { MeetingImportRecord } from "@/lib/meetingImports/types";

type SchoolOption = { id: string; name: string };

export default function MeetingImportReviewList({
  imports,
  schools,
  canAct,
  compact = false
}: {
  imports: MeetingImportRecord[];
  schools: SchoolOption[];
  canAct: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schoolByImport, setSchoolByImport] = useState<Record<string, string>>(
    {}
  );

  function runAction(
    action: () => Promise<{ ok: boolean; message?: string; error?: string }>
  ) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage(result.message ?? "Updated.");
        router.refresh();
      } else {
        setError(result.error ?? "Action failed.");
      }
    });
  }

  if (imports.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No Fireflies meeting imports are waiting for review.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {imports.map((item) => {
        const linkedSchoolId =
          schoolByImport[item.id] || item.school_id || "";
        const canAccept = Boolean(item.school_id || linkedSchoolId);
        const participants = item.participants_json
          .map((p) => p.email || p.name)
          .filter(Boolean)
          .slice(0, 6)
          .join(", ");

        return (
          <article
            key={item.id}
            className="rounded-2xl border border-white/10 bg-[var(--app-panel)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-white">
                  {item.meeting_title || "Untitled Fireflies meeting"}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Match: {item.match_status}
                  {item.match_confidence != null
                    ? ` (${Math.round(item.match_confidence * 100)}%)`
                    : ""}
                  {item.school_name ? ` · ${item.school_name}` : ""}
                  {item.meeting_started_at
                    ? ` · ${new Date(item.meeting_started_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
              {item.source_url ? (
                <a
                  className="text-sm font-medium text-blue-300 hover:text-blue-200"
                  href={item.source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open in Fireflies
                </a>
              ) : null}
            </div>

            {item.error_code === "possible_student_pii" ? (
              <p
                className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                role="status"
              >
                {item.error_message ||
                  "Possible student/education-record language detected. Review carefully before accept."}
              </p>
            ) : null}

            {!compact && item.digest_text ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                {item.digest_text.slice(0, 1200)}
                {item.digest_text.length > 1200 ? "…" : ""}
              </p>
            ) : null}

            {participants ? (
              <p className="mt-3 text-xs text-slate-500">
                Participants: {participants}
              </p>
            ) : null}

            {item.school_id ? (
              <p className="mt-2 text-sm text-slate-300">
                Linked school:{" "}
                <Link
                  className="font-medium text-blue-300 hover:text-blue-200"
                  href={`/schools/${item.school_id}`}
                  prefetch={false}
                >
                  {item.school_name || "View school"}
                </Link>
              </p>
            ) : (
              <p className="mt-2 text-sm text-amber-200">
                Link a school before accepting into discovery notes.
              </p>
            )}

            {canAct ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                {!item.school_id ? (
                  <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-slate-400">
                    School
                    <select
                      className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                      disabled={pending}
                      onChange={(event) =>
                        setSchoolByImport((current) => ({
                          ...current,
                          [item.id]: event.target.value
                        }))
                      }
                      value={linkedSchoolId}
                    >
                      <option value="">Select school…</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {!item.school_id ? (
                  <button
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
                    disabled={pending || !linkedSchoolId}
                    onClick={() =>
                      runAction(() =>
                        linkMeetingImportToSchool(item.id, linkedSchoolId)
                      )
                    }
                    type="button"
                  >
                    Link school
                  </button>
                ) : null}

                <button
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  disabled={pending || !canAccept || !item.school_id}
                  onClick={() =>
                    runAction(() => acceptMeetingImport(item.id))
                  }
                  title={
                    item.school_id
                      ? "Create discovery interview from this digest"
                      : "Link a school first"
                  }
                  type="button"
                >
                  Accept
                </button>

                <button
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
                  disabled={pending}
                  onClick={() =>
                    runAction(() => rejectMeetingImport(item.id))
                  }
                  type="button"
                >
                  Reject
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
