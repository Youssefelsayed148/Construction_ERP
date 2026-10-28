# API versioning and Sunset policy

## Current surface

There is exactly one versioned external API surface: `/api/v1`, mounted by
`backend/src/routes/v1.js` (header comment: "Phase 26 — Versioned external API: /api/v1"). It sits
alongside the original, unversioned internal API (`/api/*`, used by the React frontend) — the two are
different mounts of mostly the same underlying route handlers (`v1.js`'s remount wrapper sets
`req.baseUrl` to the internal mount before invoking the shared handler chain, so a v1 call enforces the
exact same permission result as the equivalent internal call).

There is no `/api/v2`, and no second version of `/api/v1` exists anywhere in the codebase at the time of
writing.

## OpenAPI artifact

The OpenAPI 3.0 spec is **generated from source**, not hand-written: `backend/src/utils/openapi.js`
introspects the mounted v1 router's own route stack (its header comment: "The path inventory is
introspected from the mounted v1 router's stack — the same source of truth the server dispatches on — so
the spec can never drift from the API"). It is served live at:

```
GET /api/v1/openapi.json
```

(`backend/src/routes/v1.js:637`). There is no separate build/serve script in `backend/package.json` for
it — it is generated in-process on server start and served directly by the route above. This document
intentionally does not reproduce the generated schema; read it live from a running instance, or read
`backend/src/utils/openapi.js` for how it is built.

## Versioning policy

- A breaking change to `/api/v1`'s request/response shape, auth model, or error contract requires a new
  `/api/v1` → `/api/v2` mount (following the same pattern `v1.js` already establishes), not an in-place
  change to `/api/v1`.
- Additive changes (new fields, new optional query params, new endpoints) do not require a version bump
  and are picked up automatically by the generated OpenAPI spec above.
- A field or endpoint being retired should be marked deprecated and carry a `Sunset` date before removal,
  giving external API consumers (OAuth client-credentials integrations, the scoped-token family in
  `services/oauthService`) advance notice. See the next section for whether that mechanism exists yet in
  code.

## Deprecation / Sunset headers

**No `Deprecation` or `Sunset` HTTP response header helper exists in the codebase at the time of writing**
(grepped `backend/src/` for both header names: no matches). `docs/CLOSEOUT_RECONCILIATION.md` line 185
records this same gap ("OpenAPI is generated programmatically (`openapi.js`) but no versioned/Sunset-header
artifact ... exists"), and `docs/LAUNCH_READINESS.md`'s open-Majors item 3 separately flags that the legacy
single-answer RFI/submittal response shape (`backend/src/routes/doccontrol.js:84`) has not been retired —
that is the specific endpoint a future deprecation would most likely apply to first.

This policy document is written ahead of that helper existing. When one is built, the pattern to follow
(not yet implemented, described here for whoever builds it next) is: a small Express middleware that sets
`Deprecation: true` (or a date, per RFC 8594) and `Sunset: <HTTP-date>` on a named set of routes, applied
the same way `v1.js`'s other cross-cutting middleware (`correlationId`, `rateLimit`) is applied — as a
`router.use()` scoped to the specific deprecated route(s), not a global default. Until that exists, there
is no deprecation signal on any endpoint in this API; removing or changing an endpoint today gives
consumers no machine-readable warning.
