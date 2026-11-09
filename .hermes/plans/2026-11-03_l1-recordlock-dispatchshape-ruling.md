# L1 RECORD-LOCK-GUARD-1 — DISPATCH-SHAPE RULING
Item: L1-RECORD-LOCK-GUARD-1 · Trunk cl/integration-1 @ 819a2f44 (worktree cl-integration-1) · 2026-11-03
Architect lane 1. Scope: one bounded dispatch-shape ruling. No product code. Acceptance criteria 1-5,
RED-first discipline, and AM-1..AM-10 are UNCHANGED and binding verbatim. This ruling changes only HOW the
item is dispatched (slot shape and leg ordering), not WHAT it must do.

## VERDICT

**RULING: split-parallel** — dispatch as TWO sequential PARALLEL-mode legs, contract-first: Leg 1 = server/DATA,
Leg 2 = client. Each leg occupies ONE appliance-2 slot (131072 total / 32768 output each), so each can run
beside lane-2 corpus work in whatever slot is free. Leg 1 merges, the orchestrator restarts the lane stack
and runs the AM-5 pre-gate, and ONLY THEN does Leg 2 dispatch against a live, served contract. Both legs are
MANDATORY and sequential; there is no independent acceptance for either leg alone. The acceptance gate runs
ONCE after both merge + restart + browser verdict on :5192.

Why NOT hold LONG: LONG is indefinitely stalled by corpus priority (lane 2 has 2 in-progress + 4 todo corpus
items + prompts 2-8 locked). The item would remain deferred for an unbounded number of ticks and lane-1
product work stays parked — that is the outcome the dispatch bottle-neck is meant to avoid. The work splits
cleanly at the HTTP seam that already exists and is already pinned (AM-5 pre-gate on
GET /lifecycle/:id/transitions).

Why NOT a three-leg or criterion-bound split: it would arc back toward needing a slot that spans server AND
app for a would-be "consumption" leg (store + handler + client all consume the declared set), which is the
two-slot LONG shape we are escaping. The spec's own internal ordering (AM-1: schema -> types -> engine ->
echo -> 4 YAMLs -> server consumers -> client) lands a server-before-client seam naturally. Two legs matches
that ordering and gives each slot one coherent package (all of `server/` in leg 1, all of `app/` in leg 2).

---

## 1. LEG BOUNDARY (exact files, exact pins)

