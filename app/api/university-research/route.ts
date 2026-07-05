import { executeUniversityResearch } from "@/lib/universityResearch";
import type { UniversityResearchResult } from "@/lib/universityResearch.types";
import { getServerSupabaseClient } from "@/lib/supabaseServer";
import { NextResponse, type NextRequest } from "next/server";

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const supabase = await getServerSupabaseClient();

    if (!supabase) {
      return NextResponse.json(
        errorResult("Research could not be completed. Please try again later.")
      );
    }

    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        errorResult("Sign in to run the research agent.")
      );
    }

    const result = await executeUniversityResearch(formData, {
      user,
      supabase
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      errorResult("Research could not be completed. Please try again later.")
    );
  }
}
