# DRAFT — Lane-2 Runbook (page-builder-channel campaign) — PB-CH-9 Half B item 3

Status: DRAFT (worker docs deliverable; no product-code authority).
Worker: cl-coder lane 2, dispatch l2t2355, 2026-10-09.
Every claim below is cite-verified against code MERGED at lane-trunk code tip **c74c5214**
(name-and-read table: `.hermes/plans/PB-CH-9-report.wip-l2t2355.md`). Docs follow shipped code.
Lane facts (config paths, ports, fixture ids) are DATA references, not product truth: the
effective lane config is the env `CONFIG_PATH` = `/home/brad/.hermes/cl/lanes/2/lane2-config.yaml`
(md5 `cf7e833c721751f2406e0ee57ef2d810`, re-measured), NOT repo `config.yaml`.

Ten mandated topics (task description, verbatim list), each grounded in shipped code + the
adopted decision.

## 1. Compilation vs execution

- Compile is WRITE-FREE. `POST /api/drafts/compile` stores only the draft envelope and returns
  `{draftId, revision, reviewHash, canAccept, …}` (`server/src/drafts/FormDraftService.ts:28`,
  `:148`); `canAccept` is derived from diagnostics severity/outcome (`:145`), and no canonical
  record changes before accept or on reject.
- Accept applies WITHOUT a second AI call. The client sends only `{draftId, revision,
  reviewHash}` (`app/src/shared/ai/useWorkstateProposalFlow.ts:134-150`); the server returns the
  STORED compiled result — the client can never resubmit a document. "ZERO AI calls here, ever
  — no /ai/assist/stream, no re-propose, no 'confirmation pass'" (flow comment :137).
- Stale/blocked drafts refuse at accept: revision or reviewHash mismatch => 409
  (`FormDraftService.ts:155`, `:167`); `canAccept:false` => DraftError (`:159`).
- Previewing a workflow does not execute it: the workstate/analysis intents "write nothing" at
  compile (tool descriptions, `server/src/ai/submitSuggestionTool.ts:443` enum block).

## 2. Trust tiers (AR-2)

- Tier 1 (`focus` | `open-surface`): applies ON ARRIVAL after the server's compile (Ajv + spine
  + registry resolution already happened). The frame reaching the client is the compiler OUTPUT
  (`app/src/event-editor/right-pane/ai/assistStream.ts:247` `agent_action` member;
  `AiTabPanel.tsx:560-574` mount comment); the shared executor applies it
  (`useWorkstateProposalFlow.ts:179-196` -> `executeTier1`,
  `app/src/shared/session/useWorkstateExecutor.ts:48`). No records created; unsaved work is
  preserved by the executor's reference-identity rule (non-target tabs untouched, no
  replace/close, no confirm dialog — `AiTabPanel.tsx:568-571` comment).
- Tier 2 (session-document/workstate emission): ALWAYS a card — Accept/Reject/revise — never an
  auto-push. The rule (task-list :1030-1033, verbatim): "NEVER auto-push an unaccepted workstate
  (LWW 500 ms push = silent cross-device vandalism)." Enforced in code: no accept control exists
  until the server says `canAccept:true` (`useWorkstateProposalFlow.ts:10-12` header comment);
  `applyAcceptedWorkstate` REQUIRES an explicit `{accepted:true}` attestation
  (`useWorkstateExecutor.ts:90` `ACCEPT_ATTESTATION_MISSING`), and an unaccepted document has no
  path into the tab store (`useWorkstateExecutor.ts:19-24` comment).

## 3. Actor binding

- Drafts are bound to the resolved identity: `ctx.localIdentityService.resolveRequestUser(request)`
  with a 401 when unresolved (`server/src/drafts/draftRoutes.ts:9-10` pattern).
- The ledger never trusts raw-header identity: the journal actor is the RESOLVED identity
  (token > header), never the header fallback; unresolved/`default` actors capture nothing
  (`server/src/api/routes/workspace-session.ts:77-86`; policy `capture.requireResolvedActor: true`,
  `schema/workflow/workstate-journal.policy.yaml`; `WorkstateJournal.ts:369-370`).
- Ledger queries refuse for unresolved actors: `deps.actor === null || deps.actor === 'default'`
  => honest `no-history` with reason `actor-unresolved` (`server/src/workspace-session/ledgerQuery.ts:434-435`,
  wording `:372`).
- KNOWN-UNSUPPORTED (documented, not papered over): `GET /session/:userId` serves any user's
  session with no authz (`server/src/api/routes/workspace-session.ts:57-58` — raw
  `request.params.userId`); recorded as a backlog/authz gap in PB-CH-7's decision
  (`.hermes/plans/PB-CH-7-ledger-storage-decision.md:71`, `:279`). main.yaml's raw-header LWW
  `store.put` (`workspace-session.ts:76`) is deliberately byte-unchanged.

