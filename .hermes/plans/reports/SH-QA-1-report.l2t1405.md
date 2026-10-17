# SH-QA-1 — coder report — lane 2 — l2t1405

Branch: `cl/SH-QA-1-lane2-l2t1405` (worktree `/mnt/vast/home/brad/git/wt/SH-QA-1-lane2-l2t1405`)
Base (branch point): `b398db034e8027a9da06063132dee6be6654705b` (cl/integration-2 tip at dispatch)
RED commit: `e99ea5ce` (tests-only) — GREEN commit: `660226f7`
Spec: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-15_1105-SH-QA-1-cue-cascade-spec.md` (read fully; OQ1/OQ2/OQ3 rulings followed)

## Goal achieved

The mixture-cue blob bar now fires ONLY on material labels the resolution engine does NOT bind; the chat answer→fact join is keyed by fact CONTENT (not array position); the auto-satisfy ledger closes every re-derived fact for an answered action+argument. The clofibrate " in " cascade is dead at the root (proven headlessly by T1 + T6).

## Per-change table

| File | Change |
|---|---|
| `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` | Raise-site split: blob-bar fact pushes onto a new gated list; `ScientistIntentNormalized` gains `resolutionGatedClarifications?` (conditional spread only). Cue MATCH untouched (100% DATA, `mixtureCuesFound`); all other producer reasons byte-identical on `clarifications`. |
| `server/src/compiler/resolution/resolveNounsPass.ts` | The resolution-aware gate inside `run()`: new dep `resolutionGatedClarifications`; post-`resolve()`, bound SLOT keys computed from `engine.bindings` (identityKey, same machinery as `reconcileModelUnresolved` §5.1); gated facts whose `identityKey` is a bound slot key are DROPPED; survivors APPENDED after engine+required+model facts (golden order); gated fact WITHOUT actionLocation KEPT. Zero verb/arg/domain/reason NAME literals added (B4). No new diagnostic key (B3). |
| `server/src/compiler/scientistIntent/compileScientistIntent.ts` | Plumbs `normalized.resolutionGatedClarifications` into `createResolveNounsPass` (conditional spread); stops appending gated facts at the merge point (ungated producer facts still append verbatim). |
| `server/src/ai/shorthandChat.ts` | `factRequestId(fact)` = `unresolved-c-<10-hex sha1 of JSON [actionIndex, action, argument, reason, LABEL]>` (label INCLUDED — B5/COMP-4 siblings); `unresolvedFactRequestId` positional mint retired from the map (legacy digits arm KEPT in the fold as pinned fallback-only, OQ2); `HeldShorthandIntent.answeredSlots?`; `foldAnswersIntoShorthand` resolves answers via the content-key map (exact match wins), returns `answeredSlots`; new exported `dropSatisfiedFacts(facts, ledger, doc)` (drop iff slot in ledger AND slot value verbatim-equals ledger label; no-actionLocation facts never dropped). |
| `server/src/ai/AgentOrchestrator.ts` | Fold leg ONLY: after recompile, ledger = prior held ledger + this fold's answered slots, but a slot is ledgered ONLY iff the re-derived bar carries NO fact for that slot identity (still-barred slot never ledgered — B6); `dropSatisfiedFacts` applied to `compiledFold.clarifications` BEFORE building requests AND BEFORE the re-hold; re-hold carries `answeredSlots` (conditional spread). No other leg touched. |
| `server/src/compiler/scientistIntent/cueResolutionGate.test.ts` (NEW) | T1/T1b/T1c (clofibrate + siblings, seeded → complete), T2 (genuine blob still bars, order unknown-noun→blob, message cites `" in "`, store.list() []), T3 (channel split), T4 (engine-stub identity legs + no-actionLocation KEPT), T5 (COMP-4 composition siblings survive). |
| `server/src/ai/shorthandChat.cueCascade.test.ts` (NEW) | T6 fold-loop regression (the Brad trap), T7 auto-close same action+argument, T8 `dropSatisfiedFacts` ledger semantics, T9 content-keyed join (order-flip, COMP-4 sibling distinct ids, legacy digits fallback, garbage-id null contract, answeredSlots). |
| `server/src/compiler/resolution/resolveNounsPass.test.ts` | Extended: 4 pass-level gate legs incl. bar ORDER (gated survivor lands AFTER engine+required+model facts) + no-actionLocation KEPT. |
| `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` | Extended: 422 round-trip id pin → `factRequestId(unresolvedFact)`; deterministic-fold answer uses the minted content id; NEW fold-leg ledger test (re-hold carries `answeredSlots` for the closed slot only; still-barred labware re-ask survives). |
| `server/src/ai/shorthandChat.e2eStubHonesty.test.ts` | Extended honestly (sanctioned id-format change): `comparable()` compares ids by POSITIONAL RANK (payload-shape pin preserved); the legacy-head id pin now asserts the CONTENT id of the first bar fact (format pinned, not hidden). Three-bar canon leg (reasons `[unknown-noun, unknown-noun, unrealized-mixture-blob-material]`, labels `[plate, 50:50 Trypsin-EDTA/DMEM, 50:50 Trypsin-EDTA/DMEM]`) passes UNCHANGED (B1). |
| `server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts` | Extended: `producerFacts()` reads both producer channels (channel-split); the GUARD blob-bar leg now compiles against an UNSEEDED store (the seeded blob label is exactly the false-positive this item kills — its fate is pinned in cueResolutionGate T1/T2). |
| `server/src/compiler/scientistIntent/compositionDecomposition.test.ts` | Extended: blob-bar characterization pins read both producer channels. |
| `server/src/compiler/resolution/compositionArgResolution.test.ts` | Extended: T4 blob-bar exemption/control legs read both producer channels. |

## RED → GREEN paste pairs

RED (commit e99ea5ce, tests-only; raws `shqa1-red-gate.txt`, `shqa1-red-cascade.txt`):

```
 Test Files  1 failed (1)
      Tests  9 failed | 4 passed (13)          # cueResolutionGate.test.ts
 Test Files  1 failed (1)
      Tests  10 failed | 2 passed (12)         # shorthandChat.cueCascade.test.ts
