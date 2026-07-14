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

const fieldClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none ring-blue-500 transition placeholder:text-slate-500 focus:ring-2";

export default function SchoolForm({
  schools,
  createAction,
  updateAction,
  mode = "full",
  fixedSchoolId
}: {
  schools: School[];
  createAction: (
    formData: FormData
  ) => Promise<SchoolActionResult> | SchoolActionResult;
  updateAction?: (
    formData: FormData
  ) => Promise<SchoolActionResult> | SchoolActionResult;
  mode?: "create" | "update" | "full";
  fixedSchoolId?: string;
}) {
  const [selectedSchoolId, setSelectedSchoolId] = useState(fixedSchoolId ?? "");
  const selectedSchool = schools.find((school) => school.id === selectedSchoolId);

  const [createState, submitCreate] = useActionState(
    async (_previousState: SchoolActionResult | null, formData: FormData) =>
      createAction(formData),
    null
  );
  const [updateState, submitUpdate] = useActionState(
    async (_previousState: SchoolActionResult | null, formData: FormData) =>
      updateAction
        ? updateAction(formData)
        : { ok: false, error: "Update unavailable." },
    null
  );

  const showCreate = mode === "create" || mode === "full";
  const showUpdate = (mode === "update" || mode === "full") && Boolean(updateAction);

  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--app-panel)] p-6 shadow-sm">
      {mode === "full" ? (
        <>
          <p className="text-sm font-semibold text-slate-400">School management</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">
            Add and update target schools
          </h2>
        </>
      ) : mode === "create" ? (
        <>
          <h2 className="text-xl font-semibold text-white">Create school</h2>
          <p className="mt-2 text-sm text-slate-400">
            Add a target account to your organization pipeline.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-white">Edit school</h2>
          <p className="mt-2 text-sm text-slate-400">
            Update pipeline fields for this account.
          </p>
        </>
      )}

      <div className="mt-8 space-y-8">
        {showCreate ? (
          <form
            action={submitCreate}
            className={`space-y-4 ${showUpdate ? "border-b border-white/10 pb-8" : ""}`}
          >
            {mode === "full" ? (
              <h3 className="text-lg font-semibold text-white">Create school</h3>
            ) : null}
            {createState && !createState.ok ? (
              <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-500/30">
                {createState.error}
              </p>
            ) : null}
            {createState?.ok ? (
              <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-500/30">
                School created.
              </p>
            ) : null}
            <SchoolFields />
            <button className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
              Create school
            </button>
          </form>
        ) : null}

        {showUpdate ? (
          <form
            key={selectedSchoolId || "update-school"}
            action={submitUpdate}
            className="space-y-4"
          >
            {mode === "full" ? (
              <h3 className="text-lg font-semibold text-white">Update school</h3>
            ) : null}
            {updateState && !updateState.ok ? (
              <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-500/30">
                {updateState.error}
              </p>
            ) : null}
            {updateState?.ok ? (
              <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-500/30">
                School updated.
              </p>
            ) : null}

            {fixedSchoolId ? (
              <input type="hidden" name="school_id" value={fixedSchoolId} />
            ) : (
              <label className="block">
                <span className="text-sm font-medium text-slate-300">School</span>
                <select
                  name="school_id"
                  required
                  value={selectedSchoolId}
                  onChange={(event) => setSelectedSchoolId(event.target.value)}
                  className={fieldClass}
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
            )}

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
              <p className="text-sm text-slate-400">
                Select a school to edit its pipeline fields.
              </p>
            )}
            <button
              className="w-full rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              type="submit"
              disabled={!selectedSchool}
            >
              Update school
            </button>
          </form>
        ) : null}
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
        <span className="text-sm font-medium text-slate-300">Name</span>
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={defaults?.name}
          className={fieldClass}
          placeholder="Oakwood University"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-300">Website</span>
        <input
          name="website"
          maxLength={500}
          defaultValue={defaults?.website}
          className={fieldClass}
          placeholder="https://www.example.edu"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-300">Status</span>
          <select
            name="status"
            required
            defaultValue={defaults?.status ?? "Prospect"}
            className={fieldClass}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-300">Owner</span>
          <input
            name="owner"
            required
            maxLength={120}
            defaultValue={defaults?.owner}
            className={fieldClass}
            placeholder="Account owner"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-300">Next step</span>
        <input
          name="next_step"
          required
          maxLength={500}
          defaultValue={defaults?.next_step}
          className={fieldClass}
          placeholder="Schedule discovery call"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-300">Notes</span>
        <textarea
          name="notes"
          maxLength={5000}
          rows={3}
          defaultValue={defaults?.notes}
          className={fieldClass}
          placeholder="Account context"
        />
      </label>
      <label className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm text-slate-300">
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
