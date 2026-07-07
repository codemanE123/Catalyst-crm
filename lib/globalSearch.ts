import type { SupabaseClient } from "@supabase/supabase-js";

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_MAX_QUERY_LENGTH = 100;
export const SEARCH_DEFAULT_LIMIT = 8;

export type SchoolSearchResult = {
  type: "school";
  id: string;
  name: string;
  location: string;
  state: string | null;
  status: string;
  website: string | null;
};

export type ContactSearchResult = {
  type: "contact";
  id: string;
  name: string;
  title: string;
  email: string;
  schoolId: string;
  schoolName: string;
};

export type GlobalSearchResults = {
  query: string;
  schools: SchoolSearchResult[];
  contacts: ContactSearchResult[];
};

type SampleSchoolRecord = {
  id: string;
  name: string;
  location: string;
  state?: string | null;
  status: string;
  website?: string | null;
};

type SampleContactRecord = {
  id: string;
  name: string;
  role: string;
  email: string;
  school: string;
  schoolId?: string;
};

export function normalizeSearchQuery(query: string): string | null {
  const trimmed = query.trim();

  if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
    return null;
  }

  return trimmed.slice(0, SEARCH_MAX_QUERY_LENGTH);
}

export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function buildIlikePattern(query: string): string {
  return `%${escapeIlikePattern(query)}%`;
}

export function buildOrIlikeFilter(
  columns: string[],
  pattern: string
): string {
  const quotedPattern = pattern.replace(/"/g, '""');

  return columns
    .map((column) => `${column}.ilike."${quotedPattern}"`)
    .join(",");
}

export function matchesSearchTerm(
  value: string | null | undefined,
  normalizedQuery: string
): boolean {
  if (!value) {
    return false;
  }

  return value.toLowerCase().includes(normalizedQuery.toLowerCase());
}

export function searchSampleSchools(
  schools: SampleSchoolRecord[],
  normalizedQuery: string,
  limit = SEARCH_DEFAULT_LIMIT
): SchoolSearchResult[] {
  return schools
    .filter((school) =>
      matchesSearchTerm(school.name, normalizedQuery) ||
      matchesSearchTerm(school.website ?? null, normalizedQuery) ||
      matchesSearchTerm(school.location, normalizedQuery) ||
      matchesSearchTerm(school.state ?? null, normalizedQuery)
    )
    .slice(0, limit)
    .map((school) => ({
      type: "school" as const,
      id: school.id,
      name: school.name,
      location: school.location,
      state: school.state ?? null,
      status: school.status,
      website: school.website ?? null
    }));
}

export function searchSampleContacts(
  contacts: SampleContactRecord[],
  schools: SampleSchoolRecord[],
  normalizedQuery: string,
  limit = SEARCH_DEFAULT_LIMIT
): ContactSearchResult[] {
  const schoolNameToId = new Map(
    schools.map((school) => [school.name.toLowerCase(), school.id])
  );

  return contacts
    .filter(
      (contact) =>
        matchesSearchTerm(contact.name, normalizedQuery) ||
        matchesSearchTerm(contact.role, normalizedQuery)
    )
    .slice(0, limit)
    .map((contact) => ({
      type: "contact" as const,
      id: contact.id,
      name: contact.name,
      title: contact.role,
      email: contact.email,
      schoolId: contact.schoolId ?? schoolNameToId.get(contact.school.toLowerCase()) ?? "",
      schoolName: contact.school
    }))
    .filter((contact) => contact.schoolId.length > 0);
}

export async function searchGlobal(
  supabase: SupabaseClient,
  organizationId: string,
  query: string,
  limit = SEARCH_DEFAULT_LIMIT
): Promise<GlobalSearchResults | null> {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return null;
  }

  const pattern = buildIlikePattern(normalizedQuery);
  const schoolFilter = buildOrIlikeFilter(
    ["name", "website", "location", "state"],
    pattern
  );
  const contactFilter = buildOrIlikeFilter(["name", "role"], pattern);

  const [schoolsResponse, contactsResponse] = await Promise.all([
    supabase
      .from("schools")
      .select("id,name,location,state,status,website")
      .eq("organization_id", organizationId)
      .or(schoolFilter)
      .order("name")
      .limit(limit),
    supabase
      .from("contacts")
      .select("id,name,role,email,school_id,schools(id,name)")
      .eq("organization_id", organizationId)
      .or(contactFilter)
      .order("name")
      .limit(limit)
  ]);

  if (schoolsResponse.error || contactsResponse.error) {
    throw new Error("Could not run search.");
  }

  const schools = (schoolsResponse.data ?? []).map((school) => ({
    type: "school" as const,
    id: school.id,
    name: school.name,
    location: school.location,
    state: school.state,
    status: school.status,
    website: school.website
  }));

  const contacts = (contactsResponse.data ?? [])
    .map((contact) => {
      const schoolRelation = contact.schools as
        | { id: string; name: string }
        | { id: string; name: string }[]
        | null;
      const school = Array.isArray(schoolRelation)
        ? schoolRelation[0]
        : schoolRelation;

      if (!school?.id && !contact.school_id) {
        return null;
      }

      return {
        type: "contact" as const,
        id: contact.id,
        name: contact.name,
        title: contact.role,
        email: contact.email,
        schoolId: school?.id ?? contact.school_id,
        schoolName: school?.name ?? "Unknown school"
      };
    })
    .filter((contact): contact is ContactSearchResult => contact !== null);

  return {
    query: normalizedQuery,
    schools,
    contacts
  };
}
