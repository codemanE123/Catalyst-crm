import { scrubPiiFromString, containsUnresolvedPii } from "@/lib/llm/types";

import { resolveAgentQualityConfig } from "./config";
import type {
  AutomatedQualityCheckFinding,
  AutomatedQualityCheckResult
} from "./types";

const SECRET_PATTERN =
  /\b(sk-[a-zA-Z0-9]{10,}|api[_-]?key|bearer\s+[a-z0-9\-._~+/]+=*|service_role)\b/i;
const AUTONOMOUS_ACTION_PATTERN =
  /\b(automatically send|auto-send|send without review|approve without human|create contact automatically)\b/i;
const BOILERPLATE_REPEAT_PATTERN = /([\s\S]{40,})\1{2,}/;

export type AutomatedQualityCheckInput = {
  outputText?: string | null;
  requiredFields?: Record<string, unknown>;
  schemaValid?: boolean;
  citationPresent?: boolean | null;
  confidenceScore?: number | null;
  forbiddenFieldPaths?: string[];
  env?: NodeJS.ProcessEnv;
};

function pushFinding(
  findings: AutomatedQualityCheckFinding[],
  finding: AutomatedQualityCheckFinding
) {
  findings.push(finding);
}

export function runAutomatedQualityChecks(
  input: AutomatedQualityCheckInput
): AutomatedQualityCheckResult {
  const config = resolveAgentQualityConfig(input.env);
  const findings: AutomatedQualityCheckFinding[] = [];
  const text = (input.outputText ?? "").trim();

  if (input.schemaValid === false) {
    pushFinding(findings, {
      code: "schema_invalid",
      passed: false,
      severity: "fail",
      message: "Output schema validation failed."
    });
  } else if (input.schemaValid === true) {
    pushFinding(findings, {
      code: "schema_valid",
      passed: true,
      severity: "info",
      message: "Output schema is valid."
    });
  }

  if (input.requiredFields) {
    const missing = Object.entries(input.requiredFields)
      .filter(([, value]) => {
        if (value == null) {
          return true;
        }

        if (typeof value === "string") {
          return value.trim().length === 0;
        }

        if (Array.isArray(value)) {
          return value.length === 0;
        }

        return false;
      })
      .map(([key]) => key);

    pushFinding(findings, {
      code: "required_fields",
      passed: missing.length === 0,
      severity: missing.length === 0 ? "info" : "fail",
      message:
        missing.length === 0
          ? "Required fields are present."
          : `Missing required fields: ${missing.join(", ")}.`
    });
  }

  if (config.requireSourceCitations) {
    const citationOk = input.citationPresent === true;
    pushFinding(findings, {
      code: "citation_present",
      passed: citationOk || input.citationPresent == null,
      severity:
        input.citationPresent == null
          ? "info"
          : citationOk
            ? "info"
            : "fail",
      message:
        input.citationPresent == null
          ? "Citation requirement not applicable."
          : citationOk
            ? "Source citation present."
            : "Required source citation is missing."
    });
  }

  if (input.confidenceScore != null) {
    const inRange =
      Number.isFinite(input.confidenceScore) &&
      input.confidenceScore >= 0 &&
      input.confidenceScore <= 1;
    pushFinding(findings, {
      code: "confidence_range",
      passed: inRange,
      severity: inRange ? "info" : "fail",
      message: inRange
        ? "Confidence score is in range."
        : "Confidence score is outside 0–1."
    });
  }

  if (input.forbiddenFieldPaths && input.forbiddenFieldPaths.length > 0) {
    pushFinding(findings, {
      code: "forbidden_fields",
      passed: false,
      severity: "fail",
      message: `Forbidden fields detected: ${input.forbiddenFieldPaths.join(", ")}.`
    });
  }

  if (text) {
    pushFinding(findings, {
      code: "non_empty_output",
      passed: text.length >= 20,
      severity: text.length >= 20 ? "info" : "fail",
      message:
        text.length >= 20
          ? "Output length is acceptable."
          : "Output is empty or excessively short."
    });

    pushFinding(findings, {
      code: "no_student_pii",
      passed: !containsUnresolvedPii(text),
      severity: containsUnresolvedPii(text) ? "fail" : "info",
      message: containsUnresolvedPii(text)
        ? "Possible personal contact data detected."
        : "No unresolved PII patterns detected."
    });

    const hasSecret = SECRET_PATTERN.test(text);
    pushFinding(findings, {
      code: "no_secrets",
      passed: !hasSecret,
      severity: hasSecret ? "fail" : "info",
      message: hasSecret
        ? "Possible secret or credential pattern detected."
        : "No secret patterns detected."
    });

    pushFinding(findings, {
      code: "no_autonomous_action_language",
      passed: !AUTONOMOUS_ACTION_PATTERN.test(text),
      severity: AUTONOMOUS_ACTION_PATTERN.test(text) ? "fail" : "warn",
      message: AUTONOMOUS_ACTION_PATTERN.test(text)
        ? "Prohibited autonomous-action language detected."
        : "No prohibited autonomous-action language."
    });

    pushFinding(findings, {
      code: "no_boilerplate_duplication",
      passed: !BOILERPLATE_REPEAT_PATTERN.test(text),
      severity: BOILERPLATE_REPEAT_PATTERN.test(text) ? "warn" : "info",
      message: BOILERPLATE_REPEAT_PATTERN.test(text)
        ? "Possible duplicated boilerplate detected."
        : "No duplicated boilerplate detected."
    });
  } else if (input.outputText != null) {
    pushFinding(findings, {
      code: "non_empty_output",
      passed: false,
      severity: "fail",
      message: "Output is empty or excessively short."
    });
  }

  const failed = findings.filter((finding) => !finding.passed && finding.severity === "fail");
  const warnCount = findings.filter(
    (finding) => !finding.passed && finding.severity === "warn"
  ).length;

  let safetyScore: number | null = 5;
  if (failed.some((finding) => finding.code === "no_student_pii" || finding.code === "no_secrets")) {
    safetyScore = 1;
  } else if (failed.some((finding) => finding.code === "no_autonomous_action_language")) {
    safetyScore = 2;
  } else if (failed.length > 0) {
    safetyScore = 3;
  } else if (warnCount > 0) {
    safetyScore = 4;
  }

  let completenessScore: number | null = 5;
  if (failed.some((finding) => finding.code === "required_fields" || finding.code === "schema_invalid")) {
    completenessScore = 1;
  } else if (failed.some((finding) => finding.code === "non_empty_output")) {
    completenessScore = 2;
  } else if (failed.some((finding) => finding.code === "citation_present")) {
    completenessScore = 3;
  }

  return {
    passed: failed.length === 0,
    findings,
    safety_score: safetyScore,
    completeness_score: completenessScore
  };
}

