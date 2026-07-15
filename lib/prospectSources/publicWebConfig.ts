export const PUBLIC_WEB_ENV = {
  enabled: "PUBLIC_WEB_DISCOVERY_ENABLED",
  provider: "WEB_SEARCH_PROVIDER",
  apiKey: "WEB_SEARCH_API_KEY",
  engineId: "WEB_SEARCH_ENGINE_ID",
  allowedSuffixes: "PUBLIC_WEB_ALLOWED_DOMAIN_SUFFIXES",
  maxSchoolsPerJob: "PUBLIC_WEB_MAX_SCHOOLS_PER_JOB",
  maxPagesPerSchool: "PUBLIC_WEB_MAX_PAGES_PER_SCHOOL",
  fetchTimeoutMs: "PUBLIC_WEB_FETCH_TIMEOUT_MS",
  maxResponseBytes: "PUBLIC_WEB_MAX_RESPONSE_BYTES",
  userAgent: "PUBLIC_WEB_USER_AGENT",
  requireRobots: "PUBLIC_WEB_REQUIRE_ROBOTS_ALLOWED"
} as const;

export const DEFAULT_PUBLIC_WEB_CONFIG = {
  enabled: false,
  provider: "google_cse" as const,
  allowedDomainSuffixes: [".edu", ".gov"],
  maxSchoolsPerJob: 10,
  maxPagesPerSchool: 3,
  fetchTimeoutMs: 4_000,
  maxResponseBytes: 500_000,
  userAgent: "CatalystCRMProspectBot/1.0 (+https://catalyst-crm.local; research)",
  requireRobotsAllowed: true
} as const;

export type PublicWebDiscoveryConfig = {
  enabled: boolean;
  provider: "google_cse";
  apiKey: string | null;
  engineId: string | null;
  allowedDomainSuffixes: string[];
  maxSchoolsPerJob: number;
  maxPagesPerSchool: number;
  fetchTimeoutMs: number;
  maxResponseBytes: number;
  userAgent: string;
  requireRobotsAllowed: boolean;
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

function parseSuffixes(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [...DEFAULT_PUBLIC_WEB_CONFIG.allowedDomainSuffixes];
  }

  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((suffix) => (suffix.startsWith(".") ? suffix : `.${suffix}`))
    )
  ];
}

export function resolvePublicWebDiscoveryConfig(
  env: NodeJS.ProcessEnv = process.env
): PublicWebDiscoveryConfig {
  const providerRaw = env[PUBLIC_WEB_ENV.provider]?.trim().toLowerCase();
  const provider =
    providerRaw === "google_cse" || !providerRaw
      ? "google_cse"
      : "google_cse";

  return {
    enabled: parseTruthy(
      env[PUBLIC_WEB_ENV.enabled],
      DEFAULT_PUBLIC_WEB_CONFIG.enabled
    ),
    provider,
    apiKey: env[PUBLIC_WEB_ENV.apiKey]?.trim() || null,
    engineId: env[PUBLIC_WEB_ENV.engineId]?.trim() || null,
    allowedDomainSuffixes: parseSuffixes(env[PUBLIC_WEB_ENV.allowedSuffixes]),
    maxSchoolsPerJob: parseIntInRange(
      env[PUBLIC_WEB_ENV.maxSchoolsPerJob],
      DEFAULT_PUBLIC_WEB_CONFIG.maxSchoolsPerJob,
      1,
      25
    ),
    maxPagesPerSchool: parseIntInRange(
      env[PUBLIC_WEB_ENV.maxPagesPerSchool],
      DEFAULT_PUBLIC_WEB_CONFIG.maxPagesPerSchool,
      1,
      5
    ),
    fetchTimeoutMs: parseIntInRange(
      env[PUBLIC_WEB_ENV.fetchTimeoutMs],
      DEFAULT_PUBLIC_WEB_CONFIG.fetchTimeoutMs,
      1_000,
      15_000
    ),
    maxResponseBytes: parseIntInRange(
      env[PUBLIC_WEB_ENV.maxResponseBytes],
      DEFAULT_PUBLIC_WEB_CONFIG.maxResponseBytes,
      50_000,
      2_000_000
    ),
    userAgent:
      env[PUBLIC_WEB_ENV.userAgent]?.trim() ||
      DEFAULT_PUBLIC_WEB_CONFIG.userAgent,
    requireRobotsAllowed: parseTruthy(
      env[PUBLIC_WEB_ENV.requireRobots],
      DEFAULT_PUBLIC_WEB_CONFIG.requireRobotsAllowed
    )
  };
}

export function isPublicWebDiscoveryReady(
  config: PublicWebDiscoveryConfig = resolvePublicWebDiscoveryConfig()
): boolean {
  return (
    config.enabled &&
    Boolean(config.apiKey) &&
    Boolean(config.engineId) &&
    config.provider === "google_cse"
  );
}

export type PublicWebConfigurationStatus =
  | "ready"
  | "disabled"
  | "missing_api_key"
  | "missing_engine_id"
  | "unsupported_provider";

export function getPublicWebConfigurationStatus(
  config: PublicWebDiscoveryConfig = resolvePublicWebDiscoveryConfig()
): PublicWebConfigurationStatus {
  if (!config.enabled) {
    return "disabled";
  }
  if (config.provider !== "google_cse") {
    return "unsupported_provider";
  }
  if (!config.apiKey) {
    return "missing_api_key";
  }
  if (!config.engineId) {
    return "missing_engine_id";
  }
  return "ready";
}
