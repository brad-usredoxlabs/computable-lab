# L2-P1-LABWARE-INSTANCE-RECORD-1 u1inst — Report

Lane 2 · unit u1inst (1 of 1) · branch l2/p1-labware-instance-record-1
Worktree /home/brad/cl-wt/L2-P1-LABWARE-INSTANCE-RECORD-1-lane2 · base 6340cea43eae585414d58d1093e144ce1a2c8043

## Intent (from brief, preserved)
When a staged deck preview is accepted, mint exactly one `labware-instance`
record per placed labware whose `labwareId` is the resolved DEFINITION record
id, before the graph is durably persisted, and report the minted ids in the
adoption result. Ruling (LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113):
"Identity is the record id, and the schema already says so. ... An instance
that cannot name its definition by record id is not a valid instance." No name
matching anywhere; unresolvable -> named gap + zero mints, never a guess.

## Commits (shas read back with `git rev-parse HEAD`)
1. RED:  1e06cbc1f27676cc1570e256a021487157b11eed
   `test(L2-P1-LABWARE-INSTANCE-RECORD-1 u1inst): RED — one labware-instance per placed labware, definition identity by record id`
   (new test file only; confirmed failing at base: "Failed to load url
   ./labwareInstanceMint ... Does the file exist?")
2. GREEN: 4cb70b660c2632a11d1f9d4917476d82b72b2a70
   `feat(L2-P1-LABWARE-INSTANCE-RECORD-1 u1inst): mint one labware-instance per placed labware at accept, definition identity by record id`
   (mint module + call site + test fixture id-shape fix, folded by amend)

## Changed files (3; budget was files <= 3)
- app/src/event-editor/deck/labwareInstanceMint.ts (NEW, 96 lines)
  `mintPlacedLabwareInstances({ previewLabwares, materialized, createRecord? })`
  -> `{ instanceIds, warnings }`. Exports `LABWARE_INSTANCE_SCHEMA` (the
  computable-lab/labware-instance.schema.yaml id, verbatim from
  LabwareInstanceCreateModal). Per placed labware (insertion order):
  definition id = records-first creation (key === deck key AND kind ===
  'labware'; covers created AND reused definitions) > vessel `labware.recordId`
  > deck key itself when it is a labware record id (brief's exact regex
  /^(LAB|LW)-[0-9A-Fa-f]+$/ or a labware recordId present in materialized).
  Else warning "<key> was placed without a resolvable labware definition
  record id — no instance was minted; pick or create the definition." and NO
  mint. Otherwise `createRecord(LABWARE_INSTANCE_SCHEMA, { kind:
  'labware-instance', recordId: mintRecordId() /* LAB-INST-<8 hex upper> */,
  labwareId: <resolved definition id> })` exactly once. createRecord defaults
  to apiClient.createRecord (same pattern as acceptedRecordCreations.ts:170).
- app/src/event-editor/deck/deckAdoption.ts (EDIT, +17 lines vs base)
  - import + call at step 2b: right after step 2's warning loop (the
    records-first creations; the definition exists first) and BEFORE
    persistAcceptedEventGraph; `materialized: creations.materialized ?? []`
    (deckAdoption.test.ts's mock returns { warnings: [] } with NO materialized).
  - warnings logged via console.warn(`[labware instance] ...`).
  - `instanceIds` added to the `{ adopted: true }` result and returned.
  - NOT touched (per brief): graph payload, buildAcceptedEventGraphPayload,
    buildEditorLayoutSnapshot, hydrate, editor reducer.
- app/src/event-editor/deck/labwareInstanceMint.test.ts (NEW, 166 lines;
  `@vitest-environment node`)
  Pins a-e exactly as briefed + 3 extra: (a) created definition -> createRecord
  ONCE with kind 'labware-instance' + labwareId === definition recordId;
  (b) reused existing definition -> instance references the EXISTING recordId,
  exactly one instance; (c) two placed labwares -> exactly two instances, one
  per placement (distinct mints); (d) unresolvable -> ZERO createRecord calls +
  warning names the key; (e) vessel recordId (no materialized creation) ->
  referenced; (f) deck key that is a record id (LW-<hex>) resolves without a
  materialized creation; (g) empty materialized list -> resolves via vessel id;
  (h) default wiring to apiClient.createRecord via vi.resetModules +
  vi.doMock (no network).

## Decisions (resolved from code, disclosed)
1. `instanceIds` is OPTIONAL (`instanceIds?: string[]`) on DeckAdoptionResult.
   Required broke the PROHIBITED app/src/shared/hooks/useAiChat.d1full.test.tsx:182
   (its mock of adoptStagedPreview returns the pre-u1inst adopted shape; tsc
   TS2345, measured). useAiChat is on the prohibited list, so the field is
   optional on the type while adoptStagedPreview ALWAYS populates it (callers
   and the receipt get the ids).
2. `materialized` is a REQUIRED parameter (brief's exact signature). The
   call-site `?? []` keeps the existing deckAdoption.test.ts mock green —
   verified by the regression run (that mock has no materialized field).
3. Deck-key-as-record-id uses the brief's exact regex; the RED fixture
   originally used 'LBW-DECKKEY' (letters-only tail — not hex) and was corrected
   to 'LW-1A2B3C4D' (id-shape, not a rename of behaviour).
4. Minting is sequential (await in the loop) -> deterministic one-per-placement
   ordering; no parallel fan-out.
5. Test env node (pure logic module; the module itself never touches the DOM).

## Verification (all on the FINAL commit 4cb70b66, tree clean)
Note on toolchain: `npx vitest` from this worktree root resolves to vitest
4.1.10 (an unrelated higher-level install; vite 7) and FALSE-FAILS every suite
("Denied ID ... ?raw"). The project's real toolchain is the app's own vitest
1.6.1, so all runs below use `./app/node_modules/.bin/vitest` (equivalent to
the brief's commands with the correct binary).

1. RED (commit 1e06cbc1):
   ./app/node_modules/.bin/vitest run --root app app/src/event-editor/deck/labwareInstanceMint.test.ts
   -> FAIL (module missing): "Failed to load url ./labwareInstanceMint ... Does the file exist?"
2. GREEN + regressions (final commit):
   ./app/node_modules/.bin/vitest run --root app
     app/src/event-editor/deck/labwareInstanceMint.test.ts
     app/src/event-editor/deck/deckAdoption.test.ts
     app/src/event-editor/deck/acceptedRecordCreations.test.ts
   -> Test Files 3 passed (3), Tests 18 passed (18) (8 + 4 + 6)
   With the pre-existing consumer app/src/shared/hooks/useAiChat.d1full.test.tsx
   added: Test Files 4 passed (4), Tests 21 passed (21).
   deckAdoption.test.ts stderr shows the EXPECTED named-gap warning
   `[labware instance] P1 was placed without a resolvable labware definition
   record id — no instance was minted; pick or create the definition.` for its
   mock (no materialized, P1 unresolvable) — proof the seam takes the
   no-guess path and stays green.
3. Typecheck (final commit): `npm run typecheck -w app` -> 10 errors, all
   PRE-EXISTING module-resolution errors (ajv / ajv-formats / yaml /
   prosemirror-view / @rjsf missing from the shared symlinked node_modules
   store). Baseline comparison: a clean base worktree at 6340cea4 with the
   SAME symlink set -> identical 10-error set, `diff` empty (0 new errors).
   The brief's "baseline: 0 errors" claim does NOT hold at this base (measured
   10 at base with no changes by me; the earlier 16/17 counts were caused by
   missing root server/node_modules symlinks, see environment notes).
   During development I also proved the required-vs-optional decision: with
   `instanceIds` required, the delta was exactly +1 new error
   (useAiChat.d1full.test.tsx TS2345); optional -> diff empty.
4. Tree: `git status --porcelain` empty (only the 3 committed files changed).

## Environment notes (disclosed; no worktree files affected)
- app/node_modules symlink pre-existed -> /mnt/vast/home/brad/git/cl-integration-2/app/node_modules.
- Root node_modules and server/node_modules symlinks were MISSING (brief says
  to symlink from cl-integration-2 when missing). I added both (gitignored;
  not committed). This removed a spurious prosemirror-view typecheck error and
  made the baseline comparison apples-to-apples.
- Baseline worktree at /tmp (detached at 6340cea4, same symlinks) used for the
  typecheck baseline; removed afterwards.

## Acceptance mapping
1. After accept of an AI-chat placement, a labware-instance record exists whose
   labwareId points at the confirmed definition record id — minted at the
   accept seam before persist (pins a/b/e; ordering enforced by the deckAdoption
   call-site position, step 2b before persistAcceptedEventGraph).
2. Instance count increments exactly once per accepted placement — pin c
   (exactly two for two placements, distinct mints; one per entry of
   previewLabwares, no fan-out).
3. Unresolvable definition id -> named gap warning, zero mints — pin d.
Declared follow-up (NOT done here, per brief): the graph-entry
references-the-instance leg (deck-entry-stores-instanceId).

## Next actions / owner
- Orchestrator: lane-stack reload (YAML untouched, so strictly not required),
  adversarial review + gate re-run (PROMPT1 gate scenario: instance count must
  go 6 -> 7 after an AI-chat place).
- Follow-up leg (declared): deck-entry references the instance id; out of scope
  for this unit.
No blockers.

L2-P1-LABWARE-INSTANCE-RECORD-1 UNIT u1inst DONE 4cb70b660c2632a11d1f9d4917476d82b72b2a70
