import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/authPaths";

describe("safeNextPath", () => {
  it("returns fallback for empty values", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("accepts internal paths", () => {
    expect(safeNextPath("/schools/abc")).toBe("/schools/abc");
    expect(safeNextPath("/settings/members")).toBe("/settings/members");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
  });
});