### LEG 1 — server/DATA (the declaration + the store machinery). Dispatch first, PARALLEL mode, one slot.
- `schema/core/lifecycle.meta.schema.yaml` — add per-state `contentLocked`, default false, after `terminal`
  (AM-1 #1). MUST land before any YAML uses the field (QMS7-3 / additionalProperties:false).
- `server/src/lifecycle/types.ts` — `contentLocked?: boolean` on the `states[]` item (AM-1 #2).
- `server/src/lifecycle/LifecycleEngine.ts` — `contentLockedStates(lifecycleId): ReadonlySet<string>|undefined`,
  mirror of `terminalStates()` (AM-1 #3).
- `server/src/api/handlers/LifecycleHandlers.ts` — additive `contentLockedStates` beside `terminalStates`
  on GET /lifecycle/:id/transitions (AM-1 #4).
- The FOUR lifecycle YAMLs — `document-control`, `document-controlled-signing` (approved/effective/superseded/
  archived), `lab-sample`, `registry-ops` (archived). Touch nothing else (3 unedited YAMLs: lab-vocabulary-
  control, service-request, tyf-order) (AM-1 #5).
- `server/src/store/types.ts` — `RecordStoreConfig.contentLockedStates?: (lifecycleId) => ReadonlySet<string>|undefined`
  (AM-2).
- `server/src/store/RecordStoreImpl.ts` — the content-equal no-op in `updateUnlocked` BEFORE `serializeRecord`
  (AM-3), consuming the injected resolver (byte-for-byte the AM-3 state+content-equality guard + the fallback
  rule), and the config injection at `createRecordStore` (RecordStoreImpl.ts:1048-1055). No re-invention of
  the set; no engine dependency.
- **ALL THREE `createRecordStore` sites** (AM-10): `server/src/server.ts:527` (MUST pass the real engine-backed
  resolver + a production-construction pin), `server/src/scripts/applyOwnershipDefaults.ts:282` and
  `server/src/scripts/migrateRecordLifecycles.ts:512` (either wired to the same resolver OR an explicit
  one-line OUT-OF-SCOPE declaration naming why — silence is a lock bypass). Absent-config default branches to
  a stated, commented fail-open (AM-10c forbids the `undefined?.has()` accident).
- `server/src/api/handlers/RecordHandlers.ts` — `:1139` consumes the declared resolver; grep for the four
  state strings returns only lifecycle YAML DATA + proof/evidence. The `:1205-1216` updatedAt injection stays
  as-is (AM-2/AM-8: the no-op lives in the store, not a handler short-circuit). The handler's transition logic
  is untouched (AM-3 fallback: handler must NOT short-circuit before applying lifecycleTransition).
- Server RED pins, all before the fix: AM-6 (a) store no-op PUT effective -> 200/no write/contentSha
  unchanged; (b) approved->effective && effective->superseded still WRITE and advance state (transition-swallow
  pin); (c) content-changing PUT on locked -> 409 CONTROLLED_RECORD_LOCKED at handler AND store; AM-9 (d)
  meta-schema validation for EACH of the four edited YAMLs; (e) engine-level exact-set pin per id; (f) negative
  pin that `contentLockedStates('service-request')` returns EMPTY set, not undefined.
- AM-10 wiring pin: production `createRecordStore` site wires the resolver (import/call-shape on server.ts, or
  integration through real buildServer).
- Run bars 1, 2, 4 (server tsc — the exactOptionalPropertyTypes layer), and server halves of 5/6.
- GREP GATE SCOPE (leg 1): the four state strings may appear ONLY in the lifecycle YAML DATA within what leg 1
  touches and its proof files. (Do NOT grep the whole repo here — the app still carries the old pair until
  leg 2; see §2 risk 2.)

### LEG 2 — client (the UX gate). Dispatch SECOND, PARALLEL mode, one slot, ONLY after leg 1 restarts + the AM-5 pre-gate passes.
- `app/src/shared/api/client.ts` — mirror `getLifecycleTerminalStates` (:4668) as `getLifecycleContentLockedStates`
  (AM-1 #6).
- `app/src/shared/records/lifecycleLock.ts` (new module) — single predicate home: `isContentLocked(payload)`
  and `isRecordWriteLocked(payload, terminalStates)` (AM-4). NO literal approved/effective pair in this module —
  it reads the declared set.
- `app/src/pages/RecordRegistryPage.tsx` — replace the inline `approved/effective` pair (`:554-560`) with the
  declared-set consumption; `:568` "do not touch it" comment REMOVED (this is the branch this item rewrites);
  `terminalLocked` stays on `getLifecycleTerminalStates`. /registry behaviour (S10) identical after.
- `app/src/event-editor/create/RecordEditPanel.tsx` — Save gate (no `record-edit-save` when locked; render
  `data-testid="record-edit-draft-copy"` labelled exactly `Create draft revision`, body non-editable via
  `disabled` on ProjectionTapTabEditor) + draft-copy via existing `createDraftCopy` (no new endpoint).
- App RED pins: RecordEditPanel.qms6e.test.tsx (extend apiClient mock, new lock+draft-copy cases),
  RecordHostPage.share.test.tsx (extend mocks only), the RecordRegistryPage suites unchanged-shape. Do not
  weaken existing assertions. Reuse for draft panel the `createDraftCopy(recordId,{})` route, dispatch
  `cl:records-changed`, surface `/record/<newId>`.
- Run app test bars 3 and 5 (app tsc error count stays 21 baseline, none in touched files), app half of 6.
- GREP GATE SCOPE (leg 2): after leg 2, a whole-repo grep for the four state strings returns ONLY lifecycle
  YAML DATA + proof. This is the master gate, run after leg 2 — not between legs.

## 2. QUALITY RISK ACCEPTED + WHICH SPLIT-SPECIFIC DEFECTS ARE NOW LIKELIER

The AM-3 trap (controlledContent strips `state`, so a content-only short-circuit freezes the state machine) is
the top worry. **The split does NOT move it or make it likelier.** The no-op short-circuit AND the transition
advance are both store-side, both in leg 1, and their RED pins (AM-6 a and b) run in the SAME test file against
the SAME `updateUnlocked` code. The trap cannot straddle the leg boundary — its two halves (the new no-op and
the surviving transition) are adjacent in one store function. Leg 1's green bar 1 + pin (b) is exactly what
proves a state change still writes. The orchestrator's fear of a swallowed transition is served in leg 1 alone.

The defects the split DOES make likelier (all between-leg seam risks, all mitigated):

1. **Client/server contract drift on `contentLockedStates` semantics** — leg 2 could consume a response shape
   it assumed rather than verified (e.g. fail-open undefined vs empty set). MITIGATION: AM-9(f) pins the server
   side returns an EMPTY set (declared-but-empty) and distinguishes it from not-loaded (undefined); the AM-5
   pre-gate between legs names the exact served `contentLockedStates` arrays on :3092 for all four ids, so leg 2
   starts from a bit-proven response, not an in-memory assumption.

2. **Transient two-policy window** — between leg-1 merge and leg-2 merge, the declared server set coexists with
   the old app literal (RecordRegistryPage.tsx still carries it until leg 2 lands). AM-8 says any trace of the
   old hardcoded predicate is ultimately a defect. This window is EXPECTED, not a parallel policy, and it is
   divested by leg 2's whole-repo grep gate at the END. Two operational consequences: (i) do NOT run the master
   four-string grep gate between legs — it will (correctly) still hit the app and would produce a false BLOCK;
   (ii) do NOT restart/assess acceptance until both legs have merged.

3. **Half-landing passed as acceptance** — a reviewer in a hurry could grade acceptance on leg 1 alone. Careful:
   after leg 1 the server half of acceptance 2 is already true (no-edit no-op, contentSha stable), but
   acceptance 1 (no enabled Save on /record) is NOT met until leg 2 + restart. Leg 1 alone is a SAFE monotonic
   improvement — a click on Save on an effective record now no-ops cleanly instead of committing a contentSha
   drift (strict improvement over pre-fix) — but it is NOT an acceptance pass. The acceptance gate runs once
   after both legs.

4. **Resume seam** — leg 2 depends on leg 1 having merged + restarted + pre-gated. If leg 1 never lands, leg 2
   must NOT dispatch against a speculated endpoint. The orchestrator owns the resume condition: leg 2's trigger
   is the literal prior-state fact "AM-5 pre-gate passed on the served :3092", nothing weaker.

Each of these is a dispatch-sequence risk, controlled by the orchestrator's pre-gates — none is a defense-in-
depth hole in the product code. The single-run LONG shape avoids #2/#3 only by having deferred the item into
an indefinite stall; that is not a point in LONG's favor.

## 3. AM AMENDMENTS NEEDED

NONE. AM-1..AM-10 are order-agnostic and hold verbatim across both legs; the split is exactly the spec's own
intra-item ordering (server -> client) promoted to a dispatch sequence. No amendment text is required to make
the split safe.

Adopt (in the dispatch blocks, not as an AM edit) the following BINDING SEQUENCING RULES, because they are
load-bearing for the split even though they change no acceptance criterion:

- S1. Leg 2 is mandatory; the acceptance gate runs ONCE after both legs merge + stack restart + :5192 browser
  verdict. A leg-1-only land is a safe intermediate but never an acceptance pass.
- S2. The master four-state grep gate is run AFTER leg 2 only. Running it between legs produces a false BLOCK
  (the app legitimately still holds the old pair during leg-2 work).
- S3. Leg 2's resume condition is exactly "AM-5 pre-gate passed on the served :3092 for all four ids". No
  earlier dispatch.
- S4. Neither leg introduces a state-string literal in TS. Leg 1 enforces its half of the grep gate scope; the
  whole-repo gate closes at the end of leg 2. AM-7 bait 15 (two policies) and AM-8 (debt false, no fallback)
  apply unchanged after leg 2.

## 4. TOKEN BUDGET PER LEG (PARALLEL = 131072 total / 32768 output)

- **LEG 1 (server/DATA)**: the heavy leg — meta-schema slice + types + engine mirror + echo + 4 YAMLs + store
  config/impl + 3 createRecordStore sites + RecordHandlers consumer + ~7 RED pins (a-f + wiring) + AM-3
  short-circuit reasoning. Budget **~90-100K total, ~28-30K output**. Fits the 131072/32768 cap with headroom;
  ends right when the optional B2 store-level work is declined as above-budget.
- **LEG 2 (client)**: lighter — client accessor + lifecycleLock.ts + RecordRegistryPage swap + RecordEditPanel
  gate/draft-copy + 3-4 test files. Budget **~60-70K total, ~18-22K output**. Comfortable headroom.

Both legs sit under the parallel cap; neither needs the 256K form. Each runs in whatever single slot is free
beside lane-2 corpus work, ending lane-1's indefinite deferral.

Signed: lane-1 architect, 2026-11-03.

RULING: split-parallel