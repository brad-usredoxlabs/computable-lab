# W2-11 D3 fix — said-vendor-rewrite wall verbs: govern ordinary MEANT verbs (lane 2, l2t1910)

## Why (orchestrator first-hand evidence, trunk 32a6f07a)
Gate run 2 (log /home/brad/.hermes/cl/lanes/2/logs/w211-gate-full-l2t1735-run2.log): D3
refusal leg "change the vendor text on page 1" produced NO review-ai-refusal; the model
emitted a schema-valid protocol_edit rewording a DRAFT step. Orchestrator investigation:
- backend.log (lane :3093, whole day): ZERO wall-refusal codes (SAID_IMMUTABLE /
  PROVENANCE_FALSIFICATION / ...); the D3 turn logged `[agent 6nij08] start
  surface=protocol-review ... done protocol_edit success=true ops=1`. THE WALL NEVER FIRED —
  H2 (client render) is moot; the testid review-ai-refusal exists in
  app/src/ingestion/protocol-review/ReviewAiPanel.tsx and rendered correctly for the W2-9
  gate's B2 leg which used the verb "rewrite".
- Cause is DATA, not interpreter: config/drafting/review-write-wall.yaml
  askWalls[said-vendor-rewrite].verbs lists only SAID-REWRITE verbs (rewrite, overwrite,
  retype, ...). "change" is an ordinary MEANT verb, deliberately absent per
  advc-W289-l2t0525 DEFECT-1 — BUT the W2-11 D3 golden (spec
  2026-10-12_1100-W2-11-zymo-golden-demo-spec.md §D3, verbatim refusals) names
  "change the vendor text" as a MUST-REFUSE negative. The wall's object-governance design
  already separates "change the vendor text" (verb governs the referent) from
  "change step 3 to match the vendor text on page 2" (referent is a MENTION). The verb list
  is what's missing, not the mechanism.

## Fix — ADDITIVE DATA ONLY (zero interpreter change, zero new files)
In config/drafting/review-write-wall.yaml, askWalls id `said-vendor-rewrite`:
1. verbs: ADD `change`, `edit`, `update`, `modify`, `revise`, `alter` (additive — do NOT
   remove, reorder-effect, or weaken any existing entry; do NOT touch `matching`, the other
   three walls, or `opsWall`).
2. Update the wall's YAML comment block to state the governance argument: ordinary MEANT
   verbs joined BECAUSE object governance (adjacency maxGapWords + leading-verb blockers)
   — not the verb list — separates a wall-crossing ask from a legit one; cite the boundary
   string.

Governance proof required as RED-first tests in server/src/ai/reviewWriteWall.test.ts
(surface 'protocol-review', real policy file):
- MUST REFUSE (SAID_IMMUTABLE): "change the vendor text on page 1"; "edit the vendor text";
  "update the vendor document"; "change the vendor wording"; "can you change the vendor
  text please" (interrogative strip exposes the imperative).
- MUST STAY EXEMPT (no refusal) — the exact boundary corpus that motivated DEFECT-1, each
  as its own test case:
  * "change step 3 to match the vendor text on page 2"
    (adjacency: verb@0, noun starts token 6, gap 5 > maxGapWords 3; leading-verb: blocker
    `to` sits between verb and referent -> unreachable).
  * "change step 3 so it reflects the vendor document" (blocker `so`).
  * "change the step label; the vendor text is wrong" — NOT exempt by governance
    (gap: change(0) the(1) step... vendor gap > 3 -> exempt by adjacency; leading verb
    governance: blocker `label;` is NOT a blocker word... CHECK: no blocker token between
    verb and the noun match means leading-verb FIRES. If this string fires, that is
    ACCEPTABLE and honest — "change the step label" then "the vendor text" as an
    independent clause with nothing blocking is ambiguous; do NOT add a blocker word to
    exempt it. Report the actual outcome honestly.)
- Existing suite must stay byte-green (all DEFECT-1/2/c2 boundary tests included). If any
  PRE-EXISTING test expects one of the new verbs + a said noun to pass through, that test
  is now testing the wrong thing: update it ONLY if the old expectation is exactly
  "change/edit/update/modify/revise/alter + vendor noun not refused"; a boundary string of
  the form "<new verb> <permitted target> ... <said noun>" must STAY exempt — if it fires,
  DO NOT weaken the wall; report PARTIAL/BLOCKED naming the string.

## Hard rules
- Do NOT touch server/src/ai/reviewWriteWall.ts (interpreter), ReviewAiPanel, the other
  walls' verbs/nouns/blockers, maxGapWords, blockerWords, strip patterns, negationTokens,
  opsWall, or any other file. ONE yaml + ONE test file.
- No new wall id / new predicate / no TS branch. Absent = OFF semantics unchanged.
- NEVER touch Brad's live tree, :3001/:5174, :3093/:5193, model services; no stack ops.

## Verify (real output in the report)
- `npm run test:run -w server -- src/ai/reviewWriteWall.test.ts` (or vitest direct) full
  file green incl. new arms; report the count and any updated legacy expectation.
- git -c core.fileMode=false diff --numstat (must show ONLY the two owned files).
- Report: .hermes/plans/W2-11-d3fix-report.wip-l2t1910.md committed on branch.
  END MARKER: W211-D3FIX DONE <sha> (or PARTIAL ... BLOCKED <string/leg>).

## Gate note (orchestrator, not worker work)
After merge + restart (YAML changed -> cl-lane-stack.sh 2 restart REQUIRED before the gate),
re-run the full w2-11 gate (D1-D6, run 3). D3 refusal legs must all show
review-ai-refusal; the proposal leg "reword step 3's label for our bench" must STILL yield
a proposal ('reword' is not a wall verb; verify no over-fire).
