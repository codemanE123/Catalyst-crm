# Dependency audit exceptions

**Task:** Phase 2 Task 2.38  
**Purpose:** Governed record of accepted `npm audit` findings that cannot be remediated without breaking the application stack.  
**CI reference:** `.github/workflows/ci.yml` (dependency audit step remains non-blocking for listed exceptions only).

---

## Active exceptions

### EXC-001 — PostCSS XSS via Next.js transitive dependency

| Field | Value |
| --- | --- |
| **GHSA ID** | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) |
| **Advisory title** | PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output |
| **npm audit severity** | Moderate |
| **Affected package** | `postcss` (versions `<8.5.10`) |
| **Date documented** | 2026-07-03 |
| **Review date** | 2026-10-01 (90 days from documentation) |
| **Owner** | Engineering |
| **Risk register** | R-002 in `docs/security-reports/phase-1-risk-register.md` |

#### Affected dependency chain

```text
catalyst-crm
└── next@^16.2.10
    └── postcss@<8.5.10 (bundled under node_modules/next/node_modules/postcss)
```

`npm audit` also reports the finding against the `next` package range `9.3.4-canary.0` through `16.3.0-canary.5` because it depends on a vulnerable PostCSS version.

Direct project dependencies `postcss@^8.5.16` (devDependency for Tailwind/PostCSS tooling) are **not** the reported vulnerable copy; the flagged instance is the **nested** PostCSS copy shipped inside Next.js.

#### Why it cannot currently be fixed safely

- `npm audit fix` without `--force` does not resolve the nested copy under `next`.
- `npm audit fix --force` proposes installing `next@9.3.3`, a **breaking major downgrade** incompatible with the current Next.js 16 application.
- Catalyst CRM requires Next.js 16.x for the current App Router, middleware, and build toolchain. Forcing the audit fix would break production builds and invalidate Phase 1 security work tied to the current stack.

#### Current mitigation

1. **CI:** Lint, test, and build remain **blocking**. Only the `npm audit` step uses `continue-on-error: true` for this known finding.
2. **Application exposure:** Catalyst CRM does not pass untrusted user-supplied CSS through PostCSS `stringify` in normal product flows. Styling uses Tailwind and framework-controlled CSS pipelines.
3. **Monitoring:** Re-run `npm audit` on each Next.js upgrade and at the review date below.
4. **Transparency:** This document is shared with engineering and referenced in the CI workflow for IT/security review.

#### Risk assessment

| Dimension | Rating | Notes |
| --- | --- | --- |
| **Severity (advisory)** | Moderate | XSS class issue in PostCSS CSS output handling |
| **Likelihood in Catalyst CRM** | Low | Vulnerable code path is not exposed to arbitrary attacker-controlled CSS in v1 CRM features |
| **Impact if exploited** | Medium | Would require an atypical integration that feeds untrusted CSS through PostCSS stringify |
| **Overall accepted risk** | Low–medium | Acceptable for controlled pilot with documented exception and expiry |

#### Exit criteria (remove this exception)

Remove EXC-001 and re-enable a **blocking** CI `npm audit` step when **all** of the following are true:

1. `npm audit --audit-level=moderate` exits **0** after `npm ci` on a clean install **without** `--force`, **or**
2. Next.js release used by the project bundles `postcss@>=8.5.10` in `node_modules/next/node_modules/postcss` (verify with `npm ls postcss` and `npm audit`), **and**
3. Engineering records the resolving Next.js version in this document or a changelog entry, **and**
4. CI workflow comment and `continue-on-error` on the audit step are removed or narrowed so new findings fail the pipeline.

Until exit criteria are met, renew or close this exception at each **review date**.

---

## Review log

| Review date | Reviewer | Result | Notes |
| --- | --- | --- | --- |
| 2026-07-03 | Engineering | Exception opened | Phase 2 Task 2.38 initial documentation |
| 2026-10-01 | — | Scheduled | Re-run `npm audit`; check Next.js release notes for patched PostCSS |

---

## References

- `.github/workflows/ci.yml`
- `docs/phase-2-roadmap.md` (Task 2.38)
- `docs/security-reports/phase-1-risk-register.md` (R-002)
- `docs/security-reports/phase-1-testing-report.md` (dependency audit section)
