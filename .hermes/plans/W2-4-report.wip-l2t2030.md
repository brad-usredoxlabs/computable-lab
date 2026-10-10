# W2-4-PROVENANCE-LADDER — coder report (lane 2, l2t2030)

Worktree: /mnt/vast/home/brad/git/wt/W2-4-lane2-l2t2030 (branch W2-4-lane2-l2t2030)
Base HEAD: 2e672c1b (lane trunk tip at claim, includes the W2-3 merge)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-09_1520-W2-4-provenance-ladder-spec.md (promoted; PROMOTION RECORD governs)

## §0 CLAIM-GATE PROOF (git -c core.fileMode=false merge-base --is-ancestor)

Verbatim capture (/tmp/l2t2030-claimgate-w24.txt):

```
=== CLAIM-GATE: merge-base --is-ancestor (git -c core.fileMode=false) ===
cdfdc56c (W2-1) ancestor of HEAD: exit 0 (IS ancestor)
c5b69a57 (W2-3) ancestor of HEAD: exit 0 (IS ancestor)
2e672c1b merge(lane2): W2-3-PROTOCOL-SEMANTIC-UPGRADE — intent-step discriminator (...)
```

Both §7 claim-gate ancestors confirmed first-hand. Headless item: zero browser,
zero :3093/:5193/:3001/:5174/:5193 interaction (all evidence is in-process vitest).

Lane bootstrap note (baseline integrity): the worktree initially lacked trunk's
ignored `server/schema` symlink; 25 schema/lint files failed with ENOENT on
server/schema/... Replicated 1:1 from the TRUNK worktree (`ln -s <wt>/schema
server/schema`, plus .env symlink); re-measured baselines after the fix match
the composer pins exactly. Scratch probes: none committed (server/scratch/ never
created; the probe ran as a test arm instead — see §9).

## §1 BASELINE CAPTURES AT CLAIM (SET-identity gates)

- vitest src/schema src/lint at claim base (/tmp/l2t2030-baseline-schema-lint2.txt,
  fail-file set /tmp/l2t2030-ff.txt): EXACTLY the 2-file pin
  {src/schema/EventGraphEquipmentSchema.test.ts, src/schema/LabwarePhysicalGeometryData.test.ts}
  — comm -3 vs /tmp/l2t1251-failfiles-schema-lint.txt EMPTY.
- server tsc at claim base (/tmp/l2t2030-tsc-server.txt): 26 primary error lines
  (line,col stripped) — comm -3 vs /tmp/l2t2230-tsc-server.txt EMPTY.
- graph-query leg at claim base (/tmp/l2t2030-baseline-graphquery.txt,
  /tmp/l2t2030-ff-gq.txt): EMPTY fail set (engine green).
- full suite at claim base (/tmp/l2t2030-baseline-full.txt, /tmp/l2t2030-ff-full.txt):
  91 failed files / 113 failed tests (pre-existing integration failures).

## §2 RED CAPTURE (spec §4.1)

T1+T2+T3 written FIRST; data files (vocabulary, datatype, candidate lint) then
absent. RED run (stash the data files, run the three suites;
/tmp/l2t2030-red-w24.txt) tail:

```
 FAIL  src/graph-query/Wave2LocallyValidatedQuery.test.ts [ src/graph-query/Wave2LocallyValidatedQuery.test.ts ]
 FAIL  src/lint/Wave2ProvenanceLadderRules.test.ts > rung-vocabulary lint (prov-vocab-*)
 FAIL  src/lint/Wave2ProvenanceLadderRules.test.ts > vendor-protocol-candidate lint (prov-vendor-*)
 FAIL  src/lint/Wave2ProvenanceLadderRules.test.ts > rule-id global uniqueness boot proof > loadAllLintSpecs + addSpec of EVERY shipped spec throws no Duplicate rule ID
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > rung datatype registration > the whole-tree loader registers provenance-rung-ref with zero errors
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > rung enum is EXACTLY the four admitted rungs > ...
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > per-rung conditional lineage arms > DERIVED with a document anchor is VALID
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > per-rung conditional lineage arms > INFERRED_INVARIANT with a non-empty evidence anchor array is VALID
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > per-rung conditional lineage arms > VENDOR rides a candidate ref + pageStart is VALID
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > per-rung conditional lineage arms > LOCAL_REALIZATION rides the LPR record ref and is VALID
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > per-rung conditional lineage arms > PROBE: unknown extra keys are accepted by design
 FAIL  src/schema/Wave2ProvenanceLadderSchema.test.ts > rung vocabulary parses as data > ... (x2)
 Test Files  3 failed (3)
      Tests  10 failed | 31 passed (54)
```

