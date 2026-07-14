import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProcess = vi.fn();
const mockValidate = vi.fn();

vi.mock("@/lib/agents/batchWorker", () => ({
  processAgentExecutionsFromCron: (...args: unknown[]) => mockProcess(...args),
  validateAgentCronSecret: (...args: unknown[]) => mockValidate(...args)
}));

vi.mock("@/lib/agents/retryPolicy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/retryPolicy")>();
  return {
    ...actual,
    resolveAgentWorkerBatchSize: () => 5
  };
});

describe("POST /api/agents/process", () => {
  beforeEach(() => {
    vi.resetModules();
    mockProcess.mockReset();
    mockValidate.mockReset();
    process.env.AGENT_CRON_SECRET = "test-cron-secret";
  });

  it("rejects invalid cron secrets", async () => {
    mockValidate.mockReturnValue(false);

    const { POST } = await import("@/app/api/agents/process/route");
    const response = await POST(
      new Request("http://localhost/api/agents/process", {
        method: "POST",
        headers: { authorization: "Bearer wrong" }
      })
    );

    expect(response.status).toBe(401);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("processes a bounded batch for valid cron requests", async () => {
    mockValidate.mockReturnValue(true);
    mockProcess.mockResolvedValue({
      ok: true,
      summary: {
        processed: 2,
        completed: 1,
        failed: 0,
        retried: 1,
        skipped: 0,
        stale_recovered: 0
      }
    });

    const { POST } = await import("@/app/api/agents/process/route");
    const response = await POST(
      new Request("http://localhost/api/agents/process", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" }
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      processed: 2,
      completed: 1,
      failed: 0,
      retried: 1,
      skipped: 0
    });
    expect(body.error).toBeUndefined();
  });
});
