export type {
  AgentPolicySet,
  AgentPolicyValue,
  BreakGlassGrant,
  PolicyCategory,
  PolicyExecutionStamp,
  PolicyRiskLevel,
  PolicySetStatus,
  PolicySource,
  PolicyValueType,
  ResolvedAgentPolicy,
  ResolvedPolicyValue
} from "./types";

export {
  POLICY_CATEGORIES,
  POLICY_SET_STATUSES,
  POLICY_SOURCES,
  POLICY_VALUE_TYPES
} from "./types";

export {
  POLICY_KEY_REGISTRY,
  getPolicyKeyDefinition,
  isKnownPolicyKey,
  listPolicyKeys,
  listPolicyKeysByCategory
} from "./schema";
export type { PolicyKeyDefinition } from "./schema";

export {
  AGENT_POLICY_ENV,
  DEFAULT_AGENT_POLICY_BOOTSTRAP,
  buildBootstrapSystemDefaults,
  buildSystemDefaultValues,
  resolveAgentPolicyBootstrap
} from "./defaults";

export {
  validatePolicyValue,
  validatePolicyValueMap,
  policyValuesContainSecrets
} from "./validation";

export {
  resolveAgentPolicy,
  stampFromResolvedPolicy,
  resolvedPolicyToSafetyLimits
} from "./resolve";

export {
  comparePolicyValues,
  classifyActivationImpact
} from "./impact";

export type { PolicyChangePreview } from "./impact";

export { detectPolicyDrift } from "./drift";
export type { PolicyDriftFlag } from "./drift";

export {
  createBreakGlassGrant,
  isBreakGlassActive,
  expireBreakGlassGrant,
  collectActiveBreakGlassKeys
} from "./breakGlass";

export {
  AGENT_POLICY_AUDIT_ACTIONS,
  sanitizePolicyAuditMetadata
} from "./audit";

export { InMemoryAgentPolicyService } from "./service";
