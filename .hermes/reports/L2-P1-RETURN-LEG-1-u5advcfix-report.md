# L2-P1-RETURN-LEG-1 / unit u5advcfix — advc cycle-1 fix leg (lane 2)

Worktree: /home/brad/cl-wt/L2-P1-RETURN-LEG-1-lane2 (branch cl/lane2-p1-return-leg-1)
Base: dc4b357acab76804264d072a7a4fb5899ce2fc3a · run date 2026-11-16 (~12:40–14:00 EST)
Scope: the four advc-c1 defects (F1..F4) on the ACCUMULATED branch. No LEG A/B/C rework.

## Commits (4, in order)
1. 2b9facd03a900e7ed4dde2fafefabcf05c13d8f5 — F3: real-seam client test (new file, 63 lines)
2. 89b5291d85be49a39c9f9323a5782d2dc13fb483 — F1 reject arm + F2 one-occurrence row + updated row assertions
3. 89aba149720971eeaf8e12ebecab88b7e6a4e221 — F4: resume-control hasCompletedAdopt pin (test-only)
4. <this report commit> — report + DONE marker

Final code state = commit 3 (89aba1497); the report commit adds no code.

## Changed files (budget: 4 files / 248 lines, cap 6 / 250)
- app/src/shared/api/client.definitionDisplay.test.ts (new, +63)
- app/src/event-editor/deck/ProposedGraphModal.tsx (+39/-14: F1 effect block, F2 row block)
- app/src/event-editor/deck/ProposedGraphModal.viewlabel.test.tsx (+118/-1: one-occurrence pins + 3 new arm legs)
- app/src/agent/HarnessChatPane.resumeInstruction.u4.test.tsx (+28: F4 pin leg)
client.ts production code: NOT modified (F3 test-only, per brief). HarnessChatPane.tsx production: NOT
modified (F4 mutant proved the gate already correct → test-only). useAiChat.ts: untouched.

## Baseline (measured BEFORE edits, at base dc4b357ac)
- vitest `src/event-editor/deck src/shared/api src/agent src/shared/hooks --reporter=basic`:
  `Test Files 9 failed | 111 passed (120)` · `Tests 17 failed | 579 passed (596)`
- tsc `npx tsc --noEmit | wc -l`: 13 (exit 2; files: src/editor/forms/SchemaRecordForm.tsx ×3,
  src/editor/taptab/RefCombobox.ontologyref.test.tsx — all pre-existing, outside owned scope)
- RED command at base (the four existing files; the F3 file did not exist yet):
  viewlabel 2/2 · appliedNoteDefinition 2/2 · resumeInstruction.u4 2/2 · reloadResume 4/4 = 10/10 GREEN.
  NOTE: the advc report's one noted failure ('Generic 96-Well Plate' expected-in-note) did NOT
  reproduce — appliedNoteDefinition.u4.test.tsx was green at base and stays green (2/2). It is not
  part of this unit's delta; no change was needed to turn it green.

## GREEN (final code = commit 89aba1497, run after every revert)
- Same vitest dirs: `Test Files 9 failed | 112 passed (121)` · `Tests 17 failed | 587 passed (604)`.
  Failing-file set IDENTICAL to baseline (diff shows only timing deltas) → zero NEW failures;
  +1 file / +8 tests passing (viewlabel +3, client.definitionDisplay +3, resumeInstruction.u4 +2).
- tsc: 13 lines; `diff <(sorted baseline) <(sorted final)` → 0 lines → zero NEW tsc errors.
- RED command (5 files, final): 5 passed (5) / 18 passed (18).

## Per-defect evidence (RED before → GREEN after; receipts in /tmp/u5advcfix-*)
F1 (major, ProposedGraphModal resolution effect): rejection arm pushes [labwareId, definitionId]
and settles via the SAME settle() commit as the success arm (mirrors useAiChat's catch; that file
untouched). RED (unfixed production, new leg, -t "reject arm"):
  `→ Unable to find an element with the text: generic/96_well_plate@v1 ... .proposed-graph__lw-name`
  + `Unhandled Errors — Vitest caught 1 unhandled error during the test run` (the AC-1 probe: the
  pre-fix leak), `Tests 1 failed | 4 skipped (5)`. GREEN: label resolves to the id, row settled,
  `unhandledrejection` window listener captured 0 events (PROBE_UNHANDLED_REJECTIONS clean).