export function scrubEvaluationFeedback(
  feedback: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): { ok: true; feedback: string | null } | { ok: false; error: string } {
  if (feedback == null || feedback.trim() === "") {
    return { ok: true, feedback: null };
  }

  const maxLength = resolveAgentQualityConfig(env).feedbackMaxLength;
  const scrubbed = scrubPiiFromString(feedback.trim());

  if (scrubbed.length > maxLength) {
    return {
      ok: false,
      error: `Feedback must be at most ${maxLength} characters. Do not enter protected personal data.`
    };
  }

  return { ok: true, feedback: scrubbed };
}

export function collectLowQualityFlags(input: {
  overallScore?: number | null;
  safetyScore?: number | null;
  agentConfidence?: number | null;
  outcome?: string | null;
  citationPresent?: boolean | null;
  automatedPassed?: boolean | null;
  env?: NodeJS.ProcessEnv;
}): string[] {
  const config = resolveAgentQualityConfig(input.env);
  const flags: string[] = [];

  if (
    input.overallScore != null &&
    input.overallScore < config.lowScoreThreshold
  ) {
    flags.push("overall_score_below_threshold");
  }

  if (
    input.safetyScore != null &&
    input.safetyScore < config.minSafetyScore
  ) {
    flags.push("safety_score_below_threshold");
  }

  if (
    input.agentConfidence != null &&
    input.agentConfidence >= 0.8 &&
    input.outcome === "rejected"
  ) {
    flags.push("high_confidence_rejected");
  }

  if (config.requireSourceCitations && input.citationPresent === false) {
    flags.push("missing_citations");
  }

  if (input.automatedPassed === false) {
    flags.push("automated_quality_check_failed");
  }

  return flags;
}
