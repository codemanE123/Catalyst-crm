export const MEETING_IMPORT_PROVIDERS = ["fireflies", "manual"] as const;
export type MeetingImportProvider = (typeof MEETING_IMPORT_PROVIDERS)[number];

export const MEETING_IMPORT_MATCH_STATUSES = [
  "unmatched",
  "suggested",
  "linked"
] as const;
export type MeetingImportMatchStatus =
  (typeof MEETING_IMPORT_MATCH_STATUSES)[number];

export const MEETING_IMPORT_REVIEW_STATUSES = [
  "pending_review",
  "accepted",
  "rejected",
  "failed"
] as const;
export type MeetingImportReviewStatus =
  (typeof MEETING_IMPORT_REVIEW_STATUSES)[number];

export type MeetingImportParticipant = {
  name?: string | null;
  email?: string | null;
};

export type MeetingImportDraft = {
  provider: MeetingImportProvider;
  provider_meeting_id: string;
  organization_id: string;
  meeting_title: string | null;
  meeting_started_at: string | null;
  meeting_ended_at: string | null;
  participants: MeetingImportParticipant[];
  digest_text: string | null;
  transcript_excerpt: string | null;
  source_url: string | null;
  payload_hash: string | null;
};

export type MeetingImportRecord = {
  id: string;
  organization_id: string;
  provider: MeetingImportProvider;
  provider_meeting_id: string;
  school_id: string | null;
  contact_id: string | null;
  interview_id: string | null;
  meeting_title: string | null;
  meeting_started_at: string | null;
  meeting_ended_at: string | null;
  participants_json: MeetingImportParticipant[];
  digest_text: string | null;
  transcript_excerpt: string | null;
  source_url: string | null;
  match_status: MeetingImportMatchStatus;
  match_confidence: number | null;
  review_status: MeetingImportReviewStatus;
  error_code: string | null;
  error_message: string | null;
  payload_hash: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  school_name?: string | null;
};

export const DIGEST_MAX_CHARS = 5000;
export const TRANSCRIPT_EXCERPT_MAX_CHARS = 10000;
