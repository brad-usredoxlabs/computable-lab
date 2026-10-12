# W2-11-ZYMO-GOLDEN-DEMO — frozen reviewed artifacts (campaign fixtures)

Hand-authored frozen fixtures for the W2-11 campaign golden
(`ZymoCampaignGoldenE2E.test.ts` / `ZymoCampaignNegatives.test.ts`). These are
TEST DATA (Brad ruling: all records in the data repos are test data). The
golden hashes each fixture at open (self-pin inside the test file;
`goldens/MANIFEST.yaml` is untouched per W211-OQ1 ruling (a)).

## Honest provenance (spec §0.1 / §2.2 THE BRIDGE — MANDATORY statement)

`zymo-semantic-draft.frozen.yaml` is a **HAND-AUTHORED semantic-family
artifact**, NOT a frozen model output. The freeze is honest because the
declared fallback is operative:

- Source of the ruling: `.hermes/plans/W2-10-model-evidence-report.md`
  (promoted report; file sha256 starts `ed1d2edd92f487a9`). FINAL SCORED
  LAUNCHES (:108-122): **thunder-q38: verdict FAIL**, failing_metrics
  [schema_pass_rate, lint_errors, downstream_compile] (:110);
  **computable-q4b: verdict FAIL**, same failing_metrics (:114);
  "NO winner is declared" (:121-122).
- Root cause, verbatim from the report: **F-LANE2-W210-D** (:145,
  :210-215) — PRODUCT CONTRACT GAP at the W2-6 -> W2-3 seam: landed
  semantic-family kind-tagged steps "fall between the literal-step and
  IntentStep branches" of the merged protocol.schema.yaml oneOf, so
  "schema_pass_rate can never reach 1.00 for ANY model" until the seam is
  fixed. Therefore W211-OQ3's primary leg (a) — freeze a real W2-6 model
  output from a combo that PASSED — has NO source artifact; the declared
  fallback (b) is OPERATIVE (spec §0.1, ruling W211-OQ3).
- Criteria provenance: the W2-10 criteria file is UNTRACKED
  (`.hermes/plans/semantic-pass-matrix.criteria.yaml`); pre-registration is
  proven via CONTENT — every rows.jsonl row embeds criteriaSha
  `851e2a2d5c9bc40062db5a4f8b47a2308564b23ece4c71c850e872e1acafe23d`
  (promoted report :18, ORCH AMENDMENT l2t0115 adv-D1). Per W211-OQ5 the
  cite is to the promoted report + criteriaSha; no criteria-file restore.
- What review produced the content: the draft body is authored in the merged
  W2-7 fixture shape (realizationGolden.test.ts inline fixtures, reused by
  byte-copy per the W2-10 N6d doctrine — declared duplication) over the REAL
  decoded Zymo candidate (PDF sha256
  `257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b`,
  17 steps, pageCount 31). The family's `branch_axes` are the deterministic
  `deriveBranchAxes` output over the real candidate steps (the step-1/step-4
  shared question is ONE axis; condition ids `branch-1`/`branch-2`), never
  hand-minted. Every intent step carries the merged StepProvenanceRef shape
  (`kind/type/id/pageStart`, `id` = the SAID candidate record's own recordId
  per the W2-6 P1 binding, pageStart copied from the real candidate step
  provenance). The "reviewed extraction output" flavor is carried ONLY by
  the live-smoke artifact (`server/scripts/zymo-campaign-live-smoke.ts`,
  "evidence, not a gate").

## Files

Self-pinned shas (sha256 of the committed bytes; the suites and the gate spec
refuse to run on drift):
- `zymo-semantic-draft.frozen.yaml` — `d878727ae69305d73623b6e6fd99ddf7a1bc999efd7b8d84c9c9944afdc98058`
- `zymo-robot-answers.frozen.yaml` — `ac383fe4c71d164b52decaa332aeea1c87617a7efab29d294b3cb3a49fd7492e`

- `zymo-semantic-draft.frozen.yaml` — the reviewed W2-6 draft payload (the
  MEANT body): protocolLayer universal, 17 intent steps, branch_axes with
  family condition ids. Promoted through the REAL W2-5 promotion route in
  the golden (born draft, P4).
- `zymo-robot-answers.frozen.yaml` — the lab answers (the "neither spin
  column nor plate — the robot" axis answer + the merged policy's required
  answers: `sample_count` on branch_resolution.choices as a positive count
  Quantity; `sample_plate` + `reagent_source` as labwares SetupRows with
  profile-derived role + concrete ref; scaleBindings answerValue `robot` ->
  `robot-assist-plus-96`).
