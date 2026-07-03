# Phase 1 Security Sprint — Risk Register

**Project:** Catalyst CRM  
**Status:** Post–Phase 1 (residual risks)  
**Last updated:** 2026-07-03  
**Owner:** Security Lead

This register tracks risks that remain after Phase 1 completion, plus mitigated risks for audit trail.

---

## Risk scoring legend

| Likelihood | Impact | Priority |
| --- | --- | --- |
| Low / Medium / High | Low / Medium / High / Critical | P1 (urgent) — P4 (monitor) |

---

## Active risks (post–Phase 1)

### R-001: Application-layer redaction bypass

| Field | Value |
| --- | --- |
| **ID** | R-001 |
| **Title** | Read Only users can bypass field redaction via direct Supabase API |
| **Severity** | High |
| **Likelihood** | Medium |
| **Impact** | High |
| **Priority** | P2 |
| **Description** | Task 13 redacts restricted fields in `getSchoolProfileData()` and the school profile UI. RLS still grants `read_only` users SELECT on full `interviews` and `follow_ups` rows within their org. A user with the anon key and a valid session could query restricted columns directly. |
| **Mitigation (current)** | UI and server page data layer redact values; most users use the web app only. |
| **Recommended Phase 2 action** | Column-level RLS, restricted views, or server-only data APIs that never return restricted columns for `read_only`. |
| **Owner** | Engineering + Security |

---

### R-002: Transitive PostCSS vulnerability (Next.js)

| Field | Value |
| --- | --- |
| **ID** | R-002 |
| **Title** | Moderate PostCSS advisory via Next.js dependency |
| **Severity** | Moderate |
| **Likelihood** | Low |
| **Impact** | Medium |
| **Priority** | P3 |
| **Description** | `npm audit` reports GHSA-qx2v-qp2m-jg93 (PostCSS XSS in CSS stringify) in `next/node_modules/postcss`. No fix without breaking Next downgrade. CI audit step is non-blocking. |
| **Mitigation (current)** | Documented in `.github/workflows/ci.yml`; app does not expose PostCSS stringify to untrusted CSS input in normal flows. |
| **Recommended Phase 2 action** | Upgrade Next when patched PostCSS is bundled; re-enable blocking audit or add exception allowlist with expiry date. |
| **Owner** | Engineering |

---

### R-003: No automated security/integration tests

| Field | Value |
| --- | --- |
| **ID** | R-003 |
| **Title** | Security controls verified manually only |
| **Severity** | High |
| **Likelihood** | Medium |
| **Impact** | High |
| **Priority** | P2 |
| **Description** | No automated tests for auth middleware, RLS assumptions, role guards, SSRF blocks, rate limits, or redaction. Regressions may merge if CI lint/build pass but behavior breaks. |
| **Mitigation (current)** | CI lint/build; manual test procedures in checklist. |
| **Recommended Phase 2 action** | Add Playwright E2E for auth/roles; Supabase test harness for RLS matrix; unit tests for `safeFetch`, `validation`, `authz`. |
| **Owner** | Engineering |

---

### R-004: Sample data mode without Supabase

| Field | Value |
| --- | --- |
| **ID** | R-004 |
| **Title** | Dev/sample fallback weakens security demonstration |
| **Severity** | Medium |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Priority** | P3 |
| **Description** | When `NEXT_PUBLIC_SUPABASE_URL` or anon key is unset, app serves sample data. Middleware redirects to login even without Supabase config, but redaction and RLS are not exercised. |
| **Mitigation (current)** | Production/staging must always set Supabase env vars; README documents configuration. |
| **Recommended Phase 2 action** | Fail fast in non-development environments if Supabase is missing; remove sample fallback from production builds. |
| **Owner** | Engineering |

---

### R-005: Incomplete audit coverage

