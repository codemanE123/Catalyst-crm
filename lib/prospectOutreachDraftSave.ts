export const PROSPECT_OUTREACH_DRAFT_TEMPLATE_OUTCOME = "Draft template (not sent)";
export const PROSPECT_OUTREACH_DRAFT_TEMPLATE_CHANNEL = "Email" as const;

const MIN_DRAFT_LENGTH = 20;
const MAX_DRAFT_LENGTH = 4000;

export function validateProspectOutreachDraftText(
  draftText: string
): { ok: true; draft: string } | { ok: false; error: string } {
  const draft = draftText.trim();

  if (!draft) {
    return { ok: false, error: "Enter an outreach draft before saving." };
  }

  if (draft.length < MIN_DRAFT_LENGTH) {
    return {
      ok: false,
      error: "Outreach draft is too short to save."
    };
  }

  if (draft.length > MAX_DRAFT_LENGTH) {
    return {
      ok: false,
      error: "Outreach draft must be 4000 characters or fewer."
    };
  }

  return { ok: true, draft };
}

export function parseOutreachDraftSubject(
  draftText: string,
  fallbackSubject: string
): string {
  const subjectMatch = draftText.match(/^Subject:\s*(.+)$/im);
  const parsed = subjectMatch?.[1]?.trim();

  if (!parsed) {
    return fallbackSubject.slice(0, 200);
  }

  return parsed.slice(0, 200);
}

export function buildProspectOutreachDraftNextStep(
  recommendedNextStep: string | null
): string {
  const trimmed = recommendedNextStep?.trim();

  if (trimmed) {
    return trimmed.slice(0, 500);
  }

  return "Review draft and send manually.";
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
