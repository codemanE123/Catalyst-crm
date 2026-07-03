# Phase 1 Security Sprint — Lessons Learned

**Project:** Catalyst CRM  
**Sprint:** Phase 1 Security (Tasks 1–15)  
**Date:** 2026-07-03  
**Authors:** Principal Software Architect, Security Lead, CTO

---

## Executive summary

Phase 1 succeeded in sequencing security work from **identity → authorization → data layer → abuse controls → privacy → assurance**. The sprint demonstrated that a small Next.js + Supabase prototype can reach **controlled internal testing readiness** in fifteen focused tasks without a full rewrite.

Key lessons: **layer security controls**, **do not trust UI-only privacy**, **document known dependency exceptions explicitly**, and **invest early in CI** even when test automation lags.

---

## What went well

### 1. Task ordering reduced rework

Following the recommended order (session → auth routes → middleware → schema → RLS → app guards) meant each layer built on the previous one. Service role removal (Task 7) after RLS (Task 6) forced correct session-client patterns instead of temporary bypasses.

### 2. Supabase RLS as the enforcement backbone

Organization-scoped policies with `security definer` helpers provided a single database truth for tenancy. Application guards (Task 8) added UX-friendly errors and cross-org forgery checks without duplicating all policy logic.

### 3. Small, focused libraries

Splitting concerns into `authz.ts`, `validation.ts`, `safeFetch.ts`, `rateLimit.ts`, and `auditLog.ts` kept `supabase.ts` readable and made each control testable in isolation in Phase 2.

### 4. Pragmatic rate limiting

Table-backed rate limits avoided new infrastructure (Redis) while meeting portability requirements from the checklist. Limits are easy to tune per action cost profile.

### 5. Metadata-only audit design

Choosing not to store raw notes or secrets in `audit_events` reduced privacy risk in the logging layer itself. The pattern should extend to all future audit types.

### 6. Copy-only privacy task (Task 14)

Low-risk, high-value UX improvements (PII warnings, rule-based summary disclosure) shipped without touching backend logic—appropriate late in the sprint after controls were in place.

### 7. CI with documented exceptions

Making only `npm audit` non-blocking while keeping lint/build blocking balanced honesty about transitive CVEs with merge safety. Documenting GHSA-qx2v-qp2m-jg93 in the workflow file prevents future confusion.

---

## What was harder than expected

### 1. Application-layer vs database-layer privacy

Task 13 redaction improved UX for `read_only` users but exposed a classic mistake: **privacy enforced only where data is rendered, not where it is stored or queryable**. This remains the highest-priority Phase 2 security debt.

### 2. Windows / PowerShell developer friction

Local tooling issues (Git/Node PATH, PowerShell `&&` vs `;`, `https://localhost` timeouts) consumed engineering time unrelated to security design. CI on `ubuntu-latest` is the reliable verification path.

### 3. Sample data mode ambiguity

Fallback sample data helps demos but complicates security testing narratives. Testers must explicitly configure Supabase to exercise RLS, redaction, and audit paths.

### 4. Documentation lag

README and `supabase-rls-audit.md` were not fully refreshed after later tasks. Security reports now serve as closure artifacts; a dedicated doc hygiene pass is still needed.

### 5. No migration parsing in CI

`pglast` was unavailable in the environment; SQL migrations were reviewed manually. Automated SQL policy regression checks would increase confidence.

### 6. "AI" labeling before controls

Pre-Phase 1 UI labeled features as "AI" while implementations were rule-based or fetch-based. Task 14 corrected user expectations late—**label accurately at feature introduction** is the lesson.

---

## Technical decisions — retrospective

| Decision | Verdict | Notes |
| --- | --- | --- |
| `@supabase/ssr` cookie sessions | Correct | Standard pattern for Next.js App Router |
| Four-role enum | Correct | Covers sales CRM + read-only observers |
| Zod validation | Correct | Low overhead; good error messages |
| `safeFetch` custom helper | Correct | Clear SSRF rules; unit-testable in Phase 2 |
| Table-backed rate limits | Acceptable | Good for Phase 1; watch table growth |
| Non-blocking npm audit | Acceptable | Temporary with documented CVE |
| App-layer redaction | Acceptable for Phase 1 | Insufficient alone for production |

---

## Process lessons

### For security sprints on prototypes

1. **Start with threat model tied to deployment intent** — "controlled internal testing" set appropriate scope.
2. **One task per commit** — checklist task boundaries mapped cleanly to reviewable PRs.
3. **Run lint/build after every task** — caught type errors early (e.g., Task 9 form action return types).
4. **Manual role test scripts** — worth formalizing as checklists per environment (staging sign-off).
5. **Close with reports** — completion report, risk register, and architecture update prevent knowledge loss.

### For cross-functional alignment

- **Security Lead** needed explicit residual risk acceptance (redaction bypass, PostCSS CVE).
- **CTO** needed readiness scores separating "internal pilot OK" from "production OK".
- **Product** benefited from Task 14 copy before any external demo.

---

## Anti-patterns avoided

| Anti-pattern | How Phase 1 avoided it |
| --- | --- |
| Service role as default client | Removed in Task 7 |
| Security only in middleware | Server actions independently guarded |
| Logging full user content | Audit metadata only |
| Silent validation failures | Typed `InterviewActionResult` errors |
| Blocking CI on unfixable transitive CVE | Targeted non-blocking audit only |

---

## Anti-patterns still present

| Anti-pattern | Remediation |
| --- | --- |
| Privacy by UI redaction | Phase 2 DB/views |
| Manual role provisioning | Admin UI |
| No automated security tests | Phase 2 test suite |
| Stale README security claims | Doc pass |

---

## Recommendations for Phase 2 planning

### Priority 1 (security)
- Database-enforced `read_only` column restrictions
- Automated auth/RLS/redaction integration tests
- MFA for privileged roles

### Priority 2 (operations)
- Admin membership management with audited changes
- Staging environment with mandatory Supabase
- Secret scanning in CI

### Priority 3 (product trust)
- Accurate feature labeling (assistive vs AI)
- Data retention and deletion policy
- Incident response runbook

---

## Team quotes (synthesis)

> "We moved the trust boundary from 'anyone with the URL' to 'authenticated member of an organization'—that's the real Phase 1 win."

> "Redaction in `getSchoolProfileData` is a product feature, not a security control, until RLS or views enforce it."

> "CI that blocks broken builds is security work, not just DevOps."

---

## Sprint metrics (indicative)

| Metric | Value |
| --- | --- |
| Tasks completed | 15 / 15 |
| New lib modules | 6 |
| Security migrations | 5 |
| Server actions hardened | 2 (interview, research) |
| CI steps | 4 |
| Pre-sprint critical findings (security audit) | 9+ |
| Post-sprint open P1/P2 risks | 6 (see risk register) |

---

## Conclusion

Phase 1 proved that **incremental, checklist-driven security** on an existing Next.js prototype is viable. The sprint's lasting value is not only the controls shipped but the **explicit documentation of what is still unsafe for production**—enabling honest Phase 2 prioritization.

**Recommended next step:** Kick off Phase 2 with R-001 (redaction bypass) and R-003 (automated tests) as the first two epics.

---

## Related documents

- `phase-1-security-completion-report.md`
- `phase-1-risk-register.md`
- `phase-1-testing-report.md`
- `phase-1-architecture-update.md`
- `docs/phase-1-security-checklist.md`
