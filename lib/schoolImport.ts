import {
  validateCreateSchoolInput,
  type CreateSchoolInput,
  type ValidationResult
} from "@/lib/validation";

export const SCHOOL_IMPORT_CSV_HEADERS = [
  "organization_name",
  "website",
  "city",
  "state",
  "status",
  "owner",
  "assigned_to",
  "next_step",
  "next_follow_up",
  "notes"
] as const;

export type SchoolImportRowStatus = "valid" | "invalid" | "duplicate";

export type ParsedSchoolImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  status: SchoolImportRowStatus;
  errors: string[];
  duplicateReason?: string;
  school?: CreateSchoolInput;
  district: string;
  location: string;
  state: string | null;
};

export type SchoolImportPreviewSummary = {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
};

export type SchoolImportPreview = {
  rows: ParsedSchoolImportRow[];
  summary: SchoolImportPreviewSummary;
};

const HEADER_ALIASES: Record<string, string> = {
  organization_name: "organization_name",
  name: "organization_name",
  school_name: "organization_name",
  website: "website",
  city: "city",
  state: "state",
  status: "status",
  owner: "owner",
  assigned_to: "assigned_to",
  next_step: "next_step",
  next_follow_up: "next_follow_up",
  notes: "notes"
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeHeader(header: string): string {
  return HEADER_ALIASES[header.trim().toLowerCase()] ?? header.trim().toLowerCase();
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

export function parseSchoolImportCsv(csvText: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const normalizedText = csvText.replace(/^\uFEFF/, "").trim();

  if (!normalizedText) {
    return { headers: [], rows: [] };
  }

  const lines = normalizedText.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });

  return { headers, rows };
}

export function buildSchoolLocation(city: string, state: string): string {
  const trimmedCity = city.trim();
  const trimmedState = state.trim();

  if (trimmedCity && trimmedState) {
    return `${trimmedCity}, ${trimmedState}`;
  }

  return trimmedCity || trimmedState || "Unknown";
}

export function buildSchoolDuplicateKey(name: string, district: string): string {
  return `${name.trim().toLowerCase()}::${district.trim().toLowerCase()}`;
}

function mergeImportNotes(notes: string, nextFollowUp: string): string | undefined {
  const parts = [notes.trim(), nextFollowUp.trim()].filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  if (notes.trim() && nextFollowUp.trim()) {
    return `${notes.trim()} | Next follow-up: ${nextFollowUp.trim()}`;
  }

  return parts[0];
}

function mapCsvRowToValidationInput(
  row: Record<string, string>,
  assignToMe: boolean
): {
  validation: ValidationResult<CreateSchoolInput>;
  district: string;
  location: string;
  state: string | null;
} {
  const district = row.state?.trim() || "Unknown";
  const location = buildSchoolLocation(row.city ?? "", row.state ?? "");
  const state = row.state?.trim() || null;
  const assignedTo = row.assigned_to?.trim() ?? "";

  const validation = validateCreateSchoolInput({
    name: row.organization_name ?? row.name ?? "",
    website: row.website ?? "",
    status: row.status?.trim() || "Prospect",
    owner: row.owner ?? "",
    next_step: row.next_step ?? "",
    notes: mergeImportNotes(row.notes ?? "", row.next_follow_up ?? ""),
    assigned_to: UUID_PATTERN.test(assignedTo) ? assignedTo : undefined,
    assign_to_me: assignToMe && !UUID_PATTERN.test(assignedTo)
  });

  return { validation, district, location, state };
}

export function buildSchoolImportPreview(
  csvText: string,
  existingDuplicateKeys: Set<string>,
  assignToMe = true
): SchoolImportPreview {
  const { rows } = parseSchoolImportCsv(csvText);
  const seenKeys = new Set<string>();
  const parsedRows: ParsedSchoolImportRow[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const { validation, district, location, state } = mapCsvRowToValidationInput(
      row,
      assignToMe
    );

    if (!validation.success) {
      parsedRows.push({
        rowNumber,
        raw: row,
        status: "invalid",
        errors: [validation.error],
        district,
        location,
        state
      });
      return;
    }

    const duplicateKey = buildSchoolDuplicateKey(validation.data.name, district);

    if (existingDuplicateKeys.has(duplicateKey)) {
      parsedRows.push({
        rowNumber,
        raw: row,
        status: "duplicate",
        errors: [],
        duplicateReason: "School already exists in your organization.",
        school: validation.data,
        district,
        location,
        state
      });
      return;
    }

    if (seenKeys.has(duplicateKey)) {
      parsedRows.push({
        rowNumber,
        raw: row,
        status: "duplicate",
        errors: [],
        duplicateReason: "Duplicate row in this CSV file.",
        school: validation.data,
        district,
        location,
        state
      });
      return;
    }

    seenKeys.add(duplicateKey);
    parsedRows.push({
      rowNumber,
      raw: row,
      status: "valid",
      errors: [],
      school: validation.data,
      district,
      location,
      state
    });
  });

  const summary = parsedRows.reduce<SchoolImportPreviewSummary>(
    (totals, row) => {
      totals.total += 1;

      if (row.status === "valid") {
        totals.valid += 1;
      } else if (row.status === "invalid") {
        totals.invalid += 1;
      } else {
        totals.duplicate += 1;
      }

      return totals;
    },
    { total: 0, valid: 0, invalid: 0, duplicate: 0 }
  );

  return { rows: parsedRows, summary };
}

export function getImportableRows(preview: SchoolImportPreview): ParsedSchoolImportRow[] {
  return preview.rows.filter((row) => row.status === "valid" && row.school);
}