```

T1 RED signature: `expected [ { …(4) } ] to deeply equal []` — a blob fact on slot 0:material while the store clearly holds "1 mM Clofibrate in DMSO" (the blocker, reproduced headlessly). T6 RED: first bar lacks unknown-noun for the loose label variant + re-ask loop; `dropSatisfiedFacts is not a function`, `factRequestId is not a function`.

GREEN (commit 660226f7):

```
 Test Files  3 passed (3)   Tests  45 passed (45)     # cueResolutionGate + cueCascade + resolveNounsPass
 Test Files  1 passed (1)   Tests  24 passed (24)     # resolveNounsPass (gate legs)
 Test Files  11 passed (11) Tests  172 passed (172)   # must-stay-green pin: declaredArgumentReachability,
                                                     #   compositionDecomposition, compositionArgResolution,
                                                     #   e2eStubHonesty, AgentOrchestrator.shorthandChat,
                                                     #   shorthandChat.lift, clarificationContract x2,
                                                     #   goldens/, forceMaterialClarifications
 Test Files  11 passed (11) Tests  109 passed (109)   # goldens/ + vocabularyRipOut + vocabulary +
                                                     #   promptShapeParity + clarificationContract x2 +
                                                     #   nounResolution + hintParity + spine4Registration +
                                                     #   spine4ProductionWiring
