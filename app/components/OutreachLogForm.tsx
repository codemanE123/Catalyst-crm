"use client";

import type { OutreachActionResult } from "@/lib/validation";
import { useActionState } from "react";

const channelOptions = [
  "Email",
  "Call",
  "Meeting",
  "LinkedIn",
  "Event",
  "Other"
] as const;

export default function OutreachLogForm({
  schoolId,
  schoolName,
  action
}: {
  schoolId: string;
  schoolName: string;
  action: (formData: FormData) => Promise<OutreachActionResult> | OutreachActionResult;
}) {
  const [submitState, submitAction] = useActionState(
    async (_previousState: OutreachActionResult | null, formData: FormData) =>
      action(formData),
    null
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Log outreach
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Record a touchpoint
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Log email, call, meeting, or other outreach for {schoolName}.
      </p>
      <form action={submitAction} className="mt-6 space-y-4">
        <input type="hidden" name="school_id" value={schoolId} />
        {submitState && !submitState.ok ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {submitState.error}
          </p>
        ) : null}
        {submitState?.ok ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Outreach logged.
          </p>
        ) : null}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Channel</span>
          <select
            name="channel"
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            defaultValue="Email"
          >
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Subject</span>
          <input
            name="subject"
            required
            maxLength={200}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Discovery email follow-up"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Outcome</span>
          <textarea
            name="outcome"
            required
            maxLength={1000}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="What happened on this touchpoint?"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date</span>
            <input
              name="outreach_date"
              type="date"
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="text-sm font-medium text-slate-700">Next step</span>
            <input
              name="next_step"
              required
              maxLength={500}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="Schedule follow-up call"
            />
          </label>
        </div>
        <button className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
          Save outreach
        </button>
      </form>
    </section>
  );
}
