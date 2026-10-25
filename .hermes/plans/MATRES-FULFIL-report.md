# MATRES-FULFIL — lane 2 coder report (tag l2t1340)

Worktree: /mnt/vast/home/brad/git/wt/MATRES-FULFIL-lane2-l2t1340
Branch: cl/lane2-matres-fulfil-l2t1340
Dispatch base (PINNED_TIP): 2eafc8d313f9b6af6e6dd6d910ed4a58cf91738c (4646f56a and ELIG 5e9c4bb1 ancestor-proven)

## 1. Outcome

Fulfillment binding implemented end-to-end per the canonical spec + amendment (D-1..D-10 as amended by the final-prep cite table) + F-block:

- Requirement OCCURRENCES get a stable identity `REQE-<slug>-<hash>` minted by the termId law (labelSlug + labelHash over the (graphRecordId, eventId, slot) anchor — never Date.now()/randomUUID), wired into the SOLE writer (`unresolvedSourceRequirement` synthesized blocks in AddMaterialSupport.ts; the implicit-mint functions :156/:161/:166 untouched). D3: occurrence id + componentRef membership anchor — no second id system.
- Transitions are DATA-declared: 3 new lint rules on the add-material DETAIL schemaId (new file `schema/workflow/events/plate-event.add-material.lint.yaml`) + 12 additive `fulfil-*` rules appended to `schema/lab/attestation.lint.yaml` (existing 8 rules byte-untouched; the 'FULFIL hook' rule stays at its re-pinned position). Additive schema slots only: `requirementId`, `requestedSource`, `acceptedLots`, `expectedDerivations` in `plate-event.add-material.schema.yaml`. `schema/lab/attestation.schema.yaml` diff = ZERO (F3): the merged $defs are $ref'd, never re-declared.
- Fulfillment rides `AttestationAcceptService` UNCHANGED (D4/D9): `server/src/fulfillment/FulfillmentDraft.ts` compiles attestation-kind envelopes (verb `fulfills` / `re-evaluates-fulfillment`, `against` pin fields, `evidenceRefs`) and hands them to the merged accept service; `appendOnlyKinds` gains NO entry (bait 4 held); correction identity :95/:113 untouched (OQ-1 stance (a) — protection is the FULFIL-side `fulfil-reevaluation-changed-facts-must-vary` lint rule).
- Compatibility evaluation is FULFIL-owned (OQ-3): policy-as-data `server/src/fulfillment/fulfillment-compatibility.yaml` + pure evaluator `evaluateCompatibility.ts` + loader `fulfillmentPolicy.ts` (per-call load, malformed data throws naming the path, missing declared fact => the data's missing-fact outcome INCOMPLETE — never PASS-by-default, never silent false). ZERO imports/references to ELIG dirs (grep proof below); house idiom mirrored in style only.
- Scoped to pinned plan/run revisions: the claim's `against` carries planRecordId + graphRevision + checksums (reference-copy style); the accept service's existing pinned-read re-check 409s on drift; fulfillment writes NOTHING except its own attestation record — the shared material-spec is NEVER mutated (AC-5 byte-hash proof test).
- P8 trio enforced at the accept wall: `fulfil-evaluations-declared`, `fulfil-completed-needs-compatible-evaluations`, `fulfil-mismatch-blocks` (verdict trio proven discriminating by probe: completed+incomplete FAIL, completed+all-compatible PASS, completed+no-evaluations FAIL, any mismatch FAIL).

Verification battery all green (raws in §5-§8). No app/ changes. No browser gate (per dispatch).

## 2. Commits (base 2eafc8d3 .. HEAD)

- faa5f623 docs(lane2): MATRES-FULFIL schema-fit AUDIT answers committed FIRST (spec AC-F1; DSL expressibility probes; F6 nesting stance named; bootstrap baselines disclosed)
- cc7bb47c test(lane2): MATRES-FULFIL RED suite committed (AC-F1 pins + detail-slot + attestation-side fulfil rules + P8 trio) — RED raw: 17 failed | 8 passed (25)
- 64234867 feat(lane2): MATRES-FULFIL schema+lint DATA only — additive requirementId/requestedSource slots, NEW plate-event.add-material.lint.yaml, ADDITIVE attestation.lint.yaml fulfil-* rules (12); envelope schema ZERO diff — FIRST GREEN YAML-only: 25 passed (25)
- 9e3912b3 test(lane2): MATRES-FULFIL acceptance RED suite (5.11 id law, AC-2 case-3' chain, AC-3 Shape-A, AC-4 case-5, AC-5 no-mutation, 5.12 P8 trio at accept wall) — RED raw: suite load fails, module absent
- e5d46947 feat(lane2): MATRES-FULFIL evaluator + acceptance wiring — requirementId.ts, fulfillment-compatibility.yaml, evaluateCompatibility.ts, FulfillmentDraft.ts, AddMaterialSupport synthesized blocks gain requirementId; additive declared-fact slots — GREEN: 42 passed (42) scoped; affected suites 116 passed

Full diff-stat vs dispatch base: 12 files, +2124/-4 — all under schema/workflow/events, schema/lab/attestation.lint.yaml, server/src/fulfillment/, server/src/materials/, server/src/schema/ (tests), .hermes/plans/ (audit). app/ diff-stat: EMPTY (see §8).

## 3. Committed schema-fit audit answers

Committed FIRST at faa5f623: `/mnt/vast/home/brad/git/wt/MATRES-FULFIL-lane2-l2t1340/.hermes/plans/MATRES-FULFIL-schema-fit-audit.l2t1340.md` (133 lines). Summary of its answers (full text in the committed file):

- (a) add-material `material_source_requirement`: PARTIAL — shape shipped (`additionalProperties: false`, status enum EXACTLY [unresolved, provided, linked] — AC-F1 byte-set pinned in tests), lifecycle ABSENT (no id field, no Shape-A slot, no fulfillment state; `provided`/`linked` have ZERO server writers — sole writer `unresolvedSourceRequirement`).
- (b) per-component requirement identity: ABSENT (requirementId grep ZERO in schema/ and server/src/materials/). Ruling applied: event-occurrence id via termId-style helper, anchor (graph recordId, eventId, slot); per-component anchor = componentRef membership, no second id system (D3).
- (c) fulfillment evidence refs: ABSENT event-side; fulfillment rides the attestation envelope (kind const :28-29, loose assertion bag `$defs/Claim` :141-142, envelope `evidenceRefs` :72-79, claim `evidenceRefs` :200, `$defs/Against` :103-124; ref.schema.yaml `type` free string — no widening).
- (d) pinned-revision mechanism: PARTIAL, reference-copy style (planned-run checksums.protocolSha; $defs/Against pin fields; revisionRef ^REV-; accept gate-3 pinned-read re-check 409s on drift).
- (e) accept/derivation paths: shipped, but NONE wrote a fulfillment transition; lint seam RecordStoreImpl:1025 binds payload.schemaId — detail rules fire on detail-payload validation.
- (f) declared compatibility evaluation surface: ABSENT; ELIG grepped ZERO overlap (F5); FULFIL-owned home stands.
- DSL expressibility PROOFS (tsx probes, raws run at my tip, scratch deleted before commit): nested wildcards resolve; nonEmpty on [*] = ANY; verdict trio discriminates 8/8 cases; allIn scalar-path membership works (absent => vacuous PASS, non-member => loud FAIL); regex on dotted paths works; PAIRWISE-DISTINCTNESS is NOT expressible with shipped ops — recorded constraint: enforced constructively by the mint law (eventId in anchor) + `fulfil-requirement-exists-in-plan` membership rule. Gap RECORDED, not silently dropped.
- Vocabulary pins (bait 3): REQE- family (never REQ-); verbs `fulfills`/`re-evaluates-fulfillment` NEVER enter the scientist-intent verb union (file diff = 0 lines, union stays 32); `fulfilledBy` exactly receipt|derivation|instance; verdicts compatible|mismatch|incomplete; claimStatus enum untouched and server never derives it; REQUESTED SOURCE naming, no decrement/availability vocabulary.
- Bootstrap note: fresh worktree lacked lane-exclude overlay copies + `server/schema` symlink + tube-size registry file; repaired (cp -L / ln -s, git status stays clean); post-repair baselines regenerated; pre-repair baselines disclosed as provisioning artifacts, not trunk debt.

## 4. F6 nesting stance (named explicitly)

`composition-entry.schema.yaml:48` allows a nested `composition[]` (root self-`$ref: "#"`). FULFIL's componentRef-membership stance: **top-level + one-level-nested, proven; deeper nesting is a RECORDED limitation**. The lint rule `fulfil-componentref-in-requirement` checks membership against the copied `assertion.componentRefs`, and the draft compile copies BOTH the top-level composition entries AND one level of nested composition entries (PathResolver nested-wildcard resolution proven by probe 1: `composition_snapshot[*].composition[*].component_ref.id` resolves). Deeper (2+) nesting is named as a limitation in the rule description and here — same discipline as §7.2's PathResolver caveat. `composition-entry.schema.yaml` diff = ZERO (read-only context, F3). D3 unchanged.

## 5. RED -> GREEN raw outputs

RED 1 (schema/lint suite before any YAML change, /tmp/fulfil-red-1.txt):
  Test Files  1 failed (1)
        Tests  17 failed | 8 passed (25)   RED_EXIT=1

GREEN 1 (YAML-only — schema slots + lint rules, ZERO server code, /tmp/fulfil-green-3.txt):
  Test Files  1 passed (1)
        Tests  25 passed (25)   EXIT=0
  (proves the §9 first-green claim: the contract is expressible in DATA alone)

RED 2 (acceptance suite before the TS module exists, /tmp/fulfil-red-2.txt):
  Error: Failed to load url ../materials/requirementId.js ... Does the file exist?
        Tests  no tests   EXIT=1

GREEN 2 (after evaluator + wiring, both suites, /tmp/fulfil-green-6.txt):
  Test Files  2 passed (2)
        Tests  42 passed (42)   EXIT=0

GREEN locks cover the spec §verified-by battery: case-3' chain fixture (mint -> unresolved occurrence with REQE id -> fulfillment accepted -> occurrence traceable), Shape-A case 3 no-decrement (requestedSource on a future add_material; no decrement vocabulary anywhere), case-5 correction re-evaluation (correction superseding the cited receipt => reevaluationObligations() surfaces the fulfillment; changed-facts rule), shared material-spec bytes unchanged (contentHash equality before/after acceptance), 5.12 P8 trio at the accept wall (missing evaluations / completed-with-incomplete / declared mismatch each BLOCK acceptance naming the rule id).

## 6. Scoped suites (run at HEAD, recorded)

- `npx vitest run src/schema/RequirementFulfillmentSchemas.test.ts src/fulfillment/FulfillmentAccept.test.ts` -> 2 files, 42 passed (42), EXIT=0.
- Affected existing suites (`AddMaterialSupport`, `AttestationCase5`, `AttestationAcceptService`, `MaterialCompiler`, `materialRefLabels`, `CrossCollectionPredicate`, `W25LintActivation`): 7 files, 85 passed (85), EXIT=0.
- Schema harness precedents (`AttestationSchemas.test.ts`, `MaterialReceivingSchemas.test.ts`): 2 files, 31 passed (31), EXIT=0. Total affected-suite evidence: 116 passed, zero failures.

## 7. Full server suite — failing-FILE set before/after

BEFORE (freshly regenerated at dispatch tip 2eafc8d3, /tmp/fulfil-baseline-suite.txt):
  Test Files  89 failed | 700 passed | 9 skipped (798)
        Tests  107 failed | 6569 passed | 70 skipped (6919)
       Errors  2 errors
AFTER (HEAD e5d46947, /tmp/fulfil-after-suite.txt):
  Test Files  89 failed | 702 passed | 9 skipped (800)
        Tests  106 failed | 6612 passed | 70 skipped (6961)
       Errors  2 errors

Failing-FILE comm (`comm -13 before after`): 0 new failing files; the full 89-file FAIL-name sets (85 `src/**` + 4 `test/api/**`) are IDENTICAL before/after (verified by diff of the sorted unique FAIL-file lists: 89 vs 89, empty diff). NEWLY FAILING test names: ZERO. One pre-existing failing TEST name disappeared (W25DraftLifecyclePromotion "(c) happy promote"): it PASSES standalone at HEAD (`5 passed`) — a load-timeout flap in the full-suite run (known base-debt flap class), not a lane effect; the file remains in BOTH failing-file sets via its other test "(e) candidate sha invariant". The 89-file/2-error set is pre-existing trunk debt (ANSWER-FOLD-era untracked-module imports etc.) — not fixed in-lane.

## 8. tsc sorted diff + app/ proof + fence greps

- Baseline tsc at dispatch tip: 0 error lines (`TSC_EXIT=0`). After HEAD: 0 error lines. `diff <(sort baseline) <(sort after)` -> EMPTY: zero NEW error lines.
- `git -c core.fileMode=false diff --stat 2eafc8d3...HEAD -- app/` -> EMPTY (FULFIL is server/schema-only).
- F3 grep fence at my base (re-run per F7): `git -c core.fileMode=false grep -n 'id: fulfil\|id: add-material' -- schema/` -> ZERO hits (exit 1) before first commit.
- Fence diffs all EMPTY: `schema/lab/attestation.schema.yaml`, `schema/core/datatypes/composition-entry.schema.yaml`, `server/src/attestation/`, `server/src/receiving/`, `server/src/compiler/` (incl. eligibility), `server/src/resolve/`, `schema/scientist-intent/`, `config/drafting/`, `server/src/ai/`, `server/src/config/types.ts` (appendOnlyKinds gains NO entry).
- Bait greps on the full diff: `Date.now|randomUUID|reserved|available|decrement|kind ===|status ===` in added lines -> hits ONLY in comments/test names/audit doc (no policy code); `'fulfilled'` string in TS -> only the AC-F1 negative-pin test (asserting the enum REJECTS 'fulfilled'); ELIG references -> only comment text stating the zero-sharing rule. Vocabulary union file diff = 0 lines.

## 9. Assumptions

1. Detail-lint binding: rules on the add-material DETAIL schemaId fire on detail-payload validation (RecordStoreImpl:1025 binds payload.schemaId); event-graph payloads bind the graph schemaId. Proven by the GREEN suite (rules fire through the real store+lint path in FulfillmentAccept.test.ts).
2. Pairwise-distinctness of requirementIds is enforced constructively (mint law anchor includes eventId) + membership rule, NOT by a lint op (none shipped) — recorded constraint from the audit, per §7.2's recorded-constraint escape.
3. Base debt disclosed, not fixed: `schema/lab/material-derivation.schema.yaml` has a broken `$ref: '../core/ref.schema.yaml'` (file lives at `core/datatypes/ref.schema.yaml`); no baseline test Ajv-compiles it, so it never surfaced. Out of §8 IN-list -> untouched; my acceptance test seeds the derivation fixture with `skipValidation` and names the debt in a comment.
4. The W25DraftLifecyclePromotion (c) name-flip is a full-suite load-timeout flap (passes standalone at HEAD); failing-FILE set is identical before/after.
5. Worktree provisioning fixes (server/schema symlink, lane-exclude overlay copies, tube-size registry copy) are gitignored/untracked lane setup, not lane changes.
6. No live-stack probe was needed (tests are the gate per dispatch); no YAML live-restart performed.

STATUS: complete
