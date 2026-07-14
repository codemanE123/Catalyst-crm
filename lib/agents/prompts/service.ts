import { resolveAgentPromptConfig } from "./config";
import { getPromptCatalogEntry } from "./registry";
import {
  canMutatePromptVersionContent,
  evaluatePromptActivationGates,
  validatePromptDraftContent
} from "./validation";
import { outputSchemaExists } from "../schemas/registry";
import type { AgentPromptVersion, PromptExecutionStamp } from "./types";
import type { AgentRollout } from "../rollouts/types";
import { assignRolloutVariant } from "../rollouts/assignment";
import type { RolloutAssignmentKey } from "./config";
import { AGENT_PROMPT_KEY_MAP } from "./types";
import type { AgentName } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export type CreatePromptVersionInput = {
  organizationId: string | null;
  promptKey: string;
  version: string;
  agentName: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchemaVersion: string;
  provider: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  safetyPolicyVersion: string;
  description?: string | null;
  changeSummary?: string | null;
  createdBy: string | null;
};

export type PromptServiceError = {
  ok: false;
  error: string;
};

function scopeKey(organizationId: string | null): string {
  return organizationId ?? "__global__";
}

/**
 * In-memory prompt version + rollout store for tests and pure lifecycle logic.
 * Supabase actions mirror these rules under RLS.
 */
export class InMemoryPromptRegistryService {
  versions: AgentPromptVersion[] = [];
  rollouts: AgentRollout[] = [];

  listVersions(params?: {
    organizationId?: string | null;
    promptKey?: string;
    includeGlobal?: boolean;
  }): AgentPromptVersion[] {
    return this.versions.filter((row) => {
      if (params?.promptKey && row.prompt_key !== params.promptKey) {
        return false;
      }
      if (params?.organizationId === undefined) {
        return true;
      }
      if (row.organization_id === params.organizationId) {
        return true;
      }
      if (params.includeGlobal && row.organization_id == null) {
        return true;
      }
      return false;
    });
  }

  getById(id: string): AgentPromptVersion | null {
    return this.versions.find((row) => row.id === id) ?? null;
  }

  getActive(params: {
    promptKey: string;
    organizationId: string | null;
  }): AgentPromptVersion | null {
    const orgActive = this.versions.find(
      (row) =>
        row.prompt_key === params.promptKey &&
        row.organization_id === params.organizationId &&
        row.status === "active"
    );
    if (orgActive) {
      return orgActive;
    }
    if (params.organizationId != null) {
      return (
        this.versions.find(
          (row) =>
            row.prompt_key === params.promptKey &&
            row.organization_id == null &&
            row.status === "active"
        ) ?? null
      );
    }
    return null;
  }

  createDraft(
    input: CreatePromptVersionInput
  ): { ok: true; version: AgentPromptVersion } | PromptServiceError {
    const content = validatePromptDraftContent({
      systemPrompt: input.systemPrompt,
      userPromptTemplate: input.userPromptTemplate
    });
    if (!content.ok) {
      return { ok: false, error: content.errors.join(" ") };
    }

    const duplicate = this.versions.some(
      (row) =>
        row.prompt_key === input.promptKey &&
        row.version === input.version &&
        scopeKey(row.organization_id) === scopeKey(input.organizationId)
    );
    if (duplicate) {
      return {
        ok: false,
        error: "A prompt version with this key and version already exists in scope."
      };
    }

    const version: AgentPromptVersion = {
      id: newId("pv"),
      organization_id: input.organizationId,
      prompt_key: input.promptKey,
      version: input.version,
      agent_name: input.agentName,
      status: "draft",
      description: input.description ?? null,
      system_prompt: input.systemPrompt,
      user_prompt_template: input.userPromptTemplate,
      output_schema_version: input.outputSchemaVersion,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.2,
      max_output_tokens: input.maxOutputTokens ?? 1200,
      safety_policy_version: input.safetyPolicyVersion,
      change_summary: input.changeSummary ?? null,
      created_by: input.createdBy,
      created_at: nowIso(),
      activated_at: null,
      deprecated_at: null
    };

    this.versions.push(version);
    return { ok: true, version };
  }

