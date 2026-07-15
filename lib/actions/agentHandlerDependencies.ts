import type { SupabaseClient } from "@supabase/supabase-js";

import { createContactDiscoveryHandlerDependency } from "@/lib/actions/contactDiscovery";
import { createMeetingPrepHandlerDependency } from "@/lib/actions/meetingPrep";
import { createProposalGenerationHandlerDependency } from "@/lib/actions/proposalGeneration";
import type { AgentHandlerDependencies } from "@/lib/agents/handlers";
import { createProspectEnrichmentHandlerDependency } from "@/lib/prospectEnrichment/execute";
import { createProspectGenerationHandlerDependency } from "@/lib/prospectGeneration/execute";

export async function createAgentHandlerDependencies(
  supabase: SupabaseClient
): Promise<AgentHandlerDependencies> {
  const [
    contactDiscovery,
    meetingPrep,
    proposalGeneration,
    prospectEnrichment,
    prospectGeneration
  ] = await Promise.all([
    createContactDiscoveryHandlerDependency(supabase),
    createMeetingPrepHandlerDependency(supabase),
    createProposalGenerationHandlerDependency(supabase),
    Promise.resolve(createProspectEnrichmentHandlerDependency(supabase)),
    Promise.resolve(createProspectGenerationHandlerDependency(supabase))
  ]);

  return {
    ...contactDiscovery,
    ...meetingPrep,
    ...proposalGeneration,
    ...prospectEnrichment,
    ...prospectGeneration
  };
}
