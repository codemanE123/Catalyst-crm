"use client";

import type { FollowUp } from "@/lib/supabase";
import type { FollowUpActionResult } from "@/lib/validation";
import { useActionState } from "react";

function formatDueDate(value: string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export default function FollowUpPanel({
  schoolId,
  schoolName,
  openFollowUps,
  createAction,
  completeAction
}: {
  schoolId: string;
  schoolName: string;
  openFollowUps: FollowUp[];
  createAction: (
    formData: FormData
  ) => Promise<FollowUpActionResult> | FollowUpActionResult;
  completeAction: (
    formData: FormData
  ) => Promise<FollowUpActionResult> | FollowUpActionResult;
}) {
  const [createState, submitCreate] = useActionState(
    async (_previousState: FollowUpActionResult | null, formData: FormData) =>
      createAction(formData),
    null
  );
  const [completeState, submitComplete] = useActionState(
    async (_previousState: FollowUpActionResult | null, formData: FormData) =>
      completeAction(formData),
    null
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Follow-ups
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Manage next actions
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Create and complete follow-ups for {schoolName}.
      </p>

      <form action={submitCreate} className="mt-6 space-y-4 border-b border-slate-100 pb-6">
        <input type="hidden" name="school_id" value={schoolId} />
        {createState && !createState.ok ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {createState.error}
          </p>
        ) : null}
        {createState?.ok ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Follow-up created.
          </p>
        ) : null}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Title</span>
          <input
            name="title"
            required
            maxLength={200}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Send pilot overview"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Due date</span>
            <input
              name="due_date"
              type="date"
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Owner</span>
            <input
              name="owner"
              maxLength={120}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
              placeholder="Optional assignee name"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            name="notes"
            maxLength={2000}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Context for the follow-up"
          />
        </label>
        <button className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
          Create follow-up
        </button>
      </form>

      <div className="mt-6 space-y-4">
        <p className="text-sm font-medium text-slate-700">Open follow-ups</p>
        {completeState && !completeState.ok ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {completeState.error}
          </p>
        ) : null}
        {completeState?.ok ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Follow-up marked complete.
          </p>
        ) : null}
        {openFollowUps.length ? (
          openFollowUps.map((followUp) => (
            <article
              key={followUp.id}
              className="rounded-2xl bg-slate-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{followUp.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Due {formatDueDate(followUp.due_date)}
                    {followUp.owner ? ` · ${followUp.owner}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {followUp.status}
                </span>
              </div>
              {followUp.notes ? (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {followUp.notes}
                </p>
              ) : null}
              <form action={submitComplete} className="mt-4">
                <input type="hidden" name="school_id" value={schoolId} />
                <input type="hidden" name="follow_up_id" value={followUp.id} />
                <button
                  type="submit"
                  className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Mark complete
                </button>
              </form>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No open follow-ups for this school yet.
          </p>
        )}
      </div>
    </section>
  );
}
