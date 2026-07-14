"use server";

import { revalidatePath } from "next/cache";

import {
  canManagePolicyScope,
  canUsePolicyBreakGlass,
  canViewAgentPolicies,
  getMembershipsForUser,
  isSuperAdmin
} from "@/lib/authz";
import { recordAuditEvent } from "@/lib/auditLog";
import {
  AGENT_POLICY_AUDIT_ACTIONS,
  buildSystemDefaultValues,
  classifyActivationImpact,
  comparePolicyValues,
  detectPolicyDrift,
  listPolicyKeys,
  listPolicyKeysByCategory,
  sanitizePolicyAuditMetadata,
  validatePolicyValueMap
} from "@/lib/agents/policies";
import {
  mapPolicySet,
  mapPolicyValue,
  resolveAgentPolicyFromSupabase,
  SET_SELECT,
  VALUE_SELECT
} from "@/lib/agents/policies/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type PolicyActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string };

async function requirePolicyContext() {
  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false as const,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();
  if (!user) {
    return { ok: false as const, error: "Sign in to manage agent policies." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewAgentPolicies(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to view agent policies."
    };
  }

  return { ok: true as const, supabase, user, memberships };
}

export async function loadAgentPoliciesPage(organizationId?: string | null) {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const isSalesOnly = !ctx.memberships.some(
    (m) => m.role === "admin" || m.role === "super_admin"
  );

  let setsQuery = ctx.supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .order("created_at", { ascending: false });

  if (organizationId) {
    setsQuery = setsQuery.or(
      `organization_id.eq.${organizationId},organization_id.is.null`
    );
  }

  const { data: setRows } = await setsQuery;
  const sets = (setRows ?? []).map((row) =>
    mapPolicySet(row as Record<string, unknown>)
  );

  const setIds = sets.map((row) => row.id);
  const { data: valueRows } =
    setIds.length > 0
      ? await ctx.supabase
          .from("agent_policy_values")
          .select(VALUE_SELECT)
          .in("policy_set_id", setIds)
      : { data: [] };

  const values = (valueRows ?? []).map((row) =>
    mapPolicyValue(row as Record<string, unknown>)
  );
  const valuesBySet: Record<string, typeof values> = {};
  for (const value of values) {
    valuesBySet[value.policy_set_id] = [
      ...(valuesBySet[value.policy_set_id] ?? []),
      value
    ];
  }

  const orgIdForResolve =
    organizationId ??
    ctx.memberships.find((m) => m.role !== "read_only")?.organization_id ??
    null;

  let resolved = null;
  let drift = [] as ReturnType<typeof detectPolicyDrift>;
  if (orgIdForResolve) {
    resolved = await resolveAgentPolicyFromSupabase({
      supabase: ctx.supabase,
      organizationId: orgIdForResolve
    });
    const orgActive = sets.some(
      (row) =>
        row.organization_id === orgIdForResolve && row.status === "active"
    );
    drift = detectPolicyDrift({
      resolved,
      organizationHasActivePolicy: orgActive,
      deprecatedPolicySetIds: new Set(
        sets.filter((row) => row.status === "deprecated").map((row) => row.id)
      )
    });
  }

  const organizations = isSuperAdmin(ctx.memberships)
    ? (
        await ctx.supabase.from("organizations").select("id,name").order("name")
      ).data ?? []
    : ctx.memberships
        .filter((m) => ["admin", "sales"].includes(m.role))
        .map((m) => ({ id: m.organization_id, name: m.organization_id }));

  return {
    ok: true as const,
    sets,
    valuesBySet,
    resolved,
    drift,
    categories: listPolicyKeys().reduce(
      (acc, key) => {
        acc[key.category] = listPolicyKeysByCategory(key.category);
        return acc;
      },
      {} as Record<string, ReturnType<typeof listPolicyKeysByCategory>>
    ),
    isSalesOnly,
    canManageGlobal: isSuperAdmin(ctx.memberships),
    canBreakGlass: canUsePolicyBreakGlass(ctx.memberships),
    manageableOrganizationIds: ctx.memberships
      .filter((m) => m.role === "admin" || m.role === "super_admin")
      .map((m) => m.organization_id),
    organizations,
    systemDefaults: buildSystemDefaultValues()
  };
}

export async function createPolicyDraftAction(input: {
  organizationId: string | null;
  name: string;
  version: string;
  description?: string;
  cloneFromId?: string;
}): Promise<PolicyActionResult> {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }
  if (!canManagePolicyScope(ctx.memberships, input.organizationId)) {
    return { ok: false, error: "You cannot create policies in this scope." };
  }

  let seed = buildSystemDefaultValues();
  if (input.cloneFromId) {
    const { data: sourceValues } = await ctx.supabase
      .from("agent_policy_values")
      .select(VALUE_SELECT)
      .eq("policy_set_id", input.cloneFromId);
    if (sourceValues?.length) {
      seed = Object.fromEntries(
        sourceValues.map((row) => [row.policy_key, row.value_json])
      );
    }
  }

  const { data: set, error } = await ctx.supabase
    .from("agent_policy_sets")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      version: input.version,
      status: "draft",
      description: input.description ?? null,
      change_summary: input.cloneFromId
        ? `Cloned from ${input.cloneFromId}`
        : "Created from system defaults",
      created_by: ctx.user.id
    })
    .select("id")
    .single();

  if (error || !set) {
    return {
      ok: false,
      error: error?.message?.includes("duplicate")
        ? "Version already exists in this scope."
        : "Could not create policy draft."
    };
  }

  const source =
    input.organizationId == null
      ? "global_override"
      : "organization_override";

  const rows = listPolicyKeys().map((definition) => ({
    policy_set_id: set.id,
    policy_key: definition.key,
    value_json: seed[definition.key] ?? definition.default_value,
    value_type: definition.value_type,
    source,
    description: definition.description
  }));

  const { error: valueError } = await ctx.supabase
    .from("agent_policy_values")
    .insert(rows);

  if (valueError) {
    return { ok: false, error: "Could not seed policy values." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: input.organizationId,
    actorUserId: ctx.user.id,
    action: AGENT_POLICY_AUDIT_ACTIONS.create,
    targetTable: "agent_policy_sets",
    recordId: set.id,
    metadata: sanitizePolicyAuditMetadata({
      version: input.version,
      name: input.name
    })
  });

  revalidatePath("/agents/policies");
  return { ok: true, message: "Policy draft created.", id: set.id };
}

