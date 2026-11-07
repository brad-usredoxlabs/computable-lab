# L2-L2-VACUOUS-PINS-DEBT — unit u1lsm2meta (meta-conformance pin)

## Summary
Pinned the shipped surface-manifest lint spec against the lint DSL's own meta-schema via
one disk-loaded AjvValidator test with positive and negative legs.

## Decision
- Validate the projection `{ lintVersion, rules }` (not the whole document) against
  `schema/lint/lint-v1.schema.yaml` using the repo's `AjvValidator` class (2020-12 draft).
- Negative leg: deep-clone the projection, set `rules[0].assert.assert.assert.path` to
  `'surfaces[*].panes[*]'` (a shape the :224 `in.path` pattern does not admit), validate
  again, and assert `valid === false` with an error under `/rules/0/`.

## Changed Files
- `server/src/schema/SurfaceManifestLint.test.ts` (+42 lines)
  - Added `AjvValidator` import, `LINT_META_SCHEMA_ID`, `LINT_META_PATH`
  - Added one `describe`/`it` for meta-conformance (positive + negative legs)
  - Existing 4 tests remain byte-identical

## Verification
- `cd server && npx vitest run src/schema/SurfaceManifestLint.test.ts`
  -> Tests 5 passed (5)  (4 baseline + 1 meta-conformance)
- Non-vacuity: /tmp narrowed schema (`[.]|` removed from :224 pattern) rejects the real
  spec with `valid: false` and errors under `/rules/0/assert/**`
- `cd server && npx tsc --noEmit` -> 1 error (pre-existing S3 module — unchanged)
- `git status --short` -> clean tree at exit

## Reviewer Bait Addressed
1. Non-vacuity: negative leg + /tmp probe prove the pin can fail
2. Projection only: `{ lintVersion, rules }` — no whole-doc validation
3. Schema unchanged: no diff in lint-v1.schema.yaml
4. One spec only: pins surface-manifest.lint.yaml exclusively
5. Uses AjvValidator (not raw Ajv)
6. Record<string, unknown> types (as never for addSchema)
7. No pane vocabulary values inlined
8. Disk-loaded test — no server needed

L2-L2-VACUOUS-PINS-DEBT-u1lsm2meta UNIT u1lsm2meta DONE 6004c9f145667195a41518453b28786b53ae2170
