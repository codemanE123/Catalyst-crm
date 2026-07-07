"use client";

import type {
  SchoolImportPreviewResult,
  SchoolImportResult
} from "@/lib/actions/schoolImport";
import type { SchoolImportPreview } from "@/lib/schoolImport";
import { SCHOOL_IMPORT_CSV_HEADERS } from "@/lib/schoolImport";
import { useActionState, useRef, useState, useTransition } from "react";

const statusStyles = {
  valid: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  invalid: "bg-red-100 text-red-800 ring-red-200",
  duplicate: "bg-amber-100 text-amber-800 ring-amber-200"
} as const;

export default function SchoolImport({
  previewAction,
  importAction
}: {
  previewAction: (formData: FormData) => Promise<SchoolImportPreviewResult>;
  importAction: (formData: FormData) => Promise<SchoolImportResult>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [assignToMe, setAssignToMe] = useState(true);
  const [preview, setPreview] = useState<SchoolImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewPending, startPreviewTransition] = useTransition();

  const [importState, submitImport, isImportPending] = useActionState(
    async (_previousState: SchoolImportResult | null, formData: FormData) =>
      importAction(formData),
    null
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setPreviewError(null);

    if (!file) {
      setCsvText("");
      setFileName("");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setPreviewError("Upload a .csv file.");
      setCsvText("");
      setFileName("");
      return;
    }

    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);

    startPreviewTransition(async () => {
      const formData = new FormData();
      formData.set("csv_text", text);

      if (assignToMe) {
        formData.set("assign_to_me", "on");
      }

      const result = await previewAction(formData);

      if (!result.ok) {
        setPreview(null);
        setPreviewError(result.error);
        return;
      }

      setPreview(result.preview);
      setPreviewError(null);
    });
  }

  function handleAssignToMeChange(checked: boolean) {
    setAssignToMe(checked);

    if (!csvText) {
      return;
    }

    startPreviewTransition(async () => {
      const formData = new FormData();
      formData.set("csv_text", csvText);

      if (checked) {
        formData.set("assign_to_me", "on");
      }

      const result = await previewAction(formData);

      if (!result.ok) {
        setPreview(null);
        setPreviewError(result.error);
        return;
      }

      setPreview(result.preview);
      setPreviewError(null);
    });
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        School import
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
        Import schools from CSV
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Upload a CSV file to preview rows, validate required fields, skip
        duplicates, and import valid schools. Use{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
          seed/schools-template.csv
        </code>{" "}
        as a starting point.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">CSV file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-2xl file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
          />
        </label>

        {fileName ? (
          <p className="text-sm text-slate-600">
            Selected file: <span className="font-medium">{fileName}</span>
          </p>
        ) : null}

        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={assignToMe}
            onChange={(event) => handleAssignToMeChange(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Assign imported schools to me
        </label>

        <p className="text-xs text-slate-500">
          Expected columns: {SCHOOL_IMPORT_CSV_HEADERS.join(", ")}. Required
          fields: organization_name, owner, next_step. Status defaults to
          Prospect when blank.
        </p>

        {previewError ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {previewError}
          </p>
        ) : null}

        {isPreviewPending ? (
          <p className="text-sm text-slate-500">Validating CSV rows…</p>
        ) : null}

        {preview ? (
          <PreviewPanel preview={preview} />
        ) : null}

        {preview && preview.summary.valid > 0 ? (
          <form action={submitImport} className="space-y-4">
            <input type="hidden" name="csv_text" value={csvText} />
            {assignToMe ? (
              <input type="hidden" name="assign_to_me" value="on" />
            ) : null}
            <button
              type="submit"
              disabled={isImportPending}
              className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {isImportPending
                ? "Importing schools…"
                : `Import ${preview.summary.valid} valid school${preview.summary.valid === 1 ? "" : "s"}`}
            </button>
          </form>
        ) : null}

        {importState && !importState.ok ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {importState.error}
          </p>
        ) : null}

        {importState?.ok ? (
          <ImportSummary result={importState} />
        ) : null}
      </div>
    </section>
  );
}

function PreviewPanel({ preview }: { preview: SchoolImportPreview }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="Total rows" value={preview.summary.total} />
        <SummaryCard label="Ready" value={preview.summary.valid} />
        <SummaryCard label="Invalid" value={preview.summary.invalid} />
        <SummaryCard label="Duplicates" value={preview.summary.duplicate} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Row</th>
              <th className="px-4 py-3 font-semibold">School</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Import</th>
              <th className="px-4 py-3 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {preview.rows.map((row) => (
              <PreviewRow key={row.rowNumber} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewRow({ row }: { row: import("@/lib/schoolImport").ParsedSchoolImportRow }) {
  const schoolName =
    row.school?.name ??
    row.raw.organization_name ??
    row.raw.name ??
    "(unnamed)";

  return (
    <tr className="align-top">
      <td className="px-4 py-4 text-slate-600">{row.rowNumber}</td>
      <td className="px-4 py-4">
        <p className="font-semibold text-slate-950">{schoolName}</p>
        {row.school?.owner ? (
          <p className="mt-1 text-xs text-slate-500">Owner: {row.school.owner}</p>
        ) : null}
      </td>
      <td className="px-4 py-4 text-slate-600">{row.location}</td>
      <td className="px-4 py-4">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          {row.school?.status ?? row.raw.status ?? "Prospect"}
        </span>
      </td>
      <td className="px-4 py-4">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[row.status]}`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-4 py-4 text-slate-600">
        {row.errors[0] ?? row.duplicateReason ?? "Ready to import"}
      </td>
    </tr>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ImportSummary({ result }: { result: Extract<SchoolImportResult, { ok: true }> }) {
  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div>
        <p className="text-sm font-semibold text-emerald-900">Import complete</p>
        <p className="mt-1 text-sm text-emerald-800">
          Imported {result.imported}, skipped {result.skipped}, failed{" "}
          {result.failed}.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Row</th>
              <th className="px-4 py-3 font-semibold">School</th>
              <th className="px-4 py-3 font-semibold">Outcome</th>
              <th className="px-4 py-3 font-semibold">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.details.map((detail) => (
              <tr key={`${detail.rowNumber}-${detail.name}-${detail.outcome}`}>
                <td className="px-4 py-3 text-slate-600">{detail.rowNumber}</td>
                <td className="px-4 py-3 font-medium text-slate-950">
                  {detail.name}
                </td>
                <td className="px-4 py-3 capitalize text-slate-700">
                  {detail.outcome}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {detail.message ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
