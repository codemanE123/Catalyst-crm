import { describe, expect, it } from "vitest";

import { canTriggerAgentWorker } from "@/lib/authz";
import type { OrganizationMember } from "@/lib/supabase";

function member(role: OrganizationMember["role"]): OrganizationMember {
  return {
    id: "member-1",
    organization_id: "org-1",
    user_id: "user-1",
    role,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

describe("canTriggerAgentWorker", () => {
  it("allows admin and super_admin roles", () => {
    expect(canTriggerAgentWorker([member("admin")])).toBe(true);
    expect(canTriggerAgentWorker([member("super_admin")])).toBe(true);
  });

  it("denies sales and read_only roles", () => {
    expect(canTriggerAgentWorker([member("sales")])).toBe(false);
    expect(canTriggerAgentWorker([member("read_only")])).toBe(false);
  });
});
