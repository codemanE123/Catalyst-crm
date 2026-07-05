import { executeUniversityResearch } from "@/lib/universityResearch";
import type { UniversityResearchResult } from "@/lib/universityResearch.types";

export const maxDuration = 10;

function errorResult(message: string): UniversityResearchResult {
  return {
    profile: {
      name: "",
      website: "",
      enrollment: "",
      public_private: "Unknown",
      hbcu: false,
      community_college: false,
      state: "",
      ai_programs: "",
      cyber_programs: "",
      healthcare_programs: "",
      innovation_center: "",
      entrepreneurship_center: "",
      career_services_office: "",
      workforce_development_office: "",
      profile_sources: []
    },
    saved: false,
    message
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await executeUniversityResearch(formData);
    return Response.json(result);
  } catch {
    return Response.json(
      errorResult("Research could not be completed. Please try again later.")
    );
  }
}
