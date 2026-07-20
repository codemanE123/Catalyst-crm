import { timingSafeEqual } from "crypto";

export function validateFirefliesWebhookSecret(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function readFirefliesWebhookSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return (
    request.headers.get("x-fireflies-webhook-secret")?.trim() ||
    request.headers.get("x-meeting-import-secret")?.trim() ||
    null
  );
}
