import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockRecordAuditEvent = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/supabaseServer", () => ({
  requireUser: () => mockRequireUser(),
  getServerSupabaseClient: () => mockGetServerSupabaseClient(),
  isDevelopmentEnvironment: () => true,
  SUPABASE_CONFIGURATION_ERROR: "Supabase is not configured on this deployment."
}));

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return {
    ...actual,
    requireRole: (...args: unknown[]) => mockRequireRole(...args),
    getMembershipForUser: vi.fn()
  };
});

vi.mock("@/lib/supabase", () => ({
  getRecordOwnershipFields: () => mockGetRecordOwnershipFields()
}));

vi.mock("@/lib/auditLog", () => ({
  AUDIT_ACTIONS: {
    schoolCreate: "school.create",
    schoolImport: "school.import"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

const VALID_CSV =
  "organization_name,website,city,state,status,owner,assigned_to,next_step,next_follow_up,notes\n" +
  "Howard University,https://www.howard.edu,Washington,DC,Prospect,Alex Morgan,,Schedule intro call,,\n";

function buildImportForm(csvText = VALID_CSV, assignToMe = true) {
  const formData = new FormData();
  formData.set("csv_text", csvText);

  if (assignToMe) {
    formData.set("assign_to_me", "on");
  }

  return formData;
}

function buildSupabaseMock(existingSchools: Array<{ name: string; district: string }> = []) {
  const insertedRows: Array<Record<string, unknown>> = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "schools") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: existingSchools,
              error: null
            }))
          })),
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                insertedRows.push(payload);
                return {
                  data: { id: `school-${insertedRows.length}` },
                  error: null
                };
              })
            }))
          }))
        };
      }

      return {
        insert: vi.fn(async () => ({ error: null }))
      };
    }),
    insertedRows
  };
}

describe("previewSchoolImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSupabaseClient.mockResolvedValue(null);
  });

  it("requires sign-in", async () => {
    mockRequireUser.mockResolvedValue(null);
    mockGetServerSupabaseClient.mockResolvedValue(buildSupabaseMock());

    const { previewSchoolImport } = await import("@/lib/actions/schoolImport");
    const result = await previewSchoolImport(buildImportForm());

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toBe("Sign in to import schools.");
    }
  });

  it("requires sales or admin role", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetServerSupabaseClient.mockResolvedValue(buildSupabaseMock());
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1",
      created_by: "user-1",
      updated_by: "user-1",
      assigned_to: "user-1"
    });
    mockRequireRole.mockResolvedValue(null);

    const { previewSchoolImport } = await import("@/lib/actions/schoolImport");
    const result = await previewSchoolImport(buildImportForm());

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toBe("You do not have permission to import schools.");
    }
  });

  it("returns a validated preview for authorized users", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetServerSupabaseClient.mockResolvedValue(buildSupabaseMock());
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1",
      created_by: "user-1",
      updated_by: "user-1",
      assigned_to: "user-1"
    });
    mockRequireRole.mockResolvedValue({ role: "sales" });

    const { previewSchoolImport } = await import("@/lib/actions/schoolImport");
    const result = await previewSchoolImport(buildImportForm());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.preview.summary.valid).toBe(1);
      expect(result.preview.rows[0].school?.name).toBe("Howard University");
    }
  });
});

describe("importSchoolsFromCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("imports valid rows and records audit events", async () => {
    const supabase = buildSupabaseMock();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1",
      created_by: "user-1",
      updated_by: "user-1",
      assigned_to: "user-1"
    });
    mockRequireRole.mockResolvedValue({ role: "admin" });

    const { importSchoolsFromCsv } = await import("@/lib/actions/schoolImport");
    const result = await importSchoolsFromCsv(buildImportForm());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details[0].outcome).toBe("imported");
    }

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("skips duplicate schools during import", async () => {
    const supabase = buildSupabaseMock([
      { name: "Howard University", district: "DC" }
    ]);
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1",
      created_by: "user-1",
      updated_by: "user-1",
      assigned_to: "user-1"
    });
    mockRequireRole.mockResolvedValue({ role: "sales" });

    const { importSchoolsFromCsv } = await import("@/lib/actions/schoolImport");
    const result = await importSchoolsFromCsv(buildImportForm());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.details[0].outcome).toBe("skipped");
    }
  });
});