| Field | Value |
| --- | --- |
| **ID** | R-005 |
| **Title** | Not all sensitive mutations produce audit events |
| **Severity** | Medium |
| **Likelihood** | High |
| **Impact** | Medium |
| **Priority** | P3 |
| **Description** | Audit logs cover interview create and university research run/save only. School status changes, contact edits, outreach logging, role/membership changes, and deletes are not audited. |
| **Mitigation (current)** | RLS and role guards limit who can mutate; partial audit trail exists. |
| **Recommended Phase 2 action** | Expand `AUDIT_ACTIONS`; audit admin and delete operations; consider DB triggers for critical tables. |
| **Owner** | Security + Engineering |

---

### R-006: No MFA or advanced session controls

| Field | Value |
| --- | --- |
| **ID** | R-006 |
| **Title** | Single-factor email/password only |
| **Severity** | Medium |
| **Likelihood** | Medium |
| **Impact** | High |
| **Priority** | P2 |
| **Description** | Supabase Auth supports MFA but it is not enabled or enforced. Stolen credentials grant full org access per role. |
| **Mitigation (current)** | Org-scoped RLS limits blast radius to one tenant per compromised account (except `super_admin`). |
| **Recommended Phase 2 action** | Enable Supabase MFA for admin/sales; session idle timeout; optional IP allowlisting for admin. |
| **Owner** | Security + Ops |

---

### R-007: No admin UI for membership management

| Field | Value |
| --- | --- |
| **ID** | R-007 |
| **Title** | Role assignment requires direct database access |
| **Severity** | Medium |
| **Likelihood** | High |
| **Impact** | Medium |
| **Priority** | P3 |
| **Description** | `organization_members` rows must be inserted via Supabase dashboard/SQL. Risk of misconfiguration, delayed offboarding, and human error. |
| **Mitigation (current)** | Small trusted operator set; manual SQL procedures. |
| **Recommended Phase 2 action** | Admin settings page with `admin`/`super_admin` guards; audit all role changes. |
| **Owner** | Product + Engineering |

---

### R-008: `super_admin` cross-tenant power

| Field | Value |
| --- | --- |
| **ID** | R-008 |
| **Title** | Super admin has global read/write/delete |
| **Severity** | High |
| **Likelihood** | Low |
| **Impact** | Critical |
| **Priority** | P2 |
| **Description** | `super_admin` RLS helpers grant access to all organizations. Compromise of one super admin account is a full-platform incident. |
| **Mitigation (current)** | Limit super admin assignments; org-scoped roles for day-to-day work. |
| **Recommended Phase 2 action** | Break-glass super admin with MFA, time-bound elevation, and enhanced audit; prefer per-org admin. |
| **Owner** | Security |

---

### R-009: Rate limit table growth and bypass

| Field | Value |
| --- | --- |
| **ID** | R-009 |
| **Title** | Rate limits are per-user, table-backed, without global IP throttle |
| **Severity** | Low |
| **Likelihood** | Medium |
| **Impact** | Low |
| **Priority** | P4 |
| **Description** | Distributed abuse across many accounts could stress research fetch or DB. `rate_limit_events` grows without retention policy. |
| **Mitigation (current)** | Per-user limits on expensive actions; RLS on rate limit inserts. |
| **Recommended Phase 2 action** | TTL/cleanup job for rate limit rows; optional IP-based edge rate limiting (CDN/WAF). |
| **Owner** | Engineering |

---

### R-010: User-entered PII in free-text fields

| Field | Value |
| --- | --- |
| **ID** | R-010 |
| **Title** | No technical block on student PII in notes |
| **Severity** | Medium |
| **Likelihood** | Medium |
| **Impact** | High |
| **Priority** | P2 |
| **Description** | Task 14 added warnings but no server-side PII detection or rejection. Interview notes, outreach drafts, and CRM fields can still store FERPA-regulated data. |
| **Mitigation (current)** | Privacy copy in UI and README; role-based redaction limits exposure to `read_only`. |
| **Recommended Phase 2 action** | Data classification policy; optional PII pattern warnings; encryption at rest review with Supabase; retention/deletion policy. |
| **Owner** | Legal + Security + Product |

