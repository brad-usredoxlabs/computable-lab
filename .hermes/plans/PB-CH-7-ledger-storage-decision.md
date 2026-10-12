# PB-CH-7 — Workstate-ledger storage DECISION PACKET
lane: 2 | author: architect | date: 2026-10-06 (EDT)
scouted against: /mnt/vast/home/brad/git/cl-integration-2 @ cl/integration-2 tip 7c418e36 (read-only; nothing committed)
gates: PB-CH-8 hard gate fires on the CHOSEN OPTION line at the end of this artifact.

## 0. GROUND FACT (state before anything else)

`WorkspaceSessionStore.put()` clobbers `var/sessions/{userId}/main.yaml` on every
PUT — tmp-then-rename, whole-document overwrite. **Zero history exists.** Today the
system cannot answer "what did my workstate look like yesterday?" and must never
promise recovery of what was never stored.

Verified first-hand (all paths relative to the lane-2 worktree):
- `server/src/workspace-session/WorkspaceSessionStore.ts:4-9` — header: one YAML per
  user under `var/sessions/{userId}/`, explicitly "Transient UI state, outside the
  records git tree (same class of thing as var/ai-threads/*)"; conflict policy
  "last writer wins", `updatedAt` returned so a later device can adopt.
- `server/src/workspace-session/WorkspaceSessionStore.ts:74-88` — the clobber site:
  `put()` rebuilds `{version:1, userId, tabs, activeTabId, updatedAt}` wholesale,
  writes `tmp` then `rename` (lines 84-86). No prior content is read, kept, or
  appended anywhere. `get()` (lines 55-71) yields the empty session on ENOENT.
- `server/src/api/routes/workspace-session.ts:43-60` — the PUT path: validates
  `{version:1, tabs, activeTabId}` with Ajv against
  `schema/workflow/lab-session.schema.yaml` (lines 19-20, 50-56), then `store.put()`
  (line 57). Route registered lazily at `server/src/server.ts:1507-1508`; the store
  is constructed inside the route registrar (`workspace-session.ts:33`).
- `schema/workflow/lab-session.schema.yaml:4-11` — the session doc is declared a
  **transport document**: "UI state, NOT a record kind, NOT a biological CTX-…
  context"; no lint/ui companion by design. `version` is `const: 1` (line 18).
- Frontend push loop: `app/src/shared/session/useSessionSync.ts:1-14` — tmux
  semantics, BOOT/ATTACH adopt-newer, PUSH debounced 500 ms
  (`PUSH_DEBOUNCE_MS`, line 24); ONE writer via `OpenTabsContext.replaceState`
  (`useApplySessionDocument`, lines 43-53).
- `var/` is gitignored (`.gitignore:23-24` — `server/var/`, `var/`), so **the
  session document has no git history either**. `RepoAdapter.getHistory`
  (`server/src/repo/types.ts:174-179`; impl `server/src/repo/EmbeddedGitRepoAdapter.ts:232-233`,
  used by `server/src/mcp/tools/gitTools.ts:92` and `server/src/lab-sync/wiring.ts:64`)
  only covers paths inside the records git tree — not sessions.

## 1. MACHINERY AN EVENT LINKAGE COULD RIDE (verified)

- **Audit events** — `server/src/governance/AuditEventService.ts:16-41`: appends an
  `audit-event` record (schema `schema/governance/audit-event.schema.yaml`, required
  `actor/action/subjectType/subjectId/occurredAt`; actor is "USR- id or system
  identity"). Record ids `EVT-…` minted server-side (line 18); `occurredAt` is the
  **server clock at append** (lines 17, 31). Wired at `server/src/server.ts:698`.
  Append is deliberately **best-effort** — failures are caught and logged, never
  failing the business op (lines 38-40).
- **A real hook exists**: lifecycle transitions append audit events recording what
  the transition MEANT (`server/src/api/handlers/RecordHandlers.ts:978-982`).
- **Append-only enforcement**: `audit-event`, `record-revision`, `signature` are in
  `appendOnlyKinds` and can never be edited or deleted via the record API
  (`RecordHandlers.ts:726-729`, `1176-1179`).
- **Snapshot prior art** — `server/src/revisions/RecordRevisionService.ts`:
  deterministic canonical JSON + sha256 `contentHash` (lines 20-25), content-addressed
  `REV-…` ids with dedupe-on-existing (capture, ~lines 66-78), `createdBy` actor, and
  **read-time integrity re-verification** (`read()` recomputes `contentHash(snapshot)`
  and throws `INVALID_REVISION` on mismatch, lines 51-57). This is the exact
  snapshot-verification machinery a workstate ledger should reuse — but note
  `record-revision` is a RECORD kind living in the git tree; workstate snapshots must
  NOT become one (transport, not knowledge).
- **Rotating-journal prior art** — `server/src/ai-threads/AiThreadStore.ts`:
  `append()` (line 108) plus threshold-triggered `rotateSnapshot` writing timestamped
  snapshot files (lines 138-139, 188-195). Precedent for bounded capture/retention in
  `var/`.
- **Actor resolution convention** — `server/src/security/LocalIdentityService.ts`:
  `resolveRequestUser()` (from ~line 84) prefers a valid `x-cl-session` token
  (lines 36-41, 85-96), then `x-user-id` / `x-computable-user-id` headers
  (lines 98-100), rejecting inactive users. **GAP:** the workspace-session routes do
  NOT use it — they resolve the raw `x-user-id` header with a `'default'` fallback
  (`workspace-session.ts:22-25`), and `GET /session/:userId` (lines 39-41) lets any
  caller read any user's session with no authorization check. Flagged below.
- **Timestamp reliability**: audit `occurredAt` is server-clock at append (reliable,
  server-side). Record-side timestamps vary in trust: `execution-run` requires
  `startedAt` (`schema/workflow/execution-run.schema.yaml:17,52`) and optional
  `completedAt` (line 56), but plate-event `at:` is OPTIONAL — "Actual execution
  timestamp, if known" (`schema/workflow/events/plate-event.schema.yaml:47-49`).
  Event↔snapshot linkage must ride audit `occurredAt`, never an optional plate `at:`.

## 2. PER-OPTION ANALYSIS

Worked scenario used for every option (same fixture for all three):
Tuesday 14:02 — Brad has run tab A open on RUN-7F3 (DNeasy tissue batch), plus a
plate-snapshot tab and a protocol tab; active tab = A. The debounced PUT lands
14:02:41. At 14:05 the run's lifecycle transitions and an audit event
`EVT-9C41…` (`action: run_batch_started`, `subjectId: RUN-7F3`) appends,
`occurredAt` = 14:05:02. Wednesday, on a second machine, Brad opens a chat in tab B
and asks: *"what did my workstate look like when we ran the DNeasy batch?"* Expected
outcome: a retrieved Tuesday-14:02 workstate, shown on a reviewed card, and Accept
re-attaches it in B.

### Option (a) — append-only snapshot journal of the session doc (YAML capture/tag policy)

Mechanics. On each PUT that passes a declarative capture policy, append the
content-addressed session doc as its own file under
`var/sessions/{userId}/journal/` (unique filename per capture: seq + UUID; reuse the
store's atomic tmp+rename, `WorkspaceSessionStore.ts:84-86`). Each entry stores:
`capturedAt` (server clock), `contentHash` (reuse `RecordRevisionService.canonical/
contentHash`), the snapshot, resolved actor, and optional `links: [EVT-… / recordId]`
— event identities the SERVER already knows (audit events whose `subjectId` appears
in the snapshot's tab payloads, within the capture window). Never model-invented ids.
Query = `asOf(t)`: latest snapshot with `capturedAt ≤ t`.

Worked example. The 14:02:41 PUT passes capture policy → journal file
`000123-<uuid>.yaml` (hash `sha256:…`, actor `USR-brad`, links inferred server-side:
RUN-7F3 appears both in the snapshot's tab A payload and as `EVT-9C41…`'s
subjectId). Wednesday: the retrieval tool answers "as of 14:05:02 Tue → nearest
captured state 14:02:41 Tue" and compiles a tier-2 card; Accept goes through the
shared executor → `replaceState` → exactly one push. Nothing between 14:02:41 and
14:05:02 was ever PUT, so nothing changed — the nearest-at-or-before answer IS the
state at Y. If a snapshot gap were material, the answer must label itself
"captured 14:02:41, nearest available at or before 14:05:02."

Cost. Small: one server module + one policy YAML + a capture hook at the single
`put()` call site. Zero schema churn — history metadata lives OUTSIDE the
`version: 1` payload (the const at `lab-session.schema.yaml:18` stays).
Prior art: `RecordRevisionService` (hash/verify/dedupe), `AiThreadStore.rotateSnapshot`
(rotation/retention), existing append-only discipline (`RecordHandlers.ts:726-729`).

Failure modes and mitigations.
- Unbounded growth → declarative retention (count + age caps, AiThreadStore precedent).
- "State at Y" is `≤ Y`, an approximation when no capture landed at Y → the contract
  must always surface `capturedAt`; never claim the snapshot is instantaneous.
- Two devices racing inside the 500 ms debounce both PUT → both snapshots append;
  journal is append-only so neither is lost (main.yaml stays LWW, unchanged).
- Clock skew: `asOf` compares server-stamped `capturedAt` to server-stamped audit
  `occurredAt` — same clock both sides; plate-event `at:` excluded.
- Sensitive UI state (tab titles) persisted → user-scoped access only, retention caps.

### Option (b) — versioned / mergeable session store

Mechanics. Per-tab versioned entities with branch/merge semantics; the session doc
becomes a derived view; history comes from per-entity version chains.

Worked example. Tuesday's writes create versions on the RUN-7F3 tab, the
plate-snapshot tab, etc. Wednesday's `asOf` query must replay version chains up to
14:05 and MERGE concurrent device branches. Result: a tab set that **no one ever
actually had open** — a synthetic workstate. Presenting it on the tier-2 card means
"reviewing" a state that was never experienced, which corrupts the meaning of
reviewed reattachment.

Cost. Highest: session schema v2 (`const: 1` breaks), a merge engine for UI state,
tab-slot re-derivation interplay (`app/src/shared/session/tabId.ts`, noted
`lab-session.schema.yaml:9-10`), conflict UI, and rework of the single-writer
executor PB-CH-3 builds. Failure modes: merge semantics for "which tab is active"
are unprincipled; every merge is an invented workstate.

### Option (c) — reconstruction by replaying existing records / timestamps

Mechanics. Derive "the workstate at Y" by replaying records/timestamps.

Worked example. Wednesday's query finds `RUN-7F3.startedAt` and the audit event at
14:05:02 — i.e. **what happened in the lab**, which records answer fine. But which
tabs were open, which was active, which right-pane mode was set — that is UI state
that exists in NO record (ground fact §0), and the session file is gitignored with no
history (`.gitignore:23-24`). **Replay evidence for session state: none exists — I
searched for it (audit machinery, git history machinery, ai-threads) and there is
nothing from which tabs/activeTab/right-pane could be reconstructed.** Making (c)
work would require persisting UI state as knowledge records — explicitly forbidden:
the ledger entries are TRANSPORT values, and the schema already declares the session
doc "NOT a record kind, NOT a biological CTX-…" (`lab-session.schema.yaml:4-11`).

Worked-example outcome honestly stated: "your workstate at 14:05 Tue was never
stored; here is what the lab recorded at that time." That is exactly the answer the
system must give TODAY — and must keep giving for any period with no captures.

Cost. Zero to build; infinite to deliver the promised feature.

## 3. PROPOSED RED-FIRST TEST MATRIX (per PB-CH-8, all seven rows)

For the CHOSEN option these are blocking; rows marked ✗-expect are the honest-answer
tests that must pass by returning the truthful negative, not by degrading.

1. **Capture correctness** — PUT passing capture policy appends exactly one journal
   entry whose recomputed `contentHash` matches its stored hash and whose snapshot
   round-trips to the byte-canonical tab content; PUT failing policy appends zero.
2. **Reconstruction correctness (`asOf`)** — seeded journal; query at audit-event
   `occurredAt` returns the latest snapshot `capturedAt ≤ t`, with `capturedAt`
   surfaced in the response; tie broken by capture sequence, never content order.
3. **Event attribution** — snapshot links contain ONLY server-known canonical ids
   (EVT-… audit ids / recordIds present in the snapshot's own tab payloads); a model
   proposing a plausible but unknown id must be refused the link; a lifecycle
   transition (RecordHandlers.ts:978-982 hook) followed by a PUT links without any
   client-supplied event id.
4. **Missing-history honest answer** — query for a time before the first capture
   (or before the feature existed) returns the explicit "no workstate history stored
   for that time" contract; ✗-expect: the current session must NEVER be returned as
   a stand-in.
5. **Authorization** — ledger reads resolve the actor via `LocalIdentityService.
   resolveRequestUser` (session token > header); user A reading user B's ledger is
   refused; ✗-expect the current `workspace-session.ts:22-25` raw-header behavior.
6. **Concurrent writes** — two PUTs from different devices within one debounce
   window both land in the journal (append-only, distinct seq), main.yaml remains
   LWW, no torn files (rename atomicity, `WorkspaceSessionStore.ts:84-86` pattern).
7. **Integrity** — mutate a journal file on disk; `asOf`/read detects the
   `contentHash` mismatch and returns a visible integrity diagnostic, skipping the
   corrupt entry; ✗-expect silent substitution of a neighbor snapshot.
8. **Retention** — declarative cap exceeded ⇒ oldest pruned per policy; queried
   range fully pruned ⇒ row-4 honest answer, not a partial lie.
9. **Reattachment** — Accept restores ONLY the approved projection via the shared
   executor with EXACTLY ONE session-sync push (PB-CH-3 harness); Reject and Query
   move nothing; historical surface absent today ⇒ visible diagnostic, no guessed
   route (screenshots per PB-CH-8's `verified by`).

(For the record, per-option: (b) would additionally need merge-semantics suites that
have no honest acceptance bar — a reconstructed state nobody saw cannot be
browser-reviewed; (c) could only ever pass rows 4/9-as-negative.)

## 4. DECISION AND BINDING CONTRACT FOR PB-CH-8

**I choose option (a)** — the append-only snapshot journal. Rationale in one line
each: (b) invents never-experienced merged workstates and forces a schema-v2 + merge
engine to answer a history question that needs no merging; (c) is impossible without
violating the transport-not-knowledge principle — replay evidence for UI state does
not exist (§2c). (a) reuses three proven in-repo machineries
(`RecordRevisionService` hash/verify, `AiThreadStore` rotation, the store's atomic
rename), keeps the `version: 1` transport payload untouched, and its only honest
weakness (capture-time granularity) is contractually disclosed rather than hidden.

The contract, binding on PB-CH-8:

1. **Storage & ontology.** Journal at `var/sessions/{userId}/journal/` — outside the
   records git tree, alongside `main.yaml`. Entries are TRANSPORT values: never a
   record kind, never `record-revision`, never in the knowledge layer, never
   referenced by claims/evidence. One local term: **workstate-snapshot**. Do not
   call it a revision (reserved: `record-revision`) or a record. History metadata
   (capturedAt, contentHash, actor, links, seq) stays OUTSIDE the `version: 1`
   lab-session payload; the payload schema is not extended.
2. **Declarative vs interpreted.** NEW YAML (data): capture policy (debounce floor /
   min-interval between captures, tag-linkage rules by subject-type, retention
   count+age caps, query `asOf` policy) declared alongside the session schema family
   (pattern: `schema/workflow/`, compare `lab-session.schema.yaml`'s transport-doc
   note — the policy YAML gets the same "transport, no knowledge-layer companion"
   header). Code (imperative): interprets the policy at the single `put()` site,
   hashes, appends, prunes, answers `asOf`. ZERO hardcoded policy branches —
   removing the policy YAML must leave capture disabled, not defaulting.
3. **Actor attribution.** Ledger write/read actor =
   `LocalIdentityService.resolveRequestUser` resolution (session token first, then
   header; inactive users refused — `LocalIdentityService.ts:84-100`). PB-CH-8 must
   pass `ctx.security.identityService` into the session route wiring
   (`server.ts:1507-1508` site); the `'default'` fallback actor may keep main.yaml
   LWW behavior but MUST NOT create journal entries.
4. **Event linkage.** Links carry only canonical server-known ids: `EVT-…` audit
   event ids (minted `AuditEventService.ts:18`, appended via the lifecycle hook at
   `RecordHandlers.ts:978-982`) and recordIds already present in the snapshot's tab
   payloads, matched server-side within the capture window. Event↔snapshot alignment
   uses audit `occurredAt` (server clock), never optional plate-event `at:`.
   No model-invented links, ever (PB-CH-8 text already binding).
5. **Query semantics.** Retrieval rides the existing server tool channel +
   ResolveSpine. `asOf(t)` ⇒ nearest snapshot with `capturedAt ≤ t`, response ALWAYS
   states `capturedAt` and says the state is "as captured at", never "as of". Answers
   distinguish retrieved historical evidence from inference.
6. **"No history stored then" contract.** Exact user-visible shape: state that no
   workstate history exists for that time (feature not yet capturing, or predating
   capture, or pruned per retention), optionally followed by what the RECORDS
   honestly show at that time, clearly labeled as lab events, not workstate. Never
   fall back to the current session as a stand-in.
7. **Concurrency.** Journal appends are single-writer-per-capture, unique-seq
   filenames, atomic tmp+rename (reuse `WorkspaceSessionStore.ts:84-86`); no
   read-modify-write on the journal. `main.yaml` conflict policy is unchanged (LWW).
8. **Integrity.** Read-time `contentHash` re-verification with `INVALID_REVISION`-style
   visible diagnostic (pattern `RecordRevisionService.ts:51-57`); corrupt entries are
   skipped and surfaced, never silently replaced.
9. **Retention & access.** Declarative caps (count + age) interpreted by code;
   pruning removes whole journal files only. Access = the resolved actor's own
   ledger only.
10. **Reviewed reattachment.** Query and Reject touch nothing. Accept compiles the
    historical session document into the SAME tier-2 proposal card used for live
    workstate proposals and restores ONLY the approved projection through the shared
    PB-CH-3 executor (`useApplySessionDocument`/`replaceState`, single push).
    Historical surface no longer mountable ⇒ visible diagnostic, never a guessed
    route. No replaying experiments, rerunning analyses, or recreating records.

## 5. FLAGS — things scouting could NOT confirm / existing gaps

- **No audit hook exists on the session PUT path today.** `registerWorkspaceSessionRoutes`
  takes only `ctx` and builds its own store (`workspace-session.ts:32-33`); no
  `auditService`/`identityService` is passed in. PB-CH-8 wires these.
- **Unauthenticated cross-user session read exists today**: `GET /session/:userId`
  (`workspace-session.ts:39-41`) with raw-header resolution — a read-only "attach"
  surface with no authorization. I did NOT widen scope to fix it here; it is out of
  PB-CH-7/8's ledger scope and belongs as a lane-2 backlog candidate to the
  orchestrator. The ledger itself must not inherit this pattern.
- **Audit appends are best-effort** (`AuditEventService.ts:38-40` swallows errors),
  so event linkage may legitimately be sparse; the contract treats links as
  optional evidence, never required for a snapshot to be valid.
- **No existing retention/pruning config was found** anywhere in
  `server/src/config/types.ts` or `schema/` (grep: retention|prune|cleanup|maxAge,
  no hits) — the retention policy YAML is genuinely new data, not an extension of an
  existing policy file.
- **Capture-window semantics** (which audit events fall inside a window) is specified
  in §4.4 but has no existing implementation to reuse; it is the one genuinely new
  piece of interpreted logic beyond hash/append/prune.
- Backend `exactOptionalPropertyTypes` applies to every PB-CH-8 field above
  (lane-2 header rule): optional journal fields mean absent, never `undefined`.

CHOSEN OPTION: a — append-only content-hashed workstate-snapshot journal under var/sessions/{userId}/journal/, declarative capture/tag/retention policy YAML, audit-event linkage by server-known canonical ids only, asOf queries that always disclose capturedAt and answer "no history stored then" honestly, reattachment only through the tier-2 card and the shared executor — transport values only, never knowledge records.
