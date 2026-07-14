export {
  AGENT_PROMPT_ENV,
  DEFAULT_AGENT_PROMPT_CONFIG,
  resolveAgentPromptConfig
} from "./config";
export type {
  AgentPromptConfig,
  RolloutAssignmentKey
} from "./config";

export {
  PROMPT_ALLOWED_PLACEHOLDERS,
  PROMPT_ALLOWED_PLACEHOLDER_SET,
  extractPlaceholders,
  findUnknownPlaceholders
} from "./placeholders";

export { renderPromptTemplates } from "./render";

export {
  PROMPT_CATALOG,
  getPromptCatalogEntry,
  listPromptCatalog,
  buildSeedDraftFromCatalog
} from "./registry";
export type { PromptCatalogEntry } from "./registry";

export {
  canMutatePromptVersionContent,
  evaluatePromptActivationGates,
  findForbiddenPromptContent,
  validatePromptDraftContent,
  assertRequiredPlaceholdersPresent
} from "./validation";

export {
  InMemoryPromptRegistryService,
  stampFromPromptVersion,
  resolvePromptForExecution,
  executionStampHasRawPrompt
} from "./service";

export {
  PROMPT_AUDIT_ACTIONS,
  sanitizePromptAuditMetadata
} from "./audit";

export {
  AGENT_PROMPT_KEY_MAP,
  KNOWN_PROMPT_KEYS,
  PROMPT_VERSION_STATUSES
} from "./types";

export type {
  AgentPromptVersion,
  PromptActivationGateResult,
  PromptExecutionStamp,
  PromptRenderResult,
  PromptRenderVariables,
  PromptVersionStatus,
  KnownPromptKey
} from "./types";
