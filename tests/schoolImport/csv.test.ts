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

  it("defaults owner and next step when blank", () => {
    const csv =
      "organization_name,website,city,state,status,owner,assigned_to,next_step,next_follow_up,notes\n" +
      "Howard University,https://www.howard.edu,Washington,DC,Prospect,,,,,\n";

    const preview = buildSchoolImportPreview(csv, new Set(), true);

    expect(preview.summary.valid).toBe(1);
    expect(preview.rows[0].school?.owner).toBe("Unassigned");
    expect(preview.rows[0].school?.next_step).toBe("Initial outreach");
  });

  it("rejects rows missing school name", () => {
    const csv =
      "organization_name,website,city,state,status,owner,assigned_to,next_step,next_follow_up,notes\n" +
      ",https://www.howard.edu,Washington,DC,Prospect,Alex Morgan,,Schedule intro call,,\n";

    const preview = buildSchoolImportPreview(csv, new Set(), true);

    expect(preview.summary.invalid).toBe(1);
    expect(preview.rows[0].status).toBe("invalid");
    expect(preview.rows[0].errors[0]).toBe("School name is required.");
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
  it("accepts Institution header from SC-style CSVs", () => {
    const csv =
      "Institution,Type,State,City,Website,Priority Contact\n" +
      "Alabama A&M University,Public University,AL,Normal,https://www.aamu.edu,Dean of Engineering\n";

    const parsed = parseSchoolImportCsv(csv);
    expect(parsed.rows[0].organization_name).toBe("Alabama A&M University");

    const preview = buildSchoolImportPreview(csv, new Set(), true);
    expect(preview.summary.valid).toBe(1);
    expect(preview.rows[0].school?.name).toBe("Alabama A&M University");
    expect(preview.rows[0].schoolType).toBe("Public University");
    expect(preview.rows[0].priorityContact).toBe("Dean of Engineering");
  });

  it("accepts School / Type / Priority Contact headers from directory CSVs", () => {
    const csv =
      "School,Type,State,City,Website,Priority Contact\n" +
      "Oakwood University,HBCU,AL,Huntsville,https://www.oakwood.edu,Dr. Jane Smith\n";

    const parsed = parseSchoolImportCsv(csv);
    expect(parsed.rows[0].organization_name).toBe("Oakwood University");
    expect(parsed.rows[0].type).toBe("HBCU");
    expect(parsed.rows[0].priority_contact).toBe("Dr. Jane Smith");

    const preview = buildSchoolImportPreview(csv, new Set(), true);
    expect(preview.summary.valid).toBe(1);
    expect(preview.rows[0].city).toBe("Huntsville");
    expect(preview.rows[0].schoolType).toBe("HBCU");
    expect(preview.rows[0].priorityContact).toBe("Dr. Jane Smith");
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
