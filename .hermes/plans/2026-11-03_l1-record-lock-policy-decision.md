# L1 Record-Lock Policy Decision — RULING
Item: L1-RECORD-LOCK-GUARD-1 · Trunk cl/integration-1 @ 819a2f44 · 2026-11-03
Architect lane 1. Scope: one bounded design ruling + a liftable acceptance block. No product code, no dispatch.

Facts verified first-hand this tick (confirmed against the brief, plus three that change the ruling):
- F1 (precedent): the `terminalStates` mechanism is the established data-driven state-attribute path: `LifecycleEngine.terminalStates()` (LifecycleEngine.ts:129-137) reads `terminal: true` from spec.states; `GET /lifecycle/:lifecycleId/transitions` echoes it as the additive field `terminalStates` (LifecycleHandlers.ts:81-82); the client fetches it via `getLifecycleTerminalStates` into `terminalStatesByLifecycle` and reasons with `isTerminalRow` (RecordRegistryPage.tsx:181-261). NO terminal-state list exists in TS.
- F2 (extra): `document-controlled-signing.lifecycle.yaml` has the SAME state shape as `document-control` (draft, in_review, approved, effective, superseded, archived). Today's GLOBAL hardcoded lock (RecordHandlers.ts:1139, RecordStoreImpl.ts:286) locks approved/effective/superseded/archived for ANY lifecycle-bearing record — so it locks document-controlled-signing records too. A per-lifecycle scheme MUST declare there or that lifecycle silently loses its lock.
- F3 (extra): `lab-sample.lifecycle.yaml` (`archived`) and `registry-ops.lifecycle.yaml` (`archived`) also pass through the global list today; their `archived` content is store-locked. Default-false data-driven would silently un-lock them.
- F4 (extra): no MANIFEST / treeState / golden byte-pin exists on `schema/core/lifecycles/*.yaml`. The only MANIFEST.yaml is `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` (pins scientist-intent fixtures, not lifecycle files). The QMS7-3 lifecycle-coverage validation (`governance/registryOpsLifecycle.test.ts`, `lifecycleStateErasure.test.ts`) validates lifecycle files against `lifecycle.meta.schema.yaml` (`additionalProperties:false`, :7) — additive schema change keeps it green, ordering matters.
- F5 (extra): the STORE has no lifecycle engine (`RecordStoreImpl` calls `contentLockError` at :285-290/:744-745 with only stored+incoming payload). A data-driven set must reach the store by injection, or the API-bypass leg cannot be data-driven.
- F6: `controlledContent` strips only state/createdAt/createdBy/updatedAt (RecordRevisionService.ts:32-36) then canonical() (key-order blind). `updateUnlocked` serializes and writes unconditionally — the contentSha drift mechanism (RecordStoreImpl:744 + RecordParser.ts:157).

---

## RULINGS

### Q1 — POLICY PLACEMENT: (A) Declare it in lifecycle DATA. Per-state boolean.
The item instruction forbids a second hardcoded TS policy, and the repo has a working, reviewed mechanism (F1) that already does exactly this for `terminal`. Option A is not a rat-hunt: it is four additive changes mirroring an existing one. Option C (dedupe-only, hide the YAML debt) violates both the item text and the repo rule "policy belongs in YAML; no duplicate local vocabulary," and would leave the lock unchangeable by data. Rejected.

