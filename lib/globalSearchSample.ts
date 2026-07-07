import {
  searchSampleContacts,
  searchSampleSchools,
  type GlobalSearchResults
} from "@/lib/globalSearch";

const sampleSchools = [
  {
    id: "school-1",
    name: "Roosevelt High School",
    location: "Oak Valley, CA",
    state: "CA",
    status: "Interviewing",
    website: "https://www.roosevelths.example.edu"
  },
  {
    id: "school-2",
    name: "North Star Academy",
    location: "Denver, CO",
    state: "CO",
    status: "Contacted",
    website: "https://www.northstar.example.edu"
  },
  {
    id: "school-3",
    name: "Lakeview Middle School",
    location: "Madison, WI",
    state: "WI",
    status: "Prospect",
    website: "https://www.lakeview.example.edu"
  },
  {
    id: "school-4",
    name: "Cedar Ridge Prep",
    location: "Austin, TX",
    state: "TX",
    status: "Partner",
    website: "https://www.cedarridge.example.edu"
  }
];

const sampleContacts = [
  {
    id: "contact-1",
    name: "Dr. Elaine Foster",
    role: "Principal",
    school: "Roosevelt High School",
    email: "elaine.foster@example.edu"
  },
  {
    id: "contact-2",
    name: "Marcus Lee",
    role: "College Counselor",
    school: "North Star Academy",
    email: "marcus.lee@example.edu"
  },
  {
    id: "contact-3",
    name: "Ana Morales",
    role: "Assistant Principal",
    school: "Lakeview Middle School",
    email: "ana.morales@example.edu"
  }
];

export function getSampleSearchResults(query: string): GlobalSearchResults {
  return {
    query,
    schools: searchSampleSchools(sampleSchools, query),
    contacts: searchSampleContacts(sampleContacts, sampleSchools, query)
  };
}