```

T6 GREEN: turn 1 bars `[unknown-noun, unrealized-mixture-blob-material]` on slot 0:material (model.callCount 1); answer with the catalogued label → `clarificationRequests []`, events > 0, `details.material === '1 mM Clofibrate in DMSO'`, model still 1. Cascade dead.

## Targeted trio + full-suite failing-FILE-SET equality

Targeted (`src/compiler/resolution/ src/compiler/scientistIntent/ src/ai/`):

```
BASE (b398db03):  Test Files  11 failed | 114 passed (125)   Tests  19 failed | 1199 passed (1218)
HEAD (660226f7):  Test Files  11 failed | 116 passed (127)   Tests  19 failed | 1229 passed (1248)
comm -3 base-failfiles head-failfiles → EMPTY (11 identical pre-existing files)
```

Full suite (`npm run test:run -w server`, 2 base runs + 2 head runs; raws `shqa1-base-full-1/2.txt`, `shqa1-head-full-1/2.txt`):

```
BASE run1:  Test Files  108 failed | 609 passed | 9 skipped (726)      Tests  171 failed | 5769 passed | 70 skipped (6227)
BASE run2:  Test Files  108 failed | 609 passed | 9 skipped (726)      Tests  171 failed | 5769 passed | 70 skipped (6227)
HEAD run1:  Test Files  109 failed | 610 passed | 9 skipped (728)      Tests  171 failed | 5788 passed | 70 skipped (6246)
HEAD run2:  Test Files  108 failed | 611 passed | 9 skipped (728)      Tests  162 failed | 5799 passed | 70 skipped (6257)
comm -3 base-intersect(108) head-intersect(108) → EMPTY
```

Flap candidate DISCLOSED, not hidden: `src/ai/shorthandContractDisclosure.test.ts` appeared in head run 1 only; proven GREEN standalone (`shqa1-flap-shorthandContractDisclosure.txt`: 11/11 passed) — the known load-timeout flap class. The 108-file baseline at b398db03 is larger than the spec's 47-file figure measured at 532ec676 (trunk drift between the two tips; the spec's own discipline is fail-FILE-SET equality, which holds exactly).

Pre-existing environmental debt (identical in base AND head, untouched by this item): `realizationGolden.test.ts` — Ajv `can't resolve reference ./datatypes/revision-ref.schema.yaml from protocol.schema.yaml` (trunk-untracked schema datatype; same failure text in both raws).

## tsc

