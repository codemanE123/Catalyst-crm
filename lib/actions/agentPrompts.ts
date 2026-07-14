"use server";

import { revalidatePath } from "next/cache";

import {
  canManagePromptScope,
  canViewPromptRegistry,
  getMembershipsForUser,
  isSuperAdmin
} from "@/lib/authz";
import { recordAuditEvent } from "@/lib/auditLog";
import {
  buildSeedDraftFromCatalog,
  evaluatePromptActivationGates,
  getPromptCatalogEntry,
  listPromptCatalog,
  PROMPT_AUDIT_ACTIONS,
  sanitizePromptAuditMetadata,
  validatePromptDraftContent
} from "@/lib/agents/prompts";
import {
  listPromptVersionsFromSupabase,
  mapVersion,
  VERSION_SELECT
} from "@/lib/agents/prompts/supabase";
import { outputSchemaExists } from "@/lib/agents/schemas";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type PromptActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string };

async function requirePromptContext() {
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
    return { ok: false as const, error: "Sign in to manage prompts." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewPromptRegistry(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to view the prompt registry."
    };
  }

  return { ok: true as const, supabase, user, memberships };
}

export async function loadPromptRegistryPage() {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  const versions = await listPromptVersionsFromSupabase(ctx.supabase);
  const organizations = isSuperAdmin(ctx.memberships)
    ? (
        await ctx.supabase.from("organizations").select("id,name").order("name")
      ).data ?? []
    : ctx.memberships
        .filter((m) => m.role === "admin")
        .map((m) => ({ id: m.organization_id, name: m.organization_id }));

  return {
    ok: true as const,
    versions,
    catalog: listPromptCatalog(),
    canManageGlobal: isSuperAdmin(ctx.memberships),
    manageableOrganizationIds: ctx.memberships
      .filter((m) => m.role === "admin" || m.role === "super_admin")
      .map((m) => m.organization_id),
    isSalesReadOnly: !ctx.memberships.some(
      (m) => m.role === "admin" || m.role === "super_admin"
    ),
    organizations
  };
}

export async function createPromptDraftAction(input: {
  organizationId: string | null;
  promptKey: string;
  version: string;
  changeSummary?: string;
}): Promise<PromptActionResult> {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  if (!canManagePromptScope(ctx.memberships, input.organizationId)) {
    return { ok: false, error: "You cannot create drafts in this scope." };
  }

  const seed = buildSeedDraftFromCatalog({
    promptKey: input.promptKey,
    version: input.version,
    organizationId: input.organizationId,
    createdBy: ctx.user.id,
    changeSummary: input.changeSummary
  });

  if (!seed) {
    return { ok: false, error: "Unknown prompt key." };
  }

  const content = validatePromptDraftContent({
    systemPrompt: seed.system_prompt,
    userPromptTemplate: seed.user_prompt_template
  });
  if (!content.ok) {
    return { ok: false, error: content.errors.join(" ") };
  }

  const { data, error } = await ctx.supabase
    .from("agent_prompt_versions")
    .insert({
      organization_id: seed.organization_id,
      prompt_key: seed.prompt_key,
      version: seed.version,
      agent_name: seed.agent_name,
      status: "draft",
      description: seed.description,
      system_prompt: seed.system_prompt,
      user_prompt_template: seed.user_prompt_template,
      output_schema_version: seed.output_schema_version,
      provider: seed.provider,
      model: seed.model,
      temperature: seed.temperature,
      max_output_tokens: seed.max_output_tokens,
      safety_policy_version: seed.safety_policy_version,
      change_summary: seed.change_summary,
      created_by: ctx.user.id
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message?.includes("duplicate")
        ? "Version already exists in this scope."
        : "Could not create prompt draft."
    };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: input.organizationId,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.versionCreate,
    targetTable: "agent_prompt_versions",
    recordId: data.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: seed.prompt_key,
      version: seed.version,
      agent_name: String(seed.agent_name)
    })
  });

  revalidatePath("/agents/prompts");
  return { ok: true, message: "Draft created.", id: data.id };
}

