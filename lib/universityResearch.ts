import { getRecordOwnershipFields } from "./supabase";
import { MUTATION_ROLES, requireRole } from "./authz";
import { AUDIT_ACTIONS, recordAuditEvent } from "./auditLog";
import { isSafeHttpsUrl, safeFetchText, SafeFetchError } from "./safeFetch";
import {
  enforceRateLimit,
  RATE_LIMIT_ACTIONS,
  RATE_LIMITS
} from "./rateLimit";
import { validateUniversityResearchInput } from "./validation";
import { getServerSupabaseClient, requireUser } from "./supabaseServer";
import type {
  UniversityResearchProfile,
  UniversityResearchResult
} from "./universityResearch.types";

export type {
  UniversityResearchProfile,
  UniversityResearchResult
} from "./universityResearch.types";

const RESEARCH_FETCH_TIMEOUT_MS = 2500;
const RESEARCH_MAX_RESPONSE_BYTES = 200_000;
const RESEARCH_MAX_TEXT_CHARS = 80_000;
const MAX_PAGE_FETCHES = 3;
const EMAIL_LOG_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_LOG_PATTERN = /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g;

function sanitizeLogMessage(message: string): string {
  return message
    .replace(EMAIL_LOG_PATTERN, "[redacted]")
    .replace(JWT_LOG_PATTERN, "[redacted]")
    .slice(0, 200);
}

function logResearchError(context: string, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  console.error(
    `University research ${context}: ${sanitizeLogMessage(message)}`
  );
}

function fetchTimeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function emptyResearchProfile(
  schoolName = "",
  website = ""
): UniversityResearchProfile {
  return buildProfile(schoolName || "Unknown school", website, []);
}

function toSerializableProfile(
  profile: UniversityResearchProfile
): UniversityResearchProfile {
  return {
    name: String(profile.name ?? ""),
    website: String(profile.website ?? ""),
    enrollment: String(profile.enrollment ?? ""),
    public_private:
      profile.public_private === "Public" ||
      profile.public_private === "Private"
        ? profile.public_private
        : "Unknown",
    hbcu: Boolean(profile.hbcu),
    community_college: Boolean(profile.community_college),
    state: String(profile.state ?? ""),
    ai_programs: String(profile.ai_programs ?? ""),
    cyber_programs: String(profile.cyber_programs ?? ""),
    healthcare_programs: String(profile.healthcare_programs ?? ""),
    innovation_center: String(profile.innovation_center ?? ""),
    entrepreneurship_center: String(profile.entrepreneurship_center ?? ""),
    career_services_office: String(profile.career_services_office ?? ""),
    workforce_development_office: String(
      profile.workforce_development_office ?? ""
    ),
    profile_sources: Array.isArray(profile.profile_sources)
      ? profile.profile_sources.map((source) => String(source))
      : []
  };
}

function createResearchResult(
  profile: UniversityResearchProfile,
  saved: boolean,
  message: string
): UniversityResearchResult {
  const result: UniversityResearchResult = {
    profile: toSerializableProfile(profile),
    saved: Boolean(saved),
    message: String(message)
  };

  return JSON.parse(JSON.stringify(result)) as UniversityResearchResult;
}

function toUserSafeResearchError(error: unknown): string {
  if (error instanceof SafeFetchError) {
    return "Could not fetch a public school page. Check the website URL and try again.";
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.toLowerCase().includes("timeout")) {
      return "Research timed out. Add a website URL and try again.";
    }

    if (error instanceof URIError || error.name === "URIError") {
      return "Could not process search results. Add a website URL and try again.";
    }

    if (error.message.toLowerCase().includes("rate limit")) {
      return "Too many research requests. Please wait a few minutes and try again.";
    }

    if (
      error.message.toLowerCase().includes("permission") ||
      error.message.toLowerCase().includes("not authorized")
    ) {
      return "You do not have permission to run the research agent.";
    }
  }

  return "Research could not be completed. Please try again later.";
}

const STATE_NAMES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming"
];

