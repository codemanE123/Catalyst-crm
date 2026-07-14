import { describe, expect, it } from "vitest";

import {
  dependencyIsSatisfied,
  isFutureAgent,
  isTerminalAgentStatus,
  PROSPECT_AGENT_PIPELINE
} from "@/lib/agents";

describe("agent types helpers", () => {
  it("defines the prospect pipeline order", () => {
    expect(PROSPECT_AGENT_PIPELINE).toEqual([
      "ProspectGenerationAgent",
      "ProspectEnrichmentAgent",
      "OutreachDraftAgent"
    ]);
  });

  it("identifies legacy future extension agents", () => {
    expect(isFutureAgent("FutureMeetingPrepAgent")).toBe(false);
    expect(isFutureAgent("FutureContactDiscoveryAgent")).toBe(false);
    expect(isFutureAgent("MeetingPrepAgent")).toBe(false);
    expect(isFutureAgent("ContactDiscoveryAgent")).toBe(false);
    expect(isFutureAgent("ProspectGenerationAgent")).toBe(false);
  });

  it("checks dependency satisfaction and terminal statuses", () => {
    expect(
      dependencyIsSatisfied({
        id: "dep-1",
        organization_id: "org-1",
        agent_name: "ProspectGenerationAgent",
        target_type: "job",
        target_id: "job-1",
        status: "completed",
        depends_on_execution_id: null,
        attempt_count: 0,
        max_attempts: 3,
        next_retry_at: null,
        last_error_code: null,
        started_at: null,
        completed_at: null,
        duration_ms: null,
        error_message: null,
        metadata: {},
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z"
      })
    ).toBe(true);
    expect(isTerminalAgentStatus("failed")).toBe(true);
    expect(isTerminalAgentStatus("running")).toBe(false);
  });
});
