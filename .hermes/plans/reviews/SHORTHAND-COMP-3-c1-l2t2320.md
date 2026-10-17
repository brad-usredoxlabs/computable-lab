# ADVERSARIAL REVIEW — SHORTHAND-COMP-3 c1 (lane 2) — l2t2320

VERDICT: accept

Item: SHORTHAND-COMP-3 — mixture decomposition Part I (tasks 1-7 headless)
Worktree: /mnt/vast/home/brad/git/wt/SHORTHAND-COMP-3-lane2-l2t2150
Branch: cl/SHORTHAND-COMP-3-lane2-l2t2150
Base: 968ceaf9769d64ef15df28f1a8d90e9158bbe235 (cl/integration-2 tip)
HEAD reviewed: ef832b6614a2b420ecc582bbe3bc1ebf1c02ac01 (0d1358db, 6b3d070f, 2b67f335, def12ec4, ef832b66)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-13_1830-SHORTHAND-COMP-3-spec.md (read in full incl. the l2t1830 promotion note)
Coder report: .hermes/plans/reports/SHORTHAND-COMP-3-report.l2t2150.md (read in full)

Defects: 0 (zero blocker / major / minor). Non-blocking observations at the end.

Every git command ran with `git -c core.fileMode=false`. No git mutations, no stack restart, no writes to the trunk or Brad's tree.

===================================================================
COMMANDS RUN (my own runs — quoted results)
===================================================================

1) Scope
$ cd <wt> && git -c core.fileMode=false diff --name-only 968ceaf9..HEAD
  .hermes/plans/reports/SHORTHAND-COMP-3-report.l2t2150.md
  server/prompts/material-system-rules.md
  server/src/ai/AgentOrchestrator.ts
  server/src/compiler/biology/verbs/simpleVerbs.ts
  server/src/compiler/scientistIntent/compositionDecomposition.test.ts
$ ... diff --stat 968ceaf9..HEAD        -> 5 files changed, 981 insertions(+)
$ ... diff --name-only 968ceaf9..HEAD | grep -E '\.(yaml|yml)$|schema/|config/|goldens/'
  NONE

2) OQ3 MANIFEST
$ git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
  83fda3b42519eed879bc5e49290e724f727be509
$ git -c core.fileMode=false rev-parse 968ceaf9:server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
  83fda3b42519eed879bc5e49290e724f727be509
  -> byte-identical to the branch-point hash. No re-bless.

3) Per-commit file sets (RED/GREEN ordering)
$ git -c core.fileMode=false diff --name-only 968ceaf9..0d1358db   -> compositionDecomposition.test.ts  (test-only)
$ git -c core.fileMode=false diff --name-only 0d1358db..6b3d070f   -> simpleVerbs.ts                    (production)
$ git -c core.fileMode=false diff --name-only 6b3d070f..2b67f335   -> compositionDecomposition.test.ts  (test-only)
$ git -c core.fileMode=false diff --name-only 2b67f335..def12ec4   -> material-system-rules.md, AgentOrchestrator.ts

4) C1 RED reality (no stack/stash mutation needed)
$ git -c core.fileMode=false diff --stat 968ceaf9:...simpleVerbs.ts 0d1358db:...simpleVerbs.ts   -> EMPTY (identical)
$ git -c core.fileMode=false show 0d1358db:...simpleVerbs.ts | grep -c compositionSnapshotFromParams -> 0
$ git -c core.fileMode=false show 0d1358db:...compositionDecomposition.test.ts | grep -c "it("   -> 8
  At C1 the expander has no snapshot helper, and the two failing assertions (test-file :188
  `expect(snapshot).toHaveLength(4)` where snapshot = details['composition_snapshot']; :213
  `mixed['composition_snapshot']).toHaveLength(2)`) read a key that cannot exist yet -> the RED is
  REAL and for the right reason (missing composition_snapshot), not an unrelated import/type error.

5) Targeted test (spec's own first command)
$ cd server && npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts
  Test Files  1 passed (1)
       Tests  12 passed (12)

6) promptBudget + the two FORCED_DRAFT guard tests
$ cd server && npx vitest run src/ai/promptBudget.test.ts src/ai/AgentOrchestrator.equipmentInstruction.test.ts src/ai/equipmentVocabulary.test.ts
  draft prompt budget: 47020 chars (agent 24543 + material-rules 5430 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 160)
  Test Files  3 passed (3)
       Tests  12 passed (12)
  CORE_PROMPT_CEILING_CHARS is 47_180 (server/src/ai/promptBudget.test.ts:39); promptBudget.test.ts is NOT in the diff -> ceiling UNMOVED.

