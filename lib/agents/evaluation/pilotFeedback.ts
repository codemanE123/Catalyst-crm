import {
  FEEDBACK_CATEGORIES,
  type AgentEvaluationOutcome,
  type FeedbackCategory
} from "./types";

/**
 * User-facing pilot feedback controls (Phase 5.6).
 * Stored as structured enums/numerics only — no private narrative required.
 */
export const PILOT_FEEDBACK_OUTCOME_CONTROLS = [
  {
    id: "accepted_as_is",
    label: "Accepted as-is",
    outcome: "accepted" as const
  },
  {
    id: "accepted_with_edits",
    label: "Accepted with edits",
    outcome: "approved_with_edits" as const
  },
  {
    id: "rejected",
    label: "Rejected",
    outcome: "rejected" as const
  }
] as const;

export const PILOT_FEEDBACK_CATEGORY_CONTROLS = [
  {
    id: "not_relevant",
    label: "Not relevant",
    category: "not_relevant" as const
  },
  {
    id: "incorrect",
    label: "Incorrect",
    category: "incorrect_facts" as const
  },
  {
    id: "weak_sources",
    label: "Weak sources",
    category: "weak_sources" as const
  },
  {
    id: "useful",
    label: "Useful",
    category: "useful" as const
  }
] as const;

export const SAVED_TIME_ESTIMATE_OPTIONS_MINUTES = [
  0, 5, 15, 30, 60, 90, 120
] as const;

export type PilotFeedbackOutcomeControlId =
  (typeof PILOT_FEEDBACK_OUTCOME_CONTROLS)[number]["id"];

export type PilotFeedbackPayload = {
  outcome: AgentEvaluationOutcome;
  feedbackCategories: FeedbackCategory[];
  usefulnessScore: number | null;
  savedTimeMinutes: number | null;
};

/** Clamp saved-time to a short discrete estimate (minutes). */
export function normalizeSavedTimeMinutes(
  value: unknown
): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.min(480, Math.max(0, Math.round(parsed)));
}

export function resolveOutcomeFromPilotControl(
  controlId: string | null | undefined
): AgentEvaluationOutcome | null {
  const match = PILOT_FEEDBACK_OUTCOME_CONTROLS.find(
    (control) => control.id === controlId
  );
  return match?.outcome ?? null;
}

export function sanitizePilotFeedbackCategories(
  categories: string[] | null | undefined
): FeedbackCategory[] {
  if (!categories?.length) {
    return [];
  }

  const allowed = new Set<string>(FEEDBACK_CATEGORIES);
  const unique = new Set<FeedbackCategory>();

  for (const raw of categories) {
    if (raw === "not_relevant" && allowed.has("not_relevant")) {
      unique.add("not_relevant");
      continue;
    }
    if (raw === "incorrect") {
      unique.add("incorrect_facts");
      continue;
    }
    if (allowed.has(raw)) {
      unique.add(raw as FeedbackCategory);
    }
  }

  return [...unique];
}

export function buildPilotFeedbackPayload(input: {
  outcomeControlId?: string | null;
  outcome?: AgentEvaluationOutcome | null;
  categories?: string[] | null;
  usefulnessScore?: number | null;
  savedTimeMinutes?: unknown;
}): PilotFeedbackPayload | { ok: false; error: string } {
  const outcome =
    input.outcome ??
    resolveOutcomeFromPilotControl(input.outcomeControlId ?? null);

  if (!outcome) {
    return { ok: false, error: "Select a feedback outcome." };
  }

  const usefulness =
    input.usefulnessScore != null && Number.isFinite(input.usefulnessScore)
      ? Math.min(5, Math.max(1, Math.round(input.usefulnessScore)))
      : null;

  return {
    outcome,
    feedbackCategories: sanitizePilotFeedbackCategories(input.categories),
    usefulnessScore: usefulness,
    savedTimeMinutes: normalizeSavedTimeMinutes(input.savedTimeMinutes)
  };
}
