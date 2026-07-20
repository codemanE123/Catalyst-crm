import { createHash, randomBytes } from "crypto";

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiresAt(days = 7): Date {
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + days);
  return expires;
}

export function isInviteExpired(expiresAt: string | Date, now = new Date()): boolean {
  const expires =
    typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime();
}
