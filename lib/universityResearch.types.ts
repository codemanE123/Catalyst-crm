import type { School } from "./supabase";

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
