"use server";

import { revalidatePath } from "next/cache";

import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { executeMeetingPrep } from "@/lib/meetingPrep/execute";
import type { MeetingPrepBrief } from "@/lib/meetingPrep/types";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type MeetingPrepActionResult =
  | {
      ok: true;
      message: string;
      brief: MeetingPrepBrief;
    }
  | {
      ok: false;
      error: string;
    };

async function requireMeetingPrepContext() {
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
    return { ok: false as const, error: "Sign in to generate meeting prep." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false as const,
      error: "You do not have permission to generate meeting prep."
    };
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    ownership.organization_id
  );

  if (!membership) {
    return {
      ok: false as const,
      error: "You do not have permission to generate meeting prep."
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    organizationId: ownership.organization_id
  };
}

export async function runMeetingPrepForCandidate(
  candidateId: string
): Promise<MeetingPrepActionResult> {
  const context = await requireMeetingPrepContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const trimmedId = candidateId.trim();

  if (!trimmedId) {
    return { ok: false, error: "Candidate id is required." };
  }

  const result = await executeMeetingPrep({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    targetType: "prospect_candidate",
    targetId: trimmedId
  });

  if (!result.ok) {
    return { ok: false, error: result.error_message };
  }

  if (!result.brief) {
    return { ok: false, error: "Meeting prep brief was not saved." };
  }

  revalidatePath("/prospects/jobs");

  return {
    ok: true,
    message: "Meeting prep brief saved for human review.",
    brief: result.brief
  };
}

export async function runMeetingPrepForSchool(
  schoolId: string
): Promise<MeetingPrepActionResult> {
  const context = await requireMeetingPrepContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const trimmedId = schoolId.trim();

  if (!trimmedId) {
    return { ok: false, error: "School id is required." };
  }

  const result = await executeMeetingPrep({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    targetType: "school",
    targetId: trimmedId
  });

  if (!result.ok) {
    return { ok: false, error: result.error_message };
  }

  if (!result.brief) {
    return { ok: false, error: "Meeting prep brief was not saved." };
  }

  revalidatePath(`/schools/${trimmedId}`);

  return {
    ok: true,
    message: "Meeting prep brief saved for human review.",
    brief: result.brief
  };
}

export async function createMeetingPrepHandlerDependency(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>
) {
  return {
    runMeetingPrep: async (input: {
      organizationId: string;
      actorUserId: string;
      targetType: "prospect_candidate" | "school";
      targetId: string;
      agentExecutionId?: string | null;
    }) =>
      executeMeetingPrep({
        supabase,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        agentExecutionId: input.agentExecutionId
      })
  };
}
