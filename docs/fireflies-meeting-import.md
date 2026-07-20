# Fireflies meeting import (Phase 5.x.1)

**Status:** Implemented (Fireflies only; Zoom deferred)  
**Scope:** Webhook staging → human Accept/Reject → discovery `interviews` (+ optional Meeting outreach).

## Product rules

- Imports are **never** CRM truth until a human accepts.
- Digest ≤ 5,000 chars; transcript excerpt ≤ 10,000 chars.
- Emails in digest/transcript are redacted before storage.
- Possible student/education-record language sets `error_code=possible_student_pii` and surfaces a warning; accept remains manual.
- Audit metadata must not include transcript text.

## Flow

1. Fireflies posts to `POST /api/integrations/fireflies/webhook` with shared secret.
2. Optional GraphQL fetch enriches title/summary/sentences when `FIREFLIES_API_KEY` + `meetingId` are present.
3. Payload normalizes into `meeting_imports` (`pending_review`), with deterministic school match (participant email domain ↔ school website, else title contains school name).
4. Reviewers use **Meeting imports** (`/meeting-imports`) or the school profile banner.
5. **Accept** creates an `interviews` row (and best-effort Meeting `outreach`). **Reject** closes the import. Unmatched imports must be **linked** to a school first.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEETING_IMPORT_ENABLED` | `false` | Master switch |
| `MEETING_IMPORT_REQUIRE_REVIEW` | `true` | Reserved for future auto paths; Accept still required |
| `FIREFLIES_WEBHOOK_SECRET` | unset | Shared secret (Bearer or `x-fireflies-webhook-secret`) |
| `FIREFLIES_API_KEY` | unset | Optional GraphQL enrichment |
| `FIREFLIES_DEFAULT_ORGANIZATION_ID` | unset | Org when webhook body omits `organization_id` |

Also required for webhook writes: `SUPABASE_SERVICE_ROLE_KEY` (service role bypasses RLS on insert).

Apply migration `20260720120000_meeting_imports_fireflies.sql`.

## Webhook auth

Accepted secrets (timing-safe compare):

- `Authorization: Bearer <secret>`
- `x-fireflies-webhook-secret: <secret>`
- `x-meeting-import-secret: <secret>`

Body must include `meetingId` / `meeting_id` (or equivalent) and an organization id via body (`organization_id` / `organizationId` / `clientReferenceId`) or `FIREFLIES_DEFAULT_ORGANIZATION_ID`.

## UI

- Nav: **Meeting imports**
- School profile banner when that school has pending imports

## Out of scope (v1)

- Zoom
- Auto-accept / silent CRM writes
- Contact auto-create from participants
