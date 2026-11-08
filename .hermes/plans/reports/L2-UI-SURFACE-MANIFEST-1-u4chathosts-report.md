# L2-UI-SURFACE-MANIFEST-1 / u4chathosts — report

Worktree: /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u4chathosts
Branch: cl/lane2-ui-surface-manifest-1-u4chathosts
Base: 35ff50fa8bd3e565b03351eea80e5b9083aef70a (trunk cl/integration-2 HEAD at compose time)

## Decision

Data-only leg: appended four chat-host surface entries to `config/ui/surfaces.yaml`
(project-deck-tab, record-host, artifact-host, registry-host), each with the route
pattern copied verbatim from `config/chat/chat-hosts.yaml` with the `(App.tsx:NNN)`
citation and second-route tail stripped. The second route (where one exists) is in
`description` prose only. `manifestVersion` and `paneVocabulary` untouched; the three
existing entries untouched; append-only diff.

Entry rationale (all measured in chat-hosts.yaml at base 35ff50fa):
- project-deck-tab: mount :157 names `<DeckChatSlice/>` -> panes [ai-chat, deck]; scopes off :studyId -> route-param.
- record-host: required_providers [] -> `requires` omitted; scopes on recordId -> loaded-record-id.
- artifact-host: required_providers [] -> omitted; thread-scoped on artifactId -> loaded-record-id.
- registry-host: required_providers [] -> omitted; scratch `_` scope -> loaded-record-id.

Test pin updated (only because the pinned id list would break):
`server/src/schema/SurfaceManifestSchema.test.ts` id expectation extended to the 7 ids;
still a diagnostic pin (exact list against the real Ajv-validated manifest), not a tautology.

NOT touched: schema/ui/surface-manifest.lint.yaml (still 1 rule), schema/ui/surface-manifest.schema.yaml,
schema/ui/ui-v1.schema.yaml, app/src/** , scripts/check-ui-surfaces.py, config/chat/chat-hosts.yaml,
records/.

## PRE-CHANGE baseline (raw)

    $ cd server && npx vitest run src/schema/SurfaceManifestSchema.test.ts src/schema/SurfaceManifestLint.test.ts
     ✓ src/schema/SurfaceManifestLint.test.ts  (5 tests) 74ms
     ✓ src/schema/SurfaceManifestSchema.test.ts  (4 tests) 88ms
     Test Files  2 passed (2)
          Tests  9 passed (9)

    $ python3 scripts/check-ui-surfaces.py | head -n 1
    UNRESOLVED-IMPORTS=3
    ROUTES=41 DECLARED=3 MISSING=38 PHANTOM=0 CATCHALL=1

## POST-CHANGE verification (raw)

    $ python3 scripts/check-ui-surfaces.py | head -n 3
    UNRESOLVED-IMPORTS=3
    ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1

DECLARED 3 -> 7; MISSING 38 -> 34 (exactly -4); PHANTOM stays 0 (no invented id/route).

    $ cd server && npx vitest run src/schema/SurfaceManifestSchema.test.ts src/schema/SurfaceManifestLint.test.ts
     ✓ src/schema/SurfaceManifestLint.test.ts  (5 tests) 70ms
     ✓ src/schema/SurfaceManifestSchema.test.ts  (4 tests) 92ms
     Test Files  2 passed (2)
          Tests  9 passed (9)
     Duration  1.66s

Non-vacuity (checker run against a /tmp copy of the manifest with the record-host
block removed; same module, SURFACES_YAML pointed at the copy):

    ROUTES=41 DECLARED=6 MISSING=35 PHANTOM=0 CATCHALL=1

Host set visibly goes 7 -> 6 when one entry is deleted; the census is not decorative.

Typecheck (ran because the .ts test was touched):

    $ cd server && npx tsc -p . --noEmit
    src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3' or its corresponding type declarations.

This is PRE-EXISTING and unrelated to this unit (S3 storage provider vs. a missing
`@aws-sdk/client-s3` type resolution in the launcher-provisioned node_modules);
`npx tsc -p . --noEmit | grep -c SurfaceManifest` -> 0. No diagnostic in either file
this unit touches.

## Files changed

- config/ui/surfaces.yaml (append: 4 entries, +45 lines)
- server/src/schema/SurfaceManifestSchema.test.ts (pinned id list extended, +10/-1)
- .hermes/plans/reports/L2-UI-SURFACE-MANIFEST-1-u4chathosts-report.md (this report)

## Notes

`config/ui/surfaces.yaml` is read only by `scripts/check-ui-surfaces.py` and the schema
tests, not by the running stack; the lane stack was NOT reloaded and no UI effect is
claimed.

L2-UI-SURFACE-MANIFEST-1 UNIT u4chathosts DONE 88b7b939e646580060d33029728011e2e1886c7b
