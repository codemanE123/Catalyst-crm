"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { buildManualMeetingImportDraft } from "@/lib/meetingImports/buildManualDraft";
import { resolveMeetingImportConfig } from "@/lib/meetingImports/config";
import {
  canUseLlmMeetingParse,
  parseMeetingDigestWithLlm
} from "@/lib/meetingImports/llmParse";
import {
  parseMeetingDigestHeuristic,
  validateMeetingParseOutput,
  type MeetingParseOutput
} from "@/lib/meetingImports/parseDigest";
import {
  getMeetingImportById,
  upsertMeetingImportFromDraft
} from "@/lib/meetingImports/service";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type MeetingImportActionResult =
  | {
      ok: true;
      interviewId?: string;
      importId?: string;
      message: string;
      parseMethod?: "heuristic" | "llm";
    }
  | { ok: false; error: string };

async function requireWriterContext(organizationId: string) {
  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false as const,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();
  if (!user) {
    return { ok: false as const, error: "Sign in to review meeting imports." };
  }

  const membership = await requireRole(user, MUTATION_ROLES, organizationId);
  if (!membership) {
    return {
      ok: false as const,
      error: "You do not have permission to review meeting imports."
    };
  }

  const ownership = await getRecordOwnershipFields();
  if (!ownership || ownership.organization_id !== organizationId) {
    return {
      ok: false as const,
      error: "You do not have permission to review meeting imports."
    };
  }

  return { ok: true as const, supabase, user, ownership };
}

export async function createManualMeetingImport(input: {
  digestText: string;
  meetingTitle?: string;
  meetingDate?: string;
  schoolId?: string;
}): Promise<MeetingImportActionResult> {
  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    return { ok: false, error: "Sign in to paste meeting digests." };
  }

  const context = await requireWriterContext(ownership.organization_id);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const schoolId = input.schoolId?.trim() || null;
  if (schoolId) {
    const { data: school } = await context.supabase
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .eq("organization_id", ownership.organization_id)
      .maybeSingle();

    if (!school) {
      return { ok: false, error: "Select a valid school in your organization." };
    }
  }

  const draft = buildManualMeetingImportDraft({
    organizationId: ownership.organization_id,
    digestText: input.digestText,
    meetingTitle: input.meetingTitle,
    meetingDate: input.meetingDate
  });

  if ("error" in draft) {
    return { ok: false, error: draft.error };
  }

  // Ensure uniqueness even if UUID generation is mocked in tests.
  draft.provider_meeting_id =
    draft.provider_meeting_id || `manual-${randomUUID()}`;

  const saved = await upsertMeetingImportFromDraft({
    supabase: context.supabase,
    draft,
    schoolIdOverride: schoolId
  });

  if (!saved.ok) {
    return { ok: false, error: saved.error };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organization_id,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.meetingImportReceived,
    targetTable: "meeting_imports",
    recordId: saved.record.id,
    metadata: {
      provider: "manual",
      school_id: schoolId,
      match_status: saved.record.match_status
    }
  });

  revalidatePath("/meeting-imports");
  if (schoolId) {
    revalidatePath(`/schools/${schoolId}`);
  }

  return {
    ok: true,
    importId: saved.record.id,
    message: schoolId
      ? "Digest staged for review. Accept it to add discovery interview notes."
      : "Digest staged for review. Link a school, then Accept to add CRM notes."
  };
}

export async function parseMeetingImport(
  importId: string
): Promise<MeetingImportActionResult> {
  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    return { ok: false, error: "Sign in to parse meeting imports." };
  }

  const context = await requireWriterContext(ownership.organization_id);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const record = await getMeetingImportById({
    supabase: context.supabase,
    organizationId: ownership.organization_id,
    importId
  });

  if (!record || record.review_status !== "pending_review") {
    return { ok: false, error: "Pending meeting import not found." };
  }

  const sourceText =
    `${record.digest_text ?? ""}\n\n${record.transcript_excerpt ?? ""}`.trim();
  if (!sourceText) {
    return { ok: false, error: "This import has no digest text to parse." };
  }

  let parsed: MeetingParseOutput;
  let parseMethod: "heuristic" | "llm" = "heuristic";

  if (canUseLlmMeetingParse()) {
    const llm = await parseMeetingDigestWithLlm({
      digestText: sourceText,
      meetingTitle: record.meeting_title
    });
    if (llm.ok) {
      parsed = llm.data;
      parseMethod = "llm";
    } else {
      parsed = parseMeetingDigestHeuristic({
        digestText: record.digest_text,
        transcriptExcerpt: record.transcript_excerpt,
        meetingTitle: record.meeting_title,
        meetingStartedAt: record.meeting_started_at
      });
    }
  } else {
    parsed = parseMeetingDigestHeuristic({
      digestText: record.digest_text,
      transcriptExcerpt: record.transcript_excerpt,
      meetingTitle: record.meeting_title,
      meetingStartedAt: record.meeting_started_at
    });
  }

  const pii =
    parsed.possible_student_pii ||
    record.error_code === "possible_student_pii";

  const { error } = await context.supabase
    .from("meeting_imports")
    .update({
      parsed_json: parsed,
      parsed_at: new Date().toISOString(),
      parsed_by: context.user.id,
      parse_method: parseMethod,
      meeting_title: parsed.meeting_title || record.meeting_title,
      error_code: pii ? "possible_student_pii" : record.error_code,
      error_message: pii
        ? "Possible student/education-record language detected. Review carefully before accept."
        : record.error_message
    })
    .eq("id", importId)
    .eq("organization_id", ownership.organization_id);

  if (error) {
    return { ok: false, error: "Could not save parsed meeting fields." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organization_id,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.meetingImportParsed,
    targetTable: "meeting_imports",
    recordId: importId,
    metadata: {
      parse_method: parseMethod,
      contact_count: parsed.contacts.length,
      action_item_count: parsed.action_items.length
    }
  });

  revalidatePath("/meeting-imports");
  if (record.school_id) {
    revalidatePath(`/schools/${record.school_id}`);
  }

  return {
    ok: true,
    importId,
    parseMethod,
    message:
      parseMethod === "llm"
        ? "Digest parsed with AI. Review the fields, then Accept."
        : "Digest parsed with local rules. Review the fields, then Accept."
  };
}

