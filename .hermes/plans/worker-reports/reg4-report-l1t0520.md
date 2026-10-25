# REG-4 CODER REPORT — Provenance carrot in the record rail (lane 1, l1t0520)

Worktree: /mnt/vast/home/brad/git/wt/REG-4-lane1-l1t514
Branch: wt/REG-4-lane1-l1t514
Base: 0ddbe20b82da565860cc31c55beb742af5ee3b7c (trunk cl/integration-1 tip after REG-2 merge)
RED commit: 25859a1a (test file only)
Code commit: e7b6a4af02a3dac63abc0b39a06e2614e0382762

## 0. Worktree settle check (first action)

`git -c core.fileMode=false status --porcelain | grep -c '^ D'` -> `0` on first poll. No WAIT-TIMEOUT.

## 1. Baseline (measured at own base 0ddbe20b, BEFORE any edit)

tsc base capture: /home/brad/.hermes/cl/lanes/1/tsc-reg4-base-l1t0520.txt — 23 lines
(distribution matches composer orientation: event-editor/*, ingestion, shared/hooks/useAiChat.surfaceContext.test; NONE in RecordRegistryPage, components/registry, or DocumentShell).

Vitest base capture (task command `cd app && npx vitest run src/pages/RecordRegistryPage src/components/registry src/editor/taptab`, taken at 0ddbe20b via `git reset --hard 0ddbe20b`, then restored to 25859a1a):
/home/brad/.hermes/cl/lanes/1/vitest-reg4-base-suite-l1t0520.txt

    Test Files  3 failed | 27 passed (30)
          Tests  6 failed | 270 passed (276)
    FAIL src/editor/taptab/RefCombobox.test.tsx  x2
    FAIL src/editor/taptab/documentMapper.test.ts x2
    FAIL src/editor/taptab/widgets/ChipComboboxWidget.test.tsx x2

The 6 failures are the pre-existing debt named in the dispatch (documentMapper x2, RefCombobox x2, ChipComboboxWidget x2) — present at base, NOT introduced by this work. Composer's 10-file/90-test orientation predates the REG-2/REG-3 merges; own-base re-measurement (30 files/276 tests) is the binding baseline per spec.

## 2. RED (new pins failing at base, separate commit)

Wrote ONLY app/src/components/registry/RecordProvenanceCard.test.tsx (verbatim plan:1145-1192), then:

    cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx
     ❯ src/components/registry/RecordProvenanceCard.test.tsx  (0 test)
    Error: Failed to resolve import "./RecordProvenanceCard" from "src/components/registry/RecordProvenanceCard.test.tsx". Does the file exist?
     Test Files  1 failed (1)
          Tests  no tests

Module-not-found failing all 4 pins, exactly as the plan expects. RED commit 25859a1a (test file only).

## 3. GREEN

Component + CSS written verbatim from plan:1202-1277 / plan:1282-1296 (programmatic diff vs plan blocks: zero content differences; only the plan's closing code-fence lines differ, which are not code). Page edits per plan Task 14.1-14.6 (import, RecordMetaLike/RecordData, handleSelectRecord, list-row call site, refreshSelectedRecord, rail region).

    cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx
     ✓ src/components/registry/RecordProvenanceCard.test.tsx  (4 tests) 36ms
     Test Files  1 passed (1)
          Tests  4 passed (4)

Regression (task command), head:
/home/brad/.hermes/cl/lanes/1/vitest-reg4-head-suite-l1t0520.txt

    Test Files  3 failed | 28 passed (31)
          Tests  6 failed | 274 passed (280)
    FAIL set identical to base (comm of sorted FAIL-file lists: EMPTY)

Delta vs base: +1 file / +4 tests (the new card), fail-file set unchanged — the 6 debt failures are the same 6. Page suites all green (RecordRegistryPage.test 17, createTab 10, createSearch 5, createWhileOpen 3, archiveBrowsing 9, qms6e 2, styling 4; registry: DocumentControlBar 20+5 styling, SlideOverEditor 12, RelatedRecordsCard.styling 4, RecordProvenanceCard 4). DocumentShell.test 25 green (REG-2 untouched). Pre-existing act()/getLifecycleTerminalStates stderr noise unchanged (spec BASELINS: not failures, do not chase).

## 4. tsc base vs head

    cd app && npx tsc --noEmit | grep 'error TS' | sort
    base: /home/brad/.hermes/cl/lanes/1/tsc-reg4-base-l1t0520.txt  (23 lines)
    head: /home/brad/.hermes/cl/lanes/1/tsc-reg4-head-l1t0520.txt  (23 lines)
    diff base head -> EMPTY (DELTA-ZERO)

## 5. Style / bait compliance

- Palette scan on new card files: `grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\('` -> NO PALETTE LITERALS. CSS uses only --cl-text, --cl-text-faint, --cl-text-dim, --cl-accent (all exist in app/src/shared/styles/tokens.css).
- Bait-1 (meta-drop re-appearing): diff grep count of `...(record.meta` / `...(fresh.meta` / `handleSelectRecord` anchors = 6 hits: handleSelectRecord signature+spread, list-row spread, refreshSelectedRecord `...(fresh.meta` spread, rail spread. List-row selections carry meta (server list stamps path/shas).
- Bait-2 (W4-D2): only `String(revisions)` when `revisions !== null && revisions > 0`; no revision id anywhere.
- Bait-3 (zero-row): fetch default `{records:[]}` -> no row (pins 2/3 implicitly pin it; beforeEach mocks []).
- Bait-6 (fetch discipline): single fetch inside `useEffect([recordId])`, early-return on falsy recordId, cancelled flag, `.catch` -> null.
- Bait-10 (rail scope): DocumentShell untouched; `width="full"` + `railResizable` props preserved (diff shows them outside the changed hunk); `key={editorSubjectKey}` on ProjectionTapTabEditor untouched.
- Styling tests (RecordRegistryPage.styling 4, RelatedRecordsCard.styling 4) green; not modified.

## 6. Assumptions / deviations

- AS-L1T0520-REG4-01: Dispatch stated node_modules symlinks were present; they were MISSING at bootstrap (tsc resolved to the npx stub package). Recreated the three symlinks exactly matching the REG-2 worktree pattern: node_modules -> /mnt/vast/home/brad/git/cl-integration-1/node_modules, app/node_modules -> .../app/node_modules, server/node_modules -> .../server/node_modules. Also added `node_modules` to the worktree's .git/info/exclude (repo .gitignore has `node_modules/` with trailing slash, which does not match a symlink; REG-2's worktree shows the same untracked-symlink noise). Environment repair only — zero product-code impact.
- AS-L1T0520-REG4-02: DEVIATION (documented, behavior-preserving): the plan's verbatim spread at the COMBOBOX call site (plan:1348) does not compile — `RecordSearchComboboxProps.onSelect` (RecordSearchCombobox.tsx:9-15) types the callback arg as `{recordId, schemaId, payload, isNew}` with NO `meta`, so `record.meta` is TS2339 (verified live: LSP flagged it the moment the spread was applied). OQ-2 RULED forbids widening RecordSearchCombobox, and the plan's own DESIGN section states meta "simply stays absent" at that site (local branch emits `payload: {}`, id only). Resolution: combobox call site left unchanged (`handleSelectRecord({ recordId, payload })`); the spread there would be a provable no-op. The list-row call site carries the plan spread verbatim. tsc delta-ZERO confirms no new error. If the orchestrator wants the literal snippet, it requires an OQ-2 reversal (combobox onSelect widening) — out of my authority.
- AS-L1T0520-REG4-03: Rail block keeps the trunk's no-semicolon style after `window.open(..., '_blank')` (plan snippet shows a semicolon; spec explicitly says keep whichever the file's tooling accepts — no functional change).
- AS-L1T0520-REG4-04: The dispatch's "6 pre-existing debt failures" match my measured base exactly (same 6 test names); composer's 10-file/90-test figure predates REG-2/REG-3 merges and is superseded by own-base capture per spec's re-measure rule.
- Carried finding (OQ-2, NOT absorbed): combobox-selected records show empty File/Content rows until a lifecycle refresh repopulates meta via getRecord — pre-existing quirk, recorded per ruling.

## 7. Files touched (entire diff surface)

- app/src/components/registry/RecordProvenanceCard.test.tsx (NEW, commit 25859a1a)
- app/src/components/registry/RecordProvenanceCard.tsx (NEW, commit e7b6a4af)
- app/src/components/registry/RecordProvenanceCard.css (NEW, commit e7b6a4af)
- app/src/pages/RecordRegistryPage.tsx (EDIT, commit e7b6a4af: import, RecordMetaLike+RecordData, handleSelectRecord, list-row call site, refreshSelectedRecord, rail region)

## 8. YAML-touched list

NONE. No schema/, *.ui.yaml, server, or data-dir changes. No stack restarted. No playwright run (browser gate is orchestrator-side).

## 9. Evidence files

- /home/brad/.hermes/cl/lanes/1/tsc-reg4-base-l1t0520.txt (23 lines)
- /home/brad/.hermes/cl/lanes/1/tsc-reg4-head-l1t0520.txt (23 lines; diff vs base empty)
- /home/brad/.hermes/cl/lanes/1/vitest-reg4-base-suite-l1t0520.txt (30 files, 276 tests, 6 debt fails)
- /home/brad/.hermes/cl/lanes/1/vitest-reg4-head-suite-l1t0520.txt (31 files, 280 tests, same 6 debt fails)

REG4 DONE e7b6a4af02a3dac63abc0b39a06e2614e0382762
