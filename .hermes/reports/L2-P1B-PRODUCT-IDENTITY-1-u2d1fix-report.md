# L2-P1B-PRODUCT-IDENTITY-1 / unit u2d1fix — report (chat labware gate seam fix)

Lane 2 · branch `cl/lane2-p1b-product-identity-u1-l2t2701` · base `180cbac54d5844db1db830a07948271d658b4895`
Item: L2-P1B-PRODUCT-IDENTITY-1 unit u2d1fix (1 of 1) — merged advc D1
(`/home/brad/.hermes/cl/lanes/2/reviews/L2-P1B-PRODUCT-IDENTITY-1-merged-advreview-l2t2706.md`).

## What was implemented

The chat `create_record` labware gate in `server/src/ai/AgentOrchestrator.ts` refused only when
`source === 'user-description'`, while `source` is optional in the shipped tool schema
(`submitSuggestionTool.ts:330` requires only `kind`+`name`). A model that omitted attribution
(PROBE_A) or cited `exa:<url>` (PROBE_B) took the SUCCESS arm and a generic labware preview —
the behaviour corpus prompt-1b declares disqualifying.

The predicate now refuses when `c.kind === 'labware'` AND the source does NOT identify an
existing product record: `!(typeof c.source === 'string' && c.source.startsWith('record:'))`.
Absent source, `'user-description'`, and `'exa:<url>'` all take the refuse-and-route arm
(success:false, error naming the "+ New product" modal on /lab/labware and /lab/labware/new,
no `recordCreations` emitted). Only `source: 'record:<id>'` (an existing product record) is
handed to the client — that leg stayed green throughout.

`source` stays the one authority (AC-A). The tool schema was NOT touched (source stays
optional; no vendor fields) — PROHIBITED items (submitSuggestionTool.ts, app/**, schema/**,
*.ui.yaml, event-editor) untouched. The refuse-and-route message: the lead clause was
corrected to state the real contract (the old lead only described the user-description case,
now factually stale for the other two refused states; the brief permits the lead clause);
the next-step sentence ("Identify or create that product first: open the "+ New product"
modal…") is verbatim unchanged. The block comment above the predicate was updated to match
the new contract.

Two orchestrator-level legs added to `server/src/ai/createRecordIntent.test.ts` (modelled on
the existing P1B legs, `labware: 'Thermo Optical-Quality Imaging Plate A58941'`, 384-well):
- E1: NO `source` → success:false, recordCreations empty, events empty, error names the next step.
- E2: `source: 'exa:https://example.invalid/a58941'` → same refusal.

## Changed files (2, within budget)

| file | commit | delta |
|---|---|---|
| `server/src/ai/createRecordIntent.test.ts` | 448a64b39 (RED) | +119 |
| `server/src/ai/AgentOrchestrator.ts` | 168ee73c6 (fix) | +12 / −10 |

Diff vs base `180cbac54`: exactly these two files.

## Commits

1. `448a64b398836cc1c437a06c0160e394248161d3` — test: RED legs E1/E2
2. `168ee73c61705478ba7fa1ee08d55091fc1e80dc` — fix: predicate flip (GREEN)
3. (this report commit — SHA below in the DONE line)
4. DONE line + marker file `.hermes/markers/L2-P1B-PRODUCT-IDENTITY-1-u2d1fix-DONE`

## Verification (raw, on this branch)

Baseline at base `180cbac54`, `cd server && npx vitest run src/ai/createRecordIntent.test.ts`:
```
 ✓ src/ai/createRecordIntent.test.ts  (13 tests) 64ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

RED at `448a64b39` (new legs only, same command):
```
 FAIL  src/ai/createRecordIntent.test.ts > the orchestrator hands creations to the client > L2-P1B-PRODUCT-IDENTITY-1 u2d1fix E1: REFUSES a labware create_record with NO source (no generic preview proposal)
AssertionError: expected true to be false // Object.is equality
 FAIL  src/ai/createRecordIntent.test.ts > the orchestrator hands creations to the client > L2-P1B-PRODUCT-IDENTITY-1 u2d1fix E2: REFUSES a labware create_record sourced to an exa url (no generic preview proposal)
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 13 passed (15)
```
Failure shape is exactly the D1 defect: both probes received `success: true` + a generic
recordCreation.

GREEN at `168ee73c6` (final code state, same command):
```
 ✓ src/ai/createRecordIntent.test.ts  (15 tests) 79ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```
Arm check (same run, agent log lines): the refuse-and-route error string
("is not something chat can author as a bare generic definition") appears 3× — the
existing user-description leg + E1 + E2 — and `done create_record success=true records=labware`
appears exactly 1× (the product-IDENTIFIED `record:<id>` leg still handed to the client).

Typecheck, `cd server && npx tsc --noEmit` (server/tsconfig.json excludes `**/*.test.ts`;
root tsconfig is project-references only): exit 0, zero output, **0 errors — measured at
base `180cbac54` AND at final `168ee73c6`** (both before and after the change).

## Deviations / stale-brief findings (disclosed, no silent fix)

1. **Typecheck baseline: the brief's "exactly 6 pre-existing errors in server/src/api +
   server/src/sequences" did not reproduce.** Measured 0 errors at the stated base commit and
   0 after the change. Reported as measured; nothing was weakened — the gate is simply
   strictly better (0 ≤ 6, and the delta introduced by this unit is 0).
2. The message lead clause was corrected (see above); permitted by the brief
   ("do not rewrite its message beyond the lead clause").
3. Marker mechanics: a commit cannot contain its own SHA, so — per the lane precedent
   (u4guard: report `e40e4d7d3`, marker commit `91159b967` on top) — the DONE line and the
   marker file were committed in the follow-up commit; the line names THIS report's commit,
   which contains this report.
4. Output budget: 131 inserted lines total (119 test + 12 orchestrator) vs the 120-line
   guideline; the two spec-mandated test legs drove the count. Files: 2 ≤ 2.

## Next actions

- Orchestrator/browser reviewer: the item-level browser gate (journey-milestone drive on
  :5193) is unchanged and owned by the orchestrator — not attempted here. Server TS changed
  (no YAML changed → no lane-stack reload needed), so restart the lane's server before live
  verification of the refusal text on the chat surface.
- Advc D2 (*.ui.yaml debt) is filed separately — out of scope for this unit.

## Residual risk

None known: the predicate change is confined to the one `creations.find` in the
`create_record` branch; equipment/material creations are unaffected (kind-guarded), and the
`record:<id>` handoff is covered by an existing leg that stayed green.

L2-P1B-PRODUCT-IDENTITY-1-u2d1fix UNIT L2-P1B-PRODUCT-IDENTITY-1-u2d1fix DONE f1f0a4ed66c6246a1d7d267c9e3ad20edf73fab0
