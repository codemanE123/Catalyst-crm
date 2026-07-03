import { describe, expect, it } from "vitest";

import { shouldRedactRestrictedFields } from "@/lib/authz";
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

describe("shouldRedactRestrictedFields", () => {
  it("returns true for read_only membership in the school organization", () => {
    expect(
      shouldRedactRestrictedFields(member("read_only"), [member("read_only")])
    ).toBe(true);
  });

  it("returns false for sales membership in the school organization", () => {
    expect(
      shouldRedactRestrictedFields(member("sales"), [member("sales")])
    ).toBe(false);
  });

  it("returns false for admin membership in the school organization", () => {
    expect(
      shouldRedactRestrictedFields(member("admin"), [member("admin")])
    ).toBe(false);
  });

  it("returns false when user has super_admin in any organization", () => {
    const otherOrg = "44444444-4444-4444-4444-444444444444";

    expect(
      shouldRedactRestrictedFields(member("read_only"), [
        member("read_only", ORG_A),
        member("super_admin", otherOrg)
      ])
    ).toBe(false);
  });

  it("returns false when membership for the school organization is null", () => {
    expect(shouldRedactRestrictedFields(null, [member("read_only")])).toBe(false);
  });

  it("returns false when user has no memberships", () => {
    expect(shouldRedactRestrictedFields(null, [])).toBe(false);
  });

  it("returns true when school org membership is read_only even if user is sales elsewhere", () => {
    const otherOrg = "55555555-5555-5555-5555-555555555555";

    expect(
      shouldRedactRestrictedFields(member("read_only", ORG_A), [
        member("read_only", ORG_A),
        member("sales", otherOrg)
      ])
    ).toBe(true);
  });
});