export async function updatePolicyDraftValuesAction(input: {
  policySetId: string;
  values: Record<string, unknown>;
}): Promise<PolicyActionResult> {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data: setRow } = await ctx.supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .eq("id", input.policySetId)
    .maybeSingle();

  if (!setRow) {
    return { ok: false, error: "Policy set not found." };
  }

  const set = mapPolicySet(setRow as Record<string, unknown>);
  if (!canManagePolicyScope(ctx.memberships, set.organization_id)) {
    return { ok: false, error: "You cannot update this policy." };
  }
  if (set.status !== "draft") {
    return { ok: false, error: "Only draft policies can be edited." };
  }

  const validated = validatePolicyValueMap(input.values);
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.issues.map((i) => `${i.key}: ${i.message}`).join(" ")
    };
  }

  for (const [key, value] of Object.entries(input.values)) {
    const { error } = await ctx.supabase
      .from("agent_policy_values")
      .upsert(
        {
          policy_set_id: set.id,
          policy_key: key,
          value_json: value,
          value_type: listPolicyKeys().find((k) => k.key === key)!.value_type,
          source:
            set.organization_id == null
              ? "global_override"
              : "organization_override",
          updated_at: new Date().toISOString()
        },
        { onConflict: "policy_set_id,policy_key" }
      );

    if (error) {
      return { ok: false, error: `Could not update ${key}.` };
    }
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: set.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_POLICY_AUDIT_ACTIONS.update,
    targetTable: "agent_policy_sets",
    recordId: set.id,
    metadata: sanitizePolicyAuditMetadata({
      changed_keys: Object.keys(input.values).join(",")
    })
  });

  revalidatePath("/agents/policies");
  return { ok: true, message: "Draft values updated." };
}

export async function validatePolicyDraftAction(input: {
  policySetId: string;
}): Promise<PolicyActionResult> {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data: values } = await ctx.supabase
    .from("agent_policy_values")
    .select(VALUE_SELECT)
    .eq("policy_set_id", input.policySetId);

  const map = Object.fromEntries(
    (values ?? []).map((row) => [row.policy_key, row.value_json])
  );
  const validated = validatePolicyValueMap(map);

  await recordAuditEvent(ctx.supabase, {
    organizationId: null,
    actorUserId: ctx.user.id,
    action: AGENT_POLICY_AUDIT_ACTIONS.validate,
    targetTable: "agent_policy_sets",
    recordId: input.policySetId,
    metadata: sanitizePolicyAuditMetadata({
      valid: validated.ok,
      issue_count: validated.ok ? 0 : validated.issues.length
    })
  });

  if (!validated.ok) {
    return {
      ok: false,
      error: validated.issues.map((i) => `${i.key}: ${i.message}`).join(" ")
    };
  }

  return { ok: true, message: "Validation passed." };
}

