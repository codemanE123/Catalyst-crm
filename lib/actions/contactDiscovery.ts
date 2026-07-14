"use server";

import { revalidatePath } from "next/cache";

import { executeContactDiscovery } from "@/lib/contactDiscovery/execute";
import type { ProspectContactRecommendation } from "@/lib/contactDiscovery/types";
import { assertRealProviderPilotAccess } from "@/lib/agents/pilot";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type ContactDiscoveryActionResult =
  | {
      ok: true;
      message: string;
      recommendations: ProspectContactRecommendation[];
    }
  | {
      ok: false;
      error: string;
    };

async function requireContactDiscoveryContext() {
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
    return { ok: false as const, error: "Sign in to run contact discovery." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false as const,
      error: "You do not have permission to run contact discovery."
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
      error: "You do not have permission to run contact discovery."
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    organizationId: ownership.organization_id
  };
}

export async function runContactDiscoveryForCandidate(
  candidateId: string
): Promise<ContactDiscoveryActionResult> {
  const context = await requireContactDiscoveryContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const pilot = await assertRealProviderPilotAccess({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    agentName: "ContactDiscoveryAgent"
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

  const trimmedId = candidateId.trim();

  if (!trimmedId) {
    return { ok: false, error: "Candidate id is required." };
  }

  const result = await executeContactDiscovery({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    targetType: "prospect_candidate",
    targetId: trimmedId
  });

  if (!result.ok) {
    return { ok: false, error: result.error_message };
  }

  revalidatePath(`/prospects/jobs`);

  return {
    ok: true,
    message: `Saved ${result.recommendations?.length ?? 0} recommended contact roles for review.`,
    recommendations: result.recommendations ?? []
  };
}

export async function runContactDiscoveryForSchool(
  schoolId: string
): Promise<ContactDiscoveryActionResult> {
  const context = await requireContactDiscoveryContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const pilot = await assertRealProviderPilotAccess({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    agentName: "ContactDiscoveryAgent"
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

  const trimmedId = schoolId.trim();

  if (!trimmedId) {
    return { ok: false, error: "School id is required." };
  }

  const result = await executeContactDiscovery({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    targetType: "school",
    targetId: trimmedId
  });

  if (!result.ok) {
    return { ok: false, error: result.error_message };
  }

  revalidatePath(`/schools/${trimmedId}`);

  return {
    ok: true,
    message: `Saved ${result.recommendations?.length ?? 0} recommended contact roles for review.`,
    recommendations: result.recommendations ?? []
  };
}

export async function createContactDiscoveryHandlerDependency(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>
) {
  return {
    runContactDiscovery: async (input: {
      organizationId: string;
      actorUserId: string;
      targetType: "prospect_candidate" | "school";
      targetId: string;
      agentExecutionId?: string | null;
    }) =>
      executeContactDiscovery({
        supabase,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        agentExecutionId: input.agentExecutionId
      })
  };
}