F2 (minor, row block): geometry/identity token now appears EXACTLY ONCE per row — labeled arm keeps
title=name + detail=geometry; label-absent arms (ghost-no-def, reject, unknown labware) drop the
repeated first token; detail tail = type · where · orientation. RED (F2 fix reverted, F1 kept):
  two `→ expected 2 to be 1` on the new one-occurrence pins, `Tests 2 failed | 3 passed (5)`.
  GREEN: all three arms pinned to 1 occurrence (labeled / ghost-no-def / unknown-labware, plus the
  reject arm which also renders id-labeled).
F3 (major, real seam): NEW file imports the REAL apiClient and stubs ONLY transport:
  `vi.spyOn(apiClient, 'listRecordsByKind')` resolving one record shaped like
  records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml (payload.id
  `generic/96_well_plate@v1` + payload.display_name `Generic 96-Well Plate`). Asserts: (1) hit →
  resolved display name; (2) miss (empty record list) → definitionId fallback; (3) record present
  but empty display_name → definitionId fallback. 3/3 GREEN.
  MUTANT (required): temporary `if (definitionId) return definitionId` injected at the top of the
  real getLabwareDefinitionDisplay → `→ expected 'generic/96_well_plate@v1' to be 'Generic 96-Well
  Plate'`, `Tests 1 failed | 2 passed (3)` (receipt /tmp/u5advcfix-mutant-red.txt). Reverted;
  re-ran 3/3 GREEN and `git diff` on client.ts empty (production byte-identical to base).
F4 (minor, resume gate): new leg "absent with no completed 'Accepted ' system message (streaming
  false)" + companion present-arm — both in resumeInstruction.u4.test.tsx, streaming false both
  arms. MUTANT (required): dropped `hasCompletedAdopt &&` from showResume in production →
  `→ expected <button type="button" …(2)></button> to be null`, `Tests 1 failed | 3 passed (4)`
  (receipt /tmp/u5advcfix-f4-mutant.txt). Reverted; production file byte-identical to base
  (git diff empty) — the gate is CORRECT as written; the pin is test-only, as the brief allowed.

## Acceptance map
1. Rejected getLabwareDefinitionDisplay → row label = definitionId, no unhandled rejection:
   reject-arm leg + unhandledrejection probe (F1 evidence above).
2. Geometry/identity token exactly once in all three arms: one-occurrence pins (F2 evidence).
3. REAL apiClient exercised transport-stub-only; hit name / miss id; named mutant RED: F3 evidence.
4. Resume control absent-without / present-with a completed 'Accepted ' message (streaming false):
   F4 evidence.
5. Zero NEW vitest failures (17=17, same 9 files) and zero NEW tsc errors (13=13, byte-identical
   sorted sets) vs measured baselines.

## Known pre-existing (NOT this unit's)
- 17 failing tests in 9 files (DeckSurfaceChat deckLayout/threadScope, LabwareGlyph, LawnSurface
  equipment/moveAcross, useAiChat card1fix5/threadscope) — identical set at base and final.
- 13 tsc lines in SchemaRecordForm.tsx / RefCombobox.ontologyref.test.tsx — pre-existing at base.
- Infra note honored: node_modules/schema symlink present; vitest resolved without issue.

## Receipts (outside git)
/tmp/u5advcfix-baseline-vitest.txt · /tmp/u5advcfix-baseline-tsc.txt · /tmp/u5advcfix-final-vitest.txt
/tmp/u5advcfix-final-red.txt · /tmp/u5advcfix-mutant-red.txt (F3) · /tmp/u5advcfix-f1-red.txt
/tmp/u5advcfix-f2-red.txt · /tmp/u5advcfix-f4-mutant.txt

L2-P1-RETURN-LEG-1-u5advcfix UNIT L2-P1-RETURN-LEG-1-u5advcfix DONE a7c11dec00000000000000000000000000000000
