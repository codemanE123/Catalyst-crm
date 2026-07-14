import { getPolicyKeyDefinition, isKnownPolicyKey } from "./schema";
import type { PolicyRiskLevel, PolicyValueType } from "./types";

export type PolicyValidationIssue = {
  key: string;
  message: string;
  risk: PolicyRiskLevel;
};

export type PolicyValueValidationResult =
  | { ok: true; value: unknown; value_type: PolicyValueType }
  | { ok: false; issues: PolicyValidationIssue[] };

function isPlainSerializable(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(
      (item) => typeof item === "string" || typeof item === "number"
    );
  }
  if (typeof value === "object") {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function validatePolicyValue(
  key: string,
  raw: unknown,
  options?: { breakGlassActive?: boolean }
): PolicyValueValidationResult {
  if (!isKnownPolicyKey(key)) {
    return {
      ok: false,
      issues: [
        {
          key,
          message: "Unknown policy key.",
          risk: "prohibited"
        }
      ]
    };
  }

  const definition = getPolicyKeyDefinition(key)!;
  const issues: PolicyValidationIssue[] = [];

  if (!isPlainSerializable(raw)) {
    issues.push({
      key,
      message: "Value must be plain JSON-serializable.",
      risk: "prohibited"
    });
    return { ok: false, issues };
  }

  const value = raw;

  switch (definition.value_type) {
    case "boolean":
      if (typeof value !== "boolean") {
        issues.push({
          key,
          message: "Expected boolean.",
          risk: "prohibited"
        });
      }
      break;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        issues.push({
          key,
          message: "Expected integer.",
          risk: "prohibited"
        });
      } else {
        if (definition.min != null && value < definition.min) {
          issues.push({
            key,
            message: `Must be >= ${definition.min}.`,
            risk: "prohibited"
          });
        }
        if (definition.max != null && value > definition.max) {
          issues.push({
            key,
            message: `Must be <= ${definition.max}.`,
            risk: "prohibited"
          });
        }
      }
      break;
    case "decimal":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({
          key,
          message: "Expected decimal number.",
          risk: "prohibited"
        });
      } else {
        if (definition.min != null && value < definition.min) {
          issues.push({
            key,
            message: `Must be >= ${definition.min}.`,
            risk: "prohibited"
          });
        }
        if (definition.max != null && value > definition.max) {
          issues.push({
            key,
            message: `Must be <= ${definition.max}.`,
            risk: "prohibited"
          });
        }
      }
      break;
    case "string":
      if (typeof value !== "string") {
        issues.push({
          key,
          message: "Expected string.",
          risk: "prohibited"
        });
      } else if (
        definition.enum_values &&
        !definition.enum_values.includes(value)
      ) {
        issues.push({
          key,
          message: `Must be one of: ${definition.enum_values.join(", ")}.`,
          risk: "prohibited"
        });
      }
      break;
    case "string_array":
      if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === "string")
      ) {
        issues.push({
          key,
          message: "Expected string array.",
          risk: "prohibited"
        });
      }
      break;
    case "json":
      break;
  }

  if (
    definition.prohibited_without_break_glass &&
    definition.break_glass_when?.(value) &&
    !options?.breakGlassActive
  ) {
    issues.push({
      key,
      message:
        "This autonomy/data setting requires an active super_admin break-glass grant.",
      risk: "prohibited"
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value, value_type: definition.value_type };
}

export function validatePolicyValueMap(
  values: Record<string, unknown>,
  options?: { breakGlassKeys?: Set<string> }
): { ok: true } | { ok: false; issues: PolicyValidationIssue[] } {
  const issues: PolicyValidationIssue[] = [];

  for (const [key, value] of Object.entries(values)) {
    const result = validatePolicyValue(key, value, {
      breakGlassActive: options?.breakGlassKeys?.has(key) ?? false
    });
    if (!result.ok) {
      issues.push(...result.issues);
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

const SECRET_KEY_RE =
  /(api[_-]?key|secret|password|authorization|^cookie$|system_prompt|user_prompt|raw_prompt|private_note|auth[_-]?token|access[_-]?token|refresh[_-]?token)/i;

export function policyValuesContainSecrets(
  values: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(values)) {
    if (SECRET_KEY_RE.test(key)) {
      return true;
    }
    if (typeof value === "string" && /sk-[A-Za-z0-9]{10,}/.test(value)) {
      return true;
    }
  }
  return false;
}
