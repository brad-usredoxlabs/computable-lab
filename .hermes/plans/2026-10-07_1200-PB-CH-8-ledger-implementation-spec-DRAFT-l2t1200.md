# SPEC — PB-CH-8: Implement the APPROVED ledger (option a) + reviewed workstate reattachment

Status: DRAFT for orchestrator review (spec-composer, thunderbeast). NOT dispatchable until the
orchestrator promotes it (PB-CH-6 has SINCE MERGED — see §Dependency gate).

Baseline trunk at spec time: `cl/integration-2` @ **e629b0c6** (PB-CH-4b merge); re-measured at
**3b9e2a18** (tip 43cddb26 = PB-CH-6 merge + docs handoff) DURING drafting when the trunk moved
under the composer — both rounds below, marked. Every ground-fact cite was RE-VERIFIED FIRST-HAND
by the composer (read_file/grep, no scout used); packet cites from the 7c418e36 scout are corrected
where they drifted (drift notes inline). App-side cites re-read against the post-PB-CH-6 tip: the
compile→card→accept flow was LIFTED out of AiTabPanel into `app/src/shared/ai/useWorkstateProposalFlow.ts`
(PB-CH-6, the ONE implementation with a fork-detector grep) and the stream unions are now
SOURCE-PINNED (`app/src/types/aiStreamTypes.pin.test.ts`) — both are integrated into this spec.

## Goal (one sentence)

Implement the architect-approved option (a) — an append-only content-hashed workstate-snapshot
journal under `var/sessions/{userId}/journal/` driven by a declarative capture/tag/retention policy
YAML, queryable via `asOf` through the existing forced-tool channel with honest `capturedAt`
disclosure and an honest "no history stored then" answer, and reattachable ONLY through the SAME
tier-2 proposal card + the shared PB-CH-3 executor — transport values only, never knowledge records.

## The approved decision is binding (primary source)

`.hermes/plans/PB-CH-7-ledger-storage-decision.md` @ e629b0c6 (297 lines; **CHOSEN OPTION: a** at
line 297 — re-verified present). Its §4 contract (items 1–10) is BINDING and this spec implements
exactly it. Where this spec adds precision (window semantics, file naming, frame shape), that is
interpretation of §4, never extension of scope. The task's local term is **workstate-snapshot** —
never call it a "revision" (reserved: `record-revision`) or a "record".

## Dependency gate: PB-CH-6 — MERGED (43cddb26); claim-time ancestor check still required

PB-CH-6 (analysis-local chat mount + ONE generic `useAiChat` consumer) merged **43cddb26**
(adversarial ACCEPT 0 defects, orch-verified; handoff 13:25). Its merge MUST be an ancestor of the
claim-time HEAD. Coder gate at claim:
`git -c core.fileMode=false merge-base --is-ancestor 43cddb26 HEAD` — paste the output.
PB-CH-6's own browser gate is OWED but the handoff rules PB-CH-8 MAY run while it runs (different
resources) — the coder never touches the :3093/:5193 stack or the vision slot regardless. All
PB-CH-6 CONTRACT files below are cited **on the merged tip (3b9e2a18)** and were re-read first-hand:
- Forced tool (the ONE tool): `buildAgentIntentToolDef` `server/src/ai/submitSuggestionTool.ts:623-643`
  (PB-CH-4b: registry ids injected as data; static `AGENT_INTENT_TOOL_DEF` :430 returned BY REFERENCE
  when no ids — byte-identical fallback pins exist). Intent enum + args union:
  `submitSuggestionTool.ts:647` (`AgentIntentArgs.intent`).
