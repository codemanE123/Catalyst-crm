import { NextResponse } from "next/server";

import { isMonitoringTestRouteEnabled } from "@/lib/monitoring";

export async function GET() {
  if (!isMonitoringTestRouteEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  throw new Error("Sentry staging verification test event");
}
