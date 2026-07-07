import { describe, expect, it } from "vitest";

import {
  canEnqueueProspectGeneration,
  canManageSchools,
  canViewProspectGeneration
} from "@/lib/authz";
import type { OrganizationMember } from "@/lib/supabase";

function membership(role: OrganizationMember["role"]): OrganizationMember {
  return {
    id: `member-${role}`,
    organization_id: "org-1",
    user_id: "user-1",
    role,
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: "2026-07-07T00:00:00.000Z"
  };
}

describe("prospect generation authz", () => {
  it("allows org members to view prospect generation", () => {
    expect(canViewProspectGeneration([membership("read_only")])).toBe(true);
    expect(canViewProspectGeneration([])).toBe(false);
  });

  it("allows sales and above to enqueue prospect generation", () => {
    expect(canEnqueueProspectGeneration([membership("sales")])).toBe(true);
    expect(canEnqueueProspectGeneration([membership("admin")])).toBe(true);
    expect(canEnqueueProspectGeneration([membership("read_only")])).toBe(false);
    expect(canEnqueueProspectGeneration([membership("sales")])).toBe(
      canManageSchools([membership("sales")])
    );
  });
});
