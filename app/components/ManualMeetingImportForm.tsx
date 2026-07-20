"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createManualMeetingImport } from "@/lib/actions/meetingImports";
import { DIGEST_MAX_CHARS } from "@/lib/meetingImports/types";

type SchoolOption = { id: string; name: string };

export default function ManualMeetingImportForm({
  schools,
  canAct
}: {
  schools: SchoolOption[];
  canAct: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [digest, setDigest] = useState("");
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canAct) {
    return (
      <p className="text-sm text-slate-400">
        You need sales or admin access to paste meeting digests.
      </p>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await createManualMeetingImport({
        digestText: digest,
        meetingTitle: title || undefined,
        meetingDate: meetingDate || undefined,
        schoolId: schoolId || undefined
      });
      if (result.ok) {
        setMessage(result.message);
        setDigest("");
        setTitle("");
        setMeetingDate("");
        setSchoolId("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label
          className="mb-1 block text-xs font-medium text-slate-400"
          htmlFor="manual-digest"
        >
          Meeting digest
        </label>
        <textarea
          className="min-h-40 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          disabled={pending}
          id="manual-digest"
          maxLength={DIGEST_MAX_CHARS + 4000}
          onChange={(event) => setDigest(event.target.value)}
          placeholder="Paste the Fireflies / Zoom / notes digest here…"
          required
          value={digest}
        />
        <p className="mt-1 text-xs text-slate-500">
          Up to {DIGEST_MAX_CHARS.toLocaleString()} characters become interview
          notes on Accept. Longer pastes keep an excerpt for review.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Title (optional)
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
            type="text"
            value={title}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Meeting date (optional)
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            onChange={(event) => setMeetingDate(event.target.value)}
            type="date"
            value={meetingDate}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          School (optional now)
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            disabled={pending}
            onChange={(event) => setSchoolId(event.target.value)}
            value={schoolId}
          >
            <option value="">Link later…</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      </div>

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

      <button
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        disabled={pending || !digest.trim()}
        type="submit"
      >
        {pending ? "Staging…" : "Stage digest for review"}
      </button>
    </form>
  );
}
