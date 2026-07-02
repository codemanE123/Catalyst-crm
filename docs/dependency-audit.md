# Dependency Audit

Scope: Documentation-only audit of `package.json`, `package-lock.json`, imports, top-level installed packages, outdated packages, duplicate packages, and npm security audit output.

## Executive summary

The project has a small dependency footprint. All declared runtime dependencies are used by the codebase. The main dependency risks are:

1. A moderate npm audit finding for `postcss <8.5.10` inside Next's bundled dependency tree.
2. `eslint` has a newer major version available.
3. `node_modules` contains extraneous installed packages that are not declared top-level dependencies.
4. The project depends on fast-moving pre/latest major versions: Next 16, React 19, TypeScript 6, Tailwind 4.

No code changes were made.

## Declared dependencies

### Runtime dependencies

| Package | Current | Used? | Usage |
| --- | ---: | --- | --- |
| `next` | `^16.2.10` | Yes | App Router, routing, metadata, Link, navigation |
| `react` | `^19.2.7` | Yes | Client component state, action state, JSX runtime |
| `react-dom` | `^19.2.7` | Yes | Required peer/runtime for Next/React |
| `@supabase/supabase-js` | `^2.110.0` | Yes | Supabase client creation and database reads/writes |

### Dev dependencies

| Package | Current | Used? | Usage |
| --- | ---: | --- | --- |
| `typescript` | `^6.0.3` | Yes | Type checking and Next build |
| `eslint` | `^9.39.4` | Yes | `npm run lint` |
| `eslint-config-next` | `^16.2.10` | Yes | Next/TypeScript ESLint config |
| `tailwindcss` | `^4.3.2` | Yes | Tailwind CSS |
| `@tailwindcss/postcss` | `^4.3.2` | Yes | Tailwind PostCSS plugin |
| `postcss` | `^8.5.16` | Yes | PostCSS runtime for Tailwind plugin |
| `@types/node` | `^26.1.0` | Yes | Node/Next TypeScript types |
| `@types/react` | `^19.2.17` | Yes | React TypeScript types |
| `@types/react-dom` | `^19.2.3` | Yes | React DOM TypeScript types |

## Unused packages

No declared package in `package.json` appears unused.

Evidence:

- `next` is imported in `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, and `app/schools/[id]/page.tsx`.
- `react` is imported by all client components.
- `@supabase/supabase-js` is imported in `lib/supabase.ts` and `lib/universityResearch.ts`.
- Tailwind/PostCSS packages are referenced by `app/globals.css` and `postcss.config.mjs`.
- ESLint packages are referenced by `eslint.config.mjs`.
- Type packages support the TypeScript/Next build.

Potential cleanup:

- None from `package.json` at this time.

## Outdated packages

`npm outdated` reported:

| Package | Current | Wanted | Latest | Recommendation |
| --- | ---: | ---: | ---: | --- |
| `eslint` | `9.39.4` | `9.39.4` | `10.6.0` | Consider after validating `eslint-config-next` and plugin compatibility with ESLint 10. |

Notes:

- No runtime package was reported outdated by `npm outdated`.
- `eslint` is a major-version upgrade and should not be applied blindly.

## Security concerns

`npm audit --audit-level=low` reported:

```text
postcss <8.5.10
Severity: moderate
PostCSS has XSS via Unescaped </style> in its CSS Stringify Output
Affected path: node_modules/next/node_modules/postcss
Next depends on vulnerable versions of postcss
```

Important details:

- The direct `postcss` dependency is `8.5.16`, which is above the vulnerable range.
- The finding is in Next's nested `postcss@8.4.31`.
- npm suggests `npm audit fix --force`, but that would install `next@9.3.3`, a breaking and unsafe downgrade for this project.

Recommendation:

- Do not run `npm audit fix --force`.
- Track Next releases and upgrade when Next ships a patched transitive PostCSS.
- If policy requires zero audit findings, evaluate a package override only after confirming Next compatibility. Avoid overrides that break Next internals.

## Risky packages

### `next`

- Risk: Large framework with broad transitive dependency tree and build/runtime surface.
- Current concern: nested `postcss` audit finding.
- Recommendation: keep current; upgrade promptly when a patched Next release is available.

### `@supabase/supabase-js`

- Risk: Database access library; misuse can expose data when paired with unsafe keys or broad RLS.
- Dependency itself is expected and appropriate.
- Recommendation: keep dependency, but refactor key/session usage as documented in security audits.

### Research-agent dependencies

- The university research agent uses platform `fetch`, not an additional scraping dependency.
- This reduces dependency risk, but operational/security risk remains in the custom crawler logic.

## Duplicate packages

Observed from dependency tree:

- Direct `postcss@8.5.16`
- Nested `next -> postcss@8.4.31`

This is a duplicate version situation, but it is controlled by Next's internal dependency and should not be force-deduped without framework support.

`npm find-dupes --dry-run` produced a dry-run plan involving optional native/platform packages such as:

- `lightningcss-*`
- `@next/swc-*`
- `@tailwindcss/oxide-*`
- `@unrs/resolver-binding-*`
- `@img/sharp-*`

These are optional platform packages commonly used by Next/Tailwind/native tooling. The dry-run did not change tracked files.

Recommendation:

- Do not manually remove optional transitive platform packages from the lockfile.
- If `node_modules` gets polluted locally, run a clean install rather than editing dependencies manually:

```bash
rm -rf node_modules
npm ci
```

## Extraneous installed packages

`npm ls --depth=0` reported extraneous installed packages in `node_modules`:

- `@emnapi/core`
- `@emnapi/runtime`
- `@emnapi/wasi-threads`
- `@napi-rs/wasm-runtime`
- `@tybys/wasm-util`

These are not declared in top-level `package.json`. They appear to be native/wasm helper packages from the installed dependency tree rather than intentional app dependencies.

Recommendation:

- Do not add them to `package.json`.
- Do not remove them from `package-lock.json` manually.
- Refresh local install state with `npm ci` if extraneous warnings become noisy.

## Packages that can be removed

From `package.json`:

- None recommended.

From local `node_modules` only:

- Extraneous packages can be cleaned by reinstalling dependencies, but this is environment hygiene, not a code/dependency manifest change.

## Recommended upgrades

### Short term

1. Keep current runtime dependencies.
2. Monitor Next for a version that updates nested `postcss` above `8.5.10`.
3. Re-run `npm audit` after each Next upgrade.
4. Do not run `npm audit fix --force`.

### Medium term

1. Evaluate `eslint@10` after confirming:
   - `eslint-config-next` supports ESLint 10.
   - `typescript-eslint` supports ESLint 10.
   - Existing flat config still works.
2. Add CI checks:
   - `npm ci`
   - `npm run lint`
   - `npm run build`
   - `npm audit --audit-level=moderate`

### Longer term

1. Add dependency update automation.
2. Add lockfile review rules for major framework upgrades.
3. Add a policy for security overrides only when compatibility is tested.

## Recommended dependency policy

- Use `npm ci` in CI and production builds.
- Commit `package-lock.json`.
- Avoid `npm audit fix --force` unless reviewed.
- Prefer framework-supported upgrades over transitive overrides.
- Review major upgrades in isolated branches.
- Treat auth/database/client libraries as security-sensitive.

## Final assessment

The dependency manifest is lean and appropriate for the current app. No declared package should be removed right now. The main action item is to monitor/upgrade Next when it resolves the nested PostCSS advisory and to evaluate ESLint 10 separately as a dev-tooling major upgrade.