7) Compiler + biology + materials battery
$ cd server && npx vitest run src/compiler/scientistIntent/ src/compiler/biology/ src/materials/
  Test Files  32 passed (32)
       Tests  333 passed (333)

8) Shorthand/prompt neighborhood (8 files)
$ cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts src/ai/shorthandChat.e2eStubHonesty.test.ts src/ai/shorthandChat.labwareIdBinding.test.ts src/ai/shorthandChat.labwareResult.test.ts src/ai/AgentOrchestrator.equipmentInstruction.test.ts src/ai/equipmentVocabulary.test.ts src/ai/promptBudget.test.ts
  Test Files  8 passed (8)
       Tests  52 passed (52)

9) Server typecheck
$ cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"   -> 0

10) Golden pair (pre-existing trunk debt, outside the battery)
$ cd server && npx vitest run src/ai/AgentOrchestrator.golden.test.ts src/ai/AgentOrchestrator.goldenWithSeeds.test.ts
  Test Files  2 failed (2)
       Tests  2 failed (2)
  Same two test names the report carries; matches the spec's baseline table (pre-existing at b25d2505).

11) Prompt block integrity
  python3 compare: appended section = 1,581 chars; byte-equal to plan lines 412-442 (the plan's own
  ```markdown fence line 411 / closing fence 443 are not part of the 1,581-char block). The spec's
  ":412-443 (1,581 chars)" is the same content measured to the char.

12) Banned synonyms / hardcodes
$ git -c core.fileMode=false diff 968ceaf9..HEAD | grep -nEi 'mixture_spec|components_snapshot|\brecipe\b|\bblend\b'  -> NONE
$ grep -c "params.composition" server/prompts/material-system-rules.md  -> 1
  No material-name / percent-string / role-table literals in the new production helper (only the
  spec-mandated `role === 'cells'` gate for count). No allowedRoles Set.

===================================================================
PER-BAIT FINDINGS
===================================================================

Bait 1 (scope): PASS. diff --name-only is exactly the 4 declared product paths + the report
  deliverable (<=5 in-scope). Zero goldens/, zero schema/**, zero config/**, zero YAML of any kind.
  AgentOrchestrator.ts = 1 added line (numstat 1/0). All other diffs are the expected files.

Bait 2 (OQ1(a) draft material_ref): PASS. simpleVerbs.ts:390 emits
  `materialRef: { kind:'draft', id:'mint:<label>', label }` and BOTH branch spreads stamp
  `material_ref: composition.materialRef`. The live accept flow's exact shape (expander output with
  NO manual stamping) is exercised by the OQ1(a) test (test file :309-350) AND by both end-to-end
  Brad-prompt tests (:401-454): details['material_ref'] equals the draft ref, and
  normalizeEventGraphMaterialUsage mints material_spec_ref + a complex_composition spec from that
  alone — the WITH-material_ref path acceptance will produce. The plan-stamped shape test (:267-307)
  is kept as a second pin. This closes PROBE P7 (without material_ref: 4 materials, 0 specs).

Bait 3 (OQ2 defensive-drop pin, not toThrow): PASS. Test at :200-232 is the defensive-drop pin
  (non-object 'not-an-entry' skipped; blank/whitespace material skipped; non-string role -> 'other';
  <2 valid -> no snapshot). The plan's broken `toThrow` is NOT shipped; the deviation is named in
  the test-file header (:12-20) and the report (section 10). A characterization pin that `role: 42`
  parses CLEAN is present (:137-147), matching PROBE P2.

Bait 4 (OQ3 MANIFEST vs branch point; no treeState YAML touched): PASS. 83fda3b4… identical at
  branch point and HEAD; the diff contains no vocabulary/schema/compile YAML, so replayKernel's
  treeState re-hash cannot drift.

Bait 5 (guards): PASS.
  - composition.length < 2 -> null (helper :347; also re-checks post-drop snapshot.length < 2).
  - non-string/blank role -> 'other'; role enum NOT re-declared in TS.
  - count taken only from a cells-role entry, only when typeof number && Number.isFinite.
  - byte-identity for a no-composition expand: explicit Object.keys-sorted + deep-equality pin
    (test :242-255). One-entry composition pinned as a plain add (:257-263); plain single-material
    add pinned (:234-240).
  - counterDensity (wire) -> counter_density (event) mapping happens only in the expander
    (helper returns camelCase; the two mutually-exclusive branch spreads emit snake_case). value
    objects passed through by reference; no second mapping site elsewhere in the pipeline.
  - both emit branches (legacy wells-array :487-495, modern :511-519) carry the identical gated spread.
  - exactOptionalPropertyTypes-safe: every conditional key uses `...(x !== undefined ? {x} : {})` /
    `...(x ? {x} : {})`; no `foo: undefined` property assignment in the new code; server tsc 0.

Bait 6 (prompt DATA + one bullet): PASS. Block appended verbatim (1,581 chars == plan lines
  412-442). promptBudget printed line exactly `47020 … ceiling 47180 (headroom 160)`; ceiling
  UNMOVED; promptBudget.test.ts not in the diff. The two FORCED_DRAFT guard tests green and
  UNEDITED (not in the diff). The AgentOrchestrator.ts change is exactly ONE added bullet
  (numstat 1/0) at the post-COMP-2 re-anchored position.

Bait 7 (banned synonyms / one term per entity): PASS. No mixture_spec / components_snapshot /
  recipe / blend anywhere in the diff. Names used are the pinned set: params.composition,
  composition_snapshot, formulation_kind: complex_composition, component_ref/role, count,
  counter_density. "blob" appears only in prose/comments naming the failure, never as an identifier.

Bait 8 (report honesty): PASS.
  - C1 RED is REAL (verified above): test-only commit, simpleVerbs identical to base, failures at
    the two assertions that read the absent composition_snapshot key. The coder's note that vitest
    1.6.1 words it `Target cannot be null or undefined.` (vs the spec's older `expected undefined to
    have length 4`) is honest matcher-wording, not a different failure.
  - Baselines re-measured at the branch point and disclosed (31/321 vs the spec's 26/297, with the
    +5 files/+24 tests attributed to COMP-2 landing between b25d2505 and the branch point).
  - The 5th material record (the mixture-label ref grounding to its own MAT-) is disclosed and
    reproduced (report section 9; test :290-301) rather than massaged.
  - Zero NEW failures reproduced independently: HEAD battery 32/333 all-pass (no fail set), the
    8-file neighborhood 8/52 all-pass, server tsc 0; the only failures I can produce are the two
    pre-existing golden-pair tests, identical by name to the report.

Acceptance criteria mapping:
  AC1 (params.composition one entry per component): carry pins GREEN (task-1 test; end-to-end
      prompt legs compile complete with 4 components and normalize them).
  AC2 (>=4 MAT records + exactly 1 complex_composition spec per event): end-to-end
      assertMixtureOutcome asserts materials >= 4, specs length 1, formulation_kind
      complex_composition, 4 grounded record:MAT- component_refs. GREEN.
  AC3 (cells count + counter_density, never converted to a volume): event carries count 10000 +
      counter_density {200 cells/uL}, volume stays 50 uL; no density*volume / volume-derived count
      code path (grepped). GREEN.
  AC4 (MANIFEST byte-identical; zero NEW failures): MANIFEST 83fda3b4… identical; batterry/neighborhood
      all-green; only pre-existing golden-pair debt remains. GREEN for the headless legs.

===================================================================
NON-BLOCKING OBSERVATIONS (not defects; no action required)
===================================================================

O1. `fraction` -> `source: "<fraction> of the mixture"` (simpleVerbs.ts:369) reuses the
    composition-entry `source` field (a provenance descriptor per composition-entry.schema.yaml:39)
    to carry a fraction string. This is copied verbatim from the plan snippet (:276) and the spec
    calls the plan's block "correct in substance"; composition-entry allows `source` as a string and
    the event-graph PlateEvent `details` is `additionalProperties: true`
    (event-graph.schema.yaml:349), so nothing rejects it. Flagged only so the semantics are on the
    record for Stage B.

O2. The counterDensity->counter_density mapping is written in both branch spreads (simpleVerbs.ts:493
    and :517). The two branches are mutually exclusive and the spec's "one mapping site" means
    "only in the expander, not also in the wire/schema", which holds; the duplication is cosmetic.

O3. counter_density is passed through without a `basis` member, while concentration.schema.yaml
    requires [value, unit, basis]. This is only a latent concern IF some future strict Ajv path
    validates nested event details against plate-event.add-material.schema.yaml; at present the
    event-graph PlateEvent.details is additionalProperties:true, so no path rejects it, and the
    prompt/tests intentionally carry {value, unit} per the spec. Not a defect in this diff.

O4. The end-to-end prompt tests author params.composition directly (the LLM's job is taught by the
    Task-5/6 prompt text), so the headless legs prove carry-through + expander + mint, not the
    model's compliance. This matches the spec's Task-7 split (live model behaviour is the
    orchestrator's browser gate).

O5. Report line 6 names HEAD as def12ec4 while the branch HEAD is ef832b66 (C5 = the report commit
    itself); cosmetic, C5 is report-only and the report states so.

Working tree: clean apart from the untracked `.hermes/plans/reports/raws/` and `.../probes/`
evidence dirs (expected).

VERDICT: accept. 0 defects.

ADVC-COMP3 DONE
