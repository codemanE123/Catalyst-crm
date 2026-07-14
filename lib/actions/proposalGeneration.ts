"use server";

import { revalidatePath } from "next/cache";

import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { assertRealProviderPilotAccess } from "@/lib/agents/pilot";
import { executeProposalGeneration } from "@/lib/proposalGeneration/execute";
import type { ProposalDraft } from "@/lib/proposalGeneration/types";
import { getRecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type ProposalGenerationActionResult =
  | {
      ok: true;
      message: string;
      draft: ProposalDraft;
    }
  | {
      ok: false;
      error: string;
    };

async function requireProposalGenerationContext() {
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
    return { ok: false as const, error: "Sign in to generate proposal drafts." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false as const,
      error: "You do not have permission to generate proposal drafts."
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
      error: "You do not have permission to generate proposal drafts."
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    organizationId: ownership.organization_id
  };
}

export async function runProposalGenerationForCandidate(
  candidateId: string
): Promise<ProposalGenerationActionResult> {
  const context = await requireProposalGenerationContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const pilot = await assertRealProviderPilotAccess({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    agentName: "ProposalGenerationAgent"
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

  const trimmedId = candidateId.trim();

  if (!trimmedId) {
    return { ok: false, error: "Candidate id is required." };
  }

  const result = await executeProposalGeneration({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    targetType: "prospect_candidate",
    targetId: trimmedId
  });

  if (!result.ok) {
    return { ok: false, error: result.error_message };
  }

  if (!result.draft) {
    return { ok: false, error: "Proposal draft was not saved." };
  }

  revalidatePath("/prospects/jobs");

  return {
    ok: true,
    message: "Proposal draft saved for human review.",
    draft: result.draft
  };
}

export async function runProposalGenerationForSchool(
  schoolId: string
): Promise<ProposalGenerationActionResult> {
  const context = await requireProposalGenerationContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const pilot = await assertRealProviderPilotAccess({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    agentName: "ProposalGenerationAgent"
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

  const trimmedId = schoolId.trim();

  if (!trimmedId) {
    return { ok: false, error: "School id is required." };
  }

  const result = await executeProposalGeneration({
    supabase: context.supabase,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    targetType: "school",
    targetId: trimmedId
  });

  if (!result.ok) {
    return { ok: false, error: result.error_message };
  }

  if (!result.draft) {
    return { ok: false, error: "Proposal draft was not saved." };
  }

  revalidatePath(`/schools/${trimmedId}`);

  return {
    ok: true,
    message: "Proposal draft saved for human review.",
    draft: result.draft
  };
}

export async function createProposalGenerationHandlerDependency(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>
) {
  return {
    runProposalGeneration: async (input: {
      organizationId: string;
      actorUserId: string;
      targetType: "prospect_candidate" | "school";
      targetId: string;
      agentExecutionId?: string | null;
    }) =>
      executeProposalGeneration({
        supabase,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        agentExecutionId: input.agentExecutionId
      })
  };
}