  cloneVersion(params: {
    sourceId: string;
    newVersion: string;
    createdBy: string | null;
    changeSummary?: string;
  }): { ok: true; version: AgentPromptVersion } | PromptServiceError {
    const source = this.getById(params.sourceId);
    if (!source) {
      return { ok: false, error: "Source prompt version not found." };
    }

    return this.createDraft({
      organizationId: source.organization_id,
      promptKey: source.prompt_key,
      version: params.newVersion,
      agentName: String(source.agent_name),
      systemPrompt: source.system_prompt,
      userPromptTemplate: source.user_prompt_template,
      outputSchemaVersion: source.output_schema_version,
      provider: String(source.provider),
      model: source.model,
      temperature: source.temperature,
      maxOutputTokens: source.max_output_tokens,
      safetyPolicyVersion: source.safety_policy_version,
      description: source.description,
      changeSummary:
        params.changeSummary ?? `Cloned from ${source.version}`,
      createdBy: params.createdBy
    });
  }

  updateDraftContent(params: {
    id: string;
    systemPrompt?: string;
    userPromptTemplate?: string;
    changeSummary?: string;
  }): { ok: true; version: AgentPromptVersion } | PromptServiceError {
    const version = this.getById(params.id);
    if (!version) {
      return { ok: false, error: "Prompt version not found." };
    }
    if (!canMutatePromptVersionContent(version.status)) {
      return {
        ok: false,
        error: "Active, deprecated, or archived prompt versions are immutable."
      };
    }

    const systemPrompt = params.systemPrompt ?? version.system_prompt;
    const userPromptTemplate =
      params.userPromptTemplate ?? version.user_prompt_template;
    const content = validatePromptDraftContent({
      systemPrompt,
      userPromptTemplate
    });
    if (!content.ok) {
      return { ok: false, error: content.errors.join(" ") };
    }

    version.system_prompt = systemPrompt;
    version.user_prompt_template = userPromptTemplate;
    if (params.changeSummary != null) {
      version.change_summary = params.changeSummary;
    }
    return { ok: true, version };
  }

  validateForActivation(params: {
    id: string;
    averageQualityScore?: number | null;
    testsPassed?: boolean;
  }): { ok: true } | { ok: false; errors: string[] } {
    const version = this.getById(params.id);
    if (!version) {
      return { ok: false, errors: ["Prompt version not found."] };
    }

    return evaluatePromptActivationGates({
      version,
      schemaExists: outputSchemaExists(version.output_schema_version),
      testsPassed: params.testsPassed !== false,
      averageQualityScore: params.averageQualityScore ?? null
    });
  }

  activate(params: {
    id: string;
    averageQualityScore?: number | null;
    testsPassed?: boolean;
  }): { ok: true; version: AgentPromptVersion; deactivatedId: string | null } | PromptServiceError {
    const version = this.getById(params.id);
    if (!version) {
      return { ok: false, error: "Prompt version not found." };
    }
    if (version.status === "active") {
      return { ok: true, version, deactivatedId: null };
    }

    const gates = this.validateForActivation(params);
    if (!gates.ok) {
      return { ok: false, error: gates.errors.join(" ") };
    }

    let deactivatedId: string | null = null;
    for (const row of this.versions) {
      if (
        row.prompt_key === version.prompt_key &&
        scopeKey(row.organization_id) === scopeKey(version.organization_id) &&
        row.status === "active" &&
        row.id !== version.id
      ) {
        row.status = "deprecated";
        row.deprecated_at = nowIso();
        deactivatedId = row.id;
      }
    }

    version.status = "active";
    version.activated_at = nowIso();
    version.deprecated_at = null;
    return { ok: true, version, deactivatedId };
  }

  deprecate(id: string): { ok: true; version: AgentPromptVersion } | PromptServiceError {
    const version = this.getById(id);
    if (!version) {
      return { ok: false, error: "Prompt version not found." };
    }
    if (version.status === "archived") {
      return { ok: false, error: "Archived versions cannot be deprecated." };
    }
    version.status = "deprecated";
    version.deprecated_at = nowIso();
    return { ok: true, version };
  }

  archive(id: string): { ok: true; version: AgentPromptVersion } | PromptServiceError {
    const version = this.getById(id);
    if (!version) {
      return { ok: false, error: "Prompt version not found." };
    }
    if (version.status === "active") {
      return {
        ok: false,
        error: "Deprecate or roll back the active version before archiving."
      };
    }
    version.status = "archived";
    return { ok: true, version };
  }

