import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_ACTIONS = {
  interviewCreate: "interview.create",
  outreachCreate: "outreach.create",
  followUpCreate: "follow_up.create",
  followUpComplete: "follow_up.complete",
  schoolCreate: "school.create",
  schoolImport: "school.import",
  schoolUpdate: "school.update",
  contactCreate: "contact.create",
  contactUpdate: "contact.update",
  prospectJobCreate: "prospect.job_create",
  universityResearchRun: "university_research.run",
  universityResearchSave: "university_research.save",
  membershipRoleChange: "membership.role_change",
  membershipRemove: "membership.remove"
} as const;

export type AuditMetadata = Record<string, string | number | boolean | null>;

export type AuditEventInput = {
  organizationId: string | null;
  actorUserId: string;
  action: string;
  targetTable: string;
  recordId?: string | null;
  metadata?: AuditMetadata;
};

export async function recordAuditEvent(
  supabase: SupabaseClient,
  event: AuditEventInput
) {
  const { error } = await supabase.from("audit_events").insert({
    organization_id: event.organizationId,
    actor_user_id: event.actorUserId,
    action: event.action,
    target_table: event.targetTable,
    record_id: event.recordId ?? null,
    metadata: event.metadata ?? {}
  });

  if (error) {
    console.error("Failed to record audit event:", error.message);
  }
}
