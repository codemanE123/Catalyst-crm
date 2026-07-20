import { createHash } from "crypto";

import {
  DIGEST_MAX_CHARS,
  TRANSCRIPT_EXCERPT_MAX_CHARS,
  type MeetingImportDraft,
  type MeetingImportParticipant
} from "./types";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const STUDENT_HINT_RE =
  /\b(student\s+id|ferpa|gpa\b|grades?\s+transcript|underage|minor\s+student)\b/i;

export function truncateText(value: string | null | undefined, max: number): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function redactPersonalData(text: string): string {
  return text.replace(EMAIL_RE, "[redacted-email]");
}

export function flagsPossibleStudentPii(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  return STUDENT_HINT_RE.test(text);
}

export function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function asParticipants(value: unknown): MeetingImportParticipant[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: MeetingImportParticipant[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      if (item.includes("@")) {
        out.push({ email: item.trim().toLowerCase(), name: null });
      } else {
        out.push({ name: item.trim(), email: null });
      }
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const email = asString(row.email)?.toLowerCase() ?? null;
    const name = asString(row.name) ?? asString(row.displayName) ?? null;
    if (email || name) {
      out.push({ email, name });
    }
  }
  return out.slice(0, 50);
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Fireflies often sends epoch ms or seconds
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

/**
 * Normalize Fireflies webhook / API payload into a MeetingImportDraft.
 * Accepts either a rich payload or a minimal { meetingId } shape.
 */
export function normalizeFirefliesPayload(params: {
  payload: unknown;
  organizationId: string;
  transcript?: {
    title?: string | null;
    date?: number | string | null;
    duration?: number | null;
    organizer_email?: string | null;
    participants?: unknown;
    summary?: { overview?: string | null; action_items?: string | null } | null;
    sentences?: Array<{ text?: string | null; speaker_name?: string | null }>;
    transcript_url?: string | null;
  } | null;
}): MeetingImportDraft | { error: string } {
  const root =
    params.payload && typeof params.payload === "object"
      ? (params.payload as Record<string, unknown>)
      : {};

  const meetingId =
    asString(root.meetingId) ||
    asString(root.meeting_id) ||
    asString(root.id) ||
    asString(params.transcript && (params.transcript as { id?: string }).id);

  if (!meetingId) {
    return { error: "Fireflies payload missing meetingId." };
  }

  const transcript = params.transcript ?? null;
  const title =
    asString(root.meetingTitle) ||
    asString(root.title) ||
    asString(transcript?.title) ||
    null;

  const startedAt =
    toIsoDate(root.date) ||
    toIsoDate(root.meeting_started_at) ||
    toIsoDate(transcript?.date) ||
    null;

  let endedAt: string | null = null;
  if (startedAt && typeof transcript?.duration === "number") {
    const startMs = Date.parse(startedAt);
    if (Number.isFinite(startMs)) {
      endedAt = new Date(startMs + transcript.duration * 1000).toISOString();
    }
  }

  const participants = asParticipants(
    root.participants ?? transcript?.participants ?? []
  );
  const organizer = asString(transcript?.organizer_email)?.toLowerCase();
  if (organizer && !participants.some((p) => p.email === organizer)) {
    participants.unshift({ email: organizer, name: null });
  }

  const overview =
    asString(transcript?.summary?.overview) ||
    asString(root.summary) ||
    asString(root.digest) ||
    null;
  const actionItems = asString(transcript?.summary?.action_items);
  const digestParts = [overview, actionItems ? `Action items:\n${actionItems}` : null]
    .filter(Boolean)
    .join("\n\n");

  let transcriptExcerpt: string | null = null;
  if (Array.isArray(transcript?.sentences) && transcript.sentences.length > 0) {
    transcriptExcerpt = transcript.sentences
      .slice(0, 200)
      .map((s) => {
        const speaker = asString(s.speaker_name) ?? "Speaker";
        const text = asString(s.text) ?? "";
        return `${speaker}: ${text}`;
      })
      .join("\n");
  } else {
    transcriptExcerpt =
      asString(root.transcript) || asString(root.transcript_text) || null;
  }

  const sourceUrl =
    asString(transcript?.transcript_url) ||
    asString(root.transcript_url) ||
    asString(root.source_url) ||
    (meetingId
      ? `https://app.fireflies.ai/view/${encodeURIComponent(meetingId)}`
      : null);

  const safeDigest = truncateText(
    redactPersonalData(digestParts || overview || title || "Fireflies meeting digest"),
    DIGEST_MAX_CHARS
  );
  const safeTranscript = truncateText(
    transcriptExcerpt ? redactPersonalData(transcriptExcerpt) : null,
    TRANSCRIPT_EXCERPT_MAX_CHARS
  );

  return {
    provider: "fireflies",
    provider_meeting_id: meetingId,
    organization_id: params.organizationId,
    meeting_title: truncateText(title, 500),
    meeting_started_at: startedAt,
    meeting_ended_at: endedAt,
    participants,
    digest_text: safeDigest,
    transcript_excerpt: safeTranscript,
    source_url: sourceUrl,
    payload_hash: hashPayload({
      meetingId,
      title,
      startedAt,
      participantCount: participants.length
    })
  };
}
