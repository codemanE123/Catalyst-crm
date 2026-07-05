"use server";

import { executeUniversityResearch } from "@/lib/universityResearch";
import type { UniversityResearchResult } from "@/lib/universityResearch.types";

export async function researchUniversityProfile(
  _previousState: UniversityResearchResult | null,
  formData: FormData
): Promise<UniversityResearchResult> {
  return executeUniversityResearch(formData);
}
