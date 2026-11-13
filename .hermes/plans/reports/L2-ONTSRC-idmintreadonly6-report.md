# L2-ONTSRC-idmintreadonly6 — unit report (re-cut of idmintreadonly5)

Item: L2-ONTOLOGY-ANCHOR-SOURCES-1 · lane 2 · branch cl/lane2-ontsrc-idmintreadonly6-0317
Base: 8e0db73e92dea8cd4f980fbab8575b000dbee3a0 (verified at entry; tree clean there)
Status: STOPPED — BLOCKED (ajv resolution). RED committed; the mint (Commit 2) was NOT made.

## Environment gate
- `curl -m 8 -sS -o /dev/null -w '%{http_code}\n' http://appliance-2:18080/v1/models` → `401`
  (reachable, NOT `000` — endpoint is up; no BLOCKED-on-endpoint this time).

## RED (committed — the defect, verbatim)
- Commit 1 (RED): `96b6804ec7ea147dc8e8f8b9eb6f8159570b5467` —
  `ontsrc idmintreadonly6: RED — readonly identity slot must mint a REC- id at submit (labware-definition anchor round-trip)`
  (1 file: `app/src/event-editor/create/RecordCreatePanel.readonlyId.test.tsx`, +172)
- Run: `cd app && export TMPDIR=/home/brad/.ontsrc6-scratch && mkdir -p "$TMPDIR" && npx vitest run src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx src/event-editor/create/RecordCreatePanel.readonlyId.test.tsx`
- RAW captured outgoing payload, readonly `$.id` arm (the g4 400 shape — ONE write, `ontology_ref` present, NO id):
  `RAW CAPTURED PAYLOAD (readonly $.id): {"kind":"labware-definition","title":"bench top","name":"bench top","ontology_ref":"LWO:0000120"}`
- RED assertion failure:
  `TypeError: .toMatch() expects to receive a string, but got undefined` at
  `RecordCreatePanel.readonlyId.test.tsx:141` (`expect(payload.id).toMatch(/^REC-[0-9A-F]{8}$/)` → `payload.id === undefined`)
- The new file's second arm (D16 pin: writable `$.id` → note renders, NO minted id) PASSED at base —
  RAW: `RAW CAPTURED PAYLOAD (writable $.id): {"kind":"assertion","title":"scoped assertion","name":"scoped assertion"}`
  (no `id` key — the D16 behavior this unit must preserve).
- gc16 file in the same run: `0 test` — it FAILED TO COLLECT (not 10 passing):
  `Error: Failed to resolve import "ajv/dist/2020.js" from "src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx"`
- Run summary line: `Test Files 2 failed (2)` / `Tests 1 failed | 1 passed (2)` / `Duration 12.01s`

## BLOCKER: environment (ajv resolution) — measured, read-only
- `app/node_modules` is a SYMLINK → `/mnt/vast/home/brad/git/cl-integration-2/app/node_modules` (worktree has no own node_modules; root worktree has none either).
- `node -e "require.resolve('ajv/dist/2020.js')"` from `app/` → `Cannot find module 'ajv/dist/2020.js'`; `app/node_modules/ajv` does not exist in the symlink target.
- The trunk pnpm store HAS ajv 6.15.0 and ajv 8.20.0 (`/mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/ajv@*`) — the integration-2 app deps are stale relative to this codebase's `import Ajv2020Module from 'ajv/dist/2020.js'` (an ajv8-era specifier).
- `app/package.json` does not declare `ajv` directly (only `@rjsf/validator-ajv8: ^6.3.1`), so a bare `pnpm install` would not necessarily add the app-level `ajv` the test imports.
- The brief's exact stop condition was met (collection fails with the ajv resolution error; no `npm/pnpm install` or `pnpm rebuild` was run).

## What was done / not done
- DONE: environment gate; RED test written + committed (real real-editor drive: stubbed projection with `$.id readOnly: true` for labware-definition, stubbed api client, REAL taptab editor, REAL serializer; captures the raw payload; D16-writable arm pins no-mint).
- NOT DONE (blocked): the mint in `app/src/event-editor/create/RecordCreatePanel.tsx` (was to land as Commit 2 at the id re-stamp site, after the delete-empty loop, keyed on the slot `readOnly === true` for path `$.${idField}`, shape `REC-` + 8 uppercase hex from `crypto.getRandomValues`); the GREEN run; `npx tsc --noEmit`; the mutation probe.
- Product file untouched; no schema/server/taptab/collections/material/pages edits; no YAML. `git -c core.fileMode=false status --short` is clean at exit (only the committed RED).
- Scratch: `/home/brad/.ontsrc6-scratch/` deleted at exit.

## Next action / owner
- Owner: orchestrator (environment). The lane worktree's `app/node_modules` symlink target
  (`/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`) is missing the app-level `ajv`
  (8.x) package the gc16 test imports. Options: restore the integration-2 app deps (or repoint the
  worktree symlink at an app node_modules that resolves `ajv/dist/2020.js`), then re-dispatch this unit
  with the same token — the committed RED (`96b6804e`) is the resume point: apply the mint, re-run the
  exact verify command, then `npx tsc --noEmit`.
- Resume verify command (from `app/`):
  `cd app && export TMPDIR=/home/brad/.ontsrc6-scratch && mkdir -p "$TMPDIR" && npx vitest run src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx src/event-editor/create/RecordCreatePanel.readonlyId.test.tsx`
  expected after fix: gc16 10 passed + this file 2 passed; then `npx tsc --noEmit` (0 errors).

## Marker
L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT idmintreadonly6 BLOCKED environment (ajv resolution) — app/node_modules symlink target lacks app-level ajv (8.x); gc16 suite cannot collect; RED committed at 96b6804ec7ea147dc8e8f8b9eb6f8159570b5467, mint not made
