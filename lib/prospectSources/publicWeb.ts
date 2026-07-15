import type { ProspectGenerationInput } from "@/lib/prospectGeneration";
import { SafeFetchError, safeFetchText } from "@/lib/safeFetch";

import {
  extractRegistrableDomainHint,
  normalizeHostname,
  normalizeOrganizationName,
  validateOfficialInstitutionWebsite
} from "./domainAllowlist";
import {
  getPublicWebConfigurationStatus,
  isPublicWebDiscoveryReady,
  resolvePublicWebDiscoveryConfig,
  type PublicWebDiscoveryConfig
} from "./publicWebConfig";
import { buildPublicWebSearchQueries } from "./queryGeneration";
import { evaluateRobotsTxt } from "./robots";
import type { ProspectSourceCandidate } from "./types";
import { resolveWebSearchProvider, WebSearchProviderError } from "./webSearchProvider";
import type { WebSearchResult } from "./webSearchTypes";

export const PUBLIC_WEB_SOURCE_NAME = "Public web discovery";
export const PUBLIC_WEB_DISCOVERY_METHOD = "public_web";

const CANDIDATE_PATHS = [
  "/about",
  "/academics",
  "/programs",
  "/cybersecurity",
  "/computer-science",
  "/artificial-intelligence",
  "/workforce",
  "/career-services",
  "/research",
  "/partnerships"
] as const;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE =
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

export type PublicWebSkipRecord = {
  url?: string;
  hostname?: string;
  reason: string;
};

export type PublicWebGenerationMeta = {
  request_count: number;
  search_query_count: number;
  schools_considered: number;
  pages_fetched: number;
  skipped: PublicWebSkipRecord[];
  duplicate_count: number;
  error_code: string | null;
  error_message: string | null;
  configuration_status: ReturnType<typeof getPublicWebConfigurationStatus>;
};

type FetchTextFn = (
  url: string,
  opts?: { timeoutMs?: number; maxBytes?: number; headers?: HeadersInit }
) => Promise<string>;

function stripPersonalData(text: string): string {
  return text.replace(EMAIL_RE, "[redacted]").replace(PHONE_RE, "[redacted]");
}

function stripHtml(html: string): string {
  return stripPersonalData(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractTitle(html: string): string | null {
  const og = html.match(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
  );
  if (og?.[1]?.trim()) {
    return og[1].trim();
  }
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]?.trim()) {
    return title[1].trim().replace(/\s*[|\-–].*$/, "").trim();
  }
  return null;
}

