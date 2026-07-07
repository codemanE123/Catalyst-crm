import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentHandlerRegistry } from "@/lib/agents/handlers";
import type { AgentExecution } from "@/lib/agents/types";

describe("ContactDiscoveryAgent handler", () => {
  const execution: AgentExecution = {
    id: "exec-1",
    organization_id: "org-1",
    agent_name: "ContactDiscoveryAgent",
    target_type: "prospect_candidate",
    target_id: "candidate-1",
    status: "running",
    depends_on_execution_id: null,
    attempt_count: 1,
    started_at: "2026-07-07T12:00:00.000Z",
    completed_at: null,
    duration_ms: null,
    error_message: null,
    metadata: {},
    created_at: "2026-07-07T12:00:00.000Z",
    updated_at: "2026-07-07T12:00:00.000Z"
  };

  const runContactDiscovery = vi.fn(async () => ({
    ok: true as const,
    metadata: {
      recommendation_count: 3
    }
  }));

  beforeEach(() => {
    runContactDiscovery.mockClear();
  });

  it("delegates to runContactDiscovery for supported target types", async () => {
    const registry = createAgentHandlerRegistry({ runContactDiscovery });
    const handler = registry.get("ContactDiscoveryAgent");

    expect(handler).toBeDefined();

    const result = await handler!(execution, { actorUserId: "user-1" });

    expect(result.ok).toBe(true);
    expect(runContactDiscovery).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      targetType: "prospect_candidate",
      targetId: "candidate-1",
      agentExecutionId: "exec-1"
    });
  });

  it("rejects unsupported target types", async () => {
    const registry = createAgentHandlerRegistry({ runContactDiscovery });
    const handler = registry.get("ContactDiscoveryAgent");

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
    expect(runContactDiscovery).not.toHaveBeenCalled();
  });
});
