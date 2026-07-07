"use server";

import { revalidateSchoolViews } from "@/lib/revalidateSchoolViews";
import type { User } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import {
  buildSchoolDuplicateKey,
  buildSchoolImportPreview,
  type ParsedSchoolImportRow,
  type SchoolImportPreview
} from "@/lib/schoolImport";
import { getRecordOwnershipFields, type RecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

type ImportContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      user: User;
      ownership: RecordOwnershipFields;
    }
  | { ok: false; error: string };

export type SchoolImportPreviewResult =
  | {
      ok: true;
      preview: SchoolImportPreview;
    }
  | { ok: false; error: string };

export type SchoolImportDetail = {
  rowNumber: number;
  name: string;
  outcome: "imported" | "skipped" | "failed";
  message?: string;
};

export type SchoolImportResult =
  | {
      ok: true;
      imported: number;
      skipped: number;
      failed: number;
      details: SchoolImportDetail[];
    }
  | { ok: false; error: string };

async function requireImportContext(): Promise<ImportContext> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return {
      ok: false,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();

  if (!user) {
    return { ok: false, error: "Sign in to import schools." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false,
      error: "You do not have permission to import schools."
    };
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    ownership.organization_id
  );

  if (!membership) {
    return {
      ok: false,
      error: "You do not have permission to import schools."
    };
  }

  return { ok: true, supabase, user, ownership };
}

async function loadExistingDuplicateKeys(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  organizationId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("schools")
    .select("name,district")
    .eq("organization_id", organizationId);

  if (error) {
    return new Set();
  }

  return new Set(
    (data ?? []).map((school) =>
      buildSchoolDuplicateKey(school.name, school.district ?? "Unknown")
    )
  );
}

function csvTextFromFormData(formData: FormData): string | null {
  const csvText = formData.get("csv_text");

  if (csvText === null) {
    return null;
  }

  return String(csvText);
}

function assignToMeFromFormData(formData: FormData): boolean {
  return formData.get("assign_to_me") === "on";
}

export async function previewSchoolImport(
  formData: FormData
): Promise<SchoolImportPreviewResult> {
  const csvText = csvTextFromFormData(formData);

  if (csvText === null || !csvText.trim()) {
    return { ok: false, error: "Upload a CSV file to preview." };
  }

  const context = await requireImportContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, ownership } = context;
  const existingDuplicateKeys = await loadExistingDuplicateKeys(
    supabase,
    ownership.organization_id
  );
  const preview = buildSchoolImportPreview(
    csvText,
    existingDuplicateKeys,
    assignToMeFromFormData(formData)
  );

  if (preview.summary.total === 0) {
    return { ok: false, error: "The CSV file has no data rows." };
  }

  return { ok: true, preview };
}

async function resolveImportAssignee(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  organizationId: string,
  row: ParsedSchoolImportRow,
  actorUserId: string,
  fallbackUserId: string
): Promise<{ assignedTo: string | null; error?: string }> {
  const school = row.school;

  if (!school) {
    return { assignedTo: null, error: "Invalid school row." };
  }

  if (school.assign_to_me) {
    return { assignedTo: actorUserId };
  }

  if (!school.assigned_to) {
    return { assignedTo: fallbackUserId };
  }

  const { getMembershipForUser } = await import("@/lib/authz");
  const membership = await getMembershipForUser(
    supabase,
    school.assigned_to,
    organizationId
  );

  if (!membership) {
    return {
      assignedTo: null,
      error: "Assignee must be a member of your organization."
    };
  }

  return { assignedTo: school.assigned_to };
}

async function insertImportedSchool(
  context: Extract<ImportContext, { ok: true }>,
  row: ParsedSchoolImportRow
): Promise<{ ok: true; schoolId: string } | { ok: false; message: string }> {
  const { supabase, user, ownership } = context;
  const school = row.school;

  if (!school) {
    return { ok: false, message: "Invalid school row." };
  }

  const assignee = await resolveImportAssignee(
    supabase,
    ownership.organization_id,
    row,
    user.id,
    ownership.assigned_to
  );

  if (assignee.error || !assignee.assignedTo) {
    return {
      ok: false,
      message: assignee.error ?? "Could not resolve assignee."
    };
  }

  const { data: insertedSchool, error } = await supabase
    .from("schools")
    .insert({
      name: school.name,
      website: school.website ?? null,
      status: school.status,
      owner: school.owner,
      next_step: school.next_step,
      notes: school.notes ?? null,
      district: row.district,
      location: row.location,
      state: row.state,
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by,
      assigned_to: assignee.assignedTo
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: "School already exists in your organization."
      };
    }

    return { ok: false, message: "Could not import the school." };
  }

  if (!insertedSchool) {
    return { ok: false, message: "Could not import the school." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.schoolCreate,
    targetTable: "schools",
    recordId: insertedSchool.id,
    metadata: {
      name: school.name,
      status: school.status,
      owner: school.owner,
      source: "csv_import",
      row_number: row.rowNumber
    }
  });

  return { ok: true, schoolId: insertedSchool.id };
}

export async function importSchoolsFromCsv(
  formData: FormData
): Promise<SchoolImportResult> {
  const csvText = csvTextFromFormData(formData);

  if (csvText === null || !csvText.trim()) {
    return { ok: false, error: "Upload a CSV file to import." };
  }

  const context = await requireImportContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const existingDuplicateKeys = await loadExistingDuplicateKeys(
    supabase,
    ownership.organization_id
  );
  const preview = buildSchoolImportPreview(
    csvText,
    existingDuplicateKeys,
    assignToMeFromFormData(formData)
  );
  const details: SchoolImportDetail[] = [];
  let imported = 0;

  for (const row of preview.rows) {
    const displayName =
      row.school?.name ??
      row.raw.organization_name ??
      row.raw.name ??
      "(unnamed)";

    if (row.status !== "valid" || !row.school) {
      details.push({
        rowNumber: row.rowNumber,
        name: displayName,
        outcome: "skipped",
        message:
          row.errors[0] ??
          row.duplicateReason ??
          "Skipped during import."
      });
      continue;
    }

    const result = await insertImportedSchool(context, row);

    if (result.ok) {
      imported += 1;
      details.push({
        rowNumber: row.rowNumber,
        name: row.school.name,
        outcome: "imported"
      });
      existingDuplicateKeys.add(
        buildSchoolDuplicateKey(row.school.name, row.district)
      );
      continue;
    }

    const isDuplicate = result.message.includes("already exists");
    details.push({
      rowNumber: row.rowNumber,
      name: row.school.name,
      outcome: isDuplicate ? "skipped" : "failed",
      message: result.message
    });
  }

  const skipped = details.filter((detail) => detail.outcome === "skipped").length;
  const failed = details.filter((detail) => detail.outcome === "failed").length;

  if (imported > 0) {
    await recordAuditEvent(supabase, {
      organizationId: ownership.organization_id,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.schoolImport,
      targetTable: "schools",
      metadata: {
        imported,
        skipped,
        failed,
        source: "csv_import"
      }
    });

    revalidateSchoolViews();
  }

  return {
    ok: true,
    imported,
    skipped,
    failed,
    details
  };
}
