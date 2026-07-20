import { randomUUID } from "crypto";

import {
  flagsPossibleStudentPii,
  hashPayload,
  redactPersonalData,
  truncateText
} from "./normalizeFireflies";
import {
  DIGEST_MAX_CHARS,
  TRANSCRIPT_EXCERPT_MAX_CHARS,
  type MeetingImportDraft
} from "./types";

export function buildManualMeetingImportDraft(params: {
  organizationId: string;
  digestText: string;
  meetingTitle?: string | null;
  meetingDate?: string | null;
}): MeetingImportDraft | { error: string } {
  const raw = params.digestText.trim();
  if (!raw) {
    return { error: "Paste a meeting digest before submitting." };
  }

  const redacted = redactPersonalData(raw);
  const digest = truncateText(redacted, DIGEST_MAX_CHARS);
  const excerpt =
    redacted.length > DIGEST_MAX_CHARS
      ? truncateText(redacted, TRANSCRIPT_EXCERPT_MAX_CHARS)
      : null;

  const title =
    truncateText(params.meetingTitle?.trim() || null, 500) ||
    truncateText(redacted.split(/\n/)[0] ?? null, 120) ||
    "Pasted meeting digest";

  let meetingStartedAt: string | null = null;
  if (params.meetingDate?.trim()) {
    const parsed = new Date(params.meetingDate.trim());
    if (!Number.isNaN(parsed.getTime())) {
      meetingStartedAt = parsed.toISOString();
    }
  }

  const meetingId = `manual-${randomUUID()}`;

  return {
    provider: "manual",
    provider_meeting_id: meetingId,
    organization_id: params.organizationId,
    meeting_title: title,
    meeting_started_at: meetingStartedAt,
    meeting_ended_at: null,
    participants: [],
    digest_text: digest,
    transcript_excerpt: excerpt,
    source_url: null,
    payload_hash: hashPayload({
      meetingId,
      title,
      digestLength: redacted.length,
      pii: flagsPossibleStudentPii(redacted)
    })
  };
}