EXACT contract (this is the word-for-word contract the spec borrows):
- Field: `contentLocked`, per-state boolean, `default: false`.
- Placement: per-state, sibling of `initial` / `terminal` in `states[]` (schema/core/lifecycle.meta.schema.yaml, insert after `terminal` at :31-33). `additionalProperties:false` (:7) REQUIRES the field be added to the meta-schema BEFORE any lifecycle YAML sets it, else QMS7-3 validation fails.
- `server/src/lifecycle/types.ts`: add `contentLocked?: boolean` to the `states[]` item (:6-12).
- Engine: add `contentLockedStates(lifecycleId): ReadonlySet<string> | undefined`, a byte-for-byte mirror of `terminalStates()` (LifecycleEngine.ts:129-137), scanning `state.contentLocked === true`. Undefined when the lifecycle is not loaded -> fail-open (skip), matching today's absent-lifecycleId pass-through.
- Echo: `GET /lifecycle/:lifecycleId/transitions` gains the additive field `contentLockedStates` beside `terminalStates` (:82). Same law as the terminal echo: facts read from declared YAML, never invented.
- Server resolution: RecordHandlers.ts:1139 and RecordStoreImpl.ts:286 both resolve `previous.lifecycleId -> engine/contentLockedStates(...) -> state in set`, consuming ONE shared resolver so handler and store cannot drift apart again. Because the store has no engine (F5), the store is given the resolver by injection (constructor function `(lifecycleId) => ReadonlySet<string>|undefined`, bound to the loaded engine) — the coder must NOT re-invent the set in the store. Reserved token stays `CONTROLLED_RECORD_LOCKED`.
- Client (RecordRegistryPage.tsx:558-561): replace the `state==='approved'||state==='effective'` literal with the SAME pattern as `isTerminalRow` — fetch `contentLockedStates` per distinct lifecycleId, predicate membership. The comment at :568 ("do not touch it") is superseded by this ruling; it is the very branch this item rewrites. `terminalLocked` stays untouched.

BACKWARD COMPAT for existing lifecycle YAMLs (all 7), exact set so no live lock is silently dropped:
- schema/core/lifecycles/document-control.lifecycle.yaml: `contentLocked: true` on `approved`, `effective`, `superseded`, `archived` (:24-37) — reproduces today's 4-state lock.
- schema/core/lifecycles/document-controlled-signing.lifecycle.yaml: `contentLocked: true` on the SAME 4 states — REQUIRED by F2 or this lifecycle loses its lock (today global, silently global-equivalent).
- schema/core/lifecycles/lab-sample.lifecycle.yaml: `contentLocked: true` on `archived` (: required by F3 — preserves the store-level archive lock).
- schema/core/lifecycles/registry-ops.lifecycle.yaml: `contentLocked: true` on `archived` (F3).
- schema/core/lifecycles/lab-vocabulary-control.lifecycle.yaml, service-request.lifecycle.yaml, tyf-order.lifecycle.yaml: contain none of the 4 states; touch nothing; default `false`; behavior identical.
Golden / MANIFEST / treeState: NONE to re-bless (F4). The only regression risk is QMS7-3 coverage validation, which stays green BECAUSE the schema edit lands before any YAML uses the field and is additive. Order the spec: schema -> types.ts -> engine -> echo -> 4 lifecycle YAMLs -> consumers.

(B) is WRONG for a confirmed semantic reason, refuted: `terminal` means "final — no outgoing transitions" (compiled to `type:'final'`, lifecycleCompiler.ts:27). approved/effective are content-locked but NOT terminal (they have outgoing transitions approved->effective / effective->superseded). Reusing terminal would (i) fail to lock approved/effective — the exact defect — and (ii) corrupt the state machine by marking live states final. Terminal and contentLocked are orthogonal: a state can be both (superseded/archived), contentLocked-only (approved/effective), terminal-only, or neither. Not reusable.
(C) rejected as not-honest: it keeps the debt the item's acceptance forbids.

### Q2 — NO-OP WRITE: short-circuit BEFORE serialize, token = none (200, existing record).
For a content-equal PUT/POST update, return 200 with the EXISTING record and NO write. Do NOT invent a rejection — `CONTROLLED_RECORD_LOCKED` already means "content CHANGED while locked", and a no-op is not an error. 
- Comparand: `controlledContent(stored) === controlledContent(proposed)` — the SAME canonical comparand the lock already uses (RecordRevisionService.ts:32-36), NOT byte content. Byte drift (serializeRecord re-keying) is the bug; comparing controlled content is exactly its detector and makes a re-serialized-identical payload a no-op. Consequence (declared, correct): an updatedAt/createdAt-only "touch" is ALSO a no-op — controlledContent strips bookkeeping, and a no-content-change write must not mint a new contentSha.
- Placement: the STORE (`RecordStoreImpl.updateUnlocked`, inside the `contentLockError` branch, before `serializeRecord` ~RecordStoreImpl.ts:744/RecordParser.ts:157), so an API-bypassing caller (seed-candidate path, scripts, coder tools) gets the SAME no-op. Handler-only placement would leave drift reachable off-API. The handler keeps its data-driven 409 for content-CHANGED-on-locked; the store short-circuit handles content-EQUAL (no-op). Net: locked+content-changed -> 409; content-changed-anywhere -> write; content-equal-anywhere -> no-op.