export async function previewPolicyActivationAction(input: {
  policySetId: string;
}) {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data: setRow } = await ctx.supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .eq("id", input.policySetId)
    .maybeSingle();

  if (!setRow) {
    return { ok: false as const, error: "Policy set not found." };
  }

  const set = mapPolicySet(setRow as Record<string, unknown>);
  const { data: draftValues } = await ctx.supabase
    .from("agent_policy_values")
    .select(VALUE_SELECT)
    .eq("policy_set_id", set.id);

  let activeQuery = ctx.supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .eq("status", "active");
  activeQuery =
    set.organization_id == null
      ? activeQuery.is("organization_id", null)
      : activeQuery.eq("organization_id", set.organization_id);

  const { data: activeRow } = await activeQuery.maybeSingle();
  let before = buildSystemDefaultValues();
  if (activeRow) {
    const { data: activeValues } = await ctx.supabase
      .from("agent_policy_values")
      .select(VALUE_SELECT)
      .eq("policy_set_id", activeRow.id);
    before = Object.fromEntries(
      (activeValues ?? []).map((row) => [row.policy_key, row.value_json])
    );
  }

  const after = Object.fromEntries(
    (draftValues ?? []).map((row) => [row.policy_key, row.value_json])
  );
  const changes = comparePolicyValues(before, after);
  const impact = classifyActivationImpact(changes);

  return { ok: true as const, changes, impact };
}

export async function activatePolicySetAction(input: {
  policySetId: string;
}): Promise<PolicyActionResult> {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const preview = await previewPolicyActivationAction(input);
  if (!preview.ok) {
    return preview;
  }
  if (preview.impact.blocked) {
    return {
      ok: false,
      error: `Prohibited changes blocked: ${preview.impact.prohibited
        .map((row) => row.key)
        .join(", ")}. Use break-glass if authorized.`
    };
  }

  const validation = await validatePolicyDraftAction(input);
  if (!validation.ok) {
    return validation;
  }

  const { data: setRow } = await ctx.supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .eq("id", input.policySetId)
    .maybeSingle();

  if (!setRow) {
    return { ok: false, error: "Policy set not found." };
  }

  const set = mapPolicySet(setRow as Record<string, unknown>);
  if (!canManagePolicyScope(ctx.memberships, set.organization_id)) {
    return { ok: false, error: "You cannot activate this policy." };
  }

  // Deprecate current active in scope
  let deprecateQuery = ctx.supabase
    .from("agent_policy_sets")
    .update({
      status: "deprecated",
      deprecated_at: new Date().toISOString()
    })
    .eq("status", "active")
    .neq("id", set.id);

  deprecateQuery =
    set.organization_id == null
      ? deprecateQuery.is("organization_id", null)
      : deprecateQuery.eq("organization_id", set.organization_id);

  await deprecateQuery;

  const { error } = await ctx.supabase
    .from("agent_policy_sets")
    .update({
      status: "active",
      activated_at: new Date().toISOString(),
      deprecated_at: null
    })
    .eq("id", set.id);

  if (error) {
    return { ok: false, error: "Could not activate policy set." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: set.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_POLICY_AUDIT_ACTIONS.activate,
    targetTable: "agent_policy_sets",
    recordId: set.id,
    metadata: sanitizePolicyAuditMetadata({
      version: set.version,
      high_risk_count: preview.impact.high_risk.length
    })
  });

  revalidatePath("/agents/policies");
  return { ok: true, message: "Policy set activated." };
}

export async function deprecatePolicySetAction(input: {
  policySetId: string;
}): Promise<PolicyActionResult> {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data: setRow } = await ctx.supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .eq("id", input.policySetId)
    .maybeSingle();

  if (!setRow) {
    return { ok: false, error: "Policy set not found." };
  }

  const set = mapPolicySet(setRow as Record<string, unknown>);
  if (!canManagePolicyScope(ctx.memberships, set.organization_id)) {
    return { ok: false, error: "You cannot deprecate this policy." };
  }

  await ctx.supabase
    .from("agent_policy_sets")
    .update({
      status: "deprecated",
      deprecated_at: new Date().toISOString()
    })
    .eq("id", set.id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: set.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_POLICY_AUDIT_ACTIONS.deprecate,
    targetTable: "agent_policy_sets",
    recordId: set.id,
    metadata: sanitizePolicyAuditMetadata({ version: set.version })
  });

  revalidatePath("/agents/policies");
  return { ok: true, message: "Policy set deprecated." };
}