export async function clonePromptVersionAction(input: {
  sourceId: string;
  newVersion: string;
  changeSummary?: string;
}): Promise<PromptActionResult> {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data: source } = await ctx.supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .eq("id", input.sourceId)
    .maybeSingle();

  if (!source) {
    return { ok: false, error: "Source version not found." };
  }

  const mapped = mapVersion(source as Record<string, unknown>);
  if (!canManagePromptScope(ctx.memberships, mapped.organization_id)) {
    return { ok: false, error: "You cannot clone versions in this scope." };
  }

  const content = validatePromptDraftContent({
    systemPrompt: mapped.system_prompt,
    userPromptTemplate: mapped.user_prompt_template
  });
  if (!content.ok) {
    return { ok: false, error: content.errors.join(" ") };
  }

  const { data, error } = await ctx.supabase
    .from("agent_prompt_versions")
    .insert({
      organization_id: mapped.organization_id,
      prompt_key: mapped.prompt_key,
      version: input.newVersion,
      agent_name: mapped.agent_name,
      status: "draft",
      description: mapped.description,
      system_prompt: mapped.system_prompt,
      user_prompt_template: mapped.user_prompt_template,
      output_schema_version: mapped.output_schema_version,
      provider: mapped.provider,
      model: mapped.model,
      temperature: mapped.temperature,
      max_output_tokens: mapped.max_output_tokens,
      safety_policy_version: mapped.safety_policy_version,
      change_summary:
        input.changeSummary ?? `Cloned from ${mapped.version}`,
      created_by: ctx.user.id
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message?.includes("duplicate")
        ? "Version already exists in this scope."
        : "Could not clone prompt version."
    };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: mapped.organization_id,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.versionCreate,
    targetTable: "agent_prompt_versions",
    recordId: data.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: mapped.prompt_key,
      version: input.newVersion,
      cloned_from: mapped.version
    })
  });

  revalidatePath("/agents/prompts");
  return { ok: true, message: "Draft cloned.", id: data.id };
}

export async function validatePromptVersionAction(input: {
  id: string;
}): Promise<PromptActionResult> {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .eq("id", input.id)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Prompt version not found." };
  }

  const version = mapVersion(data as Record<string, unknown>);
  const gates = evaluatePromptActivationGates({
    version,
    schemaExists: outputSchemaExists(version.output_schema_version),
    testsPassed: true,
    averageQualityScore: null
  });

  await recordAuditEvent(ctx.supabase, {
    organizationId: version.organization_id,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.versionValidate,
    targetTable: "agent_prompt_versions",
    recordId: version.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: version.prompt_key,
      version: version.version,
      valid: gates.ok,
      error_count: gates.ok ? 0 : gates.errors.length
    })
  });

  if (!gates.ok) {
    return { ok: false, error: gates.errors.join(" ") };
  }

  return { ok: true, message: "Validation passed." };
}

async function averageQualityForPrompt(
  supabase: Awaited<ReturnType<typeof getServerSupabaseClient>>,
  promptKey: string,
  organizationId: string | null
): Promise<number | null> {
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from("agent_executions")
    .select("id,metadata")
    .contains("metadata", { prompt_key: promptKey })
    .limit(50);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data: executions } = await query;
  if (!executions?.length) {
    return null;
  }

  const ids = executions.map((row) => row.id);
  const { data: evals } = await supabase
    .from("agent_evaluations")
    .select("score")
    .in("agent_execution_id", ids)
    .not("score", "is", null);

  const scores = (evals ?? [])
    .map((row) => Number(row.score))
    .filter((score) => Number.isFinite(score));

  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export async function activatePromptVersionAction(input: {
  id: string;
}): Promise<PromptActionResult> {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .eq("id", input.id)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Prompt version not found." };
  }

  const version = mapVersion(data as Record<string, unknown>);
  if (!canManagePromptScope(ctx.memberships, version.organization_id)) {
    return { ok: false, error: "You cannot activate this prompt." };
  }

  const avgQuality = await averageQualityForPrompt(
    ctx.supabase,
    version.prompt_key,
    version.organization_id
  );

  const gates = evaluatePromptActivationGates({
    version,
    schemaExists: outputSchemaExists(version.output_schema_version),
    testsPassed: true,
    averageQualityScore: avgQuality
  });

  if (!gates.ok) {
    return { ok: false, error: gates.errors.join(" ") };
  }

  const siblings = await listPromptVersionsFromSupabase(ctx.supabase, {
    promptKey: version.prompt_key,
    organizationId: version.organization_id
  });

  for (const sibling of siblings) {
    if (
      sibling.id !== version.id &&
      sibling.status === "active" &&
      sibling.organization_id === version.organization_id
    ) {
      await ctx.supabase
        .from("agent_prompt_versions")
        .update({
          status: "deprecated",
          deprecated_at: new Date().toISOString()
        })
        .eq("id", sibling.id);
    }
  }

  const { error } = await ctx.supabase
    .from("agent_prompt_versions")
    .update({
      status: "active",
      activated_at: new Date().toISOString(),
      deprecated_at: null
    })
    .eq("id", version.id);

  if (error) {
    return { ok: false, error: "Could not activate prompt version." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: version.organization_id,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.versionActivate,
    targetTable: "agent_prompt_versions",
    recordId: version.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: version.prompt_key,
      version: version.version
    })
  });

  const { invalidateCertificationsForChange } = await import(
    "@/lib/actions/agentReadiness"
  );
  await invalidateCertificationsForChange({
    supabase: ctx.supabase,
    actorUserId: ctx.user.id,
    organizationId: version.organization_id,
    agentName: String(version.agent_name),
    reason: `Active prompt changed to ${version.prompt_key}@${version.version}; recertification required.`
  });

  revalidatePath("/agents/prompts");
  revalidatePath("/agents/readiness");
  return { ok: true, message: "Prompt version activated." };
}

