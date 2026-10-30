# Lane 1 — tick 196 · 2026-10-30T14:40–15:58 EDT

## WIDGET-R1: fix-run-1 ADV-ACCEPTED + ORCH-VERIFIED + MERGED (77726016) -> fix-run-2 LANDED widget layer but STOPPED correctly at a NEW client-data-path platform gap -> architect routed ARCHD3L1T1440

## Reconciliation (all first-hand)

1. **Fix-run 1 (D3+D1) EXITED 14:23 with DONE bc8a4e10.** Adv waiter-v2 fired on death,
   review `reviews/WIDGETR1fix1-adv1-l1t1355.md` **VERDICT: accept** (scope fence clean —
   4 files; RED reproduced on base by reviewer; taptab 6-fail base-parity debt accepted on
   the input-identity argument; OBS-1 `violations.length` unguarded = same idiom as the
   pre-existing `validation.errors` branch, non-defect).
2. **ORCH SELF-VERIFY PASSED** (not the summaries): diff opened (ArrayWidget prop widened
   `| null` + `itemHint != null` guard with the FieldRow-default rationale; errors.ts appends
   lint violations `[ruleId] message` AFTER the 403/401 branches, validation branch and
   RecordCreatePanel untouched); orch re-ran the two targeted suites: **14/14 green**;
   `diff --name-status cl/integration-1...HEAD` = exactly the 4 briefed files.
3. **MERGED** `--no-ff` into cl/integration-1 -> **trunk 77726016**. No YAML in diff -> no
   restart. :3092/:5192 both 200; served :5192 `ArrayWidget.tsx` contains the merged guard
   (curl grep hit) — the served checkout carries the candidate.
4. **Fix-run 2 (architect OPT-A) fired 15:00:30 by the chain unit, slot-0, PID 2452452;
   EXITED 15:28 `STATUS: requires-rescope`** — NOT a crash, NOT a defect cycle:
   - Steps 1–5 of the ruling ALL landed in-boundary: commits b913db40 (RED tests) + 82f7cd3a
     (impl: self-recursive `ArrayItemHintField` in types.ts, `mapHintFieldsToObjectFields`
     recursive forward in ArrayWidget, nested-ObjectWidget render branching ONLY on non-empty
     `fields`, D4 `type="button"`). Unit proof RED->GREEN 4/4 including an Ajv-clean leg that
     reads the REAL assertion.ui.yaml hint shape, flat-parity pin, depth-2 leg. tsc 12=12
     zero-new.
   - NEW PLATFORM GAP found outside its hard boundary: the CLIENT-SIDE projection mapper drops
     nested item-hint `fields` before the widget sees them —
     `documentMapper.ts:263-280` (itemHint map) + `:171-183` (slot.items type has no `fields`
     member) + `:235-245` (objectConfig map, identical gap) + `WidgetRenderer.tsx:111`
     (prop type) `+308-317` (objectProperties map). Server side is ALREADY self-recursive
     (`server/src/ui/types.ts:86-88` FieldHint; EditorProjectionService forwards slot.items
     verbatim) — so this is a pure client-side flatten that violates the ui.yaml declaration.
     Worker's raw probe: `PROBE roles nested fields DROPPED = true`. Without the data-path leg,
     the C2 browser re-run provably still fails as gate shot 36. context_refs passed the gate
     only because its hint fields are flat.
   - Per the stop-boundary rule the worker did NOT absorb the gap and returned requires-rescope
     with the exact minimal proposed change. No DONE marker -> the pre-armed adv waiter
     correctly no-op'd (no review was written; the fired run exited on the missing-report
     guard — check `logs/advreview-widgetr1fix2-l1t1420.log` shows no review file; confirmed
     no `reviews/WIDGETR1fix2-adv1-l1t1420.md` exists).
5. **ARCHITECT ROUTED** ARCHD3L1T1440: request
   `/home/brad/.hermes/cl/lanes/1/decisions/WIDGETR1-D3-datapath-request-l1t1440.md` (facts +
   worker-cited drop points + minimal fix + OPT-A recommended; cycle-budget note filed: the
   ruling-premise gap is a scope amendment, not a 3rd defect cycle). Unit
   `arch-widgetr1-d3-l1t1440` started **15:49:34** (thunderbeast headroom; PID 2566813 family).
   **Watch path**: `/home/brad/.hermes/cl/lanes/1/decisions/WIDGETR1-D3-datapath-answer-l1t1440.md`.
