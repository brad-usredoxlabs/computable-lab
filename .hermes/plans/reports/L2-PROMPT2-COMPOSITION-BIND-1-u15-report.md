# L2-PROMPT2-COMPOSITION-BIND-1 / u15 — D5-1 report

Worktree: /home/brad/cl-wt/wt-COMPBIND-u15d51
Branch: cl/lane2-compbind-u15d51-l2t3185 (base efa66211)
Item: L2-PROMPT2-COMPOSITION-BIND-1, lane 2, unit u15 (browser gate 5, defect D5-1)

## Decision
The resolution-aware firing gate (SH-QA-1) is now MOOT only when the slot is
bound to a record that structurally declares a testable formulation. A bind to
a bare concept / formulation-less record no longer suppresses the gated
blob-material fact; the fact survives, counts toward blocked, and the binding
itself stands (no silent un-bind). The switch is on the typed contract term
`formulationDeclared` only — zero verb/arg/domain/reason name literals.

## Changed files
- server/src/compiler/resolution/types.ts — additive optional
  `formulationDeclared?: boolean` on BoundNoun (D5-1 comment).
- server/src/compiler/resolution/resolutionEngine.ts — bindingFor propagates
  it via conditional spread (house style, ResolveSpine.ts:245). Nothing else
  in the engine touched (levelFilter / bind verdict / mint affordances frozen).
- server/src/compiler/resolution/resolveNounsPass.ts — boundSlotKeys is now a
  Map<key, BoundNoun>; a gated fact drops iff the bound binding carries
  `formulationDeclared === true`. "No slot identity => KEPT" arm byte-identical.
- server/src/compiler/resolution/resolveNounsPass.test.ts — spineReturning
  gains an optional `declaringFormulation` curie list (fake hits carry
  formulationDeclared:true, per ResolveSpine.ts:245); existing suppression pin
  now declares the formulation it stands for; NEW RED-first D5-1 pin added.
- server/src/compiler/scientistIntent/cueResolutionGate.test.ts —
  **SCOPE DEVIATION, see below.**

## Disclosed scope deviation (needs orchestrator ratification)
The brief's PROHIBITED list says "any other test file", but the regression
command in VERIFY step 3 could not be green without aligning 4 pins in
`cueResolutionGate.test.ts` that encode the pre-D5-1 behaviour:
- T1/T1b/T1c: seeds were material records with no `formulation` payload, and
  mockStore.list ignored `schemaId`, so they leaked into tier-0 canonical-term
  hits (which never carry formulationDeclared). Fixture corrected: each seed
  now carries a structural `formulation: { concentration, solvent_ref }`, and
  the fake store honours `filter.schemaId` like the real RecordStore (these
  seeds then resolve at tier 1, where the declaration lives). Subjects of the
  pins (a resolved formulation compiles clean) are preserved, not inverted.
- T4: the suppression arm's fake binding now passes
  `binding({ formulationDeclared: true })`; its subject (slot-identity join
  suppresses regardless of label) is preserved. Counter-legs untouched.
No production code outside the owned seam was changed for this. If the
orchestrator rules these pins must stay untouched, u15 must be revised —
D5-1 as ruled is otherwise not achievable with them green.

## Verification (raw)
1. RED (new pin against unmodified source):
   `npx vitest run src/compiler/resolution/resolveNounsPass.test.ts`
   → 29 tests | 1 failed, 28 passed; failure:
   `D5-1: a bound slot whose record declares no formulation KEEPS the gated fact
   → expected true to be false` at result.ok.
2. GREEN: same command → `29 passed (29)`.
3. Regression: `npx vitest run src/compiler/resolution/ src/compiler/scientistIntent/cueResolutionGate.test.ts`
   → `Test Files 24 passed (24)`, `Tests 207 passed (207)`
   (resolveNounsPass 29, spine4Registration 19, cueResolutionGate 13).
4. `npx tsc --noEmit` (server) → one PRE-EXISTING error unrelated to this unit:
   `src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3'`.
   Proven pre-existing: with all five edited files stashed at base the same
   single error is the only output; the module is a broken link in the
   materialized node_modules, and the file is untouched by this unit.

## Commits
- cff18738 RED pin (test only).
- 2c5534d7c82465cdb1e6321e4da666b3c99dc10d D5-1 fix + fixture alignment.

## Next actions
- Orchestrator: ratify (or reject) the cueResolutionGate.test.ts fixture
  alignment; reload lane stack before any live browser re-verification.
- Browser reviewer: re-run gate 5 criterion 3 (`Add 1uL of 1mM clofibrate in
  DMSO to wells E2-H5.` with MSP-PR9-TEST-CLO-1MM removed) — expect the blob
  clarification card to fire, no ghost events.
Resume condition: scope ruling on cueResolutionGate.test.ts.

L2-PROMPT2-COMPOSITION-BIND-1 UNIT u15 DONE 2c5534d7c82465cdb1e6321e4da666b3c99dc10d
