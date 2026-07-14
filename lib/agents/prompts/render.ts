import {
  resolveAgentPromptConfig,
  type AgentPromptConfig
} from "./config";
import {
  extractPlaceholders,
  findUnknownPlaceholders,
  PROMPT_ALLOWED_PLACEHOLDER_SET
} from "./placeholders";
import { findForbiddenPromptContent } from "./validation";
import type {
  PromptRenderResult,
  PromptRenderVariables
} from "./types";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

function serializeValue(value: string | number | boolean | null): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return value;
}

/**
 * Safe template render: allowlisted placeholders only, no eval / Function / code exec.
 */
export function renderPromptTemplates(params: {
  promptKey: string;
  version: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchemaVersion: string;
  variables: PromptRenderVariables;
  requiredPlaceholders?: string[];
  config?: AgentPromptConfig;
}): PromptRenderResult {
  const config = params.config ?? resolveAgentPromptConfig();
  const combinedLength =
    params.systemPrompt.length + params.userPromptTemplate.length;

  if (combinedLength > config.maxTemplateChars) {
    return {
      ok: false,
      error: "Prompt template exceeds configured length limit.",
      reason_code: "template_too_long"
    };
  }

  const forbidden = findForbiddenPromptContent(
    params.systemPrompt,
    params.userPromptTemplate
  );
  if (forbidden.length > 0) {
    return {
      ok: false,
      error: `Forbidden prompt content: ${forbidden.join(", ")}.`,
      reason_code: "forbidden_content"
    };
  }

  const unknown = [
    ...findUnknownPlaceholders(params.systemPrompt),
    ...findUnknownPlaceholders(params.userPromptTemplate)
  ];
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown placeholders: ${[...new Set(unknown)].join(", ")}.`,
      reason_code: "unknown_placeholder"
    };
  }

  const used = new Set([
    ...extractPlaceholders(params.systemPrompt),
    ...extractPlaceholders(params.userPromptTemplate)
  ]);

  const required = params.requiredPlaceholders ?? [];
  const missingRequired = required.filter((name) => {
    if (!PROMPT_ALLOWED_PLACEHOLDER_SET.has(name)) {
      return true;
    }
    return !used.has(name) || params.variables[name] == null;
  });

  const missingValues = [...used].filter((name) => {
    const value = params.variables[name];
    return value === undefined;
  });

  if (missingRequired.length > 0 || missingValues.length > 0) {
    return {
      ok: false,
      error: `Missing required placeholders: ${[
        ...new Set([...missingRequired, ...missingValues])
      ].join(", ")}.`,
      reason_code: "missing_placeholder"
    };
  }

  const replace = (template: string): string =>
    template.replace(PLACEHOLDER_RE, (_match, name: string) => {
      if (!PROMPT_ALLOWED_PLACEHOLDER_SET.has(name)) {
        return "";
      }
      return serializeValue(params.variables[name] ?? null);
    });

  return {
    ok: true,
    system_prompt: replace(params.systemPrompt),
    user_prompt: replace(params.userPromptTemplate),
    prompt_key: params.promptKey,
    version: params.version,
    output_schema_version: params.outputSchemaVersion
  };
}