## §3 §4.2 FIRST TARGETED CHECK (single command that proves the approach early)

`cd <wt>/server && npx vitest run src/schema/integration.test.ts`
(/tmp/l2t2030-firstcheck-w24.txt) — run immediately after writing D and after
every $ref change:

```
 ✓ src/schema/integration.test.ts  (9 tests) 2126ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Whole-tree loader registers the new datatype $id; the `./ref.schema.yaml`
relative-$ref composition resolves (this check doubles as the designated
relative-$ref probe, §8.14).

## §4 BUILD-ORDER GREENS (spec §4.3-§4.7)

- Vocabulary (A+B+C): `vitest src/lint/Wave2ProvenanceLadderRules.test.ts -t "rung-vocabulary lint"` -> 7 passed (R1-R4 fire on mutations, clean vocab silent).
- Datatype (D): `vitest src/schema/Wave2ProvenanceLadderSchema.test.ts` -> 25 passed.
- Layer lints (E+F+G): full T2 -> 29 passed; ProtocolLintRules + Wave2ProtocolIntentRules -> 63 passed.
- UI specs (H): `vitest src/ui` -> 1 failed | 5 passed (6 files, 126 tests) — the 2 failures are the PRE-EXISTING EditorSuggestionService.test.ts failures present in the claim-base full-suite capture (/tmp/l2t2030-baseline-full.txt); the UI loader arms are green. Named loader test run: UISpecLoader via Wave2ProtocolIntentRules.test.ts T3 meta arm (protocol.ui.yaml through the REAL loader, zero validation errors) + T2 f boot proof.
- Crosswalk (§2.F): `vitest src/schema/Wave2NamingCrosswalk.test.ts` -> 6 passed, test file UNTOUCHED (verified EMPTY in §6 greps).
- Query leg (T3): `vitest src/graph-query/Wave2LocallyValidatedQuery.test.ts` -> 7 passed; `vitest src/graph-query` -> 10 files / 66 tests ALL passed.
- Final three-suite run: 61 passed (25+29+7).

## §5 §6 COMMANDS — VERBATIM TAILS (post-change, gated against MY claim captures)

1. PRIMARY SCOPE SET:
```
 Test Files  2 failed | 46 passed | 5 skipped (53)
      Tests  5 failed | 611 passed | 53 skipped (669)
=== fail-file set ===
src/schema/EventGraphEquipmentSchema.test.ts
src/schema/LabwarePhysicalGeometryData.test.ts
=== comm vs claim-base ===
comm exit: 0        (EMPTY — set-identity held; failures only REDUCED: 7 -> 5 tests)
```

2. server tsc:
```
lines: 26
=== comm vs pin /tmp/l2t2230-tsc-server.txt ===
comm exit: 0        (EMPTY multiset; non-zero tsc exit BY DESIGN, never demanded green)
```

3. graph-query third pin:
```
 Test Files  10 passed (10)
      Tests  66 passed (66)
