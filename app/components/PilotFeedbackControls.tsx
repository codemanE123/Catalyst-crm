"use client";

import {
  PILOT_FEEDBACK_CATEGORY_CONTROLS,
  SAVED_TIME_ESTIMATE_OPTIONS_MINUTES
} from "@/lib/agents/evaluation/pilotFeedback";
import { useId, useState } from "react";

export type PilotFeedbackSelection = {
  categories: string[];
  usefulnessScore: number | null;
  savedTimeMinutes: number | null;
};

export default function PilotFeedbackControls({
  disabled,
  value,
  onChange
}: {
  disabled?: boolean;
  value: PilotFeedbackSelection;
  onChange: (next: PilotFeedbackSelection) => void;
}) {
  const baseId = useId();

  function toggleCategory(category: string) {
    const next = value.categories.includes(category)
      ? value.categories.filter((entry) => entry !== category)
      : [...value.categories, category];
    onChange({ ...value, categories: next });
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pilot feedback
      </p>
      <p className="text-xs text-slate-600">
        Structured tags only — do not enter private notes, emails, or student data.
      </p>

      <div className="flex flex-wrap gap-2">
        {PILOT_FEEDBACK_CATEGORY_CONTROLS.map((control) => {
          const active = value.categories.includes(control.category);
          return (
            <button
              key={control.id}
              className={
                active
                  ? "rounded-full bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              }
              disabled={disabled}
              onClick={() => toggleCategory(control.category)}
              type="button"
            >
              {control.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="text-xs text-slate-600" htmlFor={`${baseId}-useful`}>
          Usefulness (1–5)
          <select
            className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1"
            disabled={disabled}
            id={`${baseId}-useful`}
            onChange={(event) =>
              onChange({
                ...value,
                usefulnessScore: event.target.value
                  ? Number(event.target.value)
                  : null
              })
            }
            value={value.usefulnessScore ?? ""}
          >
            <option value="">Skip</option>
            <option value="5">5</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1</option>
          </select>
        </label>

        <label className="text-xs text-slate-600" htmlFor={`${baseId}-time`}>
          Time saved
          <select
            className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1"
            disabled={disabled}
            id={`${baseId}-time`}
            onChange={(event) =>
              onChange({
                ...value,
                savedTimeMinutes: event.target.value
                  ? Number(event.target.value)
                  : null
              })
            }
            value={value.savedTimeMinutes ?? ""}
          >
            <option value="">Skip</option>
            {SAVED_TIME_ESTIMATE_OPTIONS_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? "None" : `${minutes} min`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function usePilotFeedbackSelection(): [
  PilotFeedbackSelection,
  (next: PilotFeedbackSelection) => void,
  () => PilotFeedbackSelection
] {
  const [value, setValue] = useState<PilotFeedbackSelection>({
    categories: [],
    usefulnessScore: null,
    savedTimeMinutes: null
  });

  return [value, setValue, () => value];
}