export async function linkMeetingImportToSchool(
  importId: string,
  schoolId: string
): Promise<MeetingImportActionResult> {
  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    return { ok: false, error: "Sign in to link meeting imports." };
  }

  const context = await requireWriterContext(ownership.organization_id);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const record = await getMeetingImportById({
    supabase: context.supabase,
    organizationId: ownership.organization_id,
    importId
  });

  if (!record || record.review_status !== "pending_review") {
    return { ok: false, error: "Pending meeting import not found." };
  }

  const { data: school } = await context.supabase
    .from("schools")
    .select("id,name")
    .eq("id", schoolId)
    .eq("organization_id", ownership.organization_id)
    .maybeSingle();

  if (!school) {
    return { ok: false, error: "Select a valid school in your organization." };
  }

  const { error } = await context.supabase
    .from("meeting_imports")
    .update({
      school_id: schoolId,
      match_status: "linked",
      match_confidence: 1
    })
    .eq("id", importId)
    .eq("organization_id", ownership.organization_id);

  if (error) {
    return { ok: false, error: "Could not link meeting import to school." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organization_id,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.meetingImportLinked,
    targetTable: "meeting_imports",
    recordId: importId,
    metadata: { school_id: schoolId }
  });

  revalidatePath("/meeting-imports");
  revalidatePath(`/schools/${schoolId}`);

  return { ok: true, message: `Linked to ${school.name}.` };
}

