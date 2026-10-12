# W2-1-NAMING-CROSSWALK — coder report (wip, l2t1155)

Worktree: /mnt/vast/home/brad/git/wt/W2-1-lane2-l2t1155 (branch
W2-1-lane2-l2t1155 off cl/integration-2 @ cb4b8ee4). Lane-sync bootstrap:
104 untracked/ignored entries replicated 1:1 from the trunk worktree
(symlinks as symlinks); parity proven with comm -3 of
`git status --porcelain -uall --ignored=matching` (empty diff, 104/104).

## Deliverables (owned files, committed)

A. docs/wave2-naming-crosswalk.md — memo; every claim carries a file:line opened.
B. schema/registry/wave2-naming-crosswalk.yaml — machine crosswalk (entries +
   forbidden_kinds + findings + `admission:` section).
C. schema/registry/wave2-verb-adjudication.yaml — ONE mapping table; counts
   machine-extracted by parsing the YAML (never hand-counted).
D. server/src/schema/Wave2NamingCrosswalk.test.ts — generic set-comparison
   admission enforcement over the data files.

Hard rules honored: zero new record kinds, zero new verb entries, ZERO edits
to scientist-intent vocabulary verbs list, protocol.schema.yaml, or any
existing triplet lint. `git status` shows only the 4 new files added by this
item (plus pre-existing lane-sync strays, never staged).

## Machine-extracted vocabulary counts (parsed, re-derived by the test)

- scientist-intent enum ($defs/actionVerb, schema/workflow/scientist-intent.schema.yaml:22): 31
- scientist-intent-vocabulary.yaml verbs (:12): 31 — set-equal AND order-equal to the enum (verified by parse)
- verb-definition seed records (records/seed/verb-definition/verb-*.yaml): 10
- operations.yaml operation ids (schema/registry/operations.yaml:3): 27 (third neighboring vocabulary — named, not conflated)
- verb-action-map.yaml mappings (schema/registry/verb-action-map.yaml:2): 26 (fourth neighboring surface)
- record kinds enumerated across every schema/**/*.schema.yaml: 128

Adjudication partition: same_operation 3 (VERB-INCUBATE<->incubate,
VERB-READ<->read, VERB-SHAKE<->shake); protocol-semantic-only 7 (autoclave,
heat, microwave, rock, set, sonicate, stir); enum-only 28. 3+7=10, 3+28=31 —
the test asserts the partition exactly. No verb added to either vocabulary.

## Collision FINDINGS (recorded, NOT resolved — architect call)

- W2-1-F1 heat: VERB-HEAT canonical `heat` (verb-heat.yaml:4) vs operations.yaml
  incubate aliases incl. `heat` (:36).
- W2-1-F2 set: VERB-SET canonical `set` (verb-set.yaml:4) vs operations.yaml
  add_material aliases incl. `set` (:16).
- W2-1-F3 shake: enum verb (scientist-intent.schema.yaml:27) + verb-definition
  canonical (verb-shake.yaml:4) yet operations.yaml ALIAS of mix (:47); absent
  from verb-action-map.yaml.
- W2-1-F4 spin/pellet vs centrifuge: enum verbs spin (:53), pellet (:54) are
  operations.yaml ALIASES of centrifuge (:66-69); centrifuge is not an enum verb.
- W2-1-F5 coverage gap: verb-action-map 26 vs enum 31; unmapped = shake + the 4
  pattern macros (vocabulary.yaml :660/:698/:732/:763).

No genuine collision was resolved; none blocked this item. Quantity confirmed
genuinely-missing (schema/lab/datatypes/ holds only chemical-properties;
core/datatypes has amount/concentration/reference-ratio — overlap check noted
for W2-2).

## Deliberate-collision test evidence