gq fail set: (empty)
comm vs claim-base: exit 0 (EMPTY)
engine untouched: git diff --name-only -- server/src/graph-query | grep -v '\.test\.ts$' => EMPTY (only Wave2LocallyValidatedQuery.test.ts added)
```

4. app: `git -c core.fileMode=false diff --name-only -- app/` => EMPTY (exit 1).

5. Zero-production-TS + ownership: staged-name list (§8 below) through the spec's
   allowlist grep => EMPTY (exit 1). `diff --name-only -- server/src app | grep -v
   '\.test\.ts$'` => EMPTY. ONE declared deviation: `server/src/lint/ProtocolLintRules.test.ts`
   (a TEST file, not production TS) — see §7 delta table row 6 and §10 unresolved.

6. Attestation grep (R2-a gate), spec pipeline verbatim (/tmp/l2t2030-attest-w24.txt):
   residual hits are ALL inside sanctioned locations — the vocabulary lint rule id
   `prov-vocab-locally-validated-is-derived` + its description (rung-vocabulary.lint.yaml),
   the crosswalk `locally-validated` term entry + note, the vendor lint R2 rule body
   (`provenance.locally_validated` as a FORBIDDEN key it rejects), and the two test
   files (mutation fixtures proving the key is REJECTED). The spec's own filter
   (`grep -vE 'rung-vocabulary\.(yaml|lint\.yaml)|Wave2ProvenanceLadder|Wave2LocallyValidatedQuery|derived_queries'`)
   does not exclude the crosswalk/vendor-lint hunks; the SEMANTIC version of the gate
   (T1 arm i: no *.schema.yaml declares any property/enum value/status named
   locally-validated) is GREEN. NO attestation field, enum value, or status was
   minted anywhere. File-attributed re-run excluding sanctioned files leaves only
   crosswalk + vendor-lint hunks (both sanctioned per §8.1: crosswalk entries and
   prov-* lint rule bodies are named locations).

7. Rung-spelling grep (per-file counts of added lines):
```
14 schema/core/datatypes/provenance-rung-ref.schema.yaml   (the ONE datatype enum + descriptions)
24 schema/registry/provenance-ladder/rung-vocabulary.lint.yaml
 4 schema/registry/provenance-ladder/rung-vocabulary.ui.yaml
23 schema/registry/provenance-ladder/rung-vocabulary.yaml
 8 schema/registry/wave2-naming-crosswalk.yaml             (the rung entries themselves)
 9 schema/workflow/local-protocol.lint.yaml
 4 schema/workflow/local-protocol.ui.yaml
 9 schema/workflow/protocol.lint.yaml
 7 schema/workflow/protocol.ui.yaml
 9 schema/workflow/vendor-protocol-candidate.lint.yaml
 4 schema/workflow/vendor-protocol-candidate.ui.yaml
```
Only ONE *.schema.yaml has any rung hit: provenance-rung-ref.schema.yaml (enum +
$id-free descriptions). §8.1 placement rule held.

8. MANIFEST discipline: `diff --name-only -- server/src/compiler/scientistIntent/goldens/MANIFEST.yaml schema/scientist-intent/` => EMPTY.

9. Untouched neighbors: `diff --name-only -- records/ schema/knowledge/ schema/studies/ schema/query/ schema/workflow/protocol.schema.yaml schema/workflow/local-protocol.schema.yaml schema/workflow/vendor-protocol-candidate.schema.yaml schema/core/datatypes/ref.schema.yaml server/src/schema/Wave2NamingCrosswalk.test.ts` => EMPTY.

10. Hardcode grep (server/src): per-file hit counts —
```
 4  server/src/graph-query/Wave2LocallyValidatedQuery.test.ts
 1  server/src/lint/ProtocolLintRules.test.ts   (the two new rule-id strings in the extended pin)
