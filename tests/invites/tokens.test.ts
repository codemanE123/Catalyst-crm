import { describe, expect, it } from "vitest";

import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  isInviteExpired
} from "@/lib/invites/tokens";

describe("membership invite tokens", () => {
  it("hashes tokens deterministically", () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toBe(hashInviteToken(`${token}x`));
  });

  it("detects expiry", () => {
    const future = inviteExpiresAt(7);
    expect(isInviteExpired(future)).toBe(false);
    expect(isInviteExpired("2000-01-01T00:00:00.000Z")).toBe(true);
  });
});
