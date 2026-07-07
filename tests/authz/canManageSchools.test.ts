import { describe, expect, it } from "vitest";

import { canManageSchools } from "@/lib/authz";
import type { OrganizationMember } from "@/lib/supabase";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

function member(role: OrganizationMember["role"], orgId = ORG_A): OrganizationMember {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    organization_id: orgId,
    user_id: USER_ID,
    role,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

describe("canManageSchools", () => {
  it("returns false for read_only users", () => {
    expect(canManageSchools([member("read_only")])).toBe(false);
  });

  it("returns true for sales users", () => {
    expect(canManageSchools([member("sales")])).toBe(true);
  });

  it("returns true for admin users", () => {
    expect(canManageSchools([member("admin")])).toBe(true);
  });

  it("returns true for super_admin users", () => {
    expect(canManageSchools([member("super_admin")])).toBe(true);
  });

  it("returns false when user has no memberships", () => {
    expect(canManageSchools([])).toBe(false);
  });
});