function detectIndicators(text: string): {
  hbcu: boolean;
  cyber: boolean;
  ai: boolean;
  workforce: boolean;
} {
  const lower = text.toLowerCase();
  return {
    hbcu:
      lower.includes("historically black") ||
      lower.includes("hbcu") ||
      /\bh\.?b\.?c\.?u\b/i.test(text),
    cyber:
      lower.includes("cybersecurity") ||
      lower.includes("cyber security") ||
      lower.includes("information assurance"),
    ai:
      lower.includes("artificial intelligence") ||
      /\bai program\b/i.test(text) ||
      lower.includes("machine learning"),
    workforce:
      lower.includes("workforce") ||
      lower.includes("career services") ||
      lower.includes("continuing education")
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function originOf(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function pickPathsForJob(
  input: ProspectGenerationInput,
  maxPages: number
): string[] {
  const paths: string[] = ["/"];
  const wantsCyber =
    input.schoolTypes.includes("cae") ||
    input.schoolTypes.includes("workforce_cyber") ||
    /cyber/i.test(input.keywords);
  const wantsAi = /artificial intelligence|\bai\b/i.test(input.keywords);
  const wantsWorkforce =
    input.schoolTypes.includes("workforce_cyber") ||
    /workforce/i.test(input.keywords);

  if (wantsCyber) {
    paths.push("/cybersecurity", "/computer-science");
  }
  if (wantsAi) {
    paths.push("/artificial-intelligence", "/research");
  }
  if (wantsWorkforce) {
    paths.push("/workforce", "/career-services");
  }
  paths.push("/academics", "/programs", "/about", "/partnerships");

  const unique = [...new Set(paths)].filter((path) =>
    path === "/" ? true : (CANDIDATE_PATHS as readonly string[]).includes(path)
  );
  // Always include homepage first
  return ["/", ...unique.filter((p) => p !== "/")].slice(0, maxPages);
}

async function loadRobotsDecision(params: {
  origin: string;
  path: string;
  config: PublicWebDiscoveryConfig;
  fetchText: FetchTextFn;
  cache: Map<string, string | null>;
}): Promise<{ allowed: boolean; reason?: string }> {
  const robotsUrl = `${params.origin}/robots.txt`;
  let body = params.cache.get(params.origin);
  if (body === undefined) {
    try {
      body = await params.fetchText(robotsUrl, {
        timeoutMs: params.config.fetchTimeoutMs,
        maxBytes: 100_000,
        headers: { "User-Agent": params.config.userAgent }
      });
      params.cache.set(params.origin, body);
    } catch {
      params.cache.set(params.origin, null);
      body = null;
    }
  }

  if (body == null) {
    if (params.config.requireRobotsAllowed) {
      return { allowed: false, reason: "robots_unavailable" };
    }
    return { allowed: true, reason: "robots_unavailable_permissive" };
  }

  const decision = evaluateRobotsTxt({
    robotsText: body,
    userAgent: params.config.userAgent,
    path: params.path
  });
  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason };
  }
  return { allowed: true };
}

function groupSearchHitsByDomain(
  results: WebSearchResult[],
  allowedSuffixes: string[]
): Map<
  string,
  { homepage: URL; title: string; snippet: string; seedUrl: string }
> {
  const byDomain = new Map<
    string,
    { homepage: URL; title: string; snippet: string; seedUrl: string }
  >();

  for (const result of results) {
    const validated = validateOfficialInstitutionWebsite(
      result.url,
      allowedSuffixes
    );
    if (!validated.ok) {
      continue;
    }
    const domain = extractRegistrableDomainHint(validated.hostname);
    if (byDomain.has(domain)) {
      continue;
    }
    const homepage = new URL(originOf(validated.url) + "/");
    byDomain.set(domain, {
      homepage,
      title: result.title,
      snippet: result.snippet,
      seedUrl: validated.url.toString()
    });
  }

  return byDomain;
}

function buildRationale(params: {
  indicators: ReturnType<typeof detectIndicators>;
  sourceUrls: string[];
  snippet: string;
}): string {
  const claims: string[] = [];
  if (params.indicators.hbcu) {
    claims.push("Page text references HBCU / historically Black college status.");
  }
  if (params.indicators.cyber) {
    claims.push("Public pages mention cybersecurity or information assurance programs.");
  }
  if (params.indicators.ai) {
    claims.push("Public pages mention artificial intelligence initiatives.");
  }
  if (params.indicators.workforce) {
    claims.push("Public pages mention workforce or career programs.");
  }
  if (claims.length === 0 && params.snippet) {
    claims.push(
      `Search snippet (public): ${stripPersonalData(params.snippet).slice(0, 180)}`
    );
  }
  claims.push(
    `Sources: ${params.sourceUrls.join("; ")}. No personal contact data collected.`
  );
  return claims.join(" ");
}

function deriveFitScore(
  indicators: ReturnType<typeof detectIndicators>,
  input: ProspectGenerationInput
): number {
  let score = 0.55;
  if (indicators.hbcu && input.schoolTypes.includes("hbcu")) {
    score += 0.12;
  }
  if (
    indicators.cyber &&
    (input.schoolTypes.includes("cae") ||
      input.schoolTypes.includes("workforce_cyber"))
  ) {
    score += 0.12;
  }
  if (indicators.ai && /ai|artificial/i.test(input.keywords)) {
    score += 0.08;
  }
  if (indicators.workforce) {
    score += 0.05;
  }
  return Math.min(Number(score.toFixed(3)), 0.92);
}

export async function generatePublicWebCandidates(
  input: ProspectGenerationInput,
  jobId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    fetchText?: FetchTextFn;
    config?: PublicWebDiscoveryConfig;
    remainingSlots?: number;
    existingDomains?: Set<string>;
    existingNames?: Set<string>;
    sleepFn?: (ms: number) => Promise<void>;
  }
): Promise<{
  candidates: ProspectSourceCandidate[];
  meta: PublicWebGenerationMeta;
}> {
  const env = options?.env ?? process.env;
  const config = options?.config ?? resolvePublicWebDiscoveryConfig(env);
  const fetchText = options?.fetchText ?? safeFetchText;
  const wait = options?.sleepFn ?? sleep;
  const remaining = Math.max(
    0,
    options?.remainingSlots ?? input.maxResults
  );
  const maxSchools = Math.min(config.maxSchoolsPerJob, remaining);

  const meta: PublicWebGenerationMeta = {
    request_count: 0,
    search_query_count: 0,
    schools_considered: 0,
    pages_fetched: 0,
    skipped: [],
    duplicate_count: 0,
    error_code: null,
    error_message: null,
    configuration_status: getPublicWebConfigurationStatus(config)
  };

  if (maxSchools <= 0) {
    return { candidates: [], meta };
  }

  if (!isPublicWebDiscoveryReady(config)) {
    meta.error_code = meta.configuration_status;
    meta.error_message =
      meta.configuration_status === "disabled"
        ? "Public web discovery is disabled."
        : "Public web discovery is not configured.";
    return { candidates: [], meta };
  }

  const provider = resolveWebSearchProvider(config.provider);
  if (!provider || !config.apiKey || !config.engineId) {
    meta.error_code = "not_configured";
    meta.error_message = "Web search provider is not configured.";
    return { candidates: [], meta };
  }

  const queries = buildPublicWebSearchQueries(input, { maxQueries: 2 });
  meta.search_query_count = queries.length;

  const allResults: WebSearchResult[] = [];
  try {
    for (const query of queries) {
      const search = await provider.search({
        query,
        maxResults: Math.min(10, maxSchools * 2),
        apiKey: config.apiKey,
        engineId: config.engineId,
        timeoutMs: config.fetchTimeoutMs,
        fetchText
      });
      meta.request_count += search.request_count;
      allResults.push(...search.results);
      await wait(150);
    }
  } catch (error) {
    if (error instanceof WebSearchProviderError) {
      meta.error_code = error.code;
      meta.error_message = error.message;
    } else {
      meta.error_code = "provider_error";
      meta.error_message = "Could not retrieve web search results.";
    }
    return { candidates: [], meta };
  }

  const grouped = groupSearchHitsByDomain(
    allResults,
    config.allowedDomainSuffixes
  );
  const existingDomains = options?.existingDomains ?? new Set<string>();
  const existingNames = options?.existingNames ?? new Set<string>();
  const robotsCache = new Map<string, string | null>();
  const candidates: ProspectSourceCandidate[] = [];

  for (const [domain, hit] of grouped) {
    if (candidates.length >= maxSchools) {
      break;
    }

    meta.schools_considered += 1;

    if (existingDomains.has(domain)) {
      meta.duplicate_count += 1;
      meta.skipped.push({ hostname: domain, reason: "duplicate_domain" });
      continue;
    }

    const origin = originOf(hit.homepage);
    const paths = pickPathsForJob(input, config.maxPagesPerSchool);
    const fetchedHtml: string[] = [];
    const sourceUrls: string[] = [hit.seedUrl];
    let pageFetches = 0;

    for (const path of paths) {
      if (pageFetches >= config.maxPagesPerSchool) {
        break;
      }

      const robots = await loadRobotsDecision({
        origin,
        path,
        config,
        fetchText,
        cache: robotsCache
      });
      meta.request_count += 1;

      if (!robots.allowed) {
        meta.skipped.push({
          url: `${origin}${path}`,
          hostname: domain,
          reason: robots.reason ?? "robots_disallow"
        });
        if (path === "/" && robots.reason === "robots_disallow") {
          break;
        }
        continue;
      }

      const pageUrl = path === "/" ? `${origin}/` : `${origin}${path}`;
      const validated = validateOfficialInstitutionWebsite(
        pageUrl,
        config.allowedDomainSuffixes
      );
      if (!validated.ok) {
        meta.skipped.push({ url: pageUrl, reason: validated.reason });
        continue;
      }

      try {
        const html = await fetchText(validated.url.toString(), {
          timeoutMs: config.fetchTimeoutMs,
          maxBytes: config.maxResponseBytes,
          headers: {
            "User-Agent": config.userAgent,
            Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8"
          }
        });
        meta.request_count += 1;
        meta.pages_fetched += 1;
        pageFetches += 1;
        fetchedHtml.push(html);
        if (!sourceUrls.includes(validated.url.toString())) {
          sourceUrls.push(validated.url.toString());
        }
      } catch (error) {
        const reason =
          error instanceof SafeFetchError
            ? error.message.includes("size")
              ? "response_too_large"
              : error.message.includes("timeout") ||
                  error.message.includes("aborted")
                ? "fetch_timeout"
                : "fetch_failed"
            : "fetch_failed";
        meta.skipped.push({ url: pageUrl, hostname: domain, reason });
      }

      await wait(200);
    }

    if (fetchedHtml.length === 0 && !hit.snippet) {
      meta.skipped.push({ hostname: domain, reason: "no_fetchable_pages" });
      continue;
    }

    const combinedText = stripHtml(fetchedHtml.join("\n"));
    const titleFromHtml = fetchedHtml
      .map((html) => extractTitle(html))
      .find(Boolean);
    const organizationName =
      titleFromHtml ||
      hit.title.replace(/\s*[|\-–].*$/, "").trim() ||
      normalizeHostname(domain);

    const nameKey = normalizeOrganizationName(organizationName);
    if (existingNames.has(nameKey)) {
      meta.duplicate_count += 1;
      meta.skipped.push({ hostname: domain, reason: "duplicate_name" });
      continue;
    }

    const indicators = detectIndicators(`${combinedText} ${hit.snippet}`);
    const retrievedAt = new Date().toISOString();
    const fit = deriveFitScore(indicators, input);
    const rationale = buildRationale({
      indicators,
      sourceUrls,
      snippet: hit.snippet
    });

    candidates.push({
      organization_name: organizationName,
      website: origin,
      city: null,
      state: null,
      school_type: indicators.hbcu
        ? "HBCU"
        : indicators.cyber
          ? "Cybersecurity-related programs"
          : null,
      rationale: `${rationale} Discovery method: ${PUBLIC_WEB_DISCOVERY_METHOD}. Retrieved: ${retrievedAt}. Job: ${jobId}.`,
      fit_score: fit,
      source_name: PUBLIC_WEB_SOURCE_NAME,
      source_urls: sourceUrls,
      enrollment_size: null,
      discovery_method: PUBLIC_WEB_DISCOVERY_METHOD,
      retrieved_at: retrievedAt
    });

    existingDomains.add(domain);
    existingNames.add(nameKey);
  }

  return { candidates, meta };
}
