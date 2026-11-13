# L2-JOURNEY-HUMANTASK-1 — unit htcreceipt (2 of 3, re-run htcreceipt3) — implementation report

- worktree: /home/brad/cl-wt/L2-JOURNEY-HUMANTASK-1-htcschema-lane2
- branch: cl/lane2-journey-humantask-htcschema-2345
- base: ba1bd4e4b930f54553a78178799918cfe6b66400 (step-0 verified: human-task.schema.yaml + humanTaskContract.ts present, grep -c selectable_kinds = 3)
- coder: cl-coder lane 2, 2026-11-13

## Commits (one per numbered step; no history rewritten)
1. 4e63091a — RED tests (module absent) — raw RED: "Failed to load url ./humanTaskCompletion.js ... Test Files 1 failed (1) / Tests no tests"
2. 359ac7e6 — schema/workflow/human-task-receipt.schema.yaml (NEW, closed, self-contained)
3. 18929df0 — decideHumanTaskCompletion (pure decision) + a4bcb39f arm-(f) ajv-formats fix (strict:true rejects an unregistered `date-time` format; shipped AjvValidator precedent uses ajv-formats — same single Ajv instance)
4. 867d7edb — probe: arm (a) fixture reversed so the sorting mutation is a live RED
5. cf9dec9b — OUTPUT-BUDGET trim: 260 lines total, behaviour unchanged (8/8 re-run after trim)

NOTE: commits 6ddebf53..2df2a6bc (humantask htcdispose3) interleaved from the parallel overflow worker on this branch. My VERIFY ran on the combined tree; my owned files are exactly the three below.

## Changed files (3, 260 lines total — budget met)
- schema/workflow/human-task-receipt.schema.yaml (NEW, 31 lines) — draft 2020-12, own $id, additionalProperties:false closed; required [kind(const human-task-receipt), task_id, record_id, member_refs(minItems 1, items closed over record_id+revision_id, both minLength 1), completed_at(format date-time), schema_id]. SELF-CONTAINED by design: mirrors the ref.schema.yaml fields rather than cross-directory $ref (unit 1's precedent; the brief mandates this). No roles/approvals/tiers.
- server/src/compiler/journey/humanTaskCompletion.ts (NEW, 89 lines) — one pure function decideHumanTaskCompletion; five RULE_* journey_human_task_* exports; fixed order kind-unsupported -> no_selection -> not_committed -> kind_mismatch -> member_unversioned -> receipt, one diagnostic per refusal; contract narrowed locally as unknown; kinds read FROM the contract (no literal list); completed_at from injected now (no clock); envelope identity read as recordId; committed+drafted = committed (docstring).
- server/src/compiler/journey/humanTaskCompletion.test.ts (NEW, 140 lines) — arms (a)-(h), RED-first.

## VERIFY (raw)
- vitest humanTaskCompletion.test.ts -> "Test Files 1 passed (1) / Tests 8 passed (8)" — exact number: 8.
- vitest journeyDocumentLint.test.ts -> "Test Files 1 passed (1) / Tests 5 passed (5)" — unchanged baseline.
- tsc --noEmit -> 0 lines (exit 0).
- git -c core.fileMode=false status --short -> empty (clean at exit; scratch worktree + dir removed).

## MUTATION PROBE (each on its own, scratch worktree at the final tree; reverted before commit)
- A (drop `record === undefined` branch): "FAIL ... (b) a staged draft with no committed record is refused as not committed / Tests 1 failed | 7 passed (8)" — arm (b) RED as required.
- B (sort member_refs by id): "FAIL ... (a) committed record with versioned members yields a receipt in member order / Tests 1 failed | 7 passed (8)" — arm (a) RED (fixture in reverse id order made this live).
- C (selectable_kinds = ['well','material'] literal): arm (d) RED — "FAIL ...(d) ... / Tests 5 failed | 3 passed (8)" (d RED as required; a/e/f/g also fall because protocol-step is outside the literal — proves the hardcode is dead).

## Deviations / notes for the gate
- Arm (f) compiles the schema with `new Ajv2020({strict:true, allErrors:true})` + `addFormats(ajv)` on the SAME instance (server/src/validation/AjvValidator.ts precedent); strict:true throws on `format: date-time` otherwise. Still one Ajv, one reader.
- Zero-member committed record reuses the member_unversioned rule (brief lists five rules; empty members = "no pinned selection" belongs to that refusal). No arm exercised it.
- htcdispose3 (unit 3) landed on this branch concurrently; nothing of mine touches its files.

## Blocker bookkeeping
None. All eight arms green; budget met at exactly 260 lines.

L2-JOURNEY-HUMANTASK-1 UNIT 2 DONE cf9dec9b648aa516f42dd8996ccaca372c4dd7e3
