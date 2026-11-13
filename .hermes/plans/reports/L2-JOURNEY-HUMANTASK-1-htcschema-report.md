# L2-JOURNEY-HUMANTASK-1 — unit htcschema (1 of 3) — implementation report

- worktree: /home/brad/cl-wt/L2-JOURNEY-HUMANTASK-1-htcschema-lane2
- branch: cl/lane2-journey-humantask-htcschema-2345
- base: 46029f8b096feb6ebde2026f99e9473b627fd67a (measured there: lint 5/5 + compiler 10/10, tsc 0 lines)
- coder: cl-coder lane 2, 2026-11-12/13

## Commits (one per numbered step; no history rewritten)
1. 10bb6b3ae2605fb9466cd817ab275189c10d0d6e — test(humantask htcschema): RED-first human-task contract gate arms (a-f) against lintJourneyDocument
2. ae1747e92fd86a6562155fd659a2a2034263f9a8 — schema(humantask htcschema): closed human-task contract schema + journey-document human_task property (not required)
3. 51bb0ed3fd634bb574ff5d4c4be3d702d1714fea — feat(humantask htcschema): validateHumanTaskContract registry gate wired into journey-document lint (optional surfaces param, after capability loop)

## Changed files (exactly the 5 owned; +13 insertions net 323/3 across the 3 commits)
- schema/workflow/human-task.schema.yaml (NEW, 78 lines) — draft 2020-12, $id https://computable-lab.com/schema/computable-lab/human-task.schema.yaml, additionalProperties:false closed; required [decision, surface, controls, selectable_kinds, completion, output_port, on_cancel, on_defer]; completion.kind enum [governed_write, versioned_selection] + receipt_required pinned true; on_cancel/on_defer enum [keep_journey_active, end_journey]; output_port $ref ./journey-port.schema.yaml#/$defs/CommittedRecordReference (no new port vocabulary); no policy tiers/roles/approvals (L2-JOURNEY-POLICY-1's authority).
- schema/workflow/journey-document.schema.yaml (116 lines; +7) — steps.items.properties gains `human_task: { $ref: "./human-task.schema.yaml" }` ONLY; NOT added to `required` (conditionality is the lint's rule; required would break every automatic fixture).
- server/src/compiler/journey/humanTaskContract.ts (NEW, 84 lines) — validateHumanTaskContract(step, surfaces: SurfacesRegistry): (a) human_in_the_loop without human_task → journey_human_task_missing; (b) automatic WITH human_task → journey_human_task_unexpected; (c) human_task.surface unknown to the registry → journey_human_task_surface_unknown; (d) any selectable_kinds entry not in that surface's registry selectableKinds → journey_human_task_kind_not_selectable. Every message names the step id, the surface id and the offending kind verbatim. No Ajv, no YAML reader here (the schema is compiled by the lint's one Ajv).
- server/src/compiler/journey/journeyDocumentLint.ts (147 lines; +31/-3) — getCompiled() does ajv.addSchema(load('human-task.schema.yaml')) BEFORE ajv.compile(load('journey-document.schema.yaml')) on the SAME Ajv instance (no second Ajv / YAML reader); lintJourneyDocument gains an OPTIONAL third parameter surfaces?: SurfacesRegistry; the human-task loop runs AFTER the capability-membership loop and appends to the existing diagnostics array; port chaining and the schema-gate-first ordering are untouched. RULE_* re-exports added (superset, see deviation D1).
- server/src/compiler/journey/humanTaskContract.test.ts (NEW, 126 lines) — 6 tests, RED-first: (a) missing contract, (b) automatic with contract, (c) unknown surface 'not_a_surface', (d) kind 'not_a_registry_kind' on surface run-plan, (e) clean agreeing document passes, (f) automatic without contract passes. Uses the REAL loadDefaultSurfacesRegistry; run-plan fixture (declares protocol-step) exists so mutation B is a live RED.

## RED evidence (raw, pre-implementation)
First run: `Tests 5 failed | 1 passed (6)` — arm (a): "expected true to be false" (lint returned ok:true with no journey_human_task_missing); arms (b)/(c)/(d): "expected 'journey_document_schema' to be '<expected rule>'" (schema gate rejected the human_task property as additionalProperty before the property existed; the semantic rules did not exist); the automatic-without-contract arm passed. Full raw output: /home/brad/.humantask-htcschema-scratch/red-run.txt.
During RED→GREEN one fixture was corrected (committed in step 3): output_port originally a StagedDraftReference; the schema gate correctly refused it against the CommittedRecordReference $ref (a receipt-required completion cannot emit an uncommitted draft) — fixture now uses { version, record_id, record_type, receipt_id }. This is the schema working as designed, not a weakened check.

