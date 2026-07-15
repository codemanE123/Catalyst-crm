import { assertSafeHttpsUrl, isSafeHttpsUrl } from "@/lib/safeFetch";

/** Domains / host patterns never accepted as official institutional websites. */
export const BLOCKED_HOST_PATTERNS = [
  /(?:^|\.)facebook\.com$/i,
  /(?:^|\.)fb\.com$/i,
  /(?:^|\.)instagram\.com$/i,
  /(?:^|\.)twitter\.com$/i,
  /(?:^|\.)x\.com$/i,
  /(?:^|\.)linkedin\.com$/i,
  /(?:^|\.)tiktok\.com$/i,
  /(?:^|\.)youtube\.com$/i,
  /(?:^|\.)youtu\.be$/i,
  /(?:^|\.)reddit\.com$/i,
  /(?:^|\.)pinterest\.com$/i,
  /(?:^|\.)wikipedia\.org$/i,
  /(?:^|\.)bit\.ly$/i,
  /(?:^|\.)t\.co$/i,
  /(?:^|\.)tinyurl\.com$/i,
  /(?:^|\.)goo\.gl$/i,
  /(?:^|\.)whitepages\.com$/i,
  /(?:^|\.)spokeo\.com$/i,
  /(?:^|\.)beenverified\.com$/i,
  /(?:^|\.)zoominfo\.com$/i,
  /(?:^|\.)rocketreach\.co$/i,
  /(?:^|\.)hunter\.io$/i,
  /(?:^|\.)indeed\.com$/i,
  /(?:^|\.)glassdoor\.com$/i,
  /(?:^|\.)yelp\.com$/i
] as const;

const LOGIN_PATH_HINTS = [
  "/login",
  "/signin",
  "/sign-in",
  "/auth/",
  "/sso",
  "/oauth",
  "/account/login",
  "/wp-login"
];

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function hostnameMatchesAllowedSuffix(
  hostname: string,
  allowedSuffixes: string[]
): boolean {
  const host = normalizeHostname(hostname);
  return allowedSuffixes.some((suffix) => {
    const normalized = suffix.toLowerCase().startsWith(".")
      ? suffix.toLowerCase()
      : `.${suffix.toLowerCase()}`;
    return host.endsWith(normalized) || host === normalized.slice(1);
  });
}

export function isBlockedSocialOrBrokerHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export function looksLikeLoginPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return LOGIN_PATH_HINTS.some((hint) => path.includes(hint));
}

export type OfficialWebsiteValidation =
  | { ok: true; url: URL; hostname: string }
  | { ok: false; reason: string };

/**
 * Validate a candidate official website URL under SSRF + institutional allow rules.
 */
export function validateOfficialInstitutionWebsite(
  rawUrl: string,
  allowedDomainSuffixes: string[]
): OfficialWebsiteValidation {
  if (!isSafeHttpsUrl(rawUrl)) {
    return { ok: false, reason: "url_not_safe_https" };
  }

  let url: URL;
  try {
    url = assertSafeHttpsUrl(rawUrl);
  } catch {
    return { ok: false, reason: "url_ssrf_rejected" };
  }

  const hostname = normalizeHostname(url.hostname);

  if (isBlockedSocialOrBrokerHost(hostname)) {
    return { ok: false, reason: "blocked_social_or_broker" };
  }

  if (!hostnameMatchesAllowedSuffix(hostname, allowedDomainSuffixes)) {
    return { ok: false, reason: "domain_suffix_not_allowed" };
  }

  if (looksLikeLoginPath(url.pathname)) {
    return { ok: false, reason: "login_path_rejected" };
  }

  return { ok: true, url, hostname };
}

export function extractRegistrableDomainHint(hostname: string): string {
  const host = normalizeHostname(hostname);
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return host;
  }
  // Keep last two labels for typical .edu / .gov (state.edu may be 3+)
  if (host.endsWith(".edu") || host.endsWith(".gov")) {
    return parts.slice(-2).join(".");
  }
  return parts.slice(-2).join(".");
}

export function normalizeOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
