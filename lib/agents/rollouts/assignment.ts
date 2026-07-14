import type { RolloutAssignmentKey } from "../prompts/config";
import type {
  AgentRollout,
  ExperimentVariant,
  RolloutAssignmentContext,
  RolloutAssignmentResult,
  RolloutPercentage
} from "./types";

/**
 * Stable 32-bit FNV-1a style hash for deterministic variant assignment.
 * Same inputs always map to the same bucket in [0, 99].
 */
export function stableHashToBucket(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function resolveAssignmentValue(
  key: RolloutAssignmentKey,
  context: RolloutAssignmentContext
): string | null {
  if (key === "organization_id") {
    return context.organizationId;
  }
  if (key === "user_id") {
    return context.userId ?? null;
  }
  return context.targetId ?? null;
}

export function isAllowedRolloutPercentage(
  value: number
): value is RolloutPercentage {
  return value === 0 || value === 10 || value === 25 || value === 50 || value === 100;
}

function allowlistIncludes(
  metadata: AgentRollout["metadata"],
  field: "organization_allowlist" | "user_allowlist",
  id: string
): boolean {
  const raw = metadata[field];
  if (!Array.isArray(raw)) {
    return false;
  }
  return raw.map(String).includes(id);
}

/**
 * Deterministic rollout assignment. Never uses per-request randomness.
 * Default assignment key is organization_id (see AGENT_ROLLOUT_ASSIGNMENT_KEY).
 */
export function assignRolloutVariant(params: {
  rollout: AgentRollout;
  context: RolloutAssignmentContext;
  assignmentKey: RolloutAssignmentKey;
}): RolloutAssignmentResult | null {
  const { rollout, context, assignmentKey } = params;

  if (rollout.status !== "active") {
    return null;
  }

  const controlId = rollout.control_prompt_version_id;
  const treatmentId = rollout.treatment_prompt_version_id;

  const finish = (
    variant: ExperimentVariant,
    bucket: number,
    keyValue: string
  ): RolloutAssignmentResult => ({
    variant,
    rollout_id: rollout.id,
    prompt_version_id: variant === "treatment" ? treatmentId : controlId,
    assignment_key: keyValue,
    assignment_bucket: bucket
  });

  if (rollout.rollout_type === "fixed_control") {
    return finish("control", 0, context.organizationId);
  }

  if (rollout.rollout_type === "fixed_treatment") {
    return finish("treatment", 0, context.organizationId);
  }

  if (rollout.rollout_type === "organization_allowlist") {
    const inList = allowlistIncludes(
      rollout.metadata,
      "organization_allowlist",
      context.organizationId
    );
    return finish(
      inList ? "treatment" : "control",
      inList ? 1 : 0,
      context.organizationId
    );
  }

  if (rollout.rollout_type === "user_allowlist") {
    const userId = context.userId ?? "";
    const inList =
      Boolean(userId) &&
      allowlistIncludes(rollout.metadata, "user_allowlist", userId);
    return finish(inList ? "treatment" : "control", inList ? 1 : 0, userId || "missing_user");
  }

  // percentage
  const keyValue = resolveAssignmentValue(assignmentKey, context);
  if (!keyValue) {
    return finish("control", 0, "missing_assignment_key");
  }

  const hashInput = `${rollout.id}:${assignmentKey}:${keyValue}`;
  const bucket = stableHashToBucket(hashInput);
  const percentage = isAllowedRolloutPercentage(rollout.rollout_percentage)
    ? rollout.rollout_percentage
    : 0;
  const variant: ExperimentVariant =
    bucket < percentage ? "treatment" : "control";

  return finish(variant, bucket, keyValue);
}
