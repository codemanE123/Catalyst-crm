import { describe, expect, it } from "vitest";

import {
  canManageGlobalPrompts,
  canManageOrgPrompts,
  canManagePromptScope,
  canViewPromptRegistry
} from "@/lib/authz";
import {
  InMemoryPromptRegistryService,
  executionStampHasRawPrompt,
  findForbiddenPromptContent,
  renderPromptTemplates,
  resolvePromptForExecution,
  sanitizePromptAuditMetadata,
  validatePromptDraftContent,
  evaluatePromptActivationGates
} from "@/lib/agents/prompts";
import { validateOutputAgainstSchema } from "@/lib/agents/schemas";
import {
  assignRolloutVariant,
  compareRolloutVariants,
  stableHashToBucket
} from "@/lib/agents/rollouts";
import type { OrganizationMember } from "@/lib/supabase";

function member(
  role: OrganizationMember["role"],
  organizationId = "org-1"
): OrganizationMember {
  return {
    id: `${role}-${organizationId}`,
    organization_id: organizationId,
    user_id: "user-1",
    role,
    created_at: "2026-07-14T12:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z"
  };
}

function seedActivePair(service: InMemoryPromptRegistryService) {
  const control = service.createDraft({
    organizationId: "org-1",
    promptKey: "prospect.enrich",
    version: "v1",
    agentName: "ProspectEnrichmentAgent",
    systemPrompt: "Public CRM enrichment assistant.",
    userPromptTemplate: "Analyze {{institution_name}} in {{icp_geography}}.",
    outputSchemaVersion: "prospect.enrich.output.v1",
    provider: "openai",
    model: "gpt-4o-mini",
    safetyPolicyVersion: "safety.policy.v1",
    createdBy: "user-1",
    maxOutputTokens: 800
  });
  expect(control.ok).toBe(true);
  if (!control.ok) {
    throw new Error(control.error);
  }

  const activated = service.activate({ id: control.version.id });
  expect(activated.ok).toBe(true);

  const treatment = service.createDraft({
    organizationId: "org-1",
    promptKey: "prospect.enrich",
    version: "v2",
    agentName: "ProspectEnrichmentAgent",
    systemPrompt: "Public CRM enrichment assistant v2.",
    userPromptTemplate: "Review {{institution_name}} under {{icp_geography}}.",
    outputSchemaVersion: "prospect.enrich.output.v1",
    provider: "openai",
    model: "gpt-4o-mini",
    safetyPolicyVersion: "safety.policy.v1",
    createdBy: "user-1",
    maxOutputTokens: 800
  });
  expect(treatment.ok).toBe(true);
  if (!treatment.ok) {
    throw new Error(treatment.error);
  }

  return {
    control: control.version,
    treatment: treatment.version
  };
}