## 4. Proposal / revision lifecycle

- Identity triple: `draftId + revision + reviewHash` (`FormDraftService.ts:28`); revision
  increments per compile of the same draftId (`:78`), draftId continuity carries across revision
  asks (`useWorkstateProposalFlow.ts:92-96` sends the pending `{draftId, revision}`).
- Stale-hash rejection: compile-side 409 when the prior draft's revision/status moved
  (`FormDraftService.ts:71`); accept-side 409 on revision/reviewHash mismatch (`:155`, `:167`).
- Superseded client responses are discarded locally by compile sequence
  (`useWorkstateProposalFlow.ts:88-97` `seq !== compileSeqRef.current`).
- D4-style NO auto-re-propose: reject is ABANDON — no reject endpoint, zero store calls, zero
  fetches, pending identity cleared, in-flight compiles superseded
  (`useWorkstateProposalFlow.ts:171-176`; PB-CH-2 §6 precedent, echoed in the projection doc's
  "No automatic re-proposal", `ai-drafting-and-ui-projection.md:107`).
- Reject restores baseline trivially: nothing was ever written on reject, so the working page is
  unchanged by construction (tier-2 writes happen only through the accepted apply).

## 5. Shared executor (ONE implementation)

- `app/src/shared/ai/useWorkstateProposalFlow.ts` is the ONE compile->card->accept/reject
  implementation (header :2-6). Fork-detector, re-run at c74c5214:
  `grep -rn compileWorkstateDraft app/src` (non-test) shows exactly two hits — the flow itself
  (`:5` comment, `:92` the ONLY call site) and the api client method it calls
  (`app/src/shared/api/client.ts:2261`). No panel re-implements compile.
- Mounts riding it: `AiTabPanel.tsx:574`, `AnalysisChatPanel.tsx:42`,
  `PdfProtocolBuilder.tsx:137` ("no fork, no second compile/accept implementation here", :132).
- `applyAcceptedWorkstate` (`useWorkstateExecutor.ts:48`, `:79`) is the only sanctioned tier-2
  apply; the raw `replaceState` is never re-exported (`:22-24` comment); the hook performs ZERO
  putSession calls — the accepted apply pushes exactly once through useSessionSync's debounced
  effect (`:25-28` comment).
- Card testids (gate selectors): `workstate-card` (`WorkstateProposalCard.tsx:78`),
  `workstate-card-compiling` (:63), `workstate-card-accept` (:128), `workstate-card-reject`
  (:131/:142), `workstate-card-applied` (:121).

## 6. Current LWW / attach semantics

- `app/src/shared/session/useSessionSync.ts` (header :3-14): BOOT hydrates from localStorage then
  `GET /api/session`, adopting the server copy when newer; PUSH is debounced 500 ms
  (`PUSH_DEBOUNCE_MS = 500`, :24; timer :154) after any local change; ATTACH on window focus /
  visibilitychange GETs and adopts if the server moved ahead.
- ONE writer: both the sync hook and `useApplySessionDocument` funnel into
  `OpenTabsContext.replaceState` (:13-14 comment).
- Server side: `WorkspaceSessionStore.put` is a whole-session last-writer-wins upsert with fresh
  `updatedAt` and atomic tmp+rename (`server/src/workspace-session/WorkspaceSessionStore.ts:73-89`).
- Consequence for gates: an accept in device A => exactly one debounced `PUT /api/session`;
  device B sees it via ATTACH GET only (B never PUTs).

## 7. Approved ledger semantics (PB-CH-7 decision + MERGED PB-CH-8 shape only)

Decision of record: `.hermes/plans/PB-CH-7-ledger-storage-decision.md` (md5
`6b9f7e3cf23d53f5fdbbf7ddf88a9c87`, re-measured), CHOSEN OPTION: a at :297 — append-only
content-hashed **workstate-snapshot** journal under `var/sessions/{userId}/journal/`,
declarative capture/tag/retention policy YAML, audit-event linkage by server-known canonical ids
only, asOf queries that always disclose capturedAt and answer "no history stored then" honestly,
reattachment only through the tier-2 card and the shared executor — transport values only, never
knowledge records. One local term: **workstate-snapshot** (:225) — never revision/record/history-record.

