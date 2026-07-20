export const MEETING_IMPORT_ENV = {
  enabled: "MEETING_IMPORT_ENABLED",
  requireReview: "MEETING_IMPORT_REQUIRE_REVIEW",
  firefliesWebhookSecret: "FIREFLIES_WEBHOOK_SECRET",
  firefliesApiKey: "FIREFLIES_API_KEY",
  defaultOrganizationId: "FIREFLIES_DEFAULT_ORGANIZATION_ID"
} as const;

export type MeetingImportConfig = {
  enabled: boolean;
  requireReview: boolean;
  firefliesWebhookSecret: string | null;
  firefliesApiKey: string | null;
  defaultOrganizationId: string | null;
};

function parseTruthy(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function resolveMeetingImportConfig(
  env: NodeJS.ProcessEnv = process.env
): MeetingImportConfig {
  return {
    enabled: parseTruthy(env[MEETING_IMPORT_ENV.enabled], false),
    requireReview: parseTruthy(env[MEETING_IMPORT_ENV.requireReview], true),
    firefliesWebhookSecret:
      env[MEETING_IMPORT_ENV.firefliesWebhookSecret]?.trim() || null,
    firefliesApiKey: env[MEETING_IMPORT_ENV.firefliesApiKey]?.trim() || null,
    defaultOrganizationId:
      env[MEETING_IMPORT_ENV.defaultOrganizationId]?.trim() || null
  };
}

export function isFirefliesImportReady(
  config: MeetingImportConfig = resolveMeetingImportConfig()
): boolean {
  return config.enabled && Boolean(config.firefliesWebhookSecret);
}