describe("prompt version lifecycle", () => {
  it("creates drafts, clones, and keeps one active per scope", () => {
    const service = new InMemoryPromptRegistryService();
    const created = service.createDraft({
      organizationId: null,
      promptKey: "prospect.enrich",
      version: "v1",
      agentName: "ProspectEnrichmentAgent",
      systemPrompt: "Safe system.",
      userPromptTemplate: "Hello {{institution_name}}",
      outputSchemaVersion: "prospect.enrich.output.v1",
      provider: "openai",
      model: "gpt-4o-mini",
      safetyPolicyVersion: "safety.policy.v1",
      createdBy: "admin-1"
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const clone = service.cloneVersion({
      sourceId: created.version.id,
      newVersion: "v1.1",
      createdBy: "admin-1"
    });
    expect(clone.ok).toBe(true);

    const first = service.activate({ id: created.version.id });
    expect(first.ok).toBe(true);

    const secondDraft = service.createDraft({
      organizationId: null,
      promptKey: "prospect.enrich",
      version: "v2",
      agentName: "ProspectEnrichmentAgent",
      systemPrompt: "Safe system.",
      userPromptTemplate: "Hello {{institution_name}}",
      outputSchemaVersion: "prospect.enrich.output.v1",
      provider: "openai",
      model: "gpt-4o-mini",
      safetyPolicyVersion: "safety.policy.v1",
      createdBy: "admin-1"
    });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) return;

    const second = service.activate({ id: secondDraft.version.id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const actives = service
      .listVersions({ promptKey: "prospect.enrich" })
      .filter((row) => row.status === "active" && row.organization_id == null);
    expect(actives).toHaveLength(1);
    expect(actives[0]?.id).toBe(secondDraft.version.id);
    expect(service.getById(created.version.id)?.status).toBe("deprecated");
  });

  it("rejects mutating active versions", () => {
    const service = new InMemoryPromptRegistryService();
    const created = service.createDraft({
      organizationId: "org-1",
      promptKey: "prospect.enrich",
      version: "v1",
      agentName: "ProspectEnrichmentAgent",
      systemPrompt: "Safe system.",
      userPromptTemplate: "Hello {{institution_name}}",
      outputSchemaVersion: "prospect.enrich.output.v1",
      provider: "openai",
      model: "gpt-4o-mini",
      safetyPolicyVersion: "safety.policy.v1",
      createdBy: "admin-1"
    });
    if (!created.ok) throw new Error(created.error);
    expect(service.activate({ id: created.version.id }).ok).toBe(true);

    const mutated = service.updateDraftContent({
      id: created.version.id,
      systemPrompt: "Changed"
    });
    expect(mutated.ok).toBe(false);
  });
});

describe("prompt rendering and safety", () => {
  it("rejects unknown and missing placeholders and length limits", () => {
    const unknown = renderPromptTemplates({
      promptKey: "prospect.enrich",
      version: "v1",
      systemPrompt: "x",
      userPromptTemplate: "Hi {{not_allowed}}",
      outputSchemaVersion: "prospect.enrich.output.v1",
      variables: {}
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.reason_code).toBe("unknown_placeholder");
    }

    const missing = renderPromptTemplates({
      promptKey: "prospect.enrich",
      version: "v1",
      systemPrompt: "x",
      userPromptTemplate: "Hi {{institution_name}}",
      outputSchemaVersion: "prospect.enrich.output.v1",
      variables: {},
      requiredPlaceholders: ["institution_name"]
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.reason_code).toBe("missing_placeholder");
    }

    const tooLong = validatePromptDraftContent({
      systemPrompt: "a".repeat(20000),
      userPromptTemplate: "b".repeat(20000),
      config: {
        maxTemplateChars: 1000,
        maxOutputTokens: 1000,
        rolloutDefaultPercentage: 0,
        rolloutAssignmentKey: "organization_id",
        requireSafetyPolicy: true,
        requireSchemaVersion: true,
        activationMinQuality: 3
      }
    });
    expect(tooLong.ok).toBe(false);

    const rendered = renderPromptTemplates({
      promptKey: "prospect.enrich",
      version: "v1",
      systemPrompt: "Safe",
      userPromptTemplate: "School {{institution_name}}",
      outputSchemaVersion: "prospect.enrich.output.v1",
      variables: { institution_name: "State U" }
    });
    expect(rendered.ok).toBe(true);
    if (rendered.ok) {
      expect(rendered.user_prompt).toContain("State U");
    }
  });

  it("blocks forbidden prompt content", () => {
    const hits = findForbiddenPromptContent(
      "Include student SSN and auto-approve prospect",
      "send proposal without approval"
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("sanitizes audit metadata and forbids raw prompts in execution stamps", () => {
    const sanitized = sanitizePromptAuditMetadata({
      prompt_key: "prospect.enrich",
      system_prompt: "SECRET",
      api_key: "sk-test",
      version: "v1"
    });
    expect(sanitized.system_prompt).toBeUndefined();
    expect(sanitized.api_key).toBeUndefined();
    expect(sanitized.prompt_key).toBe("prospect.enrich");

    expect(
      executionStampHasRawPrompt({
        prompt_key: "x",
        system_prompt: "nope"
      })
    ).toBe(true);
    expect(
      executionStampHasRawPrompt({
        prompt_key: "x",
        prompt_version: "v1"
      })
    ).toBe(false);
  });
});

describe("output schema versioning", () => {
  it("validates and rejects invalid output without silent coercion", () => {
    const bad = validateOutputAgainstSchema("prospect.enrich.output.v1", {
      public_summary: "short"
    });
    expect(bad.ok).toBe(false);

    const unknown = validateOutputAgainstSchema("missing.schema", {});
    expect(unknown.ok).toBe(false);
  });
});

describe("activation gates", () => {
  it("requires schema, safety, model, and quality threshold when data exists", () => {
    const result = evaluatePromptActivationGates({
      version: {
        system_prompt: "Safe",
        user_prompt_template: "Hi {{institution_name}}",
        output_schema_version: "prospect.enrich.output.v1",
        safety_policy_version: "safety.policy.v1",
        provider: "openai",
        model: "gpt-4o-mini",
        max_output_tokens: 500,
        status: "draft"
      },
      schemaExists: true,
      testsPassed: true,
      averageQualityScore: 2
    });
    expect(result.ok).toBe(false);
  });
});

describe("deterministic rollouts", () => {
  it("assigns stably and respects percentage boundaries and allowlists", () => {
    const service = new InMemoryPromptRegistryService();
    const { control, treatment } = seedActivePair(service);

    const rollout = service.createRollout({
      organization_id: "org-1",
      agent_name: "ProspectEnrichmentAgent",
      prompt_key: "prospect.enrich",
      control_prompt_version_id: control.id,
      treatment_prompt_version_id: treatment.id,
      rollout_type: "percentage",
      rollout_percentage: 0,
      started_at: null,
      ended_at: null,
      created_by: "admin-1",
      metadata: {}
    });
    expect(rollout.ok).toBe(true);
    if (!rollout.ok) return;

    service.transitionRollout(rollout.rollout.id, "active");

    const zero = assignRolloutVariant({
      rollout: { ...rollout.rollout, status: "active", rollout_percentage: 0 },
      context: { organizationId: "org-1" },
      assignmentKey: "organization_id"
    });
    expect(zero?.variant).toBe("control");

    const full = assignRolloutVariant({
      rollout: { ...rollout.rollout, status: "active", rollout_percentage: 100 },
      context: { organizationId: "org-1" },
      assignmentKey: "organization_id"
    });
    expect(full?.variant).toBe("treatment");

    const a = stableHashToBucket(`${rollout.rollout.id}:organization_id:org-1`);
    const b = stableHashToBucket(`${rollout.rollout.id}:organization_id:org-1`);
    expect(a).toBe(b);

    const allowlist = assignRolloutVariant({
      rollout: {
        ...rollout.rollout,
        status: "active",
        rollout_type: "organization_allowlist",
        metadata: { organization_allowlist: ["org-1"] }
      },
      context: { organizationId: "org-1" },
      assignmentKey: "organization_id"
    });
    expect(allowlist?.variant).toBe("treatment");

    expect(service.transitionRollout(rollout.rollout.id, "paused").ok).toBe(true);
    expect(service.transitionRollout(rollout.rollout.id, "active").ok).toBe(true);
    expect(service.transitionRollout(rollout.rollout.id, "cancelled").ok).toBe(true);
  });

  it("keeps in-flight execution stamps stable across rollback", () => {
    const service = new InMemoryPromptRegistryService();
    const { control, treatment } = seedActivePair(service);
    expect(service.activate({ id: treatment.id }).ok).toBe(true);

    const stampBefore = resolvePromptForExecution({
      service,
      agentName: "ProspectEnrichmentAgent",
      organizationId: "org-1"
    });
    expect(stampBefore?.prompt_version_id).toBe(treatment.id);

    const existing = { ...stampBefore! };
    expect(service.rollback({
      promptKey: "prospect.enrich",
      organizationId: "org-1",
      toVersionId: control.id
    }).ok).toBe(true);

    const stampAfter = resolvePromptForExecution({
      service,
      agentName: "ProspectEnrichmentAgent",
      organizationId: "org-1",
      existing
    });
    expect(stampAfter?.prompt_version_id).toBe(treatment.id);

    const future = resolvePromptForExecution({
      service,
      agentName: "ProspectEnrichmentAgent",
      organizationId: "org-1"
    });
    expect(future?.prompt_version_id).toBe(control.id);
  });

  it("compares control vs treatment metrics without auto-promoting", () => {
    const comparison = compareRolloutVariants([
      {
        experiment_variant: "control",
        overall_score: 4,
        outcome: "accepted",
        estimated_cost_usd: 0.02,
        latency_ms: 100,
        safety_flags: 0,
        citation_present: true,
        high_confidence_rejection: false
      },
      {
        experiment_variant: "treatment",
        overall_score: 3,
        outcome: "rejected",
        estimated_cost_usd: 0.03,
        latency_ms: 120,
        safety_flags: 1,
        citation_present: false,
        high_confidence_rejection: true
      }
    ]);

    expect(comparison.control.acceptance_rate).toBe(1);
    expect(comparison.treatment.rejection_rate).toBe(1);
  });
});

describe("prompt registry permissions", () => {
  it("scopes sales read-only, admin org, super_admin global, read_only denied", () => {
    expect(canViewPromptRegistry([member("read_only")])).toBe(false);
    expect(canViewPromptRegistry([member("sales")])).toBe(true);
    expect(canManageOrgPrompts([member("sales")], "org-1")).toBe(false);
    expect(canManageOrgPrompts([member("admin")], "org-1")).toBe(true);
    expect(canManageOrgPrompts([member("admin")], "org-2")).toBe(false);
    expect(canManageGlobalPrompts([member("admin")])).toBe(false);
    expect(canManageGlobalPrompts([member("super_admin")])).toBe(true);
    expect(canManagePromptScope([member("super_admin")], null)).toBe(true);
    expect(canManagePromptScope([member("admin")], null)).toBe(false);
  });
});
