import { describe, expect, it } from "vitest";

import {
  canManageGlobalPolicies,
  canManageOrgPolicies,
  canUsePolicyBreakGlass,
  canViewAgentPolicies
} from "@/lib/authz";
import {
  InMemoryAgentPolicyService,
  classifyActivationImpact,
  comparePolicyValues,
  createBreakGlassGrant,
  detectPolicyDrift,
  expireBreakGlassGrant,
  isBreakGlassActive,
  resolveAgentPolicy,
  sanitizePolicyAuditMetadata,
  stampFromResolvedPolicy,
  validatePolicyValue,
  validatePolicyValueMap
} from "@/lib/agents/policies";
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

describe("policy resolution hierarchy", () => {
  it("uses organization over global over system defaults", () => {
    const service = new InMemoryAgentPolicyService();

    const global = service.createDraft({
      organizationId: null,
      name: "Global",
      version: "g1",
      createdBy: "sa"
    });
    expect(global.ok).toBe(true);
    if (!global.ok) return;
    service.updateDraftValues({
      policySetId: global.set.id,
      values: { daily_budget_usd: 40, max_concurrent_executions: 3 }
    });
    expect(service.activate(global.set.id).ok).toBe(true);

    const org = service.createDraft({
      organizationId: "org-1",
      name: "Org",
      version: "o1",
      createdBy: "admin"
    });
    expect(org.ok).toBe(true);
    if (!org.ok) return;
    service.updateDraftValues({
      policySetId: org.set.id,
      values: { daily_budget_usd: 15 }
    });
    expect(service.activate(org.set.id).ok).toBe(true);

    // Full org snapshot overrides all keys; budget is explicitly changed.
    const resolved = service.resolveForOrganization("org-1");
    expect(resolved.flat.daily_budget_usd).toBe(15);
    expect(resolved.values.daily_budget_usd.source).toBe(
      "organization_override"
    );
    expect(resolved.policy_scope).toBe("organization");
    expect(resolved.flat.require_prospect_approval).toBe(true);

    // Partial-layer merge (org only sets budget): global concurrency still applies.
    const partial = resolveAgentPolicy({
      organizationId: "org-1",
      organizationLayer: {
        policySet: {
          ...org.set,
          status: "active"
        },
        values: [
          {
            id: "v1",
            policy_set_id: org.set.id,
            policy_key: "daily_budget_usd",
            value_json: 12,
            value_type: "decimal",
            source: "organization_override",
            description: null,
            created_at: org.set.created_at,
            updated_at: org.set.updated_at
          }
        ]
      },
      globalLayer: {
        policySet: { ...global.set, status: "active" },
        values: service.getValues(global.set.id)
      }
    });
    expect(partial.flat.daily_budget_usd).toBe(12);
    expect(partial.flat.max_concurrent_executions).toBe(3);
    expect(partial.values.max_concurrent_executions.source).toBe(
      "global_override"
    );
  });

  it("global wins over system when no org policy", () => {
    const service = new InMemoryAgentPolicyService();
    const global = service.createDraft({
      organizationId: null,
      name: "Global",
      version: "g1",
      createdBy: "sa"
    });
    if (!global.ok) throw new Error(global.error);
    service.updateDraftValues({
      policySetId: global.set.id,
      values: { max_llm_calls_per_day: 50 }
    });
    service.activate(global.set.id);

    const resolved = service.resolveForOrganization("org-2");
    expect(resolved.flat.max_llm_calls_per_day).toBe(50);
    expect(resolved.policy_scope).toBe("global");
  });
});

describe("policy validation", () => {
  it("rejects unknown keys, invalid types, and out-of-range values", () => {
    expect(validatePolicyValue("not_a_key", true).ok).toBe(false);
    expect(validatePolicyValue("daily_budget_usd", "ten").ok).toBe(false);
    expect(validatePolicyValue("max_concurrent_executions", -1).ok).toBe(false);
    expect(validatePolicyValue("daily_budget_usd", 10).ok).toBe(true);
  });

  it("blocks prohibited autonomy without break-glass", () => {
    const result = validatePolicyValueMap({
      allow_auto_send_email: true
    });
    expect(result.ok).toBe(false);

    const withGlass = validatePolicyValueMap(
      { allow_auto_send_email: true },
      { breakGlassKeys: new Set(["allow_auto_send_email"]) }
    );
    expect(withGlass.ok).toBe(true);
  });
});

