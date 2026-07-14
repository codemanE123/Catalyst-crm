import type { SupabaseClient } from "@supabase/supabase-js";

import { createContactDiscoveryHandlerDependency } from "@/lib/actions/contactDiscovery";
import { createMeetingPrepHandlerDependency } from "@/lib/actions/meetingPrep";
import { createProposalGenerationHandlerDependency } from "@/lib/actions/proposalGeneration";
import type { AgentHandlerDependencies } from "@/lib/agents/handlers";

export async function createAgentHandlerDependencies(
  supabase: SupabaseClient
): Promise<AgentHandlerDependencies> {
  const [contactDiscovery, meetingPrep, proposalGeneration] = await Promise.all([
    createContactDiscoveryHandlerDependency(supabase),
    createMeetingPrepHandlerDependency(supabase),
    createProposalGenerationHandlerDependency(supabase)
  ]);

  return {
    ...contactDiscovery,
    ...meetingPrep,
    ...proposalGeneration
  };
}