- Orchestrator intent dispatch: `server/src/ai/AgentOrchestrator.ts` — `compose_workstate` handler
  at :2186-2246 (emits the model's envelope VERBATIM as ONE `workstate_proposal` event, :2222);
  spine-binding precedent at :2465-2477; ResolveSpine dep wiring :889-895, :2100-2109.
- Stream union (app): `app/src/event-editor/right-pane/ai/assistStream.ts:188-210` (`agent_action`
  :204, `workstate_proposal` :210), parse cases :384-398. **PB-CH-6 added a SOURCE-PIN:**
  `app/src/types/aiStreamTypes.pin.test.ts` asserts the generic-stack mirror
  (`app/src/types/ai.ts` `AiWorkstateProposalEvent`/`AiAgentActionEvent`) matches the assistStream
  members member-for-member, two-way. Read it before touching either union: as written it pins the
  EXISTING members' shapes, so a NEW additive `ledger_answer` member does not break it — but the
  pin's stated rationale (two hand-maintained unions that drift = the defect class PB-CH-6 closes)
  governs: `ledger_answer` is deliberately assistStream-only (the generic `useAiChat` stack does not
  consume it this task — §5), and the coder states that choice in the report rather than silently
  leaving the mirrors asymmetric. `aiStreamTypes.pin.test.ts` must stay green untouched.
- Tier-2 card: `app/src/event-editor/right-pane/ai/WorkstateProposalCard.tsx` — props :34-48,
  testids `workstate-card`, `workstate-card-accept` :128, `workstate-card-reject` :131,
  blocked phase renders diagnostics + NO accept control (:140-143).
- Accept flow (post-PB-CH-6): `app/src/shared/ai/useWorkstateProposalFlow.ts` — the ONE
  compile→card→accept/reject implementation (fork detector: `grep -rn compileWorkstateDraft app/src`
  shows this file as the ONLY call site): compile via
  `apiClient.compileWorkstateDraft({adapter:'workstate'|'analysis', intent})` at :92 (client.ts:2261-2283),
  accept `apiClient.acceptWorkstateDraft` :143 → `executor.applyAcceptedWorkstate(body, {accepted:true}, identity)`
  :148; client accept method client.ts:2289-2298 (sends ONLY {draftId,revision,reviewHash}).
  `AiTabPanel.tsx` consumes the flow (`useWorkstateProposalFlow()` at :544; card render :1071) and
  keeps only its `workstateTurnRef` turn-flag guards. **The ledger answer card MUST ride this flow —
  a second compile call site is the fork the pin greps exist to catch.**
- Shared executor (the ONLY sanctioned apply): `app/src/shared/session/useWorkstateExecutor.ts`
  (`executeTier1` :47, `applyAcceptedWorkstate(body, attestation, identity)` :48-51,80), pure core
  `workstateExecutor.ts`; single push ownership lives in `useSessionSync.ts`
  (`PUSH_DEBOUNCE_MS` :24, payload-equality skip :136, `applyingRemote` :67,78-86,131-132) —
  ALL byte-frozen for this task.
- Drafts lifecycle: `server/src/drafts/draftRoutes.ts:5-17` (actor via
  `ctx.localIdentityService.resolveRequestUser`, 401 without userId), adapters registry
  `config/drafting/adapters.yaml` (`workstate` :13-16, projection-only), `FormDraftService` accept
  returns the STORED compiled result flat (PB-CH-3 promotion notes).

If PB-CH-6's merge touches `assistStream.ts` / `AiTabPanel.tsx` / the union, the coder works on the
MERGED tip and re-runs the named regression suites at claim time (see Verification).

## VERIFIED BASELINE (composer-measured at e629b0c6 unless marked inherited)

| Check | Command | Result at e629b0c6 | Result at 3b9e2a18 (post-PB-CH-6 tip) | Status |
| --- | --- | --- | --- | --- |
| server tsc pin | `npm run typecheck -w server` | **26 error lines / 6-file set**: `src/ai/AgentOrchestrator.ts`, `src/api/handlers/ProtocolIntakeHandlers.ts`, `src/api/handlers/RecordHandlers.ts`, `src/lint/AuthoringGuard.ts`, `src/scripts/bootstrapAdmin.ts`, `src/store/RecordStoreImpl.ts` | **26 lines, file-set diff EMPTY (comm -3)** | **MEASURED both** |
| app tsc pin | `cd app && npx tsc --noEmit` | **34 error lines / 24 files** (matches the 34 pin, FILE-SET identity required post-change) | **34 lines / 24 files, file-set diff EMPTY (comm -3)** | **MEASURED both** |
| server targeted | `cd server && npx vitest run src/drafts src/surfaces src/workspace-session src/api/routes` | 14 files / 135 tests, **5 failed — ALL inside `src/surfaces/surfacesAjv.test.ts`** | (same artifact) | **MEASURED** e629b0c6 — see symlink note |
| server targeted (scoped, use THIS) | `cd server && npx vitest run src/drafts src/workspace-session src/api/routes` | (13 files, 0 failed — pre-derivation) | **11 files / 116 tests / 0 FAILED** | **MEASURED** 3b9e2a18 — this is the pin for verification |
| app targeted session | `cd app && npx vitest run src/shared/session` | **7 files / 70 tests, ALL PASS** | **7 files / 70 tests, ALL PASS** | **MEASURED both** |
| full app suite | `cd app && npx vitest run` | **53 failed files / 63 failed tests / 1966 passed / 292 files, 5 errors** | **53 failed files / 63 failed tests / 2001 passed / 300 files, 6 errors** | **MEASURED both** — the 53-file pin HOLDS across the PB-CH-6 merge; pass count is NOT the bar, the failing-FILE-SET is |
| app right-pane/ai (informational) | `cd app && npx vitest run src/event-editor/right-pane/ai` | 32 files, 3 failing files / 209 tests passed, 1 unhandled error | not re-run | MEASURED e629b0c6 (informational; full-suite set-diff is the bar) |
| server full suite | `cd server && npx vitest run` | not run by composer | **INHERITED: re-measure at claim** — coder pastes claim-time pre-change failing-file set and must land set-identical after | INHERITED |
| Session-doc hash pin | main.yaml `8107ef6e…` | per handoff 11:40 | re-confirmed in handoff 13:25 | INHERITED (browser-gate phase applies) |

**surfacesAjv symlink artifact (do not chase, do not "fix"):** `server/src/surfaces/surfacesAjv.test.ts`
is an untracked SYMLINK into Brad's live tree (`git ls-files server/src/surfaces/` tracks only
`surfaces.ts`, `surfaces.test.ts`, `surfaces.deepLink.test.ts`). Its 5 failures resolve
`surfaces.ts` under `/mnt/vast/home/brad/git/computable-lab/` (Brad's registry vs lane registry
drift). It is NOT a lane regression. NEVER edit/delete the symlink (it lives outside the worktree's
git view but points into Brad's tree); scope the command per the row above and paste this paragraph's
evidence into the report.

## Ground facts, re-verified at e629b0c6 (packet §0 cites corrected)

- **The clobber is real and current:** `server/src/workspace-session/WorkspaceSessionStore.ts:74-88`
  — `put()` rebuilds `{version:1,userId,tabs,activeTabId,updatedAt}` wholesale, tmp+rename (:84-86),
  no prior content kept. `get()` yields empty on ENOENT (:67-70). **Packet cite :74-88 still exact.**
- **PUT route:** `server/src/api/routes/workspace-session.ts` — PUT handler :43-60 (Ajv against
  `lab-session.schema.yaml` :50-56, `store.put` :57). Raw-header actor resolution
  `resolveUserId` :22-25 (`'default'` fallback). `GET /session/:userId` :39-41 unauthenticated —
  packet-flagged backlog, **OUT OF SCOPE here; the ledger must not inherit the pattern**.
  **DRIFT: route registration is `server/src/server.ts:1522-1523`** (packet said :1507-1508 at
  7c418e36). `ctx` at that site ALREADY carries `localIdentityService` (used at draftRoutes.ts:9) —
  no server.ts signature change is needed to pass identity into the route.
- **Transport-document semantics:** `schema/workflow/lab-session.schema.yaml:4-13` declares UI state
  "NOT a record kind, NOT a biological CTX-…" with `version` `const: 1` (:21). Tab-kind enum :41-55.
- **Audit machinery:** `server/src/governance/AuditEventService.ts:16-41` — `EVT-…` minted :18,
  `occurredAt` = server clock at append (:17, :31), append best-effort (errors swallowed :38-40).
  Wired `server/src/server.ts:700`. Lifecycle hook appends `lifecycle_transition` with `subjectId` =
  the record id — **DRIFT: RecordHandlers hook now at ~:978-995** (packet said :978-982);
  `appendOnlyKinds` now **:729 and :1179** (packet said :726-729/:1176-1179).
- **Snapshot machinery to REUSE (pure functions, importable without a record store):**
  `server/src/revisions/RecordRevisionService.ts` — `canonical()` :18-22, `contentHash()` :23,
  read-time integrity re-verification pattern `read()` :54-61 (`INVALID_REVISION` on mismatch).
  The workstate-snapshot must NOT become a `record-revision` (it's a record kind in the git tree —
  knowledge-layer adjacency is forbidden by decision §4.1).
- **Rotation/retention precedent:** `server/src/ai-threads/AiThreadStore.ts` — threshold check :137,
  `rotateSnapshot` :188; constructor-injected thresholds (:33,:42,:47). **DRIFT: packet's :108/:138-139
  are close but the current lines are :137/:188.**
- **Actor resolution:** `server/src/security/LocalIdentityService.ts` — `resolveRequestUser` from
  :84: session token first (:85-96), then `x-user-id` / `x-computable-user-id` (:98-100), inactive
  users refused.
- **Why capture must NOT live in `WorkspaceSessionStore.put()`:** `server/src/drafts/
  WorkstateDraftAdapter.test.ts:308-319` pins `readdir(var, recursive)` containing NO 'journal' and
  `sessions/USR-test/*` = main.yaml ONLY, while seeding sessions via the store directly. A store-level
  capture hook would break this existing green pin. The packet's "single `put()` call site" means
  **the route's call site** (`workspace-session.ts:57`). `WorkspaceSessionStore.ts`: ZERO diff.
- **Schema auto-registration trap:** `server/src/schema/SchemaLoader.ts:32` —
  `DEFAULT_PATTERNS = ['*.schema.yaml', '*.schema.json']`, loaded from `schemaDir` at boot
  (server.ts:346-351). A policy file named `*.schema.yaml` would be auto-registered as a JSON Schema
  and blow up the validator boot (no `$id`, not a schema). Name the policy file exactly
  `schema/workflow/workstate-journal.policy.yaml` (does NOT match the glob — verified the matcher is
  suffix-based, `matchesPattern` :38-46).

## The design (exact, minimal — all new files except 4 narrow edits)

### 1. Server journal core — NEW `server/src/workspace-session/WorkstateJournal.ts` (+ .test.ts)

Pure filesystem module, no record store, no Fastify. Class + policy reader:

- **Policy data (THE source of truth; ZERO hardcoded policy branches):** read from
  `schema/workflow/workstate-journal.policy.yaml` **per capture/prune call** (pattern:
  `config/drafting/workstate-tab-kinds.yaml` is re-read per call by `workstateCompile.ts`;
  hot-reload without restart — PB-CH-4b's hot-reload note applies). **File absent ⇒ capture
  DISABLED** (decision §4.2: "removing the policy YAML must leave capture disabled, not
  defaulting"). Never cache across calls.
- **Entry file:** `var/sessions/{userId}/journal/{seq:06d}-{uuid}.yaml`, unique filename per
  capture (seq zero-padded + `randomUUID()`; seq = max existing seq + 1 from directory listing).
  Atomic write by reusing the store's exact tmp+rename pattern (`WorkspaceSessionStore.ts:84-86`).
  Document shape (ALL history metadata OUTSIDE the payload — the `version: 1` lab-session doc is
  untouched, decision §4.1):
  ```ts
  interface WorkstateSnapshotEntry {
    journalVersion: 1;
    seq: number;
    capturedAt: string;              // server clock at capture (new Date().toISOString())
    actor: string;                   // resolveRequestUser userId — never 'default'
    contentHash: string;             // contentHash(snapshot) — RecordRevisionService.ts:23
    snapshot: StoredWorkspaceSession; // byte-canonical transport doc, exactly as put() would write
    links?: string[];               // OMITTED when zero (exactOptionalPropertyTypes: absent, never undefined)
  }
  ```
- **Capture (call site = `workspace-session.ts:57`, AFTER validation, AFTER `store.put`
  succeeds):** interpret policy — skip when policy file missing; skip when `capture.enabled`
  false; skip when the actor did not resolve to a real user (`capture.requireResolvedActor` true ⇒
  the `'default'` fallback never captures, decision §4.3 — main.yaml LWW behavior for the fallback
  is byte-unchanged); skip when `T - lastCapturedAt < capture.minIntervalMs` (debounce floor); skip
  when `capture.skipUnchanged` true and `contentHash(new) == contentHash(last)` (precedent:
  RecordRevisionService dedupe-on-existing). Otherwise append ONE entry. Serialized per-user by an
  in-module promise queue (single-writer-per-capture, decision §4.7 — precedent
  `withRecordLock` RecordRevisionService.ts:38-46); capture/prune failures are best-effort: logged,
  NEVER fail the PUT (mirrors `AuditEventService.ts:38-40`).
- **Capture-window linkage (the ONE genuinely new interpreted logic; §4.4 — spec'd precisely):**
  at capture time `T` (server clock, same instant as `capturedAt`):
  1. `ids` = strings collected from the snapshot's tab payloads at the field names enumerated in
     policy `linkage.idFields` (data; lane values today: `runId`, `studyId`, `recordId` — mirroring
     `config/drafting/workstate-tab-kinds.yaml` idFields, which is the declared record-id-carrying
     field vocabulary). Dedup, insertion order kept.
  2. Window = `[max(prevCapturedAt + 1ms, T - linkage.windowMs), T]` inclusive, where
     `prevCapturedAt` = last successful capture's `capturedAt` for this user (no prior capture ⇒
     window start = `T - linkage.windowMs` only).
  3. Candidates = audit-event records via `store.list({ kind: 'audit-event' })`, filtered to
     `occurredAt` ∈ window AND `subjectId ∈ ids` AND (`linkage.requireSameActor` true ⇒
     event `actor` == capturing actor). `occurredAt` is the server clock both sides — optional
     plate-event `at:` is NEVER consulted (decision §4.4).
  4. `links` = the candidate `recordId`s (EVT-…), capped at `linkage.maxLinks` (data). Model output
     NEVER contributes an id: the model does not write links; there is no code path that accepts a
     caller-supplied link. Audit appends are best-effort (packet §5) so links are OPTIONAL evidence —
     zero matches ⇒ `links` field ABSENT, snapshot still valid.
  The journal core takes an `auditSource: { list(kind:'audit-event'): Promise<AuditEventLike[]> }`
  seam (constructor/parameter) so unit tests feed fake audit rows without a git tree; production
  passes `{ list: () => ctx.store.list({ kind: 'audit-event' }) }` from the route.
- **Retention:** after each capture, prune per policy (`retention.maxEntries`, `retention.maxAgeDays`):
  remove WHOLE journal files only, oldest seq first, never the just-appended file, never rewrite or
  reorder a retained file (decision §4.9). Best-effort.
- **asOf(t):** read all entries sorted by seq; re-verify `contentHash(snapshot)` per entry
  (RecordRevisionService.ts:54-61 pattern); corrupt/invalid entries are SKIPPED and surfaced as
  `integrity: [{ file, reason }]` diagnostics — never silently replaced by a neighbor. Return the
  newest entry with `capturedAt ≤ t`; ties break by seq, never content order. Result is a discriminated union:
  ```ts
  type AsOfResult =
    | { status: 'found'; asOf: string; capturedAt: string; links?: string[]; snapshot: StoredWorkspaceSession; integrity: IntegrityNote[] }
    | { status: 'no-history'; asOf: string; reason: 'policy-disabled' | 'journal-empty' | 'predates-first-capture' | 'pruned'; integrity: IntegrityNote[] }
  ```
  `policy-disabled` maps to the honest §4.6 answer (capture was never on). The caller (orchestrator
  side) ALWAYS surfaces `capturedAt` + the phrase "as captured at", never "as of", for `found`
  (decision §4.5).

### 2. NEW policy YAML — `schema/workflow/workstate-journal.policy.yaml`

New data, not an extension of anything (packet §5: no retention/prune config exists anywhere).
Header carries the SAME transport-doc disclaimer as `lab-session.schema.yaml:4-13` ("transport
state, not a record kind, no lint/ui companion"). Shape (interpret-only code; every branch is a
data read; backend `exactOptionalPropertyTypes` — optional fields absent, never `undefined`):
```yaml
journalVersion: 1
capture:
  enabled: true
  minIntervalMs: 30000
  requireResolvedActor: true
  skipUnchanged: true
linkage:
  windowMs: 900000
  requireSameActor: true
  maxLinks: 32
  idFields: [runId, studyId, recordId]
retention:
  maxEntries: 500
  maxAgeDays: 30
query:
  anchor: latest   # which audit anchor when a subject has multiple events: latest | earliest
```

### 3. Route wiring — EDIT `server/src/api/routes/workspace-session.ts` (narrow)

- Construct `WorkstateJournal` next to the store (:33 site) with `ctx.workspaceRoot`, policy path,
  and `auditSource` from `ctx.store`.
- PUT: keep `resolveUserId` for the main.yaml path BYTE-UNCHANGED; additionally call
  `ctx.localIdentityService.resolveRequestUser(request)` to obtain the journal actor (token >
  header; refused/inactive ⇒ treated as no resolved actor ⇒ no capture — decision §4.3). After
  `store.put` succeeds, `journal.maybeCapture(...)` best-effort. `GET` routes: ZERO diff. The
  `GET /session/:userId` authorization gap is OUT OF SCOPE (backlog candidate per packet §5 and the
  task-list DECISION CLEARED note) — do not widen scope.
- `server.ts:1522-1523` needs NO change (ctx already carries what's needed — verify, and if the
  route registrar genuinely can't see `ctx.localIdentityService` at that site, STOP and report,
  do not improvise a new wiring channel).

### 4. Query path — NEW `server/src/workspace-session/ledgerQuery.ts` (+ .test.ts) riding the ONE forced tool

- **One forced tool, never a second (PB-CH-4b ruling):** add ONE intent `query_workstate_history`
  to `AGENT_INTENT_TOOL_DEF` (`submitSuggestionTool.ts:430+`, description text + one enum member +
  one optional `ledgerQuery: { term?: string; recordId?: string }` property — VERBS AND TERMS ONLY,
  the doctrine holds) and to `AgentIntentArgs` (:647). `buildAgentIntentToolDef`'s clone/id-injection
  behavior and the no-ids byte-identical fallback stay intact (existing pins in
  `submitSuggestionTool.surfaceVocab.test.ts` must stay green).
- **Orchestrator handler** (`AgentOrchestrator.ts`, next to `compose_workstate` :2186): resolve the
  model's `term`/`recordId` through the SAME spine discipline (import `LOCAL_TIERS` +
  `isMintAffordance` from `ai/compileWorkspaceAction.ts` — PB-CH-2's IMPORTED discipline, never
  re-implemented; `deps.resolveSpine` at :889-895). `t` comes ONLY from server-known audit
  `occurredAt` for the resolved subjectId (`query.anchor` breaks ties). A model-proposed timestamp
  or id is NEVER trusted as an anchor or a link (decision §4.4). Unresolvable term / no server-known
  anchor ⇒ honest answer with no snapshot (see frames), never a guess.
- **Frames emitted (server-built — fetched evidence, not model narration):**
  - `found` ⇒ emit ONE `ledger_answer` event (new member, §5) carrying `status:'found'`, `asOf`,
    `capturedAt`, disclosure string ("as captured at <capturedAt> — nearest stored snapshot at or
    before <asOf>"), `links`, then emit ONE `workstate_proposal` event whose envelope the SERVER
    builds FROM THE SNAPSHOT (not from the model): `{operation:'compose-workstate', tabs:[{surface,
    target:{recordId}}], activeTab}` derived from the snapshot's tab payloads (recordIds already in
    the snapshot are server-known; surface derivation is the INVERSE of the registry + the same
    registered-surface authority `workstateCompile` uses). This rides the EXISTING client card flow:
    AiTabPanel compiles via adapter `'workstate'` (targets are store-verified) → SAME tier-2 card →
    accept via the SAME `/api/drafts/accept` + `applyAcceptedWorkstate`. ZERO new card, ZERO new
    adapter key, ZERO new executor path, ZERO new tool.
  - `no-history` ⇒ emit ONE `ledger_answer` `status:'no-history'` with the §4.6 exact answer shape:
    state that no workstate history exists for that time (reason), optionally followed by what the
    RECORDS honestly show at that time — server-known audit events near t, clearly labeled
    **lab events, not workstate** — and NO `workstate_proposal`, so NO card and zero session
    movement. Never fall back to the current session as a stand-in.
  - Unresolvable/no anchor ⇒ `ledger_answer` `status:'no-history'`, `reason:'no-anchor'` variant:
    say what could not be placed in server-known time; ask for a narrower target. Never invent `t`.
- **Historical-surface incompatibility is handled by the generic gate, not a new branch:** a
  snapshot tab whose record kind/surface no longer maps produces the EXISTING
  `UNSUPPORTED_SURFACE` / `UNMAPPABLE_RECORD_KIND` compile diagnostics ⇒ `canAccept:false` ⇒ the
  card's blocked phase (diagnostics, no accept control, WorkstateProposalCard.tsx:140-143). Visible
  diagnostic, zero movement, no guessed route.
- **No audit hook is added to the PUT path** (the ledger READS existing audit events; packet §5's
  flag stays as-is — adding writes there is out of scope).

### 5. App-side delta (minimal): render `ledger_answer` honestly

- `assistStream.ts`: one additive union member + parse case —
  `{ type: 'ledger_answer'; answer: LedgerAnswerEnvelope }` where the envelope mirrors the server
  frame (transport mirror discipline of `agent_action` at :194-210: optional fields OMITTED, never
  `undefined`). `useChatThread.ts` switch case + `chatReducer.ts` `TraceEntry.kind` gains `'ledger'`
  (additive, mirroring PB-CH-4's `'action'` kind). Render the answer as a chat message: found ⇒
  disclosure + links as provenance lines; no-history ⇒ the honest text + clearly-labeled lab
  events. The `workstate_proposal` half needs NO new app code — the existing compile→card path
  consumes it unchanged.
- **Out of scope app-side:** ledger rendering in PB-CH-6's generic `useAiChat` consumers (the wave-3
  ledger answer rides the `/ai/assist/stream` stack where the tier-2 card lives; `types/ai.ts`'s
  `AiStreamEvent` gains NO member — see the pin-test rationale above); any new card component; any
  executor change; any hunk in `useWorkstateProposalFlow.ts` (the ledger proposal enters it through
  the EXISTING `workstate_proposal` event path — zero diffs there).

### 6. Explicitly OUT of scope (zero hunks; any diff here = reviewer bait)

- `WorkspaceSessionStore.ts`, `lab-session.schema.yaml` (const `version: 1`), `agent-action.schema.yaml`,
  `workstate-intent.schema.yaml` (no disclosure fields smuggled into a model-writable envelope).
- `GET /session/:userId` authz fix; any audit-event writes on the session path; `AuditEventService`.
- A second forced tool, second proposal card, second executor path, new drafts adapter key, or
  `useSessionSync.ts` hunks beyond NONE (it is byte-frozen for PB-CH-8 — no overload needed; the
  accepted apply already exists).
- PB-CH-9 docs (`architecture-of-record.md` — NOTE: neither it nor `ai-drafting-and-ui-projection.md`
  exists in this trunk's `specifications/` at e629b0c6, verified by find; PB-CH-9 owns contract docs).
- Retention of deleted-user journal dirs (actor-model gap — see Stop boundaries).

## Acceptance criteria (verbatim from the task block, /home/brad/.hermes/cl/lanes/2/task-list.md:1871-1879)

> Red-first tests per the approved decision: capture/reconstruction correctness, event attribution,
> missing-history path (honest 'no history stored then' answer), authorization, concurrent writes,
> integrity, retention. Independent browser review on named surfaces (run AiTabPanel history response/
> reattachment card, tab strip, Analysis if in fixture): query a seeded fixture batch, inspect
> provenance, reject => no movement, accept in A => adopted in B. Screenshots: ledger-grounded-result.png,
> ledger-no-history.png, ledger-reattach-card.png, ledger-restored-A.png, ledger-attached-B.png,
> ledger-incompatible-surface.png. Seed fixtures; do not use Brad's live DNeasy data.

Task description bindings (verbatim, :1856-1864): "Capture eligibility, tagging, event association,
and query policy are DECLARATIVE (YAML); code interprets. Use authenticated actor resolution and
canonical event/entity refs — never model-invented links. Retrieval rides the existing server tool
channel + ResolveSpine; answers distinguish retrieved historical evidence from inference; present a
compiled reattachment proposal through the SAME tier-2 card. Query/reject never alter the current
session; Accept restores only the approved workstate projection via the shared executor — no
replaying experiments, rerunning analyses, or recreating records. Historical surface incompatibility
=> visible diagnostic, never a guessed route."

## Red-first test matrix (packet §3 rows 1-9, all blocking)

Server unit — `WorkstateJournal.test.ts` (tmp workspaceRoot, fake `auditSource`), `ledgerQuery.test.ts`:
1. **Capture correctness** — PUT passing policy appends EXACTLY one entry whose recomputed hash
   matches and whose snapshot round-trips byte-canonical; failing policy (disabled/interval/
   unchanged/`'default'` actor) appends ZERO. Route-level: `workspace-session.test.ts` extension via
   `app.inject` (harness precedent :16-34).
2. **asOf reconstruction** — seeded journal; query at a fake audit `occurredAt` returns latest
   `capturedAt ≤ t` WITH `capturedAt` in the result; tie breaks by seq, never content order.
3. **Event attribution** — links contain ONLY EVT ids whose subjectId ∈ snapshot tab idFields AND
   occurredAt ∈ window AND actor match; a fake audit row with a plausible-but-unmatched subjectId is
   refused; lifecycle-then-PUT links with ZERO caller-supplied ids; model payload containing a fake
   `links` field cannot reach the entry (no code path).
4. **Missing-history** — query before first capture / policy-disabled / fully-pruned ⇒
   `no-history` + reason; ✗-expect: the CURRENT session is NEVER returned as a stand-in.
5. **Authorization** — journal capture skips for `'default'`; user A's reader instance returns zero
   entries from user B's dir even when B's dir is seeded (per-user path binding, no user parameter);
   ledgerQuery refuses unresolvable actors.
6. **Concurrent writes** — two `maybeCapture` calls raced within one interval-window each land
   (distinct seq, distinct files, no torn files via rename atomicity); main.yaml still LWW.
7. **Integrity** — mutate an entry file on disk; `asOf` returns `integrity` diagnostic, SKIPS the
   corrupt entry, never substitutes a neighbor.
8. **Retention** — cap exceeded ⇒ oldest WHOLE files pruned per policy; a queried range fully pruned
   ⇒ row-4 honest answer, not a partial lie; retained lines byte-unchanged (hash before/after).
9. **Reattachment** — ledgerQuery `found` emits server-built envelope whose tabs equal the
   snapshot's ids; `no-history` emits NO `workstate_proposal`.

Route/assembly — `workspace-session.test.ts` + orchestrator test:
10. **Ledger zero-records pin** — a full query+found cycle creates ZERO record-store writes beyond
    the form-draft lifecycle that accept already owns; source-pin test: `ledgerQuery.ts` source
    contains no import of execution/promotion/analysis-run machinery (WorkstateDraftAdapter's
    projection-only pin pattern); `journal/` stays out of the records git tree (`var/` gitignored
    .gitignore:23-24).
11. **Tool-def discipline** — `query_workstate_history` present in enum; `buildAgentIntentToolDef`
    with/without ids keeps its existing pins (clone not mutate, byte-identical fallback); exactly
    ONE forced tool definition exists (`grep AGENT_INTENT_TOOL_DEF`).

App — `assistStream.ledger.test.ts` (+ panel/reducer tests): found/no-history frames parse with
optionals OMITTED never `undefined`; a `ledger_answer` frame alone renders NO accept control;
no-history text renders with the lab-events label; **reject ⇒ zero `putSession` after 600 ms +
tab-store reference identity unchanged** (fake-timer harness precedent
`useSessionSync.test.ts:13-30` / PB-CH-4 card tests); ledger-driven accept calls
`applyAcceptedWorkstate(body, {accepted:true}, identity)` EXACTLY once with exactly one push and
spied reducer showing ZERO execute/promote/recreate calls (executor spy); unknown frame types still
parse to nothing (default branch intact).

## First targeted check (bounded, EARLY — before any wiring)

Write `WorkstateJournal.test.ts` with rows 1/2/7 (hash-append, asOf, integrity) ONLY, then:
```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/workspace-session
```
Expected RED (module absent) then GREEN with ZERO edits to `WorkspaceSessionStore.ts`,
`lab-session.schema.yaml`, or any route file (`git -c core.fileMode=false status --porcelain` shows
only the new files). If a core case forces an edit to those, the design premise is wrong — STOP and
report.

## Verification commands + expected baselines (re-measure ALL at claim-time HEAD first)

1. RED outputs pasted, then green.
2. `cd server && npx vitest run src/workspace-session src/drafts src/api/routes` → baseline
   11 files/116 tests green (measured 3b9e2a18) + your new files, **ZERO failures** (surfacesAjv
   excluded — symlink artifact, paste the §Baseline note).
3. `cd server && npx vitest run src/ai` → claim-time pre-change failing set set-identical
   (`comm -3` of sorted FAIL file lists, paste).
4. `npm run typecheck -w server` → **26 lines / SAME 6-file set** (`comm -3` of file sets empty) +
   your files add zero.
5. `cd app && npx vitest run src/shared/session src/event-editor/right-pane/ai` → session baseline
   7 files/70 tests ZERO failures; right-pane/ai lands NO NEW failing file vs claim-time set.
6. `cd app && npx vitest run` → failing-file SET set-identical to the 53-file claim-time baseline
   (`comm -3` empty), 63 failed tests; paste set-diffs.
7. `cd app && npx tsc --noEmit` → **34 lines, FILE-SET identity** (`comm -3` empty).
8. `git -c core.fileMode=false diff --name-only` contains ONLY the allowed list: new
   `WorkstateJournal.*`, `ledgerQuery.*`, `schema/workflow/workstate-journal.policy.yaml`, the
   route + tool-def + AgentOrchestrator + assistStream/useChatThread/chatReducer narrow edits, the
   named test files, plus the report. Anything else = scope violation.
9. Policy-off proof: delete/rename the policy YAML in a scratch run ⇒ zero capture, ledger query
   answers `no-history reason:policy-disabled`, PUT still 200-green (paste).
10. No :3001/:5174 touches; no lane-stack restarts while other workers run (see Worker contract).
    YAML is read per call, so no restart is needed for policy changes to take effect in dev; the
    orchestrator restarts the lane backend before the browser gate per lane policy.

## Browser gate (AFTER merge, independent cl-browser-reviewer, single vision slot, deterministic-script-only per lane policy)

Seeded fixture batch written by a deterministic seed step into the LANE's isolated data dir (fixture
runs/records created via the lane API; audit rows via real lifecycle transitions; journal via real
PUTs passing policy — never Brad's live DNeasy data). Legs:
1. Ask history of the seeded run in the run-chat AiTabPanel → `ledger_answer` found + card →
   **ledger-grounded-result.png** (provenance lines show capturedAt + links) and
   **ledger-reattach-card.png** (tier-2 card, same component, testid `workstate-card`).
2. Ask about a time before capture existed → **ledger-no-history.png** (honest text; reviewer
   confirms NO card renders and /api/session bytes unchanged).
3. Reject on the reattach card → tab strip visually unchanged + /api/session hash unchanged.
4. Accept in device-context A → **ledger-restored-A.png** (exactly one `/api/drafts/accept`,
   NO second `/ai/assist/stream` during accept — reviewer watches network).
5. Context B attach → **ledger-attached-B.png** (adopted state).
6. Seed a journal entry referencing a no-longer-mappable kind/surface → **ledger-incompatible-surface.png**
   (blocked card: diagnostics, no accept control).

## Stop boundaries — coder STOPS and reports to the orchestrator, never improvises

- Any retention/actor semantics beyond this spec (e.g. journal dirs of deleted/inactive users,
  cross-device clock trust beyond server clock, audit retention) — the packet leaves them open.
- Any pressure to store knowledge records, extend `lab-session`/`workstate-intent` schemas, widen
  `GET /session/:userId`, or add audit writes on the session path.
- Any pressure to bypass the tier-2 card / shared executor (a direct `replaceState` "for ledger
  restore" is THE canonical violation), add a second forced tool, a second card, or a drafts
  adapter key.
- If the assist-stream handler cannot supply a resolved actor at query time (Open question 1), STOP
  before wiring the orchestrator handler — do not fall back to raw-header identity for ledger reads.

## Worker contract

- Worktree `wt/PB-CH-8-lane2-l2t<HHMM>` off **claim-time** `cl/integration-2` HEAD; HEAD must
  include the PB-CH-6 merge **43cddb26** (`git -c core.fileMode=false merge-base --is-ancestor
  43cddb26 HEAD` output pasted) AND e629b0c6. Record claim SHA + both ancestor SHAs in the report. NFS bootstrap
  pitfalls apply (background `git worktree add`; `git reset --hard` recovery; node_modules/symlink
  links to the TRUNK's node_modules verified before start; excludes = lane-exclude recipe).
- `git -c core.fileMode=false` for EVERY git command in the trunk/worktree (NFS fakes ~2550
  mode-bit modifications otherwise). NEVER `git add -A` — add paths explicitly. ONE logical commit
  (+ optional report commit). Branch off the lane trunk, name `pb-ch-8-lane2-l2t<HHMM>`.
- Report (unique path): `.hermes/plans/PB-CH-8-report.wip-l2t<HHMM>.md` — red-first outputs,
  matrix mapping, verification 1-10 outputs verbatim (incl. all `comm -3` set-diffs, the policy-off
  proof, claim SHAs), and the symlink-artifact evidence paragraph.
- NO lane-stack restarts while other lane workers run; NEVER :3001/:5174; NEVER
  `/mnt/vast/home/brad/git/computable-lab`. No browser gate run by the coder (gate is post-merge,
  orchestrator-owned).

## Reviewer bait (the adversarial review looks exactly here)

- **Ledger bytes reaching knowledge/records tables = reject.** Journal lives ONLY under
  `var/sessions/{userId}/journal/` (gitignored .gitignore:23-24); no `record-revision`, no
  `form-draft`-adjacent smuggling of snapshot content into any record payload; test row 10 proves
  zero record writes.
- **Reattachment bypassing the tier-2 card or shared executor = reject.** No `replaceState`
  reference outside `useSessionSync.ts`; the ledger path reaches the tab store ONLY via
  `workstate_proposal`→compile→card→accept→`applyAcceptedWorkstate`. Spy-prove ZERO
  execute/promote/recreate calls; ZERO `/ai/assist/stream` during accept.
- **Capture policy hardcoded in TS = reject.** Every threshold (interval, window, actor rule, caps,
  idFields, anchor) is a policy-data read per call; removing the YAML must DISABLE capture, not
  default it (verification 9 is the proof). A TS constant mirroring any policy number is a defect.
- **`*.schema.yaml` naming trap:** the policy file MUST be `workstate-journal.policy.yaml`; naming
  it `workstate-journal.schema.yaml` would auto-register it as a JSON Schema (SchemaLoader.ts:32)
  and break validator boot.
- **Store-level capture = reject:** `WorkspaceSessionStore.ts` zero-diff; breaking
  `WorkstateDraftAdapter.test.ts:308-319` (the journal-not-widened pin) is the tell.
- **`'no history stored then'` replaced by inferred reconstruction = reject.** Any code path where
  an asOf miss returns the current session, a merged/synthesized doc, or record-derived UI guesses
  (option (c) is FORBIDDEN by the decision) is a rejection-grade defect. Disclosure text says "as
  captured at", never "as of", never claims instantaneousness.
- **Cross-user journal read = reject.** Reader/user dirs bound to the resolved actor; no endpoint
  or envelope field names another user; test row 5 is non-vacuous (B's dir seeded with entries,
  queried as A, must return nothing).
- **Retention that rewrites or reorders existing journal lines = reject.** Whole-file deletes only;
  hash-compare retained files before/after (row 8).
- **exactOptionalPropertyTypes sites:** `links`, `integrity`, `capturedAt`-bearing optionals,
  frame envelope optionals — conditional spread (`...(links ? {links} : {})`), ABSENT never
  `undefined`; app frames mirror the omission discipline at assistStream.ts:194-210.
- **YAML-reload trap:** caching the policy at boot both breaks the policy-off proof and hot-reload
  parity (read per call like workstate-tab-kinds.yaml).
- **Model-invented ids:** any path where a string from model output (timestamp, EVT-…, recordId)
  becomes `t`, a link, or a tab target without spine/store verification = reject. The
  reattachment envelope is SERVER-built from snapshot bytes, never model-echoed.
- **Second-tool / second-card / second-executor reflexes:** the ledger intent rides the ONE
  `agent_intent` tool (PB-CH-4b), the answer card IS `WorkstateProposalCard` via the `'workstate'`
  adapter; a new adapter key `'ledger'` or a `LedgerCard.tsx` is scope creep, not a feature.
- **surfacesAjv symlink:** "fixing" those 5 failures (or touching the symlink into Brad's tree) =
  scope violation; the scoped command in the baseline table is the sanctioned surface suite.
- **Ports/data:** any :3001/:5174 evidence or writes under the main data dir = automatic fail.

## Open questions (max 3; each with what I checked)

1. **Does `/ai/assist/stream` resolve its actor via `resolveRequestUser` today?** Grep for
   `resolveRequestUser|x-user-id` in `AIHandlers.ts:299-360` region found nothing; the thread
   handlers use the raw-header + `'default'` pattern (`AiThreadHandlers.ts:28-29`) and drafts use
   `resolveRequestUser` (`draftRoutes.ts:9-10`). If the assist turn only carries header identity,
   the ledger query identity is header-based while the card accept is token-preferred — same user
   per browser session, but the authz story differs. Checked: AIHandlers.ts, AiThreadHandlers.ts,
   draftRoutes.ts. The stop-boundary covers it: do not wire ledger reads on an unresolved identity
   until the orchestrator's userId source is confirmed at the query call site.
2. **Server-built `workstate_proposal` vs model-fed answer narration for the `found` case.** I
   spec'd deterministic server frames (`ledger_answer` + server-built envelope) because they keep
   "retrieved evidence ≠ inference" mechanical; the PB-CH-4 precedent is a verbatim model-envelope
   emission (:2222). If the architect wants the model to narrate the fetched answer (with the spine
   injection precedent at :2465-2477), the frame design changes but every honesty invariant stays —
   flag before dispatch if a ruling exists.
3. **Disclosure ON the card itself.** `capturedAt` disclosure rides the `ledger_answer` frame and
   the chat answer; the card's summary comes from the generic workstate compile, which has no
   ledger knowledge. Surfacing capturedAt inside the card would need an additive optional field on
   the model-writable `workstate-intent` envelope — which I rejected as forgeable provenance.
   Checked: WorkstateProposalCard.tsx:34-48, workstateCompile summary path,
   workstate-intent.schema.yaml additionalProperties:false. If the architect wants it, it's a
   schema + non-model-channel decision, not a coder improvisation.

---
Report: DONE — draft at this path. Summary: full implementation spec for PB-CH-8 option (a) —
journal core + policy YAML + route capture hook at workspace-session.ts:57 (store byte-frozen;
WorkstateDraftAdapter.test.ts:308-319 is the load-bearing proof why), capture-window linkage spec'd
precisely as the packet's one new interpreted-logic item, asOf with always-disclosed capturedAt and
honest no-history frames, ledger intent riding the ONE forced tool with SERVER-built
workstate_proposal riding the existing compile→card→accept→shared-executor path (zero new
card/executor/adapter/tool), 9-row red-first matrix + per-user isolation + policy-off proof,
measured baselines at BOTH e629b0c6 and 3b9e2a18 (trunk moved under the composer mid-draft — PB-CH-6
merged 43cddb26; server tsc 26/6-file and app tsc 34/24-file IDENTICAL across both, app session
7/70 green both, full-app 53 failing files holds both, server scoped targeted 11/116/0 at the new
tip; surfacesAjv 5-fails shown to be a symlink artifact into Brad's tree). Dependency gate updated
to the merged reality (ancestor check on 43cddb26 at claim); app-side cites re-verified against the
post-PB-CH-6 tip (accept flow now `useWorkstateProposalFlow.ts` — cited, zero-diff for PB-CH-8;
aiStreamTypes pin-test constraint folded in). Measured vs inherited marked in the baseline table.
Open: assist-path actor resolution, server-frame vs model-narration ruling, on-card disclosure
(rejected as forgeable — needs architect ruling).