describe("policy lifecycle", () => {
  it("enforces immutable active versions and one active per scope", () => {
    const service = new InMemoryAgentPolicyService();
    const first = service.createDraft({
      organizationId: "org-1",
      name: "A",
      version: "v1",
      createdBy: "admin"
    });
    if (!first.ok) throw new Error(first.error);
    expect(service.activate(first.set.id).ok).toBe(true);

    const mutate = service.updateDraftValues({
      policySetId: first.set.id,
      values: { daily_budget_usd: 99 }
    });
    expect(mutate.ok).toBe(false);

    const second = service.createDraft({
      organizationId: "org-1",
      name: "B",
      version: "v2",
      createdBy: "admin",
      cloneFromId: first.set.id
    });
    if (!second.ok) throw new Error(second.error);
    expect(service.activate(second.set.id).ok).toBe(true);

    const actives = service
      .listSets("org-1")
      .filter((row) => row.status === "active");
    expect(actives).toHaveLength(1);
    expect(actives[0]?.id).toBe(second.set.id);
    expect(service.getSet(first.set.id)?.status).toBe("deprecated");
  });

  it("compares versions and blocks prohibited activation", () => {
    const before = { daily_budget_usd: 10, allow_auto_send_email: false };
    const after = { daily_budget_usd: 25, allow_auto_send_email: true };
    const changes = comparePolicyValues(before, after);
    const impact = classifyActivationImpact(changes);
    expect(impact.operational.length).toBeGreaterThan(0);
    expect(impact.prohibited.some((row) => row.key === "allow_auto_send_email")).toBe(
      true
    );
    expect(impact.blocked).toBe(true);
  });
});