## VERIFY BEFORE EXIT (raw summaries, run at 51bb0ed3)
1. `cd server && npx vitest run src/compiler/journey/humanTaskContract.test.ts`
   Test Files  1 passed (1) / Tests  6 passed (6)
2. `cd server && npx vitest run src/compiler/journey/journeyDocumentLint.test.ts src/compiler/journey/journeyCompiler.test.ts`
   Test Files  2 passed (2) / Tests  15 passed (15) — baseline held with the rule wired in
3. `cd server && npx tsc --noEmit` → exit 0, 0 lines (single run; raw: /home/brad/.humantask-htcschema-scratch/tsc.txt)
4. `git -c core.fileMode=false status --short` → empty (clean tree at exit; node_modules is gitignored)

## Mutation probes (both REVERTED; no residue — grep 'MUTATION|false &&' on the committed validator is empty)
- A (subset check deleted, `if (false && ...)`): `npx vitest run src/compiler/journey/humanTaskContract.test.ts` → RED, arm (d) fails "expected true to be false" (ok flipped true, no journey_human_task_kind_not_selectable for 'not_a_registry_kind'). Raw: /home/brad/.humantask-htcschema-scratch/mutationA.txt
- B (registry lookup replaced by hardcoded ['well','cell','event','material']): RED — the clean agreeing fixture fails because run-plan's declared 'protocol-step' is absent from the literal; diagnostic (probed via tsx): "step review human_task offers selectable kind 'protocol-step' on surface 'run-plan', which that surface does not permit". Proves the registry is the authority. Raw: /home/brad/.humantask-htcschema-scratch/mutationB.txt

## Decisions (reversible, from code)
- Optional 3rd parameter on lintJourneyDocument (registry only gates when passed). Rationale, verified first-hand: journeyCompiler.ts (prohibited) calls the lint with 2 args and journeyCompiler.test.ts asserts `lintJourneyDocument(plan, CATALOGUE).ok === true` on human_in_the_loop steps WITHOUT human_task (3 call sites, lines 141/156 + arm (b) fixture). A mandatory registry would break the 15/15 baseline or force edits to a prohibited file. The Ajv schema gate (shape, incl. closed human_task) always runs; the registry AGREEMENT is what needs the registry and is gated on its presence. Compiler wiring (passing the real registry) is a later unit's step — this unit's observable is the lint diagnostic set (acceptance waived, data-only unit).
- output_port pinned to CommittedRecordReference: completion.receipt_required is pinned true, and the port vocabulary's only receipt-carrying reference is CommittedRecordReference (journey-port.schema.yaml:70-78). No new port vocabulary created.
- Diagnostic shape: rule + message + step_id (no index/next_step_id — single-step rule); matches JourneyDocumentLintDiagnostic.

## Deviations (brief vs. implementation; both in brief's own favor)
- D1: brief step 5 says "export the three RULE_* constants" but its own arms (a)-(d) require FOUR distinct rule names (missing / unexpected / surface_unknown / kind_not_selectable). All four are exported from humanTaskContract.ts and re-exported by journeyDocumentLint.ts. The "three" is read as the brief counting the two-arms it named in step 1 (i)+(ii) plus (d); nothing named in the brief is missing.
- D2: environment — the worktree shipped with no node_modules; `pnpm install --frozen-lockfile` at repo root (lockfiles byte-identical to the main checkout /home/brad/git/computable-lab; pnpm 12.3.4, shared store, 3s, 877 packages). Baseline re-measured GREEN there before any edit (2 files / 15 tests).

## Not changed (verified): the three existing rules' names/messages, port chaining order, schema-gate-first ordering, journeyCompiler.ts manifest shape, every existing fixture, and all prohibited files (git diff HEAD~3..HEAD touches only the 5 owned files).

## Next actions (owners outside this unit)
- Unit 2/3: completion-receipt path (criterion a), role refusal (b), client task renderer — the latter carries the browser criteria. Wiring: journeyCompiler/server callers pass the real SurfacesRegistry as the third lint argument when the human-task gate must run end-to-end (decision above).

## Recovery
Receipts: /home/brad/.humantask-htcschema-scratch/{red-run.txt,mutationA.txt,mutationB.txt,tsc.txt,probe.ts,probe2.ts}. Scratch dir is outside git per brief.

L2-JOURNEY-HUMANTASK-1 UNIT htc-schema DONE 0dc9a1de6a2020767081672929efc2330a61f1fc
