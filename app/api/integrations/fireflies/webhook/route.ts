import { NextResponse } from "next/server";

import {
  isFirefliesImportReady,
  resolveMeetingImportConfig
} from "@/lib/meetingImports/config";
import { fetchFirefliesTranscript } from "@/lib/meetingImports/firefliesApi";
import { normalizeFirefliesPayload } from "@/lib/meetingImports/normalizeFireflies";
import { upsertMeetingImportFromDraft } from "@/lib/meetingImports/service";
import {
  readFirefliesWebhookSecret,
  validateFirefliesWebhookSecret
} from "@/lib/meetingImports/webhookAuth";
import { createServiceRoleSupabaseClient } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveOrganizationId(
  payload: Record<string, unknown>,
  defaultOrganizationId: string | null
): string | null {
  const fromBody =
    (typeof payload.organization_id === "string" &&
      payload.organization_id.trim()) ||
    (typeof payload.organizationId === "string" &&
      payload.organizationId.trim()) ||
    (typeof payload.clientReferenceId === "string" &&
      payload.clientReferenceId.trim()) ||
    null;
  return fromBody || defaultOrganizationId;
}

export async function POST(request: Request) {
  const config = resolveMeetingImportConfig();

  if (!isFirefliesImportReady(config)) {
    return NextResponse.json(
      { error: "Meeting import is disabled or not configured." },
      { status: 503 }
    );
  }

  const provided = readFirefliesWebhookSecret(request);
  if (
    !validateFirefliesWebhookSecret(provided, config.firefliesWebhookSecret)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const organizationId = resolveOrganizationId(
    payload,
    config.defaultOrganizationId
  );
  if (!organizationId) {
    return NextResponse.json(
      {
        error:
          "organization_id is required (body or FIREFLIES_DEFAULT_ORGANIZATION_ID)."
      },
      { status: 400 }
    );
  }

  const meetingId =
    (typeof payload.meetingId === "string" && payload.meetingId.trim()) ||
    (typeof payload.meeting_id === "string" && payload.meeting_id.trim()) ||
    null;

  let transcript = null;
  if (meetingId && config.firefliesApiKey) {
    try {
      transcript = await fetchFirefliesTranscript({
        apiKey: config.firefliesApiKey,
        meetingId
      });
    } catch {
      transcript = null;
    }
  }

  const normalized = normalizeFirefliesPayload({
    payload,
    organizationId,
    transcript
  });

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role is not configured." },
      { status: 503 }
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (!org) {
    return NextResponse.json(
      { error: "Unknown organization_id." },
      { status: 400 }
    );
  }

  const saved = await upsertMeetingImportFromDraft({
    supabase,
    draft: normalized
  });

  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    import_id: saved.record.id,
    match_status: saved.record.match_status,
    review_status: saved.record.review_status,
    school_id: saved.record.school_id
  });
}