  /**
   * Rollback activates a previous non-archived version.
   * Does not mutate historical execution metadata.
   */
  rollback(params: {
    promptKey: string;
    organizationId: string | null;
    toVersionId: string;
    averageQualityScore?: number | null;
  }): { ok: true; version: AgentPromptVersion; previousActiveId: string | null } | PromptServiceError {
    const target = this.getById(params.toVersionId);
    if (!target) {
      return { ok: false, error: "Rollback target not found." };
    }
    if (target.prompt_key !== params.promptKey) {
      return { ok: false, error: "Rollback target prompt_key mismatch." };
    }
    if (
      scopeKey(target.organization_id) !== scopeKey(params.organizationId)
    ) {
      return { ok: false, error: "Rollback target organization scope mismatch." };
    }

    const previous = this.getActive({
      promptKey: params.promptKey,
      organizationId: params.organizationId
    });

    if (target.status === "archived") {
      return { ok: false, error: "Cannot roll back to an archived version." };
    }

    if (target.status === "draft") {
      const activated = this.activate({
        id: target.id,
        averageQualityScore: params.averageQualityScore ?? null
      });
      if (!activated.ok) {
        return activated;
      }
      return {
        ok: true,
        version: activated.version,
        previousActiveId: previous?.id ?? null
      };
    }

    const gates = evaluatePromptActivationGates({
      version: target,
      schemaExists: outputSchemaExists(target.output_schema_version),
      testsPassed: true,
      averageQualityScore: params.averageQualityScore ?? null
    });
    if (!gates.ok) {
      return { ok: false, error: gates.errors.join(" ") };
    }

    for (const row of this.versions) {
      if (
        row.prompt_key === params.promptKey &&
        scopeKey(row.organization_id) === scopeKey(params.organizationId) &&
        row.status === "active"
      ) {
        row.status = "deprecated";
        row.deprecated_at = nowIso();
      }
    }

    target.status = "active";
    target.activated_at = target.activated_at ?? nowIso();
    target.deprecated_at = null;

    return {
      ok: true,
      version: target,
      previousActiveId: previous?.id ?? null
    };
  }

  createRollout(input: Omit<AgentRollout, "id" | "created_at" | "status"> & {
    status?: AgentRollout["status"];
  }): { ok: true; rollout: AgentRollout } | PromptServiceError {
    const control = this.getById(input.control_prompt_version_id);
    const treatment = this.getById(input.treatment_prompt_version_id);
    if (!control || !treatment) {
      return { ok: false, error: "Control and treatment versions are required." };
    }
    if (
      control.prompt_key !== input.prompt_key ||
      treatment.prompt_key !== input.prompt_key
    ) {
      return { ok: false, error: "Rollout versions must match prompt_key." };
    }

    const rollout: AgentRollout = {
      id: newId("ro"),
      organization_id: input.organization_id,
      agent_name: input.agent_name,
      prompt_key: input.prompt_key,
      control_prompt_version_id: input.control_prompt_version_id,
      treatment_prompt_version_id: input.treatment_prompt_version_id,
      rollout_type: input.rollout_type,
      rollout_percentage: input.rollout_percentage,
      status: input.status ?? "draft",
      started_at: input.started_at,
      ended_at: input.ended_at,
      created_by: input.created_by,
      metadata: input.metadata ?? {},
      created_at: nowIso()
    };
    this.rollouts.push(rollout);
    return { ok: true, rollout };
  }

  getActiveRollout(params: {
    promptKey: string;
    organizationId: string;
  }): AgentRollout | null {
    const orgScoped =
      this.rollouts.find(
        (row) =>
          row.prompt_key === params.promptKey &&
          row.organization_id === params.organizationId &&
          row.status === "active"
      ) ?? null;
    if (orgScoped) {
      return orgScoped;
    }
    return (
      this.rollouts.find(
        (row) =>
          row.prompt_key === params.promptKey &&
          row.organization_id == null &&
          row.status === "active"
      ) ?? null
    );
  }

  transitionRollout(
    id: string,
    next: AgentRollout["status"]
  ): { ok: true; rollout: AgentRollout } | PromptServiceError {
    const rollout = this.rollouts.find((row) => row.id === id);
    if (!rollout) {
      return { ok: false, error: "Rollout not found." };
    }

    const allowed: Record<string, AgentRollout["status"][]> = {
      draft: ["active", "cancelled"],
      active: ["paused", "cancelled", "completed"],
      paused: ["active", "cancelled", "completed"],
      completed: [],
      cancelled: []
    };

    if (!allowed[rollout.status]?.includes(next)) {
      return {
        ok: false,
        error: `Cannot transition rollout from ${rollout.status} to ${next}.`
      };
    }

    rollout.status = next;
    if (next === "active" && !rollout.started_at) {
      rollout.started_at = nowIso();
    }
    if (next === "cancelled" || next === "completed") {
      rollout.ended_at = nowIso();
    }
    return { ok: true, rollout };
  }

  promoteTreatment(params: {
    rolloutId: string;
    averageQualityScore?: number | null;
  }): { ok: true; version: AgentPromptVersion; rollout: AgentRollout } | PromptServiceError {
    const rollout = this.rollouts.find((row) => row.id === params.rolloutId);
    if (!rollout) {
      return { ok: false, error: "Rollout not found." };
    }

    const activated = this.activate({
      id: rollout.treatment_prompt_version_id,
      averageQualityScore: params.averageQualityScore ?? null
    });
    if (!activated.ok) {
      return activated;
    }

    rollout.status = "completed";
    rollout.ended_at = nowIso();
    return { ok: true, version: activated.version, rollout };
  }

  rollbackRolloutToControl(params: {
    rolloutId: string;
    averageQualityScore?: number | null;
  }): { ok: true; version: AgentPromptVersion; rollout: AgentRollout } | PromptServiceError {
    const rollout = this.rollouts.find((row) => row.id === params.rolloutId);
    if (!rollout) {
      return { ok: false, error: "Rollout not found." };
    }

    const rolled = this.rollback({
      promptKey: rollout.prompt_key,
      organizationId: rollout.organization_id,
      toVersionId: rollout.control_prompt_version_id,
      averageQualityScore: params.averageQualityScore ?? null
    });
    if (!rolled.ok) {
      return rolled;
    }

    rollout.status = "completed";
    rollout.ended_at = nowIso();
    return { ok: true, version: rolled.version, rollout };
  }
}

export function stampFromPromptVersion(
  version: AgentPromptVersion,
  extras?: {
    rollout_id?: string | null;
    experiment_variant?: "control" | "treatment" | null;
  }
): PromptExecutionStamp {
  return {
    prompt_key: version.prompt_key,
    prompt_version: version.version,
    prompt_version_id: version.id,
    output_schema_version: version.output_schema_version,
    provider: String(version.provider),
    model: version.model,
    rollout_id: extras?.rollout_id ?? null,
    experiment_variant: extras?.experiment_variant ?? null
  };
}

export function executionStampHasRawPrompt(
  metadata: Record<string, unknown>
): boolean {
  const disallowed = [
    "system_prompt",
    "user_prompt",
    "rendered_prompt",
    "raw_prompt",
    "messages"
  ];
  return disallowed.some((key) => key in metadata);
}

export function resolvePromptForExecution(params: {
  service: InMemoryPromptRegistryService;
  agentName: AgentName | string;
  organizationId: string;
  userId?: string | null;
  targetId?: string | null;
  assignmentKey?: RolloutAssignmentKey;
  /** If already stamped, keep stable — do not re-resolve. */
  existing?: Partial<PromptExecutionStamp> | null;
}): PromptExecutionStamp | null {
  if (params.existing?.prompt_version_id && params.existing.prompt_key) {
    return {
      prompt_key: String(params.existing.prompt_key),
      prompt_version: String(params.existing.prompt_version ?? ""),
      prompt_version_id: String(params.existing.prompt_version_id),
      output_schema_version: String(
        params.existing.output_schema_version ?? ""
      ),
      provider: String(params.existing.provider ?? ""),
      model: String(params.existing.model ?? ""),
      rollout_id:
        params.existing.rollout_id == null
          ? null
          : String(params.existing.rollout_id),
      experiment_variant:
        params.existing.experiment_variant === "control" ||
        params.existing.experiment_variant === "treatment"
          ? params.existing.experiment_variant
          : null
    };
  }

  const promptKey =
    AGENT_PROMPT_KEY_MAP[params.agentName as AgentName] ??
    getPromptCatalogEntry(
      String(params.agentName)
    )?.prompt_key;

  if (!promptKey) {
    return null;
  }

  const config = resolveAgentPromptConfig();
  const assignmentKey =
    params.assignmentKey ?? config.rolloutAssignmentKey;
  const rollout = params.service.getActiveRollout({
    promptKey,
    organizationId: params.organizationId
  });

  if (rollout) {
    const assignment = assignRolloutVariant({
      rollout,
      context: {
        organizationId: params.organizationId,
        userId: params.userId,
        targetId: params.targetId
      },
      assignmentKey
    });
    if (assignment) {
      const version = params.service.getById(assignment.prompt_version_id);
      if (version) {
        return stampFromPromptVersion(version, {
          rollout_id: assignment.rollout_id,
          experiment_variant: assignment.variant
        });
      }
    }
  }

  const active = params.service.getActive({
    promptKey,
    organizationId: params.organizationId
  });
  if (!active) {
    return null;
  }
  return stampFromPromptVersion(active);
}
