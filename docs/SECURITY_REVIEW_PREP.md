# Independent security review preparation

Status: **pending independent reviewer**. This checklist organizes the repository
evidence; it is not an independent audit or a claim that all findings are closed.

## Review scope

Review the Phase 1 security plan and the audit artifacts, then trace each material
finding to the current implementation, tests, and current command output:

- `docs/ERP_CLOSEOUT_PLAN.md` Phase 1 controls and its exit gate.
- `docs/CODEX_AUDIT_REPORT.md` and any prior code/security audit reports.
- `docs/CLOSEOUT_LOG.md` for dated implementation and test evidence.
- Authentication/token/session handling, authorization and project scoping,
  audit/event atomicity, input validation, upload/SSRF boundaries, rate limiting,
  secret handling, CORS/security headers, and dependency exposure.

## Evidence available for reviewer

- Final real-PostgreSQL suite on fresh Docker PG16: 67 suites / 621 tests passed on
  2026-10-14; focused security-related tests are listed in the PG suite output and
  `docs/CLOSEOUT_LOG.md`.
- Backend mock suite: 53 suites / 1,005 tests passed.
- `npm run lint:guards`: `lint-guards: ok`.
- `docs/TESTING.md` lists the test layers and their real-PG requirements.
- `docs/CLOSEOUT_LOG.md` records the limits of each local test run and previously
  observed reconciliation residue.

## Reviewer worksheet

For every finding, record: identifier, severity, affected route/data, independent
reproduction, current status, exact evidence, residual risk, remediation or accepted
owner decision, reviewer, and date. A finding is not closed solely because a test
exists; verify the test reproduces the original issue and exercises the fixed path.

| Control area | Reviewer result | Finding IDs / evidence / residual risk |
|---|---|---|
| Authentication, JWT typing, session invalidation, lockout | Pending | |
| Authorization, tenant/project scope, IDOR | Pending | |
| State changes, transactional audit, denial logging | Pending | |
| Input validation, SQL safety, typed error leakage | Pending | |
| Upload validation, storage, access control, scanning boundary | Pending | |
| SSRF and external adapters | Pending | |
| Rate limits, trusted proxy configuration, multi-replica behavior | Pending | |
| CORS, headers, CSP, browser storage | Pending | |
| Secrets, API tokens, agent permissions and action approvals | Pending | |
| Dependencies, lockfiles, known vulnerabilities | Pending | |

## Dependency audit (run 2026-10-28, closeout batch A-6, item 3)

`npm audit --omit=dev` was explicitly authorized and run once in each of `backend/`
and `frontend/` for this closeout slice (superseding the earlier note below, which
is kept for history). No secret values were read or printed; `npm audit` only sends
package name/version metadata to the registry, nothing project-specific.

### backend/

Before: 3 findings (2 high, 1 moderate) — `body-parser` (<1.20.9, GHSA-27r3-jxmh-p828,
DoS via trailing bytes after a compressed body), `multer` (2.0.0–2.4.0,
GHSA-q7qp-rjg7-q26m, DoS via a pending async `fileFilter` after request teardown),
`qs` (6.7.0–6.16.0, GHSA-6pq8-jhm2-2vcw, DoS via `qs.stringify`). All three are
non-breaking patch/minor bumps within the same major version
(`body-parser` 1.20.8→1.20.9 transitive via `express`, `multer` 2.4.0→2.5.0 direct
dependency, `qs` 6.16.0→6.16.2 transitive). Applied via `npm audit fix`; `multer`'s
version range in `backend/package.json` already covers 2.5.0 (`^2.1.1`), so only the
lockfile changed. Verified after: `npm audit --omit=dev` → **0 vulnerabilities**.

A separate `deepmerge`/`jest-config`/`jest`/`jest-cli` chain (6 low) remains in the
full (`npm audit`, no `--omit=dev`) report; `jest` is a `devDependency` here, so
`--omit=dev` correctly excludes it and it is out of this item's scope. It never
ships in the deployed backend process.

### frontend/

Before: 49 findings (3 critical, 22 high, 8 moderate, 16 low). `npm audit fix`
(non-force) resolved 10 of them without a breaking change (`proxy-addr`,
`shell-quote`, `source-map-js`, `postcss-selector-parser`, `launch-editor`, and
part of the `qs`/`nth-check` chains) and updated only `frontend/package-lock.json` —
no entry in `frontend/package.json`'s own `dependencies`/`devDependencies` needed a
version bump. Verified after: `npm audit --omit=dev` → 39 findings (1 critical, 15
high, 7 moderate, 16 low).

