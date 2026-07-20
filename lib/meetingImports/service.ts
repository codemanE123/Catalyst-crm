import type { SupabaseClient } from "@supabase/supabase-js";

import { matchSchoolForMeetingImport } from "./matchSchool";
import { flagsPossibleStudentPii } from "./normalizeFireflies";
import type { MeetingImportDraft, MeetingImportRecord } from "./types";

function relatedSchoolName(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    const first = value[0] as { name?: string } | undefined;
    return first?.name?.trim() || null;
  }
  if (typeof value === "object" && value !== null && "name" in value) {
    const name = (value as { name?: string }).name;
    return name?.trim() || null;
  }
  return null;
}

function mapRow(row: Record<string, unknown>): MeetingImportRecord {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    provider: "fireflies",
    provider_meeting_id: String(row.provider_meeting_id),
    school_id: (row.school_id as string | null) ?? null,
    contact_id: (row.contact_id as string | null) ?? null,
    interview_id: (row.interview_id as string | null) ?? null,
    meeting_title: (row.meeting_title as string | null) ?? null,
    meeting_started_at: (row.meeting_started_at as string | null) ?? null,
    meeting_ended_at: (row.meeting_ended_at as string | null) ?? null,
    participants_json: Array.isArray(row.participants_json)
      ? (row.participants_json as MeetingImportRecord["participants_json"])
      : [],
    digest_text: (row.digest_text as string | null) ?? null,
    transcript_excerpt: (row.transcript_excerpt as string | null) ?? null,
    source_url: (row.source_url as string | null) ?? null,
    match_status: row.match_status as MeetingImportRecord["match_status"],
    match_confidence:
      row.match_confidence == null ? null : Number(row.match_confidence),
    review_status: row.review_status as MeetingImportRecord["review_status"],
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    payload_hash: (row.payload_hash as string | null) ?? null,
    reviewed_by: (row.reviewed_by as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    school_name: relatedSchoolName(row.schools)
  };
}

export async function upsertMeetingImportFromDraft(params: {
  supabase: SupabaseClient;
  draft: MeetingImportDraft;
}): Promise<
  | { ok: true; record: MeetingImportRecord; created: boolean }
  | { ok: false; error: string }
> {
  const match = await matchSchoolForMeetingImport({
    supabase: params.supabase,
    organizationId: params.draft.organization_id,
    participants: params.draft.participants,
    meetingTitle: params.draft.meeting_title
  });

  const piiFlag = flagsPossibleStudentPii(
    `${params.draft.digest_text ?? ""}\n${params.draft.transcript_excerpt ?? ""}`
  );

  const row = {
    organization_id: params.draft.organization_id,
    provider: params.draft.provider,
    provider_meeting_id: params.draft.provider_meeting_id,
    school_id: match.school_id,
    meeting_title: params.draft.meeting_title,
    meeting_started_at: params.draft.meeting_started_at,
    meeting_ended_at: params.draft.meeting_ended_at,
    participants_json: params.draft.participants,
    digest_text: params.draft.digest_text,
    transcript_excerpt: params.draft.transcript_excerpt,
    source_url: params.draft.source_url,
    match_status: match.match_status,
    match_confidence: match.match_confidence,
    review_status: "pending_review" as const,
    error_code: piiFlag ? "possible_student_pii" : null,
    error_message: piiFlag
      ? "Possible student/education-record language detected. Human review required before accept."
      : null,
    payload_hash: params.draft.payload_hash,
    reviewed_by: null,
    reviewed_at: null,
    interview_id: null
  };

  const { data, error } = await params.supabase
    .from("meeting_imports")
    .upsert(row, {
      onConflict: "organization_id,provider,provider_meeting_id"
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not save meeting import." };
  }

  return {
    ok: true,
    record: mapRow(data as Record<string, unknown>),
    created: true
  };
}

export async function listPendingMeetingImports(params: {
  supabase: SupabaseClient;
  organizationId: string;
  schoolId?: string | null;
  limit?: number;
}): Promise<MeetingImportRecord[]> {
  let query = params.supabase
    .from("meeting_imports")
    .select("*, schools(name)")
    .eq("organization_id", params.organizationId)
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (params.schoolId) {
    query = query.eq("school_id", params.schoolId);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }
  return data.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getMeetingImportById(params: {
  supabase: SupabaseClient;
  organizationId: string;
  importId: string;
}): Promise<MeetingImportRecord | null> {
  const { data, error } = await params.supabase
    .from("meeting_imports")
    .select("*")
    .eq("id", params.importId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return mapRow(data as Record<string, unknown>);
}
