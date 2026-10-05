# PROTO-AI-10 report — wip-l2t1715 (cl-senior, lane 2)

Branch `wt/PROTO-AI-10-lane2-l2t1715` off `cl/integration-2 @ 6cfc7e03`. NOT merged (orchestrator owns merge + `cl-browser-reviewer` gate against :5193).

## What was built

Rail (EXISTING `ResourceSection` in `ProtocolNavPanel.tsx`, extended — not rebuilt) now shows the run's bound concrete labware instance beside each matching declared roleId. Read-only display; no binding create/edit UI; no schema touched.

Data path (all inside owned files):
1. **`app/src/run/RunProtocolStepsLoader.tsx`** — `resolveRunProtocol(runId)` already fetched the PLR into `pp`; new `labwareBindingsFromPayload(pp)` joins `bindings.labware` (`planned-run.schema.yaml` `$defs/LabwareBinding`: `roleId` required, `labwareInstanceRef?`, `labwareGeometryRef?`) into `roleId → { instanceRef, geometryRef? }`.
   - Zero guessing: an entry with no `labwareInstanceRef` publishes NOTHING (geometry alone does not count).
   - Ref read tolerant of a `ref.schema.yaml` node (`{ id, label? }`) or a bare id string.
   - The load effect publishes it via `sel.setLabwareBindings(...)` immediately after resolution — BEFORE the steps/resource fetches — with `{}` whenever the run resolves to nothing. So every `runId`/`refreshKey` re-run resets the map: no stale labels after a run/protocol switch, even if downstream fetches fail.
2. **`app/src/event-editor/protocol/ProtocolSelectionContext.tsx`** — new exports `LabwareBindingDisplay`, `LabwareBindingMap`, `NO_LABWARE_BINDINGS`; new state fields `labwareBindings` / `setLabwareBindings` (shared-empty constant, never a fresh object per render, mirroring `NO_PROTOCOL_RESOURCES`).
3. **`app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx`** (+ `.css`) — `ResourceSection` takes an OPTIONAL `bindings?: LabwareBindingMap`; only the LABWARE mount passes it (equipment never decorated). A matched role renders an extra compact line `instanceRef.label ?? instanceRef.id` (`data-testid="protocol-nav-labware-bound-<roleId>"`, `title=<instance id>`), class `.protocol-nav__role-bound` — the rail's accepted compact `label ?? id` ref read (convention cited: `describeRef` in `ProtocolIdentity.tsx:74-82`, `refId()` in `KnowledgeRailSection.tsx:27-31`); no new widget. Unmatched roles and empty map render EXACTLY as before. Collapsed-by-default untouched.

## TDD evidence (RED first, per slice)

- Slice 1 (context): 2 new tests → RED (`labwareBindings` undefined) → GREEN. `ProtocolSelectionContext.test.tsx` 10/10.
- Slice 2 (loader join): 4 new tests → RED (3 failed, bindings never published) → GREEN. `RunProtocolStepsLoader.test.tsx` 6/6. Covers: PLR bindings publish roleId→instance (geometryRef rides; unbound role and equipment role absent); PLR without bindings publishes `{}`; two roles bound to DIFFERENT instances of the SAME design stay distinguishable (LABI-96A vs LABI-96B); runId switch A→B clears stale bindings.
- Slice 3 (rail render): 6 new tests → RED (4 failed) → GREEN. `ProtocolNavPanel.test.tsx` 18/18. Covers: bound instance beside matched roleId; `label ?? id` fallback; two-distinct-instances; protocol-only shows none; equipment never decorated; clearing the map removes stale labels.

## Test results

- Targeted (`npx vitest run` in app/): the 9 related files — RunProtocolStepsLoader, ProtocolSelectionContext, all 5 ProtocolNavPanel suites, protocolStepEditing, RunWorkspaceShell — **9 files passed, 52 tests passed, 0 failed**.
- Full `npm run test:unit -w app`: 265 files — 220 passed / 45 flagged; 1846 tests — 1783 passed / 63 failed. All 63 failures live in 22 files I never touched (protocol-ide, ingestion, knowledge/browser, find, extraction, editor, PdfViewer, taptab, ProjectTabStrip, RawRecordEditor) plus e2e specs the unit runner can't collect. VERIFIED PRE-EXISTING: with my work stashed, those exact 22 files fail identically on base (22 files / 63 tests). NONE of my three suites appears in the failure set.

## Typecheck

`npx tsc --noEmit` in app/: 36 error lines at BASE (6cfc7e03, stashed-worktree check) and 36 lines with my changes — byte-comparable; ZERO new errors. The pre-existing `contentSha` errors in ProtocolNavPanel.tsx (:121/:127) exist on base and are not in my diff (they belong to other lanes' in-flight work on the integration branch).

## Assumptions (consequential, recorded)

1. Only `bindings.labware` is read (spec: LABWARE bindings only); `geometryRef` is carried in the published map but NOT rendered (rail line is the instance identity; hover title = instance id).
2. Reset semantics: the map resets when the loader re-resolves (runId/refreshKey change), publishing synchronously with the run resolution rather than waiting for the protocol-resource fetch — the spec's "resets exactly when resources does" is satisfied and strictly safer against fetch failures (empty-map publish can't be skipped).
3. `labwareBindings` is a required field on the context state with a shared-empty default (the OPTIONAL-compile requirement applies to `setResources`-style dispatch callers and the `bindings` prop on `ResourceSection`, both of which are optional; every existing dispatch compiles unchanged — proven by unchanged tsc error set).
4. Bare-string refs are tolerated in the loader's ref read (schema allows string forms elsewhere in the repo); a ref node without `id` binds nothing.

## Handoff

- Merge to `cl/integration-2` → `cl-lane-stack.sh 2 restart` → `cl-browser-reviewer` vs :5193. Bound run shows instance refs beside roles; protocol-only/unbound show none; run/protocol switch clears; collapsed-by-default intact (existing tests assert the latter two at unit level).
- No server, schema, AI-intent, or wizard files touched (`git diff --stat` below).

## Diff

- app/src/event-editor/protocol/ProtocolSelectionContext.tsx | context: optional binding map + setter
- app/src/event-editor/protocol/ProtocolSelectionContext.test.tsx | +2 tests
- app/src/run/RunProtocolStepsLoader.tsx | PLR bindings join + publish/reset
- app/src/run/RunProtocolStepsLoader.test.tsx | +4 tests
- app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx | ResourceSection `bindings?` + bound line
- app/src/event-editor/right-pane/protocol/ProtocolNavPanel.test.tsx | +6 tests
- app/src/event-editor/right-pane/protocol/ProtocolNavPanel.css | `.protocol-nav__role-bound`