### Q3 — SCOPE, RED-PINS, RESIDUAL GAPS.
IN (minimum touch set): the 2 schema files + types (Q1), LifecycleEngine.ts, LifecycleHandlers.ts, RecordHandlers.ts, RecordStoreImpl.ts (+ its constructor injection), RecordRegistryPage.tsx, app/src/shared/api/client.ts (mirror `getLifecycleContentLockedStates` off `getLifecycleTerminalStates`), and the 4 lifecycle YAMLs above.
OUT (hard): no new UI surface (no new buttons/panels; the client leg reuses the existing Save->draft-copy affordance / DocumentControlBar shell only); no second policy literal anywhere in TS (grep gate: no state-string array new in server or app); no lifecycle YAML edit beyond `contentLocked`; no record **record-schema** or renderer change; no new rejection token (reuse `CONTROLLED_RECORD_LOCKED`).
RED-first pins (must fail before the fix, else vacuous):
- P1 SERVER no-op: no-op PUT on effective DOC-DEMO-SOP -> 200 AND `meta.contentSha` unchanged. RED before short-circuit.
- P2 SERVER lock, bypass-proof: a content-changing update issued through a bare `store.updateUnlocked` on an effective record -> CONTROLLED_RECORD_LOCKED. Proves the store leg, not just the handler.
- P3 CLIENT: /record/DOC-DEMO-SOP renders NO enabled Save (browser-verified :5192), `state=effective`. RED before client leg.
- P4 RETENTION: draft still saves on /record (PUT 200, reload shows edit); /registry S10 unchanged (saveGone, headerButtons, draft-copy 200, original untouched).
Residual gap the spec MUST document: if only the SERVER leg lands, criterion 1 is unmet — /record still shows an enabled Save on effective records (dead chrome); if only the CLIENT leg lands, criterion 2's server half is unmet — a bare-API PUT still rewrites contentSha. State which leg(s) land and file the other. Short-circuit alone (no lock) keeps criterion 2 but not 1.

## ACCEPTANCE IMPLICATIONS (lift verbatim into the spec)
1. /record/DOC-DEMO-SOP (effective) renders NO enabled Save; lock affordance is 'Create draft revision' (or equivalent minting POST /records/:id/draft-copy). Browser-verified on :5192. Client leg reads declared `contentLockedStates`, not a literal.
2. No-edit submit on an effective record does NOT change meta.contentSha (store short-circuits on controlledContent-equal before serialize and returns the existing record, 200); a content-changing submit is refused CONTROLLED_RECORD_LOCKED at handler AND store (store never enjoys a changed write on a locked state). An API-bypassing updateEqual gets the same no-op.
3. /registry S10 still passes unchanged (saveGone true, headerButtons ['Create draft revision','Cancel'], draft-copy 200, original untouched).
4. A DRAFT record still saves normally on /record (PUT 200, reload shows the edit).
5. RED-first pin at each fixed layer (P1-P4) + no new type errors + grep gate: no state-string literal introduced in server/src or app/src (the only place the 4 ids appear is the lifecycle YAML DATA + proof/evidence).

No Brad card: every question was settled by repo evidence (F1-F6). The only behavioral judgment — preserving the archived lock on lab-sample/registry-ops to match today's global list — follows the project rule "never silently drop an existing lock"; if the coder has evidence those archives never need a store lock, they may prune and say so, but parity is the default. Signed: lane-1 architect, 2026-11-03.