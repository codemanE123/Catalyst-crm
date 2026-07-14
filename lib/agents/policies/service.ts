import { collectActiveBreakGlassKeys, createBreakGlassGrant } from "./breakGlass";
import { buildSystemDefaultValues } from "./defaults";
import { classifyActivationImpact, comparePolicyValues } from "./impact";
import {
  resolveAgentPolicy,
  stampFromResolvedPolicy,
  type PolicyOverrideLayer
} from "./resolve";
import { listPolicyKeys } from "./schema";
import {
  policyValuesContainSecrets,
  validatePolicyValueMap
} from "./validation";
import type {
  AgentPolicySet,
  AgentPolicyValue,
  BreakGlassGrant,
  PolicyExecutionStamp,
  PolicySource,
  ResolvedAgentPolicy
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function scopeKey(organizationId: string | null): string {
  return organizationId ?? "__global__";
}

type ServiceError = { ok: false; error: string };

/**
 * In-memory policy registry for tests and lifecycle logic mirrored by Supabase actions.
 */
export class InMemoryAgentPolicyService {
  sets: AgentPolicySet[] = [];
  values: AgentPolicyValue[] = [];
  breakGlass: BreakGlassGrant[] = [];

  listSets(organizationId?: string | null): AgentPolicySet[] {
    if (organizationId === undefined) {
      return [...this.sets];
    }
    return this.sets.filter((row) => row.organization_id === organizationId);
  }

  getSet(id: string): AgentPolicySet | null {
    return this.sets.find((row) => row.id === id) ?? null;
  }

  getValues(policySetId: string): AgentPolicyValue[] {
    return this.values.filter((row) => row.policy_set_id === policySetId);
  }

  getActiveSet(organizationId: string | null): AgentPolicySet | null {
    return (
      this.sets.find(
        (row) =>
          row.organization_id === organizationId && row.status === "active"
      ) ?? null
    );
  }

  createDraft(input: {
    organizationId: string | null;
    name: string;
    version: string;
    description?: string;
    changeSummary?: string;
    createdBy: string | null;
    seedFromDefaults?: boolean;
    cloneFromId?: string;
  }): { ok: true; set: AgentPolicySet } | ServiceError {
    if (
      this.sets.some(
        (row) =>
          scopeKey(row.organization_id) === scopeKey(input.organizationId) &&
          row.version === input.version
      )
    ) {
      return { ok: false, error: "Version already exists in this scope." };
    }

    const set: AgentPolicySet = {
      id: newId("ps"),
      organization_id: input.organizationId,
      name: input.name,
      version: input.version,
      status: "draft",
      description: input.description ?? null,
      change_summary: input.changeSummary ?? null,
      created_by: input.createdBy,
      created_at: nowIso(),
      updated_at: nowIso(),
      activated_at: null,
      deprecated_at: null
    };
    this.sets.push(set);

    let seed: Record<string, unknown> = {};
    let source: PolicySource = "system_default";

    if (input.cloneFromId) {
      const sourceSet = this.getSet(input.cloneFromId);
      if (!sourceSet) {
        return { ok: false, error: "Clone source not found." };
      }
      if (scopeKey(sourceSet.organization_id) !== scopeKey(input.organizationId)) {
        return { ok: false, error: "Cannot clone across organization scopes." };
      }
      seed = Object.fromEntries(
        this.getValues(sourceSet.id).map((row) => [row.policy_key, row.value_json])
      );
      source =
        input.organizationId == null
          ? "global_override"
          : "organization_override";
    } else if (input.seedFromDefaults !== false) {
      seed = buildSystemDefaultValues();
      source =
        input.organizationId == null
          ? "global_override"
          : "organization_override";
    }

    if (policyValuesContainSecrets(seed)) {
      return { ok: false, error: "Secrets are not allowed in policy values." };
    }

    for (const definition of listPolicyKeys()) {
      if (!(definition.key in seed)) {
        continue;
      }
      this.values.push({
        id: newId("pv"),
        policy_set_id: set.id,
        policy_key: definition.key,
        value_json: seed[definition.key],
        value_type: definition.value_type,
        source,
        description: definition.description,
        created_at: nowIso(),
        updated_at: nowIso()
      });
    }

    return { ok: true, set };
  }

  updateDraftValues(params: {
    policySetId: string;
    values: Record<string, unknown>;
    breakGlassKeys?: Set<string>;
  }): { ok: true; set: AgentPolicySet } | ServiceError {
    const set = this.getSet(params.policySetId);
    if (!set) {
      return { ok: false, error: "Policy set not found." };
    }
    if (set.status !== "draft") {
      return {
        ok: false,
        error: "Active, deprecated, or archived policy sets are immutable."
      };
    }

    if (policyValuesContainSecrets(params.values)) {
      return { ok: false, error: "Secrets are not allowed in policy values." };
    }

    const validated = validatePolicyValueMap(params.values, {
      breakGlassKeys: params.breakGlassKeys
    });
    if (!validated.ok) {
      return {
        ok: false,
        error: validated.issues.map((issue) => issue.message).join(" ")
      };
    }

    for (const [key, value] of Object.entries(params.values)) {
      const existing = this.values.find(
        (row) => row.policy_set_id === set.id && row.policy_key === key
      );
      const definition = listPolicyKeys().find((entry) => entry.key === key)!;
      if (existing) {
        existing.value_json = value;
        existing.updated_at = nowIso();
      } else {
        this.values.push({
          id: newId("pv"),
          policy_set_id: set.id,
          policy_key: key,
          value_json: value,
          value_type: definition.value_type,
          source:
            set.organization_id == null
              ? "global_override"
              : "organization_override",
          description: definition.description,
          created_at: nowIso(),
          updated_at: nowIso()
        });
      }
    }

    set.updated_at = nowIso();
    return { ok: true, set };
  }

  validateDraft(policySetId: string):
    | { ok: true }
    | { ok: false; error: string } {
    const set = this.getSet(policySetId);
    if (!set) {
      return { ok: false, error: "Policy set not found." };
    }

    const map = Object.fromEntries(
      this.getValues(policySetId).map((row) => [row.policy_key, row.value_json])
    );
    const breakGlassKeys = collectActiveBreakGlassKeys(this.breakGlass);
    const validated = validatePolicyValueMap(map, { breakGlassKeys });
    if (!validated.ok) {
      return {
        ok: false,
        error: validated.issues.map((issue) => `${issue.key}: ${issue.message}`).join(" ")
      };
    }
    return { ok: true };
  }

  activate(
    policySetId: string,
    options?: { allowHighRiskWithoutBreakGlass?: boolean }
  ):
    | { ok: true; set: AgentPolicySet; deactivatedId: string | null }
    | ServiceError {
    const set = this.getSet(policySetId);
    if (!set) {
      return { ok: false, error: "Policy set not found." };
    }

    const validation = this.validateDraft(policySetId);
    if (!validation.ok) {
      return validation;
    }

    const active = this.getActiveSet(set.organization_id);
    const before = active
      ? Object.fromEntries(
          this.getValues(active.id).map((row) => [row.policy_key, row.value_json])
        )
      : buildSystemDefaultValues();
    const after = Object.fromEntries(
      this.getValues(set.id).map((row) => [row.policy_key, row.value_json])
    );
    const impact = classifyActivationImpact(comparePolicyValues(before, after));

    if (impact.blocked && !options?.allowHighRiskWithoutBreakGlass) {
      const breakGlassKeys = collectActiveBreakGlassKeys(this.breakGlass);
      const stillBlocked = impact.prohibited.filter(
        (change) => !breakGlassKeys.has(change.key)
      );
      if (stillBlocked.length > 0) {
        return {
          ok: false,
          error: `Prohibited changes require break-glass: ${stillBlocked
            .map((row) => row.key)
            .join(", ")}.`
        };
      }
    }

    let deactivatedId: string | null = null;
    for (const row of this.sets) {
      if (
        scopeKey(row.organization_id) === scopeKey(set.organization_id) &&
        row.status === "active" &&
        row.id !== set.id
      ) {
        row.status = "deprecated";
        row.deprecated_at = nowIso();
        row.updated_at = nowIso();
        deactivatedId = row.id;
      }
    }

    set.status = "active";
    set.activated_at = nowIso();
    set.deprecated_at = null;
    set.updated_at = nowIso();
    return { ok: true, set, deactivatedId };
  }

  deprecate(id: string): { ok: true; set: AgentPolicySet } | ServiceError {
    const set = this.getSet(id);
    if (!set) {
      return { ok: false, error: "Policy set not found." };
    }
    set.status = "deprecated";
    set.deprecated_at = nowIso();
    set.updated_at = nowIso();
    return { ok: true, set };
  }

  archive(id: string): { ok: true; set: AgentPolicySet } | ServiceError {
    const set = this.getSet(id);
    if (!set) {
      return { ok: false, error: "Policy set not found." };
    }
    if (set.status === "active") {
      return {
        ok: false,
        error: "Deprecate or roll back the active policy before archiving."
      };
    }
    set.status = "archived";
    set.updated_at = nowIso();
    return { ok: true, set };
  }

  rollback(params: {
    organizationId: string | null;
    toPolicySetId: string;
  }): { ok: true; set: AgentPolicySet } | ServiceError {
    const target = this.getSet(params.toPolicySetId);
    if (!target) {
      return { ok: false, error: "Rollback target not found." };
    }
    if (scopeKey(target.organization_id) !== scopeKey(params.organizationId)) {
      return { ok: false, error: "Rollback scope mismatch." };
    }
    if (target.status === "archived") {
      return { ok: false, error: "Cannot roll back to an archived policy." };
    }

    // Re-activating a previous version: clone values into content immutability
    // by flipping status after validation of stored values.
    if (target.status === "draft") {
      return this.activate(target.id);
    }

    for (const row of this.sets) {
      if (
        scopeKey(row.organization_id) === scopeKey(params.organizationId) &&
        row.status === "active"
      ) {
        row.status = "deprecated";
        row.deprecated_at = nowIso();
        row.updated_at = nowIso();
      }
    }

    target.status = "active";
    target.activated_at = target.activated_at ?? nowIso();
    target.deprecated_at = null;
    target.updated_at = nowIso();
    return { ok: true, set: target };
  }

  resolveForOrganization(
    organizationId: string,
    env?: NodeJS.ProcessEnv
  ): ResolvedAgentPolicy {
    const orgSet = this.getActiveSet(organizationId);
    const globalSet = this.getActiveSet(null);
    const breakGlassKeys = collectActiveBreakGlassKeys(this.breakGlass);

    const toLayer = (
      set: AgentPolicySet | null
    ): PolicyOverrideLayer | null =>
      set
        ? { policySet: set, values: this.getValues(set.id) }
        : null;

    return resolveAgentPolicy({
      organizationId,
      organizationLayer: toLayer(orgSet),
      globalLayer: toLayer(globalSet),
      env,
      activeBreakGlassKeys: breakGlassKeys
    });
  }

  stampForOrganization(organizationId: string): PolicyExecutionStamp {
    return stampFromResolvedPolicy(this.resolveForOrganization(organizationId));
  }

  grantBreakGlass(input: {
    organizationId: string | null;
    policyKey: string;
    reason: string;
    expiresAt: string;
    createdBy: string;
    isSuperAdmin: boolean;
  }): { ok: true; grant: BreakGlassGrant } | ServiceError {
    const created = createBreakGlassGrant(
      {
        organizationId: input.organizationId,
        policyKey: input.policyKey,
        reason: input.reason,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy
      },
      { isSuperAdmin: input.isSuperAdmin }
    );
    if (!created.ok) {
      return created;
    }
    this.breakGlass.push(created.grant);
    return created;
  }

  expireDueBreakGlass(now: Date = new Date()): BreakGlassGrant[] {
    const expired: BreakGlassGrant[] = [];
    for (const grant of this.breakGlass) {
      if (!grant.expired_at && new Date(grant.expires_at).getTime() <= now.getTime()) {
        grant.expired_at = now.toISOString();
        expired.push(grant);
      }
    }
    return expired;
  }
}