**All 39 remaining findings trace to exactly one root: they are transitive
dependencies of `react-scripts@5.0.1` (Create React App's build/dev tool) or of
`jest`/`jest-environment-jsdom` (the test runner that `react-scripts test` wires
up).** `react-scripts` is listed under `dependencies` in `frontend/package.json`
(standard CRA convention — it is the build tool itself, not application code), but
functionally every one of these packages is build-time or local-dev-server tooling:
webpack, PostCSS, SVGO, Terser/`serialize-javascript`, Workbox, `node-pre-gyp`/
`canvas`/`tar` (native-module install machinery pulled in by `jest-environment-jsdom`
for `<canvas>` support in tests), and `webpack-dev-server`/`webpack-dev-middleware`
(only active under `npm start`, the local dev server — never part of
`npm run build`'s static output, and never deployed). None of this code is bundled
into the JS/CSS files served to end users; it all runs only on a developer's or
CI machine, during `npm run build`, `npm start`, or `npm test`.

| Advisory / package | Severity | Exposed via | Reachable in the deployed app? | Mitigation |
|---|---|---|---|---|
| GHSA-34x7-hfp2-rc4v et al. (`tar` <=7.5.20, 11 advisories) | Critical | `canvas`→`@mapbox/node-pre-gyp`→`tar`, pulled in by `jest-environment-jsdom` | No — native-module install tooling for the jsdom test environment; never runs against untrusted archives, never part of the built bundle | Deferred; tracked here |
| GHSA-rp65-9cf3-cjxr (`nth-check` <2.0.1) | High | `svgo`→`css-select`→`nth-check`, pulled in by `@svgr/webpack` (SVG-to-component loader) via `react-scripts` | No — processes only this repo's own SVG assets at build time, never user input | Deferred; tracked here |
| GHSA-7fh5-64p2-3v2j / GHSA-qx2v-qp2m-jg93 / GHSA-6g55-p6wh-862q / GHSA-fxqj-rqcc-2cmp / GHSA-r28c-9q8g-f849 (`postcss` <=8.5.22, 5 advisories) | High | `resolve-url-loader`→`postcss`, pulled in by `react-scripts`'s Sass loader chain | No — processes only this repo's own CSS at build time | Deferred; tracked here |
| GHSA-5c6j-r48x-rmvq / GHSA-qj8w-gfj5-8c6v / GHSA-m5mm-p8h7-m29v (`serialize-javascript` <=7.1.2, 3 advisories) | High | `rollup-plugin-terser` / `css-minimizer-webpack-plugin`, pulled in by `react-scripts`'s production minifier | No — only serializes this repo's own build config objects at build time, not user/network input | Deferred; tracked here |
| GHSA-qpx9-hpmf-5gmw (`underscore` <=1.13.7) | High | `bfj`→`jsonpath`→`underscore`, pulled in by `react-dev-utils` (CRA's build-output formatter) | No — build-time only | Deferred; tracked here |
| GHSA-g84c-rxfj-3j2c (`webpack-dev-middleware` <7.4.5) | High | `webpack-dev-server`, pulled in by `react-scripts start` | No — only serves the app locally during `npm start`; this path is not used by the staging/production container, which serves `npm run build`'s static output | Deferred; tracked here |
| webpack-dev-server source-code-theft advisories | High | `react-scripts start`'s dev server | No, same as above | Deferred; tracked here |
| SVGO `removeScripts` advisories | High | `svgo`, pulled in by `@svgr/webpack` via `react-scripts` | No — optimizes only this repo's own SVG assets at build time | Deferred; tracked here |
| GHSA-4mjr-xmp4-gh2g / GHSA-6pq8-jhm2-2vcw (`qs`, moderate) | Moderate | `express`→`qs`, pulled in by `webpack-dev-server` | No — dev-server only | Deferred; tracked here |
| GHSA-w5hq-g745-h8pq (`uuid` <11.1.1, moderate) | Moderate | `sockjs`→`uuid`, pulled in by `webpack-dev-server` | No — dev-server only | Deferred; tracked here |
| `deepmerge`, `@tootallnate/once`, and the `jest`/`jest-environment-jsdom`/`jsdom` chain (low) | Low | `react-scripts`'s bundled `jest`/`jest-watch-typeahead` | No — test runner only | Deferred; tracked here |

`npm audit fix --force` was evaluated and **not** applied: for every row above it
proposes downgrading `react-scripts` to `0.0.0` (a known `npm audit` artifact for a
deeply-pinned CRA dependency tree — `0.0.0` is not a real, installable release) or
jumping `pdfjs-dist`/`jest-watch-typeahead` to versions that were never tested
against this app's build/test config. That is a breaking change this closeout
instruction does not authorize without confirming the forced change is still
non-breaking, so it is deferred and tracked here instead, per owner review.

**Recommended post-launch follow-up:** evaluate migrating off Create React App
(in maintenance mode upstream) to an actively maintained build tool (e.g. Vite),
which would remove this entire dependency subtree rather than requiring it to be
re-triaged on every future audit.

### Prior note (superseded by the run above)

`npm audit` was previously not executed in an earlier local-only continuation of
this closeout, out of caution about external registry calls. That caution has now
been explicitly superseded by this batch's authorized, scoped `npm audit --omit=dev`
run, recorded above.

## Sign-off

- Independent reviewer: **pending**
- Date: **pending**
- Open Critical/High findings: **not established**
- Production security gate: **not met**
