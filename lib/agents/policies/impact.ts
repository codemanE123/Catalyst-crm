import { getPolicyKeyDefinition } from "./schema";
import type { PolicyRiskLevel } from "./types";

export type PolicyChangePreview = {
  key: string;
  before: unknown;
  after: unknown;
  risk: PolicyRiskLevel;
  summary: string;
};

function formatValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "enabled" : "disabled";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function comparePolicyValues(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): PolicyChangePreview[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: PolicyChangePreview[] = [];

  for (const key of [...keys].sort()) {
    const prev = before[key];
    const next = after[key];
    if (JSON.stringify(prev) === JSON.stringify(next)) {
      continue;
    }

    const definition = getPolicyKeyDefinition(key);
    let risk: PolicyRiskLevel = definition?.risk ?? "operational";

    if (definition?.break_glass_when?.(next)) {
      risk =
        definition.risk === "prohibited" ? "prohibited" : "high_risk";
    }

    if (definition?.prohibited_without_break_glass && next === true) {
      risk = "prohibited";
    }

    changes.push({
      key,
      before: prev,
      after: next,
      risk,
      summary: `${key}: ${formatValue(prev)} → ${formatValue(next)}`
    });
  }

  return changes;
}

export function classifyActivationImpact(changes: PolicyChangePreview[]): {
  safe: PolicyChangePreview[];
  operational: PolicyChangePreview[];
  high_risk: PolicyChangePreview[];
  prohibited: PolicyChangePreview[];
  blocked: boolean;
} {
  const safe = changes.filter((row) => row.risk === "safe");
  const operational = changes.filter((row) => row.risk === "operational");
  const high_risk = changes.filter((row) => row.risk === "high_risk");
  const prohibited = changes.filter((row) => row.risk === "prohibited");

  return {
    safe,
    operational,
    high_risk,
    prohibited,
    blocked: prohibited.length > 0
  };
}
