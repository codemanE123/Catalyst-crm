"use client";

import type { School } from "@/lib/supabase";
import type { SchoolActionResult } from "@/lib/validation";
import { useActionState, useState } from "react";

const statusOptions = [
  "Prospect",
  "Contacted",
  "Interviewing",
  "Partner"
] as const;

export default function SchoolForm({
  schools,
  createAction,
  updateAction
}: {
  schools: School[];
  createAction: (
    formData: FormData
  ) => Promise<SchoolActionResult> | SchoolActionResult;
  updateAction: (
    formData: FormData
  ) => Promise<SchoolActionResult> | SchoolActionResult;
}) {
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const selectedSchool = schools.find((school) => school.id === selectedSchoolId);

  const [createState, submitCreate] = useActionState(
    async (_previousState: SchoolActionResult | null, formData: FormData) =>
      createAction(formData),
    null
  );
  const [updateState, submitUpdate] = useActionState(
    async (_previousState: SchoolActionResult | null, formData: FormData) =>
      updateAction(formData),
    null
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        School management
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Add and update target schools
      </h2>

      <div className="mt-8 space-y-8">
        <form action={submitCreate} className="space-y-4 border-b border-slate-100 pb-8">
          <h3 className="text-lg font-semibold text-slate-950">Create school</h3>
          {createState && !createState.ok ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {createState.error}
            </p>
          ) : null}
          {createState?.ok ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              School created.
            </p>
          ) : null}
          <SchoolFields />
          <button className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
            Create school
          </button>
        </form>

        <form
          key={selectedSchoolId || "update-school"}
          action={submitUpdate}
          className="space-y-4"
        >
          <h3 className="text-lg font-semibold text-slate-950">Update school</h3>
          {updateState && !updateState.ok ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {updateState.error}
            </p>
          ) : null}
          {updateState?.ok ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              School updated.
            </p>
          ) : null}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">School</span>
            <select
              name="school_id"
              required
              value={selectedSchoolId}
              onChange={(event) => setSelectedSchoolId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            >
              <option value="" disabled>
                Select school
              </option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>
          {selectedSchool ? (
            <SchoolFields
              defaults={{
                name: selectedSchool.name,
                website: selectedSchool.website ?? "",
                status: selectedSchool.status,
                owner: selectedSchool.owner,
                next_step: selectedSchool.next_step,
                notes: selectedSchool.notes ?? ""
              }}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Select a school to edit its pipeline fields.
            </p>
          )}
          <button
            className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            type="submit"
            disabled={!selectedSchool}
          >
            Update school
          </button>
        </form>
      </div>
    </section>
  );
}

function SchoolFields({
  defaults
}: {
  defaults?: {
    name: string;
    website: string;
    status: School["status"];
    owner: string;
    next_step: string;
    notes: string;
  };
}) {
  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Name</span>
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={defaults?.name}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="Oakwood University"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Website</span>
        <input
          name="website"
          maxLength={500}
          defaultValue={defaults?.website}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="https://www.example.edu"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <select
            name="status"
            required
            defaultValue={defaults?.status ?? "Prospect"}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Owner</span>
          <input
            name="owner"
            required
            maxLength={120}
            defaultValue={defaults?.owner}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
            placeholder="Account owner"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Next step</span>
        <input
          name="next_step"
          required
          maxLength={500}
          defaultValue={defaults?.next_step}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="Schedule discovery call"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Notes</span>
        <textarea
          name="notes"
          maxLength={5000}
          rows={3}
          defaultValue={defaults?.notes}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-cyan-500 transition focus:ring-2"
          placeholder="Account context"
        />
      </label>
      <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="assign_to_me"
          className="h-4 w-4 rounded border-slate-300"
        />
        Assign to me
      </label>
    </>
  );
}