- server (`npx tsc --noEmit`): BASE 1 error (`AgentOrchestrator.ts(344,18) TS2339` — pre-existing at b398db03; the spec's "0" was measured at the older 532ec676). HEAD 1 error: the SAME error, line shifted to 345 by my one added import line. Set-diff: identical modulo the line shift → ZERO NEW. Raws `shqa1-tsc-base.txt`, `shqa1-tsc-head.txt`.
- app: NOT run — zero app/ changes proven by scope diff (below): `git -c core.fileMode=false diff --name-only b398db03..HEAD` contains NO `app/` path.

## Bait outcomes B1–B7

- **B1 gate does not blunt the bar**: T2 green (unresolved cue-bearing label with no composition bars; reasons ordered `['unknown-noun', 'unrealized-mixture-blob-material']` on the SAME slot; store.list() [] — no mint). e2eStubHonesty three-bar canon `[unknown-noun, unknown-noun, unrealized-mixture-blob-material]` with labels `[plate, 50:50 Trypsin-EDTA/DMEM, 50:50 Trypsin-EDTA/DMEM]` passes UNCHANGED — same-slot facts NOT merged.
- **B2 " in " not blunted + no per-record hardcode**: `git -c core.fileMode=false hash-object config/drafting/mixture-material-cues.yaml` = `8ab1eb70a299c1d35acfa473beb37715e32dd47e` BEFORE and AFTER (byte-identical; `diff --name-only` shows zero config/drafting paths; no exempt additions). Zero reagent/label/cue literals in changed non-test src (scan of added lines clean; the only "clofibrate" string in AgentOrchestrator.ts is a pre-existing comment at :399). Fixture labels live only in test SEED_RECORDS.
- **B3 no new wire/SSE shape**: `IntentCompileFromPromptHandlers.ts` and `MaterialGrounding.ts` and all of app/ untouched (diff shows zero such paths). `ScientistIntentUnresolvedFact` (types.ts) gains NO field. The pass diagnostic gains NO new key (survivors ride the existing `details.clarifications`). Only the `id` STRING format changed (app echoes verbatim; app-side grep shows no parser of `unresolved-`).
- **B4 gate is identity, not names**: added-lines scan of resolveNounsPass.ts contains no verb/arg/domain/reason name literals (only `'string'` typeof and the `blocked` identifier). T4 mutation-proof legs green: suppression follows boundKeys (binding with a DIFFERENT label suppresses; binding on a different slot does NOT suppress; no binding survives). Gated fact WITHOUT actionLocation KEPT (pinned at both unit and pass level).
- **B5 join key completeness**: key includes `label`; T9 pins COMP-4 same-slot siblings get DISTINCT ids, content id survives a held-array order FLIP (splices the right slot), legacy `unresolved-2` digits id still folds positionally (fallback-only; a content id never matches the digits arm), garbage id ⇒ null (null contract pinned).
- **B6 ledger does not swallow legitimate asks**: T7 (still-unbound plate card re-asked; ZERO cards for the answered material slot), T8 (edited slot value re-opens; ledger label ≠ slot value never drops; no-actionLocation fact never dropped; empty ledger = identity), fold-leg test (still-barred slot NOT ledgered; ledger carried into re-hold only for closed slots). Existing malformed-payload extraction-only re-ask test stays green.
- **B7 MANIFEST/bless**: `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` = `fbf743ab1384778de43eeb113da0f0857eef9fce` BEFORE and AFTER (identical). No golden fixture added; `diff --name-only` shows no goldens/ or MANIFEST path; goldens suite green (109/109 pin run).

## Scope diff (git -c core.fileMode=false diff --name-only b398db03..HEAD)

```
server/src/ai/AgentOrchestrator.shorthandChat.test.ts   (owned: existing chat harness extended)
server/src/ai/AgentOrchestrator.ts                      (owned: fold leg only)
server/src/ai/shorthandChat.cueCascade.test.ts          (new test)
server/src/ai/shorthandChat.e2eStubHonesty.test.ts      (existing chat harness extended)
server/src/ai/shorthandChat.ts                          (owned)
server/src/compiler/resolution/compositionArgResolution.test.ts (must-stay-green harness extended)
server/src/compiler/resolution/resolveNounsPass.test.ts (owned: gate legs)
server/src/compiler/resolution/resolveNounsPass.ts      (owned)
server/src/compiler/scientistIntent/compileScientistIntent.ts (owned)
server/src/compiler/scientistIntent/compositionDecomposition.test.ts (must-stay-green harness extended)
server/src/compiler/scientistIntent/cueResolutionGate.test.ts (new test)
server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts (cue-data suite extended)
server/src/compiler/scientistIntent/normalizeScientistIntent.ts (owned)
```

Subset of the owned set + §Test-plan files + the two existing chat/normalizer harnesses (spec-sanctioned "extended, not rewritten"). ZERO app/, schema/, config/drafting/, goldens/, MaterialGrounding.ts, IntentCompileFromPromptHandlers.ts paths.

## OQ3 (held-422 arm) — evidence and disposition

Per the ruling, the ledger is chat-held-intent-only. My RED work did NOT surface a 422-arm re-ask of a disappeared fact: the 422 route (`IntentCompileFromPromptHandlers.ts` :343-351 at base) sends `compile.clarifications` verbatim and holds `localMacro` with NO server-side fold leg — there is no server-side re-derive loop on that route to re-ask anything. Nothing to hand back; the route stayed a verbatim passthrough (zero diff). If the orchestrator later wants ledger semantics on that arm, it remains a wire-protocol conversation (stop_boundary), not an implementation gap found here.

## Assumptions recorded (consequential, explicit)

- AS-L2T1405-1: server tsc baseline at MY branch point b398db03 is 1 pre-existing error (AgentOrchestrator.ts:344 TS2339), not the spec's 0 (measured at 532ec676). Zero-new proven by set-diff (same error, line 344→345 shift from my import).
- AS-L2T1405-2: full-suite failing-file baseline at b398db03 is 108 files (stable across 2 runs), larger than the spec's 47 at 532ec676 — trunk drift; fail-FILE-SET equality is the discipline and holds.
- AS-L2T1405-3: the spine's naked matching BINDS "1mM Clofibrate in DMSO" against the seeded "1 mM Clofibrate in DMSO" (measured via probe: single blob fact, no unknown-noun). The T6/T7 cascade fixtures therefore use the measured-UNBOUND first-pass label "the clofibrate in DMSO" to reproduce the shipped two-fact first bar honestly.
- AS-L2T1405-4: `realizationGolden.test.ts` fails identically at base and head (Ajv revision-ref.schema.yaml resolution) — pre-existing environmental debt, out of this item's file set.

## Restart note

No cue-YAML or vocabulary edit ⇒ no stack restart is needed to trust the :3093/:5193 legs after merge (cue data is per-call; vocabulary cached but untouched). No lane stack was restarted by this coder.

## Live proof (done-gate)

The :5193 clofibrate-sentence end-to-end receipt rides SH-QA-2's browser gate (orchestrator-owned, post-merge). The headless proofs above stand alone for this report.

SH-QA-1 DONE 660226f7
