import type { SupabaseClient } from "@supabase/supabase-js";

import type { MeetingImportMatchStatus, MeetingImportParticipant } from "./types";

function extractDomain(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("@")) {
    const domain = trimmed.split("@")[1]?.trim() ?? null;
    return domain || null;
  }
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function registrableHint(hostname: string): string {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return hostname;
  }
  if (hostname.endsWith(".edu") || hostname.endsWith(".gov")) {
    return parts.slice(-2).join(".");
  }
  return parts.slice(-2).join(".");
}

export type SchoolMatchResult = {
  school_id: string | null;
  school_name: string | null;
  match_status: MeetingImportMatchStatus;
  match_confidence: number | null;
};

/**
 * Deterministic school matching: email domain ↔ school website domain,
 * then exact title contains school name.
 */
export async function matchSchoolForMeetingImport(params: {
  supabase: SupabaseClient;
  organizationId: string;
  participants: MeetingImportParticipant[];
  meetingTitle: string | null;
}): Promise<SchoolMatchResult> {
  const { data: schools, error } = await params.supabase
    .from("schools")
    .select("id,name,website")
    .eq("organization_id", params.organizationId);

  if (error || !schools || schools.length === 0) {
    return {
      school_id: null,
      school_name: null,
      match_status: "unmatched",
      match_confidence: null
    };
  }

  const participantDomains = new Set(
    params.participants
      .map((p) => extractDomain(p.email ?? null))
      .filter((d): d is string => Boolean(d))
      .map((d) => registrableHint(d))
  );

  for (const school of schools) {
    const siteDomain = extractDomain(
      (school as { website?: string | null }).website
    );
    if (!siteDomain) {
      continue;
    }
    const hint = registrableHint(siteDomain);
    if (participantDomains.has(hint) || participantDomains.has(siteDomain)) {
      return {
        school_id: String((school as { id: string }).id),
        school_name: String((school as { name: string }).name),
        match_status: "suggested",
        match_confidence: 0.85
      };
    }
  }

  const title = (params.meetingTitle ?? "").toLowerCase();
  if (title) {
    for (const school of schools) {
      const name = String((school as { name: string }).name).toLowerCase();
      if (name.length >= 5 && title.includes(name)) {
        return {
          school_id: String((school as { id: string }).id),
          school_name: String((school as { name: string }).name),
          match_status: "suggested",
          match_confidence: 0.7
        };
      }
    }
  }

  return {
    school_id: null,
    school_name: null,
    match_status: "unmatched",
    match_confidence: null
  };
}