export async function rejectMeetingImport(
  importId: string
): Promise<MeetingImportActionResult> {
  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    return { ok: false, error: "Sign in to reject meeting imports." };
  }

  const context = await requireWriterContext(ownership.organization_id);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const record = await getMeetingImportById({
    supabase: context.supabase,
    organizationId: ownership.organization_id,
    importId
  });

  if (!record || record.review_status !== "pending_review") {
    return { ok: false, error: "Pending meeting import not found." };
  }

  const { error } = await context.supabase
    .from("meeting_imports")
    .update({
      review_status: "rejected",
      reviewed_by: context.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", importId)
    .eq("organization_id", ownership.organization_id);

  if (error) {
    return { ok: false, error: "Could not reject meeting import." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organization_id,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.meetingImportRejected,
    targetTable: "meeting_imports",
    recordId: importId,
    metadata: { provider: "fireflies" }
  });

  revalidatePath("/meeting-imports");
  if (record.school_id) {
    revalidatePath(`/schools/${record.school_id}`);
  }

  return { ok: true, message: "Meeting import rejected." };
}

export async function acceptMeetingImport(
  importId: string
): Promise<MeetingImportActionResult> {
  const config = resolveMeetingImportConfig();
  const ownership = await getRecordOwnershipFields();
  if (!ownership) {
    return { ok: false, error: "Sign in to accept meeting imports." };
  }

  const context = await requireWriterContext(ownership.organization_id);
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const record = await getMeetingImportById({
    supabase: context.supabase,
    organizationId: ownership.organization_id,
    importId
  });

  if (!record || record.review_status !== "pending_review") {
    return { ok: false, error: "Pending meeting import not found." };
  }

  if (!record.school_id) {
    return {
      ok: false,
      error: "Link this import to a school before accepting."
    };
  }

  if (config.requireReview === false) {
    // Still require explicit accept action; flag only controls future auto paths.
  }

  const validatedParse = record.parsed_json
    ? validateMeetingParseOutput(record.parsed_json)
    : null;
  const parsed =
    validatedParse && validatedParse.success ? validatedParse.data : null;

  const interviewDate =
    (parsed?.meeting_date && /^\d{4}-\d{2}-\d{2}/.test(parsed.meeting_date)
      ? parsed.meeting_date.slice(0, 10)
      : null) ||
    (record.meeting_started_at
      ? record.meeting_started_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10));

  const providerLabel =
    record.provider === "manual" ? "Pasted meeting" : "Fireflies";
  const discovery = parsed?.discovery ?? {};
  const digest =
    parsed?.summary?.trim() ||
    record.digest_text?.trim() ||
    record.meeting_title?.trim() ||
    `${providerLabel} digest`;

  const sentiment = discovery.sentiment ?? "Warm";
  const pilotInterest = discovery.pilot_interest ?? "Medium";
  const nextStep =
    discovery.next_step?.trim() ||
    parsed?.action_items?.[0]?.title ||
    "Review imported digest and set next step.";

  const { data: interview, error: interviewError } = await context.supabase
    .from("interviews")
    .insert({
      school_id: record.school_id,
      interviewer: `${providerLabel} import`,
      interview_date: interviewDate,
      sentiment,
      notes: digest.slice(0, 5000),
      follow_up: nextStep.slice(0, 500),
      raw_notes: record.transcript_excerpt,
      pain_points: discovery.pain_points ?? null,
      current_tools: discovery.current_tools ?? null,
      buyer: discovery.buyer ?? null,
      budget: discovery.budget ?? null,
      budget_owner: discovery.budget_owner ?? null,
      objections: discovery.objections ?? null,
      referrals: discovery.referrals ?? null,
      next_step: nextStep.slice(0, 500),
      pilot_interest: pilotInterest,
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by
    })
    .select("id")
    .single();

  if (interviewError || !interview) {
    return { ok: false, error: "Could not create interview from meeting import." };
  }

  // Optional Meeting outreach row — interview is source of truth if this fails.
  await context.supabase.from("outreach").insert({
    school_id: record.school_id,
    channel: "Meeting",
    subject:
      parsed?.outreach?.subject ||
      parsed?.meeting_title ||
      record.meeting_title ||
      `${providerLabel} meeting`,
    outcome: parsed?.outreach?.outcome || "Completed",
    outreach_date: interviewDate,
    owner: `${providerLabel} import`,
    next_step: nextStep.slice(0, 500),
    organization_id: ownership.organization_id,
    created_by: ownership.created_by,
    updated_by: ownership.updated_by
  });

  for (const item of (parsed?.action_items ?? []).slice(0, 5)) {
    await context.supabase.from("follow_ups").insert({
      school_id: record.school_id,
      title: item.title.slice(0, 200),
      due_date:
        item.due_date && /^\d{4}-\d{2}-\d{2}/.test(item.due_date)
          ? item.due_date.slice(0, 10)
          : null,
      notes: item.owner ? `Owner hint: ${item.owner}` : null,
      owner: item.owner || `${providerLabel} import`,
      status: "Open",
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by
    });
  }

  for (const contact of (parsed?.contacts ?? []).slice(0, 5)) {
    if (!contact.name?.trim() || !contact.email?.trim()) {
      continue;
    }
    await context.supabase.from("contacts").insert({
      school_id: record.school_id,
      partner_id: null,
      name: contact.name.slice(0, 120),
      role: (contact.role || "Meeting contact").slice(0, 120),
      email: contact.email.slice(0, 254),
      phone: contact.phone ?? null,
      linkedin_url: contact.linkedin ?? null,
      notes: "Created from meeting import parse.",
      relationship: "New",
      last_touch: interviewDate,
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by
    });
  }

  const { error: updateError } = await context.supabase
    .from("meeting_imports")
    .update({
      review_status: "accepted",
      interview_id: interview.id,
      match_status: "linked",
      reviewed_by: context.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", importId)
    .eq("organization_id", ownership.organization_id);

  if (updateError) {
    return {
      ok: false,
      error: "Interview created but import status could not be updated."
    };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organization_id,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.meetingImportAccepted,
    targetTable: "meeting_imports",
    recordId: importId,
    metadata: {
      interview_id: interview.id,
      school_id: record.school_id,
      provider: record.provider
    }
  });

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organization_id,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.interviewCreate,
    targetTable: "interviews",
    recordId: interview.id,
    metadata: {
      school_id: record.school_id,
      interview_date: interviewDate,
      source: `${record.provider}_import`
    }
  });

  revalidatePath("/meeting-imports");
  revalidatePath(`/schools/${record.school_id}`);
  revalidatePath(`/schools/${record.school_id}?tab=discovery`);
  revalidatePath(`/schools/${record.school_id}?tab=activity`);

  return {
    ok: true,
    interviewId: interview.id,
    message: "Meeting import accepted into discovery interview notes."
  };
}
