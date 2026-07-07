"use client";

import type { CreateProspectGenerationJobResult } from "@/lib/actions/prospectGeneration";
import {
  PROSPECT_SCHOOL_TYPE_LABELS,
  PROSPECT_SCHOOL_TYPES,
  type ProspectSchoolType
} from "@/lib/prospectGeneration";
import { useActionState } from "react";

const defaultSchoolTypes: ProspectSchoolType[] = [
  "hbcu",
  "cae",
  "state_university"
];

export default function ProspectGenerationForm({
  createAction,
  canEnqueue
}: {
  createAction: (formData: FormData) => Promise<CreateProspectGenerationJobResult>;
  canEnqueue: boolean;
}) {
  const [state, submit, isPending] = useActionState(
    async (_previousState: CreateProspectGenerationJobResult | null, formData: FormData) =>
      createAction(formData),
    null
  );

  if (!canEnqueue) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Generate prospects</h2>
        <p className="mt-2 text-sm text-slate-600">
          You have read-only access. Contact an admin to enqueue prospect generation jobs.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-950">Generate prospects</h2>
        <p className="text-sm text-slate-600">
          Define your ideal customer profile. Jobs are queued for background processing — no AI or
          external calls are made from this form.
        </p>
      </div>

      <form action={submit} className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Geography</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-950"
            name="geography"
            placeholder="e.g. Southeast US, Texas, DC metro"
            required
            type="text"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">School types</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PROSPECT_SCHOOL_TYPES.map((schoolType) => (
              <label
                key={schoolType}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <input
                  defaultChecked={defaultSchoolTypes.includes(schoolType)}
                  name="school_types"
                  type="checkbox"
                  value={schoolType}
                />
                {PROSPECT_SCHOOL_TYPE_LABELS[schoolType]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Keywords</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-950"
            name="keywords"
            placeholder="e.g. cybersecurity, workforce development, information assurance"
            type="text"
          />
        </label>

        <label className="block max-w-xs">
          <span className="text-sm font-medium text-slate-700">Maximum results</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-950"
            defaultValue={25}
            max={100}
            min={1}
            name="max_results"
            required
            type="number"
          />
        </label>

        <button
          className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Queueing job..." : "Queue prospect generation"}
        </button>
      </form>

      {state && !state.ok ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      ) : null}

      {state?.ok ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          Job queued. It will appear in job history below once processing begins.
        </p>
      ) : null}
    </section>
  );
}