`cd server && npx vitest run src/schema/Wave2NamingCrosswalk.test.ts`:
Test Files 1 passed (1); Tests 6 passed (6). Fixtures flagged: `local-protocol`
proposed NEW -> collides-with-record-kind; `incubate` -> collides with
scientist-intent-verb AND verb-definition-canonical; `rock` ->
verb-definition-canonical; `centrifuge` -> operation-id;
`semantic-extraction-ir` -> not-listed-in-crosswalk; Quantity without CURIE
plan -> missing-or-invalid-curie-plan. Clean pass: Quantity (cf:quantity),
VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION, constraint-classes.

Negative control (proves the collision assertions bite): a throwaway copy with
fixture-1's expectation inverted to admitted==true FAILED exactly one test —
"AssertionError: expected false to be true" on the DELIBERATE COLLISION case
(Test Files 1 failed; Tests 1 failed | 5 passed). Copy deleted; not committed.

## Verification outputs

1. Wave2NamingCrosswalk.test.ts: `Test Files 1 passed (1) / Tests 6 passed (6)` (green).
2. `npm run typecheck -w server`: 26 error lines, 6 files
   (AgentOrchestrator, ProtocolIntakeHandlers, RecordHandlers, AuthoringGuard,
   bootstrapAdmin, RecordStoreImpl). Normalized SET vs pin
   /tmp/l2t2230-tsc-server.txt (sha256 924c18bd..., 26 lines): comm -3 EMPTY —
   identical error-line set.
3. `npx vitest run src/compiler/scientistIntent/`: 8 files / 87 tests ALL pass
   (0 fail files — unchanged, untouched by this item). Full
   `npx vitest run src/compiler/`: fail-file SET = 17 files (matches the 17/29
   baseline; list: seedModels.fluorescence, QuadrantStampExpander,
   aiPrecompileGating, BaselineFixtures, CrossTurnMini, FixItFixtures,
   FixtureRunner, PatternExpandersDebug, Prompt01Green, Prompt02Green,
   Prompt04DeepDebug, ParserEvalHarness, AiPrecompileShapeMismatch.log,
   GeminiEmAppliancePath, ProtocolRealizePass, FourLayerCorrespondence,
   StructuralCorrespondencePass) — 17 failed | 129 passed (146 files).

Status: implementation complete; acceptance pending orchestrator re-run.

## Fix run 1 (l2t1251) — adversarial cycle 1 -> fix (commit 79016be9 review)

Review: /home/brad/.hermes/cl/lanes/2/reviews/review-W2-1-adversarial-l2t1210-c1.md
(VERDICT: fix — 4 defects, all citation/omission; substantive content PASS).
No data restructuring: machine counts (enum 31 / vocab 31 / records 10 /
operations 27 / map 26), the 3/7/28 partition, forbidden_kinds, and the
admission test logic are byte-untouched. Test file needed NO change (no
findings-count pins; drift guard pins only the 5 vocabulary counts).

### D1 (citation) shake enum line :27 -> :31
Sources re-opened: schema/workflow/scientist-intent.schema.yaml line 27 =
`- incubate`, line 31 = `- shake` (enum values start :24). Corrected all 4
occurrences:
- docs/wave2-naming-crosswalk.md:103 -> `(scientist-intent.schema.yaml:31)`
- schema/registry/wave2-naming-crosswalk.yaml:204 (W2-1-F3 detail) -> `:31`
- schema/registry/wave2-verb-adjudication.yaml:55 (VERB-SHAKE `also`) -> `:31`
- schema/registry/wave2-verb-adjudication.yaml:117 (F3 detail) -> `:31`

### D2 (citation) cf: convention path + line
Sources re-opened: specifications/computable-lab-principles.md line 45 =
heading "## 6. Declarative Rules, Imperative Drools"; the CURIE convention
sentence ("New concepts get CURIE-style local namespace (`cf:ROS`...)") is
line 43. Corrected both occurrences to
`specifications/computable-lab-principles.md:43`:
- docs/wave2-naming-crosswalk.md:132 (was computable-lab-principles.md:45)
- schema/registry/wave2-naming-crosswalk.yaml:260 (admission curie-plan rule)