6. **Fleet at checkpoint**: slot-0 FREE (fix-run 2 exited 15:28; pid file WIDGETR1FIX2L1T1420-
   2452448-15:00:30 dead). slot-1: lane-2 LABSTATE-fix3 (2155105, started 12:41:36 — likely
   gone; lane-2's business). tb-bg slot-0 LEGD composer alive, slot-1 LEGE alive (both lane 2).
   Vision: all locks free. Stagger for next coder launch: earliest fleet-wide = 16:00:30
   (last :18080 launch 15:00:30) — OR earlier if no live coder exists (stagger gates fresh
   launches vs the last launch; next tick verify slot pid files per the rule as written).
7. **Watches**: id-mint answer file STILL ABSENT (provisional D-A+R-1 stands, AS-L1T176-1).
   GC-14 dossier witness UNCHANGED (W28-A5k sha f43da24dea…, mtime Oct 25 12:32) — Brad's
   review question stands, NOT re-asked. D3-datapath answer (new watch above).

## In flight (do NOT duplicate)

- **Architect ARCHD3L1T1440** — unit arch-widgetr1-d3-l1t1440 (started 15:49, expect ≤45 min;
  2x-watch ~16:40). Answer path above.
- **Branch wt/widget-r1-lane1-l1t0510** carries UNMERGED fix-run-2 commits (b913db40+82f7cd3a).
  Do NOT merge them until the data-path leg lands (or architect OPT-B re-scopes) AND the final
  whole-branch adv review accepts.

## NEXT TICK — in order

1. Read the D3-datapath answer.
   - OPT-A: dispatch ONE data-path run — worktree SAME (wt/widget-r1-lane1-l1t0510), same
     branch; boundary: app/src/editor/taptab/documentMapper.ts, extensions/WidgetRenderer.tsx,
     +1 documentMapper test leg; forward nested `fields` recursively (import ArrayItemHintField
     from taptab/types.ts), conditional-spread pattern, no names/branches on fields; verify
     taptab suite + tsc 12-baseline. Stagger-gate per fleet rule. Prompt token
     WIDGETR1FIX3L1T<hhmm>; unique report `deliverables/widget-r1-report-l1t<hhmm>-fix3.md`;
     arm adv waiter ON THE DONE MARKER ONLY (v2 pattern: export PATH, prompt-file guard).
     End-to-end proof for this run: `PROBE roles nested fields DROPPED = false` via the same
     probe id + documentMapper two-level test leg.
   - OPT-B: partial-accept widget layer, fold data-path to a NEW approved item (C2 stays NOT
     evidenced; A7b cannot close; record blocker structure on WIDGET-R1).
   - OPT-C: architect would amend the ui.yaml — route back to Brad (schema-intent change).
2. After the data-path commit lands: FINAL whole-branch adv review
   (reviews/WIDGETR1fix3-adv-l1t<hhmm>.md; prompt pre-written at
   prompts/advreview-widgetr1fix2-l1t1420.txt — copy and re-token to the final run, review
   subject = full branch vs trunk 77726016). ACCEPT -> orch self-verify (diff vs 77726016 =
   ONLY taptab owned files; re-run targeted suites; app tsc zero-new) -> merge -> FULL C1-C6
   browser re-gate at NEW receipts ts on :5192 (prompt copy
   prompts/browser-WIDGETR1-A7b-dispatch-l1t1255.txt amended: new trunk revision, defect-0
   probe must now ALSO assert nested-fields survive into attrs — probe line: the served
   documentMapper.ts contains the recursive fields forward). C2 must author ROLES through the
   widget this time.
3. On A7b accept: WIDGET-R1 -> done (mark + handoff), then GC-14 close-out re-gate (A6
   ANREV-DREADER-1 data leg + A7a cite RUN1 + lint-refusal + console legs; A7b evidence =
   accept receipts). GC-14 itself still awaits BRAD REVIEW of the dossier — do not close
   GC-14 on the re-gate alone.
4. Continue id-mint decision watch + dossier unchanged-check every tick.
5. No spec-composer dispatch (no next-ready approved item; zero todo rows).

## assumptions:

- AS-L1T196-1 (evidence_debt=false): fix-run-1 D1 live proof on coder's :5174 dev instance of
  the same worktree code is honest evidence pending the :5192 re-gate leg (served-module probe +
  real 422 banner ruleId + guard now served on :5192).
- AS-L1T196-2 (evidence_debt=TRUE): fix-run-2 widget layer accepted-in-principle on unit proof;
  end-to-end depends on the data-path leg — clears at the A7b re-gate C2 pass.
- AS-L1T195-1 stands (merged). AS-L1T195-2 CLEARED (OPT-A executed; its stop at the new gap is
  superseded by AS-L1T196-2). AS-L1T195-3 stands (D5/D6 minors tracked; D6 CSS-only, out of
  every current boundary).
- CARRIED OPEN: AS-L1T176-1 (id-mint provisional D-A+R-1, decision file absent 15:55).
  AS-L1T186-1 carried. AS-L1T194-1/3 stand; AS-L1T194-2 stays OPEN — clears at A7b ACCEPT
  receipts.
- CARRIED (evidence_debt=false): AS-L1T193-1/2, AS-L1T191-1, AS-L1T190-1/2, AS-L1T187-1/2/3,
  AS-L1T188-1/2, AS-L1T189-1/2/3, AS-L1T185-1/2, AS-L1T184-1, AS-L1T183-1/2, AS-L1T181-1,
  AS-L1T180-1/2, AS-L1T179-1/2, AS-L1TICK174-1/2, AS-L1T2100-1, AS-L1T1505-1/2,
  AS-L1T172-1/2, AS-L1T173-1/2, AS-L1T177-1.

## evidence debt (open):

- AS-L1T1430-1 — WI-5 value proof: clears if the GC-14 close-out re-gate screenshots a method
  editor with real values. Carried.
- AS-L1T194-2 — evidence-leg hybrid: clears at A7b gate ACCEPT receipts. Carried.
- AS-L1T196-2 — nested-authoring end-to-end: clears at the A7b re-gate C2 pass (widget-authored
  roles objects at :5192). NEW, carried.