---

### R-011: Outbound SSRF residual risk

| Field | Value |
| --- | --- |
| **ID** | R-011 |
| **Title** | Research agent still performs intentional outbound HTTP |
| **Severity** | Medium |
| **Likelihood** | Low |
| **Impact** | Medium |
| **Priority** | P3 |
| **Description** | `safeFetch` blocks private IPs and non-HTTPS URLs, but public URLs chosen by users still trigger server-side fetches (DNS rebinding and novel bypass classes are ongoing SSRF concerns). |
| **Mitigation (current)** | HTTPS-only, IP blocklist, redirect validation, size/timeout limits, rate limits. |
| **Recommended Phase 2 action** | Allowlist domains for research; async job queue; monitor outbound fetch failures and anomalies. |
| **Owner** | Security + Engineering |

---

### R-012: Documentation drift

| Field | Value |
| --- | --- |
| **ID** | R-012 |
| **Title** | README and audit docs partially stale |
| **Severity** | Low |
| **Likelihood** | High |
| **Impact** | Low |
| **Priority** | P4 |
| **Description** | `README.md` Authentication section still states dashboard routes are not protected (pre–Task 3). `docs/supabase-rls-audit.md` executive summary lists Tasks 7–13 as remaining gaps though they are now complete. |
| **Mitigation (current)** | Phase 1 security reports supersede for closure status. |
| **Recommended Phase 2 action** | Doc hygiene pass; link README to `docs/security-reports/`. |
| **Owner** | Engineering |

---

### R-013: CI audit non-blocking

| Field | Value |
| --- | --- |
| **ID** | R-013 |
| **Title** | Dependency audit does not fail CI |
| **Severity** | Low |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Priority** | P3 |
| **Description** | New moderate+ vulnerabilities may not block merges while PostCSS exception remains. |
| **Mitigation (current)** | Audit still runs and surfaces in CI logs; lint/build block. |
| **Recommended Phase 2 action** | Scoped audit allowlist with expiry; Dependabot alerts; blocking audit when tree is clean. |
| **Owner** | Engineering |

---

### R-014: No secret scanning in CI

| Field | Value |
| --- | --- |
| **ID** | R-014 |
| **Title** | Optional secret scanning not implemented |
| **Severity** | Medium |
| **Likelihood** | Low |
| **Impact** | High |
| **Priority** | P3 |
| **Description** | Phase 1 checklist listed optional secret scanning; only dependency audit was added. |
| **Mitigation (current)** | `.env.example` without secrets; no committed keys found in prior audit. |
| **Recommended Phase 2 action** | Enable GitHub secret scanning / gitleaks in CI. |
| **Owner** | Security |

---

## Mitigated risks (Phase 1 closed)

| Former risk | Phase 1 mitigation | Task |
| --- | --- | --- |
| Unauthenticated dashboard access | Middleware + session auth | 1–3 |
| Broad RLS (`using true`) | Org-scoped policies | 4–6 |
| Service role in user paths | Session client only | 7 |
| Unauthorized server actions | Role guards + org checks | 8 |
| Unvalidated inputs | Zod schemas | 9 |
| SSRF via research URLs | `safeFetch` | 10 |
| Action abuse / DoS | Rate limits | 11 |
| No accountability trail | Audit events | 12 |
| Read Only sees sensitive fields in UI | Field redaction | 13 |
| Misleading AI/privacy UX | Consent copy | 14 |
| No CI quality gate | GitHub Actions workflow | 15 |

---

## Risk heat map (residual)

```
Impact →
         Low      Medium    High      Critical
Likelihood
High     R-012    R-005     —         —
Medium   R-009    R-004     R-001     —
         R-013    R-011     R-003     R-008
Low      —        R-002     R-006     —
                            R-010
                            R-014
```

---

## Review cadence

- **Weekly** during Phase 2 sprint planning.
- **Per release** before any external pilot expansion.
- **Immediately** on security incident or dependency critical advisory.
