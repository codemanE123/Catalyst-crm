import { getRecordOwnershipFields, type School } from "./supabase";
import { MUTATION_ROLES, requireRole } from "./authz";
import { validateUniversityResearchInput } from "./validation";
import { getServerSupabaseClient, requireUser } from "./supabaseServer";

export type UniversityResearchProfile = Required<
  Pick<
    School,
    | "name"
    | "website"
    | "enrollment"
    | "public_private"
    | "hbcu"
    | "community_college"
    | "state"
    | "ai_programs"
    | "cyber_programs"
    | "healthcare_programs"
    | "innovation_center"
    | "entrepreneurship_center"
    | "career_services_office"
    | "workforce_development_office"
    | "profile_sources"
  >
>;

export type UniversityResearchResult = {
  profile: UniversityResearchProfile;
  saved: boolean;
  message: string;
};

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
    ? trimmedWebsite
    : `https://${trimmedWebsite}`;
}

function pageUrls(baseUrl: string) {
  const url = new URL(baseUrl);
  const origin = url.origin;

  return [
    origin,
    `${origin}/about`,
    `${origin}/academics`,
    `${origin}/programs`,
    `${origin}/admissions`,
    `${origin}/career-services`,
    `${origin}/workforce-development`,
    `${origin}/innovation`,
    `${origin}/entrepreneurship`
  ];
}

async function discoverTopicPages(schoolName: string, website: string) {
  const hostname = new URL(website).hostname.replace(/^www\./, "");
  const topics = [
    "artificial intelligence program",
    "cybersecurity program",
    "healthcare programs",
    "innovation center",
    "entrepreneurship center",
    "career services",
    "workforce development"
  ];
  const discovered = await Promise.all(
    topics.map(async (topic) => {
      const query = encodeURIComponent(`${schoolName} ${topic} site:${hostname}`);

      try {
        const response = await fetch(`https://duckduckgo.com/html/?q=${query}`, {
          headers: {
            "user-agent": "CatalystCRMResearchAgent/1.0"
          },
          signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
          return "";
        }

        const html = await response.text();
        const match = [...html.matchAll(/uddg=([^"&]+)/g)]
          .map((result) => decodeURIComponent(result[1]))
          .find((url) => {
            try {
              return new URL(url).hostname.includes(hostname);
            } catch {
              return false;
            }
          });

        return match ?? "";
      } catch {
        return "";
      }
    })
  );

  return [...new Set(discovered.filter(Boolean))];
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "CatalystCRMResearchAgent/1.0"
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return null;
    }

    const text = stripHtml(await response.text());
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
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const matches = [...html.matchAll(/uddg=([^"&]+)/g)]
      .map((match) => decodeURIComponent(match[1]))
      .filter((url) => /^https?:\/\//i.test(url));
    const eduResult = matches.find((url) => {
      const hostname = new URL(url).hostname;
      return hostname.endsWith(".edu") || hostname.includes(".edu.");
    });

    return eduResult ? new URL(eduResult).origin : "";
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
): Promise<"saved" | "denied" | "failed"> {
  // User-triggered saves use the authenticated session client so RLS applies.
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return "failed";
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return "denied";
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
    return "denied";
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

  return error ? "failed" : "saved";
}

export async function researchUniversityProfile(
  _previousState: UniversityResearchResult | null,
  formData: FormData
): Promise<UniversityResearchResult> {
  "use server";

  const validation = validateUniversityResearchInput(formData);

  if (!validation.success) {
    return {
      profile: buildProfile("Unknown school", "", []),
      saved: false,
      message: validation.error
    };
  }

  const schoolName = validation.data.school_name;
  const submittedWebsite = normalizeWebsite(validation.data.website);

  const user = await requireUser();

  if (!user) {
    return {
      profile: buildProfile(schoolName, submittedWebsite, []),
      saved: false,
      message: "Sign in to run the research agent."
    };
  }

  const membership = await requireRole(user, MUTATION_ROLES);

  if (!membership) {
    return {
      profile: buildProfile(schoolName, submittedWebsite, []),
      saved: false,
      message: "You do not have permission to run the research agent."
    };
  }

  const website = submittedWebsite || (await discoverWebsite(schoolName));

  if (!website) {
    return {
      profile: buildProfile(schoolName, "", []),
      saved: false,
      message: "Could not discover an official website. Add a website and rerun the agent."
    };
  }

  const targetUrls = [
    ...new Set([...pageUrls(website), ...(await discoverTopicPages(schoolName, website))])
  ];
  const pages = (
    await Promise.all(targetUrls.map((url) => fetchPage(url)))
  ).filter((page): page is { url: string; text: string } => Boolean(page));
  const fallbackPages = pages.length
    ? pages
    : [
        {
          url: website,
          text: `${schoolName} public university website`
        }
      ];
  const profile = buildProfile(schoolName, website, fallbackPages);
  const saveResult = await saveProfile(profile);
  const saved = saveResult === "saved";

  return {
    profile,
    saved,
    message: saved
      ? "Research complete and CRM school profile updated."
      : saveResult === "denied"
        ? "Research complete, but you do not have permission to save this profile."
        : "Research complete. Connect Supabase to save this profile automatically."
  };
}