export async function archivePolicySetAction(input: {
  policySetId: string;
}): Promise<PolicyActionResult> {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data: setRow } = await ctx.supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .eq("id", input.policySetId)
    .maybeSingle();

  if (!setRow) {
    return { ok: false, error: "Policy set not found." };
  }

  const set = mapPolicySet(setRow as Record<string, unknown>);
  if (!canManagePolicyScope(ctx.memberships, set.organization_id)) {
    return { ok: false, error: "You cannot archive this policy." };
  }
  if (set.status === "active") {
    return {
      ok: false,
      error: "Deprecate or roll back before archiving an active policy."
    };
  }

  await ctx.supabase
    .from("agent_policy_sets")
    .update({ status: "archived" })
    .eq("id", set.id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: set.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_POLICY_AUDIT_ACTIONS.archive,
    targetTable: "agent_policy_sets",
    recordId: set.id,
    metadata: sanitizePolicyAuditMetadata({ version: set.version })
  });

  revalidatePath("/agents/policies");
  return { ok: true, message: "Policy set archived." };
}

export async function rollbackPolicySetAction(input: {
  toPolicySetId: string;
}): Promise<PolicyActionResult> {
  const activated = await activatePolicySetAction({
    policySetId: input.toPolicySetId
  });
  if (!activated.ok) {
    return activated;
  }

  const ctx = await requirePolicyContext();
  if (ctx.ok) {
    await recordAuditEvent(ctx.supabase, {
      organizationId: null,
      actorUserId: ctx.user.id,
      action: AGENT_POLICY_AUDIT_ACTIONS.rollback,
      targetTable: "agent_policy_sets",
      recordId: input.toPolicySetId,
      metadata: sanitizePolicyAuditMetadata({
        to_policy_set_id: input.toPolicySetId
      })
    });
  }

  revalidatePath("/agents/policies");
  return { ok: true, message: "Rolled back to selected policy version." };
}

export async function enableBreakGlassAction(input: {
  organizationId: string | null;
  policyKey: string;
  reason: string;
  expiresAt: string;
  confirmation: string;
}): Promise<PolicyActionResult> {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }
  if (!canUsePolicyBreakGlass(ctx.memberships)) {
    return { ok: false, error: "Break-glass requires super_admin." };
  }
  if (input.confirmation.trim().toUpperCase() !== "BREAK GLASS") {
    return {
      ok: false,
      error: 'Type "BREAK GLASS" to confirm this high-risk operation.'
    };
  }

  const { createBreakGlassGrant } = await import("@/lib/agents/policies");
  const grant = createBreakGlassGrant(
    {
      organizationId: input.organizationId,
      policyKey: input.policyKey,
      reason: input.reason,
      expiresAt: input.expiresAt,
      createdBy: ctx.user.id
    },
    { isSuperAdmin: true }
  );

  if (!grant.ok) {
    return grant;
  }

  const { data, error } = await ctx.supabase
    .from("agent_policy_break_glass")
    .insert({
      organization_id: grant.grant.organization_id,
      policy_key: grant.grant.policy_key,
      reason: grant.grant.reason,
      expires_at: grant.grant.expires_at,
      created_by: ctx.user.id
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create break-glass grant." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: input.organizationId,
    actorUserId: ctx.user.id,
    action: AGENT_POLICY_AUDIT_ACTIONS.breakGlassEnable,
    targetTable: "agent_policy_break_glass",
    recordId: data.id,
    metadata: sanitizePolicyAuditMetadata({
      policy_key: input.policyKey,
      expires_at: input.expiresAt,
      reason_length: input.reason.trim().length
    })
  });

  revalidatePath("/agents/policies");
  return { ok: true, message: "Break-glass grant created.", id: data.id };
}

export async function comparePolicySetsAction(input: {
  leftId: string;
  rightId: string;
}) {
  const ctx = await requirePolicyContext();
  if (!ctx.ok) {
    return ctx;
  }

  const load = async (id: string) => {
    const { data } = await ctx.supabase
      .from("agent_policy_values")
      .select(VALUE_SELECT)
      .eq("policy_set_id", id);
    return Object.fromEntries(
      (data ?? []).map((row) => [row.policy_key, row.value_json])
    );
  };

  const [left, right] = await Promise.all([
    load(input.leftId),
    load(input.rightId)
  ]);
  const changes = comparePolicyValues(left, right);
  return {
    ok: true as const,
    changes,
    impact: classifyActivationImpact(changes)
  };
}
