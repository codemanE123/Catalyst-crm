/**
 * College Scorecard provider configuration (Phase 5.2).
 * Stub fallback is development-only — never silent mock in staging/production.
 */

export const COLLEGE_SCORECARD_ENV = {
  apiKey: "COLLEGE_SCORECARD_API_KEY",
  dataGovApiKey: "DATA_GOV_API_KEY",
  enabled: "COLLEGE_SCORECARD_ENABLED",
  allowStub: "COLLEGE_SCORECARD_ALLOW_STUB",
  timeoutMs: "COLLEGE_SCORECARD_TIMEOUT_MS",
  maxPages: "COLLEGE_SCORECARD_MAX_PAGES",
  maxRetries: "COLLEGE_SCORECARD_MAX_RETRIES",
  minRequestIntervalMs: "COLLEGE_SCORECARD_MIN_REQUEST_INTERVAL_MS"
} as const;

export const DEFAULT_COLLEGE_SCORECARD_CONFIG = {
  enabled: true,
  timeoutMs: 12_000,
  maxPages: 5,
  maxRetries: 2,
  minRequestIntervalMs: 250,
  perPage: 100
} as const;

export type CollegeScorecardConfig = {
  enabled: boolean;
  apiKey: string | null;
  timeoutMs: number;
  maxPages: number;
  maxRetries: number;
  minRequestIntervalMs: number;
  perPage: number;
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

function parseIntInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function getCollegeScorecardApiKey(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const dedicated = env[COLLEGE_SCORECARD_ENV.apiKey]?.trim();
  const dataGov = env[COLLEGE_SCORECARD_ENV.dataGovApiKey]?.trim();
  return dedicated || dataGov || null;
}

export function resolveCollegeScorecardConfig(
  env: NodeJS.ProcessEnv = process.env
): CollegeScorecardConfig {
  return {
    enabled: parseTruthy(
      env[COLLEGE_SCORECARD_ENV.enabled],
      DEFAULT_COLLEGE_SCORECARD_CONFIG.enabled
    ),
    apiKey: getCollegeScorecardApiKey(env),
    timeoutMs: parseIntInRange(
      env[COLLEGE_SCORECARD_ENV.timeoutMs],
      DEFAULT_COLLEGE_SCORECARD_CONFIG.timeoutMs,
      3_000,
      60_000
    ),
    maxPages: parseIntInRange(
      env[COLLEGE_SCORECARD_ENV.maxPages],
      DEFAULT_COLLEGE_SCORECARD_CONFIG.maxPages,
      1,
      10
    ),
    maxRetries: parseIntInRange(
      env[COLLEGE_SCORECARD_ENV.maxRetries],
      DEFAULT_COLLEGE_SCORECARD_CONFIG.maxRetries,
      0,
      5
    ),
    minRequestIntervalMs: parseIntInRange(
      env[COLLEGE_SCORECARD_ENV.minRequestIntervalMs],
      DEFAULT_COLLEGE_SCORECARD_CONFIG.minRequestIntervalMs,
      0,
      5_000
    ),
    perPage: DEFAULT_COLLEGE_SCORECARD_CONFIG.perPage
  };
}

/**
 * Deterministic stub is allowed only in local development (or explicit override).
 * Staging / production / preview / test never silently fall back to mock data.
 */
export function mayUseCollegeScorecardStubFallback(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const explicit = env[COLLEGE_SCORECARD_ENV.allowStub]?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") {
    // Still refuse on Vercel production / preview.
    if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
      return false;
    }
    return env.NODE_ENV === "development";
  }

  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    return false;
  }

  if (env.NODE_ENV === "production" || env.NODE_ENV === "test") {
    return false;
  }

  return env.NODE_ENV === "development";
}

export function isCollegeScorecardReady(
  config: CollegeScorecardConfig = resolveCollegeScorecardConfig()
): boolean {
  return config.enabled && Boolean(config.apiKey);
}
