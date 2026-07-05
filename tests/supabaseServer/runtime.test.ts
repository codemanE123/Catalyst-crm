import { describe, expect, it } from "vitest";

import {
  isDevelopmentEnvironment,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

describe("supabaseServer runtime guards", () => {
  it("exports a clear configuration error message", () => {
    expect(SUPABASE_CONFIGURATION_ERROR).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(SUPABASE_CONFIGURATION_ERROR).toContain("development");
  });

  it("detects development based on NODE_ENV", () => {
    expect(isDevelopmentEnvironment()).toBe(process.env.NODE_ENV === "development");
  });
});