### D3 (citation) adjudication `also` off-by-one
Verified via `grep -n '^  - id: incubate$' -> 33`, `grep -n '^  - id: read$' -> 55`:
- wave2-verb-adjudication.yaml:47 -> `operations.yaml:33` (incubate op id)
- wave2-verb-adjudication.yaml:51 -> `operations.yaml:55` (read op id)

### D4 (omission) NEW FINDING W2-1-F6 `warm`
Verified: operations.yaml:36 incubate aliases
`[hold, rest, sit, heat, warm, equilibrate, maintain_environment, control_temperature]`
and operations.yaml:252 thaw aliases `[warm]` (thaw `expands_to: [incubate]`
at :251). Added W2-1-F6 in the exact F1-F5 format to BOTH YAML findings blocks
and the memo findings section:
- crosswalk yaml (W2-1-F6, status: collision, term: warm): "alias `warm` is
  assigned to TWO distinct operations: operations.yaml `incubate` whose
  aliases include `warm` (schema/registry/operations.yaml:36) AND operations.yaml
  `thaw` whose aliases include `warm` (schema/registry/operations.yaml:252).
  Inverse shape of F1-F5 — one local alias term for two entities; thaw also
  `expands_to: [incubate]` (operations.yaml:251), so the overlap is
  semantically real. Recorded for architect adjudication."
- adjudication yaml (same id/status/term): "alias warm assigned to TWO
  operations: incubate aliases [.., warm, ..] (operations.yaml:36) AND thaw
  aliases [warm] (operations.yaml:252); thaw also expands_to [incubate] (:251)"
- memo §6 bullet W2-1-F6 `warm` (same citations), plus one clarifying sentence
  in the §6 closing paragraph noting F6 is the inverse shape (one alias term
  for two entities) recorded for the same architect adjudication.
Count pins touched: NONE enumerate findings (test asserts vocabulary counts and
partition arithmetic only; adjudication :36 note "5 enum verbs unmapped" refers
to the F5 coverage gap, not a findings count — left as-is). Findings block now
6 entries in both YAMLs (machine-verified below).

### Verification outputs (fix run 1)

1. `cd server && npx vitest run src/schema/Wave2NamingCrosswalk.test.ts`:
   `Test Files 1 passed (1) / Tests 6 passed (6)` (green).
2. python3 yaml.safe_load both new YAMLs:
   wave2-naming-crosswalk.yaml OK kind= naming-crosswalk findings= 6
   ['W2-1-F1'..'W2-1-F6']; wave2-verb-adjudication.yaml OK kind=
   verb-adjudication findings= 6 ['W2-1-F1'..'W2-1-F6'].
3. Grep proof: `grep -n 'scientist-intent.schema.yaml:27'` over the 4 owned
   files -> exit 1 (no matches); `grep -n 'computable-lab-principles.md:45'`
   -> exit 1 (no matches); corrected citations present: memo:103 +
   crosswalk:204 + adjudication:55/:117 `:31`; memo:132 + crosswalk:260
   `specifications/computable-lab-principles.md:43`; adjudication:47
   `operations.yaml:33` + :51 `operations.yaml:55`; `grep -n 'W2-1-F6'` ->
   memo:112, crosswalk:223, adjudication:126.
4. `npm run typecheck -w server`: 26 error lines / 6 files; normalized
   (line,col stripped) SET diff vs pin /tmp/l2t2230-tsc-server.txt
   (sha256 924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41):
   diff EMPTY — SET IDENTICAL (AgentOrchestrator.ts, ProtocolIntakeHandlers.ts,
   RecordHandlers.ts, AuthoringGuard.ts, bootstrapAdmin.ts, RecordStoreImpl.ts).

Diff scope: exactly 3 of the 4 owned files changed (test file unchanged — no
defect touched it); +32/-9. No forbidden surface touched.

Status: cycle-1 defects fixed; acceptance pending orchestrator re-run /
cycle-2 review.