41  server/src/lint/Wave2ProvenanceLadderRules.test.ts
32  server/src/schema/Wave2ProvenanceLadderSchema.test.ts
```
All hits confined to *.test.ts fixtures/pins; ZERO in any shipped vocabulary/lint TS (there is no shipped TS beyond tests at all).

11. Full-suite SET vs claim base: post 91 failed files / 112 failed tests vs base
91/113 — comm -3 of fail-file sets shows only a vitest rendering artifact
(`src/storage/acquisition.test.ts` vs `src/storage/acquisition.test.ts [ ... ]`
line-form variance; same file, same test). No failure ADDED. (Environment-
dependent pre-existing flake noted in §10.)

## §6 THREE-LEG NO-PROMOTION WALL WALK (§2.1 transition_policy -> T1 d / T2 a-c)

Leg 1 — VOCABULARY DATA (rung-vocabulary.yaml transition_policy): forbidden_edges
{DERIVED->VENDOR, INFERRED_INVARIANT->VENDOR, LOCAL_REALIZATION->VENDOR} as declared
data; prov-vocab-no-vendor-promotion-edge reads the permitted `transitions` in the
DSL-honest direction (every edge must originate at VENDOR or not target VENDOR).
T2 arm a: injecting `{source: DERIVED, target: VENDOR, via: 'mutation arm'}` into
the parsed vocabulary -> R3 ERROR naming the item index. GREEN.

Leg 2 — SCHEMA CLOSURE (T1 arm d): candidate fact objects are closed
(additionalProperties:false at every level incl. $defs/Provenance). Proven by
fixtures: `rung: VENDOR` on steps[0].provenance -> INVALID; `locally_validated: true`
on a step -> INVALID; `validatedBy` on a step -> INVALID; `rung` on a labware
ExtractedItem provenance -> INVALID. There is NO rung FIELD a derived conclusion
could be relabelled with — VENDOR is positional. GREEN.

Leg 3 — LINT REJECTIONS (T2 arms b/c): prov-vendor-facts-document-anchored fires
per-item across ALL NINE provenance-carrying arrays (each fires independently —
arm proves it); prov-vendor-no-rung-attestation fires on rung/locally_validated/
validatedBy keys in engine-linted payloads; prov-vendor-specifications-not-step-params
fires on a step carrying validatedBy; prov-derived-conclusions-anchored fires on
present-but-unanchored intent provenance naming the stepId; prov-derived-never-
vendor-carrier fires on a candidate-typed ref wearing a RUN- id. GREEN.

Query leg honesty (T3 arm c): every derived-query op is find/traverse — read-side
primitives only ("No query in this schema mutates laboratory state"); no query
path mints VENDOR. GREEN.

Which layer rejects what (§8.5, per arm):
- rung key on candidate fact = SCHEMA reject (additionalProperties:false; T1 d) + lint belt names it (T2 b).
- `type: run` intent ref = SCHEMA reject (W2-3 merged StepProvenanceRef type const; T1/W2-3 fixture leg).
- right-type wrong-id / present-but-unanchored provenance = LINT reject (prov-derived-*; T2 c).
- rung key on the shared datatype = ACCEPTED BY DESIGN iff rung enum matches (values closed, keys open — closure decision below).
- DERIVED->VENDOR edge in the vocabulary = LINT reject (prov-vocab R3; T2 a).

## §7 ACCEPTANCE CLAUSE -> PROOF WALKTHROUGH (spec §5) + MERGED-SHAPE DELTA TABLE

Clause 1 "each rung instantiates with required lineage":
- VENDOR: datatype arm (candidate ref + pageStart VALID; non-candidate type INVALID) + candidate carrier fixture + prov-vendor-* firing arms.
- DERIVED: datatype arm (pageStart required) + intent-step fixture (anchored VALID / unanchored ERROR).
- INFERRED_INVARIANT: datatype arm (evidence array required, empty INVALID) + T1 arm h knowledge-layer instantiation (assertion.evidence_refs + evidence required supports/sources; supports dropped -> INVALID). HONESTY STATEMENT: the FAMILY-side slot does NOT exist in protocol.schema.yaml today (root closed; StepProvenanceRef type-const is candidate-only; EvidenceSource.type lacks protocol/run). No lint rule was shipped against a path that exists nowhere (dead rules are vacuity bait, §8.9). The lineage is proven on the ONLY surface that exists (knowledge layer), the seam is a COMMENT block in protocol.lint.yaml pointing at rung-vocabulary.yaml, and the slot widening is the declared hand-off to W2-5 (OQ1 ACCEPT disposition: evidence-anchor via existing EvidenceSource-shaped refs; protocol/run kind gap = W2-5, NOT W2-4 scope).
- LOCAL_REALIZATION: datatype arm (LPR record ref) + LPR carrier fixtures (choices recorded clean / matched-without-choices ERROR / unmatched silent).

Clause 2 "DERIVED conclusions CANNOT be promoted to VENDOR by any path (lint rejects)": three-leg wall above (§6 of this report) — GREEN.

Clause 3 "locally-validated computes true only when a realization+run+evidence chain exists, false when any link is removed": T3 arm a TRUE (all three declared clauses non-empty) + arms b(i) drop-LPR FALSE, b(ii) run in_progress FALSE, b(iii) drop-evidence FALSE, b(iii-b) evidence retracted FALSE — four recomputed mutations. Clauses READ FROM THE YAML as data (parsed rung-vocabulary.yaml derived_queries[0].query_clauses; snapshot arm asserts the parsed shapes; GraphQuery ops built FROM the parsed clause fields — no hand-authored query literals). Engine + index IMPORTED UNTOUCHED; composition lives in the test file only (OQ2 ACCEPT: no new DSL op; SERVICE home is W2-5/W2-7).

Clause 4 "vendor-validated-labware fact renders from candidate specifications without appearing as a step parameter": T1 arm d (closed step schema REJECTS validatedBy/rung/locally_validated) + prov-vendor-specifications-not-step-params (lint leg, presence-of-field ONLY — free-text notes stay free text, stated in the file header) + vendor-protocol-candidate.ui.yaml "Manufacturer specifications" section ("vendor-validated labware renders HERE") with NO step-parameter validation affordance anywhere in the layout. HONEST BOUNDARY: hints are the wave-2 UI contract (data); W2-8 renders; NO app code, NO browser gate.

Merged-shape delta table (assumed -> found; merged trunk WINS):

| # | Assumption (spec §7) | Found at merged trunk | Action |
|---|---|---|---|
| 1 | AS-W24-W23-STEPREF: StepProvenanceRef = ref constrained {kind const record, type const vendor-protocol-candidate} + anchors, additionalProperties:false | Merged exactly as drafted | Delta NONE; T1 arms build on it |
| 2 | AS-W24-W23-RULEIDS: 7 merged ids | Confirmed exactly (step-role-closure, labware-role-identity-bearing, role-id-category-unique, legacy-literal-bounded, legacy-inventory-no-intent-drift, intent-step-provenance-visible, intent-verb-ref-declared); prov-* collision-free | R-8/R-9 appended after R-7; W2-3 rules byte-unchanged (additive-only proof arm pins all 7 ids + severities) |
| 3 | AS-W24-W23-R6: intent-step-provenance-visible = WARNING | Confirmed severity: warning | R-6/R-8 split holds as drafted; SET pinned: missing provenance -> EXACTLY 1 warning, 0 prov-derived findings |
| 4 | AS-W24-W22-CROSSWALK: admitted status string from merged file | W2-2's flips use `status: existing` (constraint-classes/Quantity entries) | Used `existing` for the four rung flips + locally-validated entry; mirrored merged key set (term/status/binds_to/curie_plan/source_decision/note); never touched W2-2's lines |
| 5 | AS-W24-CANDIDATE-SEED: no candidate records under records/seed; confirm CAN- prefix, never invent | No candidate seed records; prefix CONFIRMED from merged fixtures: Wave2ProtocolIntentSchema.test.ts:74 (`CAN-w23-demo`) + production mint server/src/api/handlers/ExtractHandlers.ts:162 (`CAN-${target_kind}-${Date.now()}`) | R-9 pattern ^CAN- with the source recorded in the rule comment |
| 6 | protocol.lint.yaml additive edit | Merged ProtocolLintRules.test.ts:321 pins the 7-id rule SET exactly | CONFLICT: additive mandate vs merged pin. Resolved by extending the pin 7->9 ids with the SAME ratification precedent the file itself records ("extended ... per spec mandate + orch ratification l2t1955"). Declared deviation — flagged for orchestrator ratification (§10) |
| 7 | protocol.ui.yaml additive edit | Merged Wave2ProtocolIntentRules.test.ts:356 pins the Intent section's 4-field list exactly | Resolved WITHOUT touching the pinned test: W2-4 hints ride a NEW 'Provenance (DERIVED)' section; the pinned Intent section is byte-identical; suite green untouched |
| 8 | Rung names UNMINTED at trunk (orch grep) | Confirmed zero hits at base | First-spend stands; minted only in sanctioned locations |

## §8 DIFF --NAME-ONLY LIST (the commit)

```
schema/core/datatypes/provenance-rung-ref.schema.yaml          (NEW — the ONE datatype enum; ships UNMOUNTED)
schema/registry/provenance-ladder/rung-vocabulary.yaml         (NEW — ladder as registry DATA)
schema/registry/provenance-ladder/rung-vocabulary.lint.yaml    (NEW — prov-vocab-* R1-R4)
schema/registry/provenance-ladder/rung-vocabulary.ui.yaml      (NEW — derivation.ui.yaml precedent)
schema/registry/wave2-naming-crosswalk.yaml                    (EDIT — 4 rung status flips + locally-validated entry; W2-2 lines untouched)
schema/workflow/vendor-protocol-candidate.lint.yaml            (NEW — prov-vendor-* R1-R3, exact $id incl. workflow/ segment)
schema/workflow/vendor-protocol-candidate.ui.yaml              (NEW — VENDOR badge + specifications rendering, no step-parameter affordance)
schema/workflow/protocol.lint.yaml                             (EDIT additive — R-8/R-9 + commented INFERRED_INVARIANT seam; W2-3 rules byte-unchanged)
schema/workflow/protocol.ui.yaml                               (EDIT additive — NEW 'Provenance (DERIVED)' section)
schema/workflow/local-protocol.lint.yaml                       (EDIT — activated from 0 rules with when-guarded prov-local-* R1-R3; comment header byte-unchanged)
schema/workflow/local-protocol.ui.yaml                         (EDIT additive — LOCAL_REALIZATION section)
server/src/schema/Wave2ProvenanceLadderSchema.test.ts          (NEW T1 — 25 tests)
server/src/lint/Wave2ProvenanceLadderRules.test.ts             (NEW T2 — 29 tests)
server/src/graph-query/Wave2LocallyValidatedQuery.test.ts      (NEW T3 — 7 tests)
server/src/lint/ProtocolLintRules.test.ts                      (EDIT — 7-id pin extended to 9 (declared deviation, §7 row 6))
```

Zero production TypeScript (grep EMPTY); zero new record kinds (T1 forbidden-kind
arm green: no forbidden_kinds string, provenance-rung, or provenance-vocabulary
is a properties.kind.const anywhere in *.schema.yaml).

## §9 NAMED PROBES + §8 BAIT DISPOSITIONS

- nonEmpty-object probe (§2.6 R1, REQUIRED): PathResolver.isEmpty (PathResolver.ts:228-246)
  treats undefined/null/''/[]/{} as EMPTY. Live probe arm in T2 (evaluatePredicate
  on `{choices: {}}` vs absent vs filled): EMPTY-object and absent behave IDENTICALLY
  (both fail nonEmpty); filled passes. Recorded in the local-protocol.lint.yaml
  header; the DSL cannot distinguish them and no free-invented tightening was made.
- Ajv closure decision (§2.3, REQUIRED): provenance-rung-ref.schema.yaml does NOT
  set outer additionalProperties:false — ref.schema.yaml is open and closing while
  allOf-composing risks rejecting ref's own fields under some Ajv stances; mirrors
  the equipment-capability allOf+$ref style. Probe arm: unknown extra keys ACCEPTED
  by design; rung VALUES closed (enum rejects NOT_A_RUNG and a fifth rung). Stated
  in the schema description.
- §8.1 VOCAB vs KIND: rung strings confined to vocabulary files, the ONE datatype
  enum, prov-* lint rule bodies, crosswalk entries, tests (per-file counts §5.7).
  Vocabulary doc kind is `provenance-vocabulary` on a NON-*.schema.yaml data doc.
- §8.2 double-fire: when-guard `nonEmpty steps[*].intent` on every prov-derived rule;
  legacy protocol SET = ZERO findings (pinned); missing provenance = EXACTLY R-6
  warning + zero prov-derived (pinned); `not(exists intent.provenance)` arm keeps
  the absent case out of R-8; empty provenance array passes everyItem vacuously (R-6's business).
- §8.3 $id trap: vendor-protocol-candidate.lint.yaml + .ui.yaml bind the EXACT
  candidate $id INCLUDING the workflow/ segment; firing proven in T2 arm b.
- §8.4 unrestricted rules: every shipped spec carries a spec-level schemaId; the
  vocabulary spec's doc_id schemaId never matches any record (boot-harmless).
- §8.9 dead rules: none shipped (INFERRED_INVARIANT family slot = comment seam).
- §8.12 duplicate ids: all new ids prov-*; T2 f boot proof = loadAllLintSpecs +
  addSpec of EVERY shipped spec, no Duplicate throw (LintEngine.ts:61).
- §8.13 empty-spec activation: local-protocol.lint.yaml now live at boot; all three
  rules when-guarded; legacy LPR payload emits ZERO findings (pinned arm);
  records/seed holds no LPR records.
- OQ3 boot probe (REQUIRED): LintSpecLoader.ts contains ZERO schemaId validation
  (grep count 0); server.ts boot only checks `spec.rules.length === 0` (:411) and
  warns (not fails) on spec load errors. The doc_id-bound vocabulary lint loads
  cleanly; the pre-approved 5-line rung-vocabulary.schema.yaml fallback was NOT
  needed. Boot harmlessness additionally proven by T2 f (full-repo engine load).
- OQ1/OQ2 dispositions (PROMOTION RECORD): ACCEPTED as ruled — evidence-anchor seam
  to W2-5 is NOT W2-4 scope (declared, instantiated on knowledge layer); no new
  DSL op (R-6 warning covers missing, prov-derived-* errors cover present-unanchored).
- Headless: no YAML-reload trap engaged (all evidence in-process vitest); no stack
  interaction; Brad's live tree untouched.

## §10 UNRESOLVED / FOR ORCHESTRATOR

1. DECLARED DEVIATION (needs ratification or a revert instruction):
   `server/src/lint/ProtocolLintRules.test.ts` 7-id rule-set pin extended to 9 ids
   (the two new prov-derived-* ids) with an in-file comment citing the same
   ratification precedent the file already records (l2t1955). The spec's §6
   ownership allowlist does not name this file, but §2.5 mandates the prov-derived-*
   rules live IN protocol.lint.yaml, and the merged pin makes additive activation
   otherwise impossible. It is a TEST-file edit (zero production TS; tsc multiset
   unchanged 26=26). Wave2NamingCrosswalk.test.ts and Wave2ProtocolIntentRules.test.ts
   remain UNTOUCHED.
2. Pre-existing full-suite flake (not mine, not gated): src/initializeApp.extractionRunner.test.ts
   arm "null-guards when the profile is missing" passed inside the full-suite runs
   (base AND post) but failed when run in isolation after the lane bootstrap added
   the .env symlink — environment-dependent, present at claim base in spirit
   (profile-dependent); full-suite fail-file SET identity held (91=91 files).
   src/storage/acquisition.test.ts shows a vitest line-form rendering variance
   between captures (same file, same failing test). Neither is touched by this diff.
3. INFERRED_INVARIANT family-side slot: declared hand-off to W2-5 (OQ1a promotion
   note widening StepProvenanceRef type const). When it lands, the family rule
   rides protocol.lint.yaml with a prov-family-* id (seam comment marks the spot).

W2-4 report ends. Verification evidence: /tmp/l2t2030-{claimgate,red,firstcheck,crosswalk,ui,post-schema-lint2,post-tsc,post-graphquery,post-full,attest,hardcode,names}-w24.txt.