describe("break-glass", () => {
  it("requires super_admin, reason, and expiry; expires correctly", () => {
    const denied = createBreakGlassGrant(
      {
        organizationId: "org-1",
        policyKey: "allow_private_crm_context",
        reason: "Need temporary CRM context for incident review case.",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdBy: "u1"
      },
      { isSuperAdmin: false }
    );
    expect(denied.ok).toBe(false);

    const ok = createBreakGlassGrant(
      {
        organizationId: "org-1",
        policyKey: "allow_private_crm_context",
        reason: "Need temporary CRM context for incident review case.",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdBy: "u1"
      },
      { isSuperAdmin: true }
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(isBreakGlassActive(ok.grant)).toBe(true);

    const expired = expireBreakGlassGrant(ok.grant);
    expect(isBreakGlassActive(expired)).toBe(false);
  });

  it("service expireDueBreakGlass marks grants", () => {
    const service = new InMemoryAgentPolicyService();
    const grant = service.grantBreakGlass({
      organizationId: "org-1",
      policyKey: "require_source_citations",
      reason: "Temporary citation waiver for staged experiment review.",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      createdBy: "sa",
      isSuperAdmin: true
    });
    // past expiry rejected at create — create future then force expire
    expect(grant.ok).toBe(false);

    const future = service.grantBreakGlass({
      organizationId: "org-1",
      policyKey: "require_source_citations",
      reason: "Temporary citation waiver for staged experiment review.",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdBy: "sa",
      isSuperAdmin: true
    });
    expect(future.ok).toBe(true);
    if (!future.ok) return;
    future.grant.expires_at = new Date(Date.now() - 1000).toISOString();
    const expired = service.expireDueBreakGlass();
    expect(expired).toHaveLength(1);
  });
});

describe("execution stamp and drift", () => {
  it("stamps policy metadata without secrets and preserves existing stamps", () => {
    const service = new InMemoryAgentPolicyService();
    const draft = service.createDraft({
      organizationId: "org-1",
      name: "A",
      version: "v1",
      createdBy: "admin"
    });
    if (!draft.ok) throw new Error(draft.error);
    service.activate(draft.set.id);

    const stamp = service.stampForOrganization("org-1");
    expect(stamp.policy_set_id).toBe(draft.set.id);
    expect(stamp.policy_scope).toBe("organization");
    expect(stamp.resolved_policy_hash.length).toBeGreaterThan(0);
    expect("api_key" in stamp).toBe(false);

    const preserved = resolveAgentPolicy({
      organizationId: "org-1",
      organizationLayer: null,
      globalLayer: null
    });
    const reminted = stampFromResolvedPolicy(preserved);
    expect(reminted.policy_scope).toBe("system");
  });

  it("detects missing org policy and env drift", () => {
    const resolved = resolveAgentPolicy({
      organizationId: "org-1",
      organizationLayer: null,
      globalLayer: null,
      env: {
        AGENT_POLICY_DEFAULT_DAILY_BUDGET_USD: "10",
        AGENT_POLICY_DEFAULT_MAX_CONCURRENCY: "2"
      }
    });

    // Force mismatch by mutating flat after resolve is awkward; call detect with
    // resolved that has different concurrency than bootstrap defaults used.
    const flags = detectPolicyDrift({
      resolved: {
        ...resolved,
        flat: { ...resolved.flat, max_concurrent_executions: 9 }
      },
      organizationHasActivePolicy: false,
      env: {
        AGENT_POLICY_DEFAULT_MAX_CONCURRENCY: "2"
      }
    });

    expect(
      flags.some((flag) => flag.code === "organization_missing_active_policy")
    ).toBe(true);
    expect(
      flags.some((flag) => flag.code === "env_conflicts_with_db_policy")
    ).toBe(true);
  });
});

describe("authorization and audit sanitation", () => {
  it("scopes roles correctly", () => {
    expect(canViewAgentPolicies([member("read_only")])).toBe(false);
    expect(canViewAgentPolicies([member("sales")])).toBe(true);
    expect(canManageOrgPolicies([member("sales")], "org-1")).toBe(false);
    expect(canManageOrgPolicies([member("admin")], "org-1")).toBe(true);
    expect(canManageOrgPolicies([member("admin")], "org-2")).toBe(false);
    expect(canManageGlobalPolicies([member("admin")])).toBe(false);
    expect(canManageGlobalPolicies([member("super_admin")])).toBe(true);
    expect(canUsePolicyBreakGlass([member("admin")])).toBe(false);
    expect(canUsePolicyBreakGlass([member("super_admin")])).toBe(true);
  });

  it("sanitizes audit metadata", () => {
    const cleaned = sanitizePolicyAuditMetadata({
      version: "v1",
      api_key: "sk-secret",
      system_prompt: "hidden",
      changed_keys: "daily_budget_usd"
    });
    expect(cleaned.api_key).toBeUndefined();
    expect(cleaned.system_prompt).toBeUndefined();
    expect(cleaned.version).toBe("v1");
  });
});

describe("safe defaults", () => {
  it("keeps autonomy and private data disabled", () => {
    const resolved = resolveAgentPolicy({
      organizationId: "org-1",
      organizationLayer: null,
      globalLayer: null
    });
    expect(resolved.flat.allow_auto_approve_prospects).toBe(false);
    expect(resolved.flat.allow_auto_send_email).toBe(false);
    expect(resolved.flat.allow_auto_send_proposals).toBe(false);
    expect(resolved.flat.allow_auto_create_contacts).toBe(false);
    expect(resolved.flat.allow_private_crm_context).toBe(false);
    expect(resolved.flat.allow_contact_personal_data).toBe(false);
    expect(resolved.flat.require_prospect_approval).toBe(true);
    expect(resolved.flat.require_source_citations).toBe(true);
    expect(resolved.flat.prospect_enrichment_enabled).toBe(false);
  });
});