The MERGED PB-CH-8 surface (all re-read at c74c5214; this section describes the merged shape,
not the spec's intentions):

- Intent: `query_workstate_history` (`server/src/ai/submitSuggestionTool.ts:443` enum;
  dispatch `server/src/ai/AgentOrchestrator.ts:2378`, host wired via
  `createLedgerQueryHost` `server/src/server.ts:1086`, `AgentOrchestrator.ts:911`). VERBS AND
  TERMS ONLY via `ledgerQuery` {term}|{recordId}; the model NEVER supplies a timestamp — the
  time anchor comes from server-known audit `occurredAt` with policy `query.anchor` breaking
  ties (`ledgerQuery.ts:10-12`).
- Frame: `{ type: 'ledger_answer', answer: LedgerAnswerEnvelope }`
  (`app/src/event-editor/right-pane/ai/assistStream.ts:265`; parsed/relayed verbatim :458-466;
  unrecognized status is DROPPED, never guessed).
- Envelope (`ledgerQuery.ts:62-90` + client mirror `assistStream.ts:212-229`):
  `status: 'found' | 'no-history'`; `asOf?` OPTIONAL BY CONTRACT — present exactly when a
  server-known audit time exists, OMITTED on refusal paths (policy-disabled / actor-unresolved /
  no-anchor; exactOptionalPropertyTypes: absent, never `undefined`; no fabricated epoch is ever
  emitted); `capturedAt?` present iff found; `disclosure?`, `links?`, `reason?`,
  `labEvents?` (labelled lab events, NOT workstate), `integrity?`, `answerText?`.
- Wording authority: `ledgerAnswerText` (`ledgerQuery.ts:377-380`) — found answers say
  `Workstate as captured at <capturedAt>` (disclosure override possible, e.g. `:477` "nearest
  stored snapshot at or before"), NEVER "as of"; the frame and the chat line share this ONE
  function. No-history answers use `REASON_TEXT` (:366-374), incl. `no-anchor` and
  `actor-unresolved`.
- Reattachment: `ServerBuiltWorkstateEnvelope {operation:'compose-workstate',
  tabs[{surface,target{recordId}}], activeTab?}` (`ledgerQuery.ts:95-100`) emitted as ONE
  `workstate_proposal` built FROM THE SNAPSHOT BYTES (`AgentOrchestrator.ts:2443`), riding the
  SAME tier-2 card + shared executor. `no-history` emits NO proposal: no card, zero session
  movement, never the current session as a stand-in (:2373-2377 comment). Snapshot tabs with no
  kind mapping yield `UNMAPPABLE_SNAPSHOT_TAB` diagnostics surfaced through the existing
  diagnostics channel (:2445-2456) — visible blocked card, never a guessed route.
- Policy is DATA: `schema/workflow/workstate-journal.policy.yaml` (journalVersion 1; capture
  enabled/minIntervalMs 30000/requireResolvedActor/skipUnchanged; linkage windowMs 900000,
  maxLinks 32, idFields [runId, studyId, recordId]; retention maxEntries 500/maxAgeDays 30;
  query anchor latest, labEventsMax 8). Deliberately `*.policy.yaml`, NOT `*.schema.yaml`
  (SchemaLoader auto-registration trap, header comment). Re-read PER call, never cached
  (`WorkstateJournal.ts:191`, `readPolicy` :287). **Policy-off rule: no policy YAML (or
  enabled:false, or malformed) => capture DISABLED, never defaulted** (:193-194, :364; query
  then answers honestly `no-history reason:policy-disabled` :495). The honest "no history stored
  then" contract rides `capturedAt` disclosure; a miss NEVER falls back to the current session.
- Capture point: the ROUTE call site only — `store.put` (main.yaml LWW, raw-header actor,
  byte-unchanged) then `journal.maybeCapture` with the RESOLVED identity
  (`workspace-session.ts:76-86`); the store itself stays byte-frozen (comment :36-38).
- Journal files: `var/sessions/{userId}/journal/<seq>-<uuid>.yaml` append-only
  (`WorkstateJournal.ts:282-283`); whole-file pruning only, oldest seq first, never the
  just-appended file (policy retention comment).

## 8. Seeding / cleanup

- Fixture pool (lane data dir `/home/brad/.computable-lab-lane2`, dataDir in lane2-config.yaml;
  all lane records are test data per Brad's ruling — never :3001/:5174 or the main data dir):
  run `records/runs/RUN-2026-09-19-run-vwr8/` (+ `records/run/RUN-2026-09-19-run-vwr8__2026-09-19-run.yaml`),
  protocols `records/protocol/PRT-4iaey2__purelink-genomic-dna-extraction-thermo-fisher.yaml`,
  `PRT-g5zy9e__…`, `PRT-wlj0qm__…` (all re-listed on disk 2026-10-09). Session dirs:
  `default`, `USR-BRAD`, `USR-LOCAL-ADMIN`.
- Session-doc snapshot/restore: snapshot `var/sessions/USR-BRAD/main.yaml` before the gate;
  teardown restores the snapshot copy and pastes final sha == baseline. Current pin (measured
  2026-10-09 00:0x EDT): `406bd1c6710c02f863f50d8a809f7dd31efb6df813f3d6abf3d8e4431b465d36`
  (supersedes the composition pin 8107ef6e…; PB-CH-8 gate accept legs moved it legitimately).
  Three-way semantics (spec OQ2): baseline for no-push legs, invariant within pending/rejected
  legs, restore target at teardown.
- Ledger journal seeding: via REAL policy-passing PUTs (a resolved-actor session PUT triggers
  `maybeCapture` per §7) — NEVER hand-written journal files. Existing journal entries under
  `var/sessions/USR-BRAD/journal/` (000001-… onward) came from PB-CH-8's own gate legs.
  Debounce floor minIntervalMs 30000 means two seeding PUTs need >30 s spacing or the second is
  skipped (`unchanged`/`interval` skip reasons, `WorkstateJournal.ts:102`).
- Cleanup: restore main.yaml from snapshot; journal entries are append-only transport state —
  pruning is policy-driven (maxEntries/maxAgeDays), not manual deletion, during a gate.

## 9. YAML restarts

- `tsx --watch` does NOT reload YAML for schema/policy registration at boot (lane header rule;
  task-list :1043-1044: "restart lane backend after YAML changes (tsx --watch does not reload
  YAML)"). After any schema/policy YAML change (e.g. PB-CH-8's
  `schema/workflow/workstate-journal.policy.yaml`), restart before gating.
- The ONLY sanctioned restart: `cl-lane-stack.sh 2 restart`
  (`/mnt/vast/home/brad/git/computable-lab/cl-lane-stack.sh`, `restart) stop; sleep 1; start`
  at :104). The script is BLOCKING => run with background=true (lane pitfall, burned twice).
  Verify after: `:3093/api/health` 200 and `:5193` 200. NEVER restart while a gate is live.
- Exception by design: the journal policy file itself is re-read PER call by WorkstateJournal
  (hot-reload without restart, `WorkstateJournal.ts:191`/`:287`; policy-off proof belongs to
  PB-CH-8's gate, not re-litigated here). Schema/policy REGISTRATION (Ajv, SchemaLoader) still
  needs the restart.

## 10. Known-unsupported

- Unregistered surfaces => visible diagnostic + no-op, never a guessed route: tier-1 frames
  without a routable target return diagnostic text ("Agent action carried no routable target —
  nothing was written.", `useWorkstateProposalFlow.ts:191-193`); the surface registry declares
  10 ids in `schema/registry/surfaces/surfaces.yaml` (:19-:83: find, run-plan, run-design,
  run-execute, results, analysis, knowledge, project, ingestion, protocol-review) — `literature`
  is NOT one (it is a surface LABEL per PB-CH-6 OQ1, `.hermes/plans/PB-CH-6-report.md:17`).
- Record kinds absent from `config/drafting/workstate-tab-kinds.yaml` (kinds at c74c5214:
  planned-run/execution-run->run, study->project, protocol->record-edit, vendor-pdf->protocol-review,
  analysis-revision/analysis-run->record-edit) produce `UNMAPPABLE_RECORD_KIND` diagnostics
  (`server/src/drafts/workstateCompile.ts:55`, `:287`), never a guessed tab; snapshot tabs
  likewise yield `UNMAPPABLE_SNAPSHOT_TAB` (`ledgerQuery.ts:102`, `:305`, `:311`).
- Ledger historical surface no longer mountable => blocked card with surfaced diagnostics
  (`AgentOrchestrator.ts:2445-2456` forwards `UNMAPPABLE_SNAPSHOT_TAB`/`NO_ANCHOR`/`UNKNOWN_RECORD`
  through the diagnostics channel), never a silent bare answer.
- Generic component-tree page building remains DEFERRED (`architecture-of-record.md` §3b :83
  committed text; §8 item 1).
- `GET /session/:userId` unauthenticated cross-user read: KNOWN-UNSUPPORTED backlog (§3 above).
- `analysis-run.schema.yaml` has NO `.ui.yaml` triplet companion at c74c5214 (only
  `schema/knowledge/analysis-run.schema.yaml` exists; find re-run) — the ANR-000002
  `UI_SPEC_NOT_FOUND` evidence debt (AS-LANE2-PBCH6-ANR-UISPEC-GAP) stays OPEN with its
  disposition owed at PB-CH-9 close (see evidence manifest; the worker does not close it).
