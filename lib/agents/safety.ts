import { resolveAgentSafetyLimits } from "./limits";

/**
 * Hard safety guardrails shared by agents. No agent may autonomously perform
 * outbound or irreversible CRM actions — humans approve first.
 */
export const AGENT_AUTONOMY_GUARDS = {
  mayAutonomouslySendEmail: false,
  mayAutonomouslyApproveProspects: false,
  mayAutonomouslySendProposals: false,
  requiresHumanApprovalForExternalActions: true
} as const;

export type AutonomyAction =
  | "send_email"
  | "approve_prospect"
  | "send_proposal"
  | "external_action";

export function isAutonomousActionAllowed(action: AutonomyAction): boolean {
  switch (action) {
    case "send_email":
      return AGENT_AUTONOMY_GUARDS.mayAutonomouslySendEmail;
    case "approve_prospect":
      return AGENT_AUTONOMY_GUARDS.mayAutonomouslyApproveProspects;
    case "send_proposal":
      return AGENT_AUTONOMY_GUARDS.mayAutonomouslySendProposals;
    case "external_action":
      return !AGENT_AUTONOMY_GUARDS.requiresHumanApprovalForExternalActions;
    default:
      return false;
  }
}

export function assertNoAutonomousExternalAction(action: AutonomyAction): {
  ok: true;
} | {
  ok: false;
  error_message: string;
  error_code: "permanent";
} {
  if (isAutonomousActionAllowed(action)) {
    return { ok: true };
  }

  return {
    ok: false,
    error_message:
      "Agents cannot perform this action automatically. Human approval is required.",
    error_code: "permanent"
  };
}

export function enforcePromptInputSize(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): { ok: true } | { ok: false; error: string } {
  const max = resolveAgentSafetyLimits(env).maxPromptChars;

  if (value.length > max) {
    return {
      ok: false,
      error: "Input exceeds the maximum allowed size for AI processing."
    };
  }

  return { ok: true };
}

export function enforceGeneratedOutputSize(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): { ok: true } | { ok: false; error: string } {
  const max = resolveAgentSafetyLimits(env).maxOutputChars;

  if (value.length > max) {
    return {
      ok: false,
      error: "Generated content exceeds the maximum allowed size."
    };
  }

  return { ok: true };
}

export function enforceCandidateBatchSize(
  batchSize: number,
  env: NodeJS.ProcessEnv = process.env
): { ok: true; max: number } | { ok: false; error: string; max: number } {
  const max = resolveAgentSafetyLimits(env).maxCandidateBatchSize;

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    return {
      ok: false,
      error: "Candidate batch size must be a positive number.",
      max
    };
  }

  if (batchSize > max) {
    return {
      ok: false,
      error: `Candidate batch size must be between 1 and ${max}.`,
      max
    };
  }

  return { ok: true, max };
}

export function computeChainDepthFromParent(
  parentChainDepth: number | null | undefined
): number {
  if (parentChainDepth == null || !Number.isFinite(parentChainDepth)) {
    return 1;
  }

  return Math.max(1, Math.floor(parentChainDepth) + 1);
}

export function detectCircularDependency(params: {
  organizationId: string;
  dependsOnExecutionId: string | null | undefined;
  findById: (
    id: string,
    organizationId: string
  ) => Promise<{ id: string; depends_on_execution_id: string | null } | null>;
  maxHops?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return (async () => {
    if (!params.dependsOnExecutionId) {
      return { ok: true };
    }

    const seen = new Set<string>();
    let currentId: string | null = params.dependsOnExecutionId;
    const maxHops = params.maxHops ?? 50;

    for (let hop = 0; hop < maxHops && currentId; hop += 1) {
      if (seen.has(currentId)) {
        return {
          ok: false,
          error: "Circular agent dependency chain detected."
        };
      }

      seen.add(currentId);
      const node = await params.findById(currentId, params.organizationId);

      if (!node) {
        return {
          ok: false,
          error: "Dependency execution was not found in your organization."
        };
      }

      currentId = node.depends_on_execution_id;
    }

    return { ok: true };
  })();
}
