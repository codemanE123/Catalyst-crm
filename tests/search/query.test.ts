import { describe, expect, it } from "vitest";

import {
  buildIlikePattern,
  buildOrIlikeFilter,
  escapeIlikePattern,
  matchesSearchTerm,
  normalizeSearchQuery,
  searchSampleContacts,
  searchSampleSchools
} from "@/lib/globalSearch";

const sampleSchools = [
  {
    id: "school-1",
    name: "Howard University",
    location: "Washington, DC",
    state: "DC",
    status: "Prospect",
    website: "https://www.howard.edu"
  },
  {
    id: "school-2",
    name: "Spelman College",
    location: "Atlanta, GA",
    state: "GA",
    status: "Prospect",
    website: "https://www.spelman.edu"
  }
];

const sampleContacts = [
  {
    id: "contact-1",
    name: "Dr. Elaine Foster",
    role: "Principal",
    school: "Howard University",
    email: "elaine@example.edu"
  }
];

describe("normalizeSearchQuery", () => {
  it("requires at least two characters", () => {
    expect(normalizeSearchQuery("a")).toBeNull();
    expect(normalizeSearchQuery("  hi ")).toBe("hi");
  });

  it("caps query length", () => {
    expect(normalizeSearchQuery("a".repeat(150))?.length).toBe(100);
  });
});

describe("escapeIlikePattern", () => {
  it("escapes ilike wildcard characters", () => {
    expect(escapeIlikePattern("100%_done")).toBe("100\\%\\_done");
    expect(buildIlikePattern("100%_done")).toBe("%100\\%\\_done%");
  });
});

describe("buildOrIlikeFilter", () => {
  it("builds a PostgREST OR filter for indexed columns", () => {
    expect(buildOrIlikeFilter(["name", "website"], "%howard%")).toBe(
      'name.ilike."%howard%",website.ilike."%howard%"'
    );
  });
});

describe("searchSampleSchools", () => {
  it("matches school name, website, city, and state", () => {
    expect(searchSampleSchools(sampleSchools, "howard")).toHaveLength(1);
    expect(searchSampleSchools(sampleSchools, "howard.edu")).toHaveLength(1);
    expect(searchSampleSchools(sampleSchools, "washington")).toHaveLength(1);
    expect(searchSampleSchools(sampleSchools, "dc")).toHaveLength(1);
  });

  it("returns no matches for unrelated terms", () => {
    expect(searchSampleSchools(sampleSchools, "zzzz")).toHaveLength(0);
  });
});

describe("searchSampleContacts", () => {
  it("matches contact name and title", () => {
    expect(searchSampleContacts(sampleContacts, sampleSchools, "elaine")).toHaveLength(
      1
    );
    expect(searchSampleContacts(sampleContacts, sampleSchools, "principal")).toHaveLength(
      1
    );
  });
});

describe("matchesSearchTerm", () => {
  it("performs case-insensitive substring matching", () => {
    expect(matchesSearchTerm("Howard University", "howard")).toBe(true);
    expect(matchesSearchTerm(null, "howard")).toBe(false);
  });
});
