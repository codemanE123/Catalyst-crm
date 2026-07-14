import { NextResponse } from "next/server";

import {
  processAgentExecutionsFromCron,
  validateAgentCronSecret
} from "@/lib/agents/batchWorker";
import { resolveAgentWorkerBatchSize } from "@/lib/agents/retryPolicy";
import { sanitizeAgentErrorMessage } from "@/lib/agents/sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readCronSecret(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-agent-cron-secret")?.trim() ?? null;
}

export async function POST(request: Request) {
  const expected = process.env.AGENT_CRON_SECRET?.trim();
  const provided = readCronSecret(request);

  if (!validateAgentCronSecret(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processAgentExecutionsFromCron({
      env: process.env
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: sanitizeAgentErrorMessage(result.error) },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      batch_size: resolveAgentWorkerBatchSize(),
      ...result.summary
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent batch processing failed.";

    return NextResponse.json(
      { error: sanitizeAgentErrorMessage(message) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
