import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentHandlerRegistry } from "@/lib/agents/handlers";
import type { AgentExecution } from "@/lib/agents/types";

describe("MeetingPrepAgent handler", () => {
  const execution: AgentExecution = {
    id: "exec-1",
    organization_id: "org-1",
    agent_name: "MeetingPrepAgent",
    target_type: "school",
    target_id: "school-1",
    status: "running",
    depends_on_execution_id: null,
    attempt_count: 1,
    max_attempts: 3,
    next_retry_at: null,
    last_error_code: null,
    started_at: "2026-07-07T12:00:00.000Z",
    completed_at: null,
    duration_ms: null,
    error_message: null,
    metadata: {},
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z"
  };

  const runMeetingPrep = vi.fn(async () => ({
    ok: true as const,
    metadata: {
      confidence_score: 0.82
    }
  }));

  beforeEach(() => {
    runMeetingPrep.mockClear();
  });

  it("delegates to runMeetingPrep for supported target types", async () => {
    const registry = createAgentHandlerRegistry({ runMeetingPrep });
    const handler = registry.get("MeetingPrepAgent");

    const result = await handler!(execution, { actorUserId: "user-1" });

    expect(result.ok).toBe(true);
    expect(runMeetingPrep).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      targetType: "school",
      targetId: "school-1",
      agentExecutionId: "exec-1"
    });
  });

  it("rejects unsupported target types", async () => {
    const registry = createAgentHandlerRegistry({ runMeetingPrep });
    const handler = registry.get("MeetingPrepAgent");

    const result = await handler!(
      {
        ...execution,
        target_type: "prospect_generation_job",
        target_id: "job-1"
      },
      { actorUserId: "user-1" }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_message).toContain("prospect_candidate or school");
    }
    expect(runMeetingPrep).not.toHaveBeenCalled();
  });
});