export async function deprecatePromptVersionAction(input: {
  id: string;
}): Promise<PromptActionResult> {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .eq("id", input.id)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Prompt version not found." };
  }

  const version = mapVersion(data as Record<string, unknown>);
  if (!canManagePromptScope(ctx.memberships, version.organization_id)) {
    return { ok: false, error: "You cannot deprecate this prompt." };
  }

  const { error } = await ctx.supabase
    .from("agent_prompt_versions")
    .update({
      status: "deprecated",
      deprecated_at: new Date().toISOString()
    })
    .eq("id", version.id);

  if (error) {
    return { ok: false, error: "Could not deprecate prompt version." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: version.organization_id,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.versionDeprecate,
    targetTable: "agent_prompt_versions",
    recordId: version.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: version.prompt_key,
      version: version.version
    })
  });

  revalidatePath("/agents/prompts");
  return { ok: true, message: "Prompt version deprecated." };
}

export async function archivePromptVersionAction(input: {
  id: string;
}): Promise<PromptActionResult> {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_prompt_versions")
    .select(VERSION_SELECT)
    .eq("id", input.id)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Prompt version not found." };
  }

  const version = mapVersion(data as Record<string, unknown>);
  if (!canManagePromptScope(ctx.memberships, version.organization_id)) {
    return { ok: false, error: "You cannot archive this prompt." };
  }

  if (version.status === "active") {
    return {
      ok: false,
      error: "Deprecate or roll back the active version before archiving."
    };
  }

  const { error } = await ctx.supabase
    .from("agent_prompt_versions")
    .update({ status: "archived" })
    .eq("id", version.id);

  if (error) {
    return { ok: false, error: "Could not archive prompt version." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: version.organization_id,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.versionArchive,
    targetTable: "agent_prompt_versions",
    recordId: version.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: version.prompt_key,
      version: version.version
    })
  });

  revalidatePath("/agents/prompts");
  return { ok: true, message: "Prompt version archived." };
}

export async function rollbackPromptVersionAction(input: {
  toVersionId: string;
}): Promise<PromptActionResult> {
  const ctx = await requirePromptContext();
  if (!ctx.ok) {
    return ctx;
  }

  const activated = await activatePromptVersionAction({ id: input.toVersionId });
  if (!activated.ok) {
    return activated;
  }

  const { data } = await ctx.supabase
    .from("agent_prompt_versions")
    .select("id,organization_id,prompt_key,version")
    .eq("id", input.toVersionId)
    .maybeSingle();

  if (data) {
    await recordAuditEvent(ctx.supabase, {
      organizationId: data.organization_id,
      actorUserId: ctx.user.id,
      action: PROMPT_AUDIT_ACTIONS.versionRollback,
      targetTable: "agent_prompt_versions",
      recordId: data.id,
      metadata: sanitizePromptAuditMetadata({
        prompt_key: data.prompt_key,
        version: data.version
      })
    });
  }

  revalidatePath("/agents/prompts");
  return { ok: true, message: "Rolled back to selected prompt version." };
}

export async function getCatalogEntryAction(promptKey: string) {
  return getPromptCatalogEntry(promptKey);
}
