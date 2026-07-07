import { describe, expect, it } from "vitest";

import {
  buildSchoolDuplicateKey,
  buildSchoolImportPreview,
  buildSchoolLocation,
  parseSchoolImportCsv
} from "@/lib/schoolImport";

const VALID_ROW =
  "organization_name,website,city,state,status,owner,assigned_to,next_step,next_follow_up,notes\n" +
  "Howard University,https://www.howard.edu,Washington,DC,Prospect,Alex Morgan,,Schedule intro call,2026-07-15,HBCU target\n";

describe("parseSchoolImportCsv", () => {
  it("parses headers and rows from a CSV file", () => {
    const parsed = parseSchoolImportCsv(VALID_ROW);

    expect(parsed.headers).toContain("organization_name");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].organization_name).toBe("Howard University");
    expect(parsed.rows[0].city).toBe("Washington");
  });

  it("handles quoted fields with commas", () => {
    const csv =
      "organization_name,website,city,state,status,owner,assigned_to,next_step,next_follow_up,notes\n" +
      '"Oakwood University, Inc.",https://oakwood.edu,Huntsville,AL,Prospect,Alex Morgan,,Call dean,,Notes\n';

    const parsed = parseSchoolImportCsv(csv);

    expect(parsed.rows[0].organization_name).toBe("Oakwood University, Inc.");
  });
});

describe("buildSchoolImportPreview", () => {
  it("marks valid rows ready for import", () => {
    const preview = buildSchoolImportPreview(VALID_ROW, new Set(), true);

    expect(preview.summary.total).toBe(1);
    expect(preview.summary.valid).toBe(1);
    expect(preview.summary.invalid).toBe(0);
    expect(preview.rows[0].status).toBe("valid");
    expect(preview.rows[0].school?.name).toBe("Howard University");
    expect(preview.rows[0].location).toBe("Washington, DC");
    expect(preview.rows[0].district).toBe("DC");
  });

  it("rejects rows missing required fields", () => {
    const csv =
      "organization_name,website,city,state,status,owner,assigned_to,next_step,next_follow_up,notes\n" +
      "Howard University,https://www.howard.edu,Washington,DC,Prospect,,,Schedule intro call,,\n";

    const preview = buildSchoolImportPreview(csv, new Set(), true);

    expect(preview.summary.invalid).toBe(1);
    expect(preview.rows[0].status).toBe("invalid");
    expect(preview.rows[0].errors[0]).toBe("Owner is required.");
  });

  it("skips duplicates already in the organization", () => {
    const duplicateKey = buildSchoolDuplicateKey("Howard University", "DC");
    const preview = buildSchoolImportPreview(
      VALID_ROW,
      new Set([duplicateKey]),
      true
    );

    expect(preview.summary.duplicate).toBe(1);
    expect(preview.rows[0].status).toBe("duplicate");
    expect(preview.rows[0].duplicateReason).toContain("already exists");
  });

  it("skips duplicate rows within the same CSV", () => {
    const csv =
      "organization_name,website,city,state,status,owner,assigned_to,next_step,next_follow_up,notes\n" +
      "Howard University,https://www.howard.edu,Washington,DC,Prospect,Alex Morgan,,Schedule intro call,,\n" +
      "Howard University,https://www.howard.edu,Washington,DC,Prospect,Alex Morgan,,Follow up,,\n";

    const preview = buildSchoolImportPreview(csv, new Set(), true);

    expect(preview.summary.valid).toBe(1);
    expect(preview.summary.duplicate).toBe(1);
    expect(preview.rows[1].duplicateReason).toContain("Duplicate row");
  });

  it("merges next_follow_up into notes", () => {
    const preview = buildSchoolImportPreview(VALID_ROW, new Set(), true);

    expect(preview.rows[0].school?.notes).toBe(
      "HBCU target | Next follow-up: 2026-07-15"
    );
  });
});

describe("buildSchoolLocation", () => {
  it("combines city and state", () => {
    expect(buildSchoolLocation("Atlanta", "GA")).toBe("Atlanta, GA");
  });

  it("falls back when location parts are missing", () => {
    expect(buildSchoolLocation("", "GA")).toBe("GA");
    expect(buildSchoolLocation("", "")).toBe("Unknown");
  });
});

describe("buildSchoolDuplicateKey", () => {
  it("normalizes name and district for duplicate checks", () => {
    expect(buildSchoolDuplicateKey(" Howard University ", "DC")).toBe(
      buildSchoolDuplicateKey("howard university", "dc")
    );
  });
});