function normalizeWebsite(website: string) {
  const trimmedWebsite = website.trim();

  if (!trimmedWebsite) {
    return "";
  }

  return /^https?:\/\//i.test(trimmedWebsite)
    ? trimmedWebsite.replace(/^http:\/\//i, "https://")
    : `https://${trimmedWebsite}`;
}

function pageUrls(baseUrl: string) {
  try {
    const origin = new URL(baseUrl).origin;

    return [origin, `${origin}/about`, `${origin}/academics`];
  } catch {
    return isSafeHttpsUrl(baseUrl) ? [baseUrl] : [];
  }
}

async function fetchResearchPages(urls: string[]) {
  const candidates = [...new Set(urls.filter((url) => isSafeHttpsUrl(url)))].slice(
    0,
    MAX_PAGE_FETCHES
  );
  const pages: { url: string; text: string }[] = [];

  for (const url of candidates) {
    const page = await fetchPage(url);

    if (page) {
      pages.push(page);
    }
  }

  return pages;
}

function stripHtml(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  return stripped.slice(0, RESEARCH_MAX_TEXT_CHARS);
}

async function fetchPage(url: string) {
  try {
    if (!isSafeHttpsUrl(url)) {
      return null;
    }

    const text = stripHtml(
      await safeFetchText(url, {
        headers: {
          "user-agent": "CatalystCRMResearchAgent/1.0"
        },
        timeoutMs: RESEARCH_FETCH_TIMEOUT_MS,
        maxBytes: RESEARCH_MAX_RESPONSE_BYTES
      })
    );

    return {
      url,
      text
    };
  } catch {
    return null;
  }
}

async function discoverWebsite(schoolName: string) {
  const query = encodeURIComponent(`${schoolName} official site university`);

  try {
    const response = await fetch(`https://duckduckgo.com/html/?q=${query}`, {
      headers: {
        "user-agent": "CatalystCRMResearchAgent/1.0"
      },
      signal: fetchTimeoutSignal(RESEARCH_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const matches = [...html.matchAll(/uddg=([^"&]+)/g)]
      .map((match) => safeDecodeURIComponent(match[1]))
      .filter(Boolean)
      .filter((url) => isSafeHttpsUrl(url));
    const eduResult = matches.find((url) => {
      try {
        const hostname = new URL(url).hostname;
        return hostname.endsWith(".edu") || hostname.includes(".edu.");
      } catch {
        return false;
      }
    });

    if (!eduResult || !isSafeHttpsUrl(eduResult)) {
      return "";
    }

    try {
      return new URL(eduResult).origin;
    } catch {
      return "";
    }
  } catch {
    return "";
  }
}

function findEvidence(
  pages: { url: string; text: string }[],
  label: string,
  terms: string[]
) {
  for (const page of pages) {
    const lowerText = page.text.toLowerCase();
    const matchedTerm = terms.find((term) => lowerText.includes(term));

    if (matchedTerm) {
      return `Found ${label} evidence via "${matchedTerm}" on ${page.url}`;
    }
  }

  return "Not found";
}

function findEnrollment(text: string) {
  const matches = [
    ...text.matchAll(
      /(?:enrollment|student body|students? enrolled|total students?)[^\d]{0,80}([\d,]{4,})/gi
    )
  ];
  const numbers = matches
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value >= 1000 &&
        !(value >= 1900 && value <= 2099)
    );
  const largest = Math.max(0, ...numbers);

  return largest ? largest.toLocaleString("en-US") : "";
}

function findState(text: string) {
  return (
    STATE_NAMES.find((state) =>
      new RegExp(`\\b${state.replace(" ", "\\s+")}\\b`, "i").test(text)
    ) ?? ""
  );
}

function hasAny(text: string, terms: string[]) {
  const lowerText = text.toLowerCase();
  return terms.some((term) => lowerText.includes(term));
}

function inferPublicPrivate(text: string): UniversityResearchProfile["public_private"] {
  if (hasAny(text, ["public university", "state university", "public institution"])) {
    return "Public";
  }

  if (hasAny(text, ["private university", "private institution", "independent college"])) {
    return "Private";
  }

  return "Unknown";
}

function buildProfile(
  schoolName: string,
  website: string,
  pages: { url: string; text: string }[]
): UniversityResearchProfile {
  const combinedText = pages.map((page) => page.text).join(" ");
  const lowerName = schoolName.toLowerCase();
  const lowerText = combinedText.toLowerCase();
  const isCommunityCollege =
    lowerName.includes("community college") ||
    /(?:^|\s)is (?:a )?(?:public )?community college\b/.test(lowerText) ||
    /two-year (?:public )?college/.test(lowerText);

  return {
    name: schoolName,
    website,
    enrollment: findEnrollment(combinedText) || "Not found",
    public_private: inferPublicPrivate(combinedText),
    hbcu: hasAny(combinedText, [
      "historically black college",
      "historically black university",
      "hbcu"
    ]),
    community_college: isCommunityCollege,
    state: findState(combinedText) || "Not found",
    ai_programs: findEvidence(pages, "AI program", [
        "artificial intelligence",
        "machine learning",
        "data science"
      ]),
    cyber_programs: findEvidence(pages, "cyber program", [
      "cybersecurity",
      "cyber security",
      "information security"
    ]),
    healthcare_programs: findEvidence(pages, "healthcare program", [
      "healthcare",
      "health care",
      "nursing",
      "public health"
    ]),
    innovation_center: findEvidence(pages, "innovation center", [
      "innovation center",
      "innovation hub",
      "innovation lab"
    ]),
    entrepreneurship_center: findEvidence(pages, "entrepreneurship center", [
        "entrepreneurship center",
        "entrepreneurship",
        "venture"
      ]),
    career_services_office: findEvidence(pages, "career services office", [
      "career services",
      "career center",
      "career development"
    ]),
    workforce_development_office: findEvidence(pages, "workforce development office", [
      "workforce development",
      "continuing education"
    ]),
    profile_sources: pages.map((page) => page.url)
  };
}

async function saveProfile(
  profile: UniversityResearchProfile
): Promise<{ status: "saved" | "denied" | "failed"; schoolId?: string }> {
  // User-triggered saves use the authenticated session client so RLS applies.
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return { status: "failed" };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return { status: "denied" };
  }

  const { data: existingSchool } = await supabase
    .from("schools")
    .select("organization_id")
    .eq("name", profile.name)
    .eq("district", profile.public_private)
    .maybeSingle();

  if (
    existingSchool &&
    existingSchool.organization_id !== ownership.organization_id
  ) {
    return { status: "denied" };
  }

  const { error } = await supabase.from("schools").upsert(
    {
      name: profile.name,
      website: profile.website,
      enrollment: profile.enrollment,
      public_private: profile.public_private,
      hbcu: profile.hbcu,
      community_college: profile.community_college,
      state: profile.state,
      ai_programs: profile.ai_programs,
      cyber_programs: profile.cyber_programs,
      healthcare_programs: profile.healthcare_programs,
      innovation_center: profile.innovation_center,
      entrepreneurship_center: profile.entrepreneurship_center,
      career_services_office: profile.career_services_office,
      workforce_development_office: profile.workforce_development_office,
      profile_sources: profile.profile_sources,
      district: profile.public_private,
      location: profile.state,
      status: "Prospect",
      owner: "Research agent",
      next_step: "Review researched school profile",
      ...(ownership
        ? {
            organization_id: ownership.organization_id,
            created_by: ownership.created_by,
            updated_by: ownership.updated_by,
            assigned_to: ownership.assigned_to
          }
        : {})
    },
    {
      onConflict: "name,district"
    }
  );

  if (error) {
    return { status: "failed" };
  }

  const { data: school } = await supabase
    .from("schools")
    .select("id")
    .eq("name", profile.name)
    .eq("district", profile.public_private)
    .maybeSingle();

  return {
    status: "saved",
    schoolId: school?.id
  };
}

export async function executeUniversityResearch(
  formData: FormData
): Promise<UniversityResearchResult> {
  let schoolName = "";
  let submittedWebsite = "";

  try {
    const validation = validateUniversityResearchInput(formData);

    if (!validation.success) {
      return createResearchResult(
        emptyResearchProfile(),
        false,
        validation.error
      );
    }

    schoolName = validation.data.school_name;
    submittedWebsite = normalizeWebsite(validation.data.website);

    const user = await requireUser();

    if (!user) {
      return createResearchResult(
        emptyResearchProfile(schoolName, submittedWebsite),
        false,
        "Sign in to run the research agent."
      );
    }

    const membership = await requireRole(user, MUTATION_ROLES);

    if (!membership) {
      return createResearchResult(
        emptyResearchProfile(schoolName, submittedWebsite),
        false,
        "You do not have permission to run the research agent."
      );
    }

    const supabase = await getServerSupabaseClient();

    if (supabase) {
      const rateLimit = await enforceRateLimit(
        supabase,
        user.id,
        RATE_LIMIT_ACTIONS.universityResearch,
        RATE_LIMITS.universityResearch,
        "Too many research requests. Please wait a few minutes and try again."
      );

      if (!rateLimit.allowed) {
        return createResearchResult(
          emptyResearchProfile(schoolName, submittedWebsite),
          false,
          rateLimit.error
        );
      }
    }

    if (submittedWebsite && !isSafeHttpsUrl(submittedWebsite)) {
      return createResearchResult(
        emptyResearchProfile(schoolName, ""),
        false,
        "Could not fetch a public school page. Check the website URL and try again."
      );
    }

    const website = submittedWebsite || (await discoverWebsite(schoolName));

    if (!website || !isSafeHttpsUrl(website)) {
      return createResearchResult(
        emptyResearchProfile(schoolName, submittedWebsite),
        false,
        submittedWebsite
          ? "Could not fetch a public school page. Check the website URL and try again."
          : "Could not discover an official website. Add a website and rerun the agent."
      );
    }

    const pages = await fetchResearchPages(pageUrls(website));
    const fallbackPages = pages.length
      ? pages
      : [
          {
            url: website,
            text: `${schoolName} public university website`
          }
        ];
    const profile = buildProfile(schoolName, website, fallbackPages);

    if (supabase) {
      try {
        let websiteHost = "unknown";

        try {
          websiteHost = new URL(website).hostname;
        } catch {
          websiteHost = "unknown";
        }

        await recordAuditEvent(supabase, {
          organizationId: membership.organization_id,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.universityResearchRun,
          targetTable: "schools",
          metadata: {
            school_name: schoolName,
            website_host: websiteHost,
            source_page_count: pages.length
          }
        });
      } catch (auditError) {
        logResearchError("audit run", auditError);
      }
    }

    let saveResult: { status: "saved" | "denied" | "failed"; schoolId?: string };

    try {
      saveResult = await saveProfile(profile);
    } catch (saveError) {
      logResearchError("save profile", saveError);
      saveResult = { status: "failed" };
    }

    const saved = saveResult.status === "saved";

    if (supabase && saved) {
      try {
        let websiteHost = "unknown";

        try {
          websiteHost = new URL(website).hostname;
        } catch {
          websiteHost = "unknown";
        }

        await recordAuditEvent(supabase, {
          organizationId: membership.organization_id,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.universityResearchSave,
          targetTable: "schools",
          recordId: saveResult.schoolId ?? null,
          metadata: {
            school_name: schoolName,
            website_host: websiteHost,
            source_page_count: pages.length
          }
        });
      } catch (auditError) {
        logResearchError("audit save", auditError);
      }
    }

    return createResearchResult(
      profile,
      saved,
      saved
        ? "Research complete and CRM school profile updated."
        : saveResult.status === "denied"
          ? "Research complete, but you do not have permission to save this profile."
          : "Research complete. Connect Supabase to save this profile automatically."
    );
  } catch (error) {
    logResearchError("researchUniversityProfile", error);
    return createResearchResult(
      emptyResearchProfile(schoolName, submittedWebsite),
      false,
      toUserSafeResearchError(error)
    );
  }
}
