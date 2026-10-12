# PB-CH-8 report — Workstate journal + ledger query (lane 2, l2t1405, RESUMED run)

Report path: `.hermes/plans/PB-CH-8-report.wip-l2t1530.md`
Branch: `pb-ch-8-lane2-l2t1405`
Claim SHA (worktree HEAD at claim): `3b9e2a18`
Ancestor gate (pasted):
```
$ git -c core.fileMode=false merge-base --is-ancestor 43cddb26 HEAD
ANCESTOR 43cddb26 OK
$ git -c core.fileMode=false merge-base --is-ancestor e629b0c6 HEAD
ANCESTOR e629b0c6 OK
```

## Resume bookkeeping (this session is the SECOND run of this item)

- Run 1 died on a context-compression error with uncommitted work. Per dispatch, the
  recovered WIP was IMMEDIATELY protected as one WIP commit:
  `10c3b65d wip(PB-CH-8): journal + ledger query WIP recovered from dead run (pre-review)`
  — 9 files, +1329/-5: `WorkstateJournal.ts` (520 ln), `WorkstateJournal.test.ts` (274 ln,
  5 tests), `ledgerQuery.ts` (408 ln), `schema/workflow/workstate-journal.policy.yaml` (49 ln),
  route edits (`workspace-session.ts` +39), `submitSuggestionTool.ts` (+31) and its
  analysis/test/workstate pins. Pathspec-listed only; `git add -A` never used;
  `server/model.pkl` and the cl-lane-sync untracked copies were never staged.
- Nothing in the worktree was reset, cleaned, or reverted. All run-2 work sits on top of
  `10c3b65d` and lands in ONE logical code commit (sha on the DONE line below).
- `server/src/workspace-session/index.ts` needed NO edit: it exports only the store
  (unchanged since 4f76d08f); the new modules are imported by path, matching the existing
  import style everywhere else.

## Which verifications ran at which HEAD (honest mapping)

- Baselines re-measured at pristine `3b9e2a18` in a throwaway worktree
  (`/mnt/vast/home/brad/git/wt/PB-CH-8-pristine-baseline`, detached at 3b9e2a18, the 61
  lane-synced untracked files replicated 1:1 symlinks-as-symlinks, node_modules links to
  the trunk) AND at WIP `10c3b65d` in the main worktree. Script: `/tmp/pbch8-baselines.sh`,
  outputs `/tmp/pbch8-baseline/`.
- Verifications 1–10 below were run at the working tree on top of `10c3b65d` (post-WIP,
  pre-code-commit) — the final battery script `/tmp/pbch8-final.sh`, outputs
  `/tmp/pbch8-final/`. The code commit contains exactly the tree that was measured.
- Server-side RED-first (spec "First targeted check", module-absent RED) was performed by
  RUN 1 (recorded in the spec's own matrix process; run 1's GREEN scoped suite is what the
  WIP commit carried). Run 2 re-proved RED for the app-side legs via stash (see V1).

## Verification 1 — RED outputs, then green

App-side RED proof (run 2, at 10c3b65d + working edits, with the five app edits STASHED —
the new ledger test files present against the pre-PB-CH-8 app code):
```
FAIL  assistStream.ledger.test.ts > a found ledger_answer frame parses verbatim (links OMITTED when absent, never undefined)
FAIL  assistStream.ledger.test.ts > a found frame with links keeps them verbatim (provenance lines ride the frame)
FAIL  assistStream.ledger.test.ts > a no-history frame keeps reason + labEvents + the server-built answerText (§4.6 honest shape)
FAIL  chatReducer.ledgerTrace.test.tsx > MessageLog — a found ledger answer renders verbatim with provenance lines (capturedAt + links)
FAIL  chatReducer.ledgerTrace.test.tsx > MessageLog — a no-history ledger answer renders the honest server text with its labeled lab events
FAIL  useChatThread.ledger.test.tsx > a found ledger_answer becomes ONE kind:"ledger" trace entry with the server text verbatim + links
FAIL  useChatThread.ledger.test.tsx > a no-history ledger_answer becomes the honest trace entry with its labeled lab events
FAIL  useChatThread.ledger.test.tsx > the never-default forcing seam survives and the ledger case exists (source-pin)
Test Files  3 failed (3)
Tests  8 failed | 2 passed (10)
```
After `git stash pop` (GREEN):
```
Test Files  3 passed (3)
Tests  10 passed (10)
```
Server-side: run 1 measured RED (module absent) then GREEN per the spec's First targeted
check; run 2's new server test files (ledgerQuery.test.ts, AgentOrchestrator.ledger.test.ts,
workspace-session.journal.test.ts) were authored against the recovered implementation —
their RED-first leg is run 1's, stated honestly rather than re-faked.

## Verification 2 — server scoped suite

`cd server && npx vitest run src/workspace-session src/drafts src/api/routes`
- Baseline at 3b9e2a18 (re-measured): **11 files / 116 tests / 0 failed** (matches spec pin).
- Final: **14 files / 145 tests / 0 FAILED** (11 baseline + WorkstateJournal.test.ts 13,
  ledgerQuery.test.ts 12, workspace-session.journal.test.ts 4 — net +29 tests, zero failures).

**surfacesAjv symlink artifact (do not chase, do not "fix")** — evidence re-verified at this
HEAD:
```
$ git -c core.fileMode=false ls-files server/src/surfaces/
server/src/surfaces/surfaces.deepLink.test.ts
server/src/surfaces/surfaces.test.ts
server/src/surfaces/surfaces.ts
$ ls -la server/src/surfaces/
lrwxrwxrwx 1 3000 3000 78 Oct  3 11:57 surfacesAjv.test.ts -> /mnt/vast/home/brad/git/computable-lab/server/src/surfaces/surfacesAjv.test.ts
```
`surfacesAjv.test.ts` is an untracked SYMLINK into Brad's live tree; its failures resolve
`surfaces.ts` under `/mnt/vast/home/brad/git/computable-lab/` (Brad's registry vs lane
registry drift). NOT a lane regression; the symlink was never edited or deleted; the scoped
command above excludes `src/surfaces` per the spec's baseline row.

## Verification 3 — server `src/ai` failing-file set

`cd server && npx vitest run src/ai`
- Pristine 3b9e2a18: 10 failed files / 21 failed tests (620 total).
- Final: **10 failed files / 21 failed tests / 603 passed (624)** — 81 files (80 + new
  AgentOrchestrator.ledger.test.ts, 4 tests, green).
- `comm -3` of sorted FAIL-file lists (pristine vs final): **EMPTY** (identical 10-file set:
  AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden,
  AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot,
  chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema).

## Verification 4 — server tsc pin

`npm run typecheck -w server` (via `cd server && npm run typecheck`): **26 error lines**.
Position-normalized diff vs pristine (`sed 's/([0-9]*,[0-9]*)//'` + sort + diff): **EMPTY**.
`comm -3` of file sets: **EMPTY** — same 6-file set:
`src/ai/AgentOrchestrator.ts`, `src/api/handlers/ProtocolIntakeHandlers.ts`,
`src/api/handlers/RecordHandlers.ts`, `src/lint/AuthoringGuard.ts`,
`src/scripts/bootstrapAdmin.ts`, `src/store/RecordStoreImpl.ts`.
My files add ZERO tsc errors (the pre-existing AgentOrchestrator.ts errors are the same
lines as pristine; normalized diff proves line-for-line identity).

## Verification 5 — app session + right-pane/ai

- `cd app && npx vitest run src/shared/session` → **7 files / 70 tests / ZERO failures** (pin holds).
- `cd app && npx vitest run src/event-editor/right-pane/ai` → 3 failed files / 219 tests
  passed (35 files = 32 baseline + 3 new ledger test files). `comm -3` of FAIL-file lists vs
  the claim-time set: **EMPTY** — same 3 pre-existing failing files
  (draftChanges.test.ts, ParameterAnswerInput.test.tsx, useChatThread.deckLayout.test.tsx —
  all untracked cl-lane-sync copies, not mine). NO new failing file.

## Verification 6 — full app suite

`cd app && npx vitest run` (final run, `/tmp/pbch8-final/final-app-full3.txt`):
**53 failed files / 63 failed tests / 2011 passed (303 files, 2074 tests)**.
- `comm -3` src FAIL-file sets (pristine 34 files vs final 34): **EMPTY**.
- `comm -3` e2e FAIL-file sets (19 vs 19): **EMPTY**.
- Pass count rose 2001 → 2011 = exactly my 10 new app ledger tests; failing-FILE-SET is the
  bar and it is identical.
- Cross-check run excluding my 3 new app test files
  (`npx vitest run --exclude '**/*ledger*.test.*'`): **53 failed / 63 failed tests / 2001
  passed (300 files)** — byte-identical to the pristine baseline, proving my new files are
  not implicated in any failure.
- FLAKE disclosure: one intermediate full-suite run showed
  `src/graph/events/forms/AddMaterialForm.biological.test.tsx` failing
  (`expected 0 to be greater than 0` on `onChange.mock.calls.length`). It PASSES in
  isolation, PASSES in the final full run, and PASSES in the exclude-my-files run; the
  file imports nothing from the AI stream stack I touched (grep over
  `src/graph/events/forms/` for assistStream/chatReducer/useChatThread/MessageLog/ai.css =
  zero hits). It is a load-order/timing flake in the shared full-suite pool (the lane
  task-list records prior flake history for full-suite runs), not a PB-CH-8 regression.

## Verification 7 — app tsc pin

`cd app && npx tsc --noEmit` → **34 error lines**. Position-normalized diff vs pristine:
**EMPTY**. `comm -3` of file sets: **EMPTY** (24-file identity). (An intermediate tree state
briefly added 6 TS2339 errors in assistStream.ts — the dispatchFrame parse type lacked the
`answer` field; fixed before the measured final state.)

## Verification 8 — scope diff

`git -c core.fileMode=false diff --name-only HEAD` (code commit contents):
```
app/src/event-editor/right-pane/ai/MessageLog.tsx
app/src/event-editor/right-pane/ai/ai.css
app/src/event-editor/right-pane/ai/assistStream.ts
app/src/event-editor/right-pane/ai/chatReducer.ts
app/src/event-editor/right-pane/ai/useChatThread.ts
server/src/ai/AgentOrchestrator.ts
server/src/ai/submitSuggestionTool.protocolEdit.test.ts
server/src/ai/types.ts
server/src/api/handlers/AIHandlers.ts
server/src/api/routes/workspace-session.ts
server/src/server.ts
server/src/workspace-session/WorkstateJournal.test.ts
server/src/workspace-session/WorkstateJournal.ts
server/src/workspace-session/ledgerQuery.ts
```
plus new files: `server/src/workspace-session/ledgerQuery.test.ts`,
`server/src/ai/AgentOrchestrator.ledger.test.ts`,
`server/src/api/routes/workspace-session.journal.test.ts`,
`app/src/event-editor/right-pane/ai/{assistStream.ledger.test.ts, chatReducer.ledgerTrace.test.tsx, useChatThread.ledger.test.tsx}`
(and the WIP commit's 9 files). Every file maps to the spec's allowed list:
- `server.ts` + `AIHandlers.ts` + `types.ts`: the OQ1b ledger-query dep threading + resolved
  actor threading + `ledger_answer` AgentEvent member / `ledgerActor` request field — named
  in the dispatch's STEP 2c and required by the orchestrator handler.
- `ai.css`: the ledger trace-chip styling (part of the §5 render).
- `submitSuggestionTool.protocolEdit.test.ts`: enum-pin update for the eighth intent
  (the pin enumerates the intent union; the WIP commit widened it).
- FROZEN SEAMS: `git diff --name-only HEAD | grep -E 'WorkspaceSessionStore|lab-session.schema|useWorkstateProposalFlow|useSessionSync|workstate-intent|agent-action.schema'` → **NONE**. Zero hunks in any byte-frozen file. `aiStreamTypes.pin.test.ts` untouched and green (5/5).

## Verification 9 — policy-off proof WITHOUT a restart

The lane stack was NOT restarted (shared with a live browser gate). The spec states YAML is
read PER call, so the proof is per-call re-read tests on ONE live instance:

1. Journal unit (`WorkstateJournal.test.ts`, "policy re-read PER call (no boot cache)"):
   capture ON → flip YAML `enabled:false` IN PLACE → next `maybeCapture` on the SAME
   instance returns `captured:false reason:'policy-disabled'`, journal file count stays 1;
   DELETE the YAML → capture stays disabled (never defaulted); `asOf` on the same instance
   answers `no-history reason:'policy-disabled'`. GREEN.
2. Ledger host (`ledgerQuery.test.ts`, "policy-off answers honestly per call"): seeded +
   captured, then `rm(policyPath)` → the very next `host.run(...)` on the SAME host answers
   `no-history reason:'policy-disabled'` with NO workstateProposal; restore the YAML → the
   next query answers `found` again. No restart, no cache. GREEN.
3. Route leg (`workspace-session.journal.test.ts`, real policy YAML copied into a harness
   schemaDir, fake `localIdentityService`): PUT 1 (resolved actor) → 200 + exactly 1 journal
   entry; **delete the policy YAML** → PUT 2 still **200-green** (main.yaml round-trips,
   activeTabId honored) and the journal dir still holds only the first entry (capture
   disabled per-call); restore YAML → capture lives again. GREEN (4/4).

## Verification 10 — no forbidden touches

No :3001/:5174 access, no lane-stack restart, no lane-stack process was touched, no git
command ran in the trunk without `-c core.fileMode=false`, no browser gate run (per dispatch).

## Red-first matrix mapping (rows 1–11)

| Row | Test |
| --- | --- |
| 1 capture correctness | WorkstateJournal.test.ts "capture correctness" (hash-append, byte-canonical round-trip; disabled/interval/unchanged/unresolved-actor/missing-file ⇒ ZERO) + route leg workspace-session.journal.test.ts |
| 2 asOf reconstruction | "asOf reconstruction" (latest capturedAt ≤ t WITH capturedAt; ties by seq) |
| 3 event attribution | "capture-window linkage" (subjectId ∈ idFields AND window AND actor; unmatched EVT refused; zero caller-supplied ids; model `links` field cannot reach the entry; maxLinks cap) |
| 4 missing-history | ledgerQuery.test.ts "no-history honesty" (before-first-capture, unresolvable term, invented recordId, no-anchor; CURRENT session never a stand-in) + retention fully-pruned answer |
| 5 authorization | journal "per-user isolation" (A's reader sees zero of B's seeded dir; 'default' never captures) + ledgerQuery "authorization" (null + 'default' REFUSED before any resolution; A sees nothing of B) + orchestrator test 4 (no header substitution) + route test 2 (header-only actor captures NOTHING, PUT still 200) |
| 6 concurrent writes | "concurrent writes" (raced maybeCapture ⇒ distinct seq files, no torn files, no leftover tmp) |
| 7 integrity | "integrity" (mutated file ⇒ integrity diagnostic, SKIPPED, never a neighbor substitute) |
| 8 retention | "retention" (cap ⇒ oldest WHOLE files pruned, retained bytes unchanged, fully-pruned range ⇒ row-4 honest answer) |
| 9 reattachment | ledgerQuery "found" (server-built envelope tabs = snapshot ids; no-history ⇒ NO proposal) + AgentOrchestrator.ledger.test.ts (ONE ledger_answer + ONE server-built workstate_proposal; no-history ⇒ zero proposals) |
| 10 ledger zero-records | ledgerQuery.test.ts source-pin (no execution/promotion/analysis-run imports) + tripwire store (found cycle ⇒ ZERO create/update/delete) + orchestrator test store tripwires + journal dir under `var/` (route test 4; `.gitignore` `var/` + `server/var/` confirmed) |
| 11 tool-def discipline | submitSuggestionTool enum pins (eighth intent `query_workstate_history`; analysis/protocolEdit/workstate/test pins updated in WIP + final commits); `buildAgentIntentToolDef` with/without-ids pins green (surfaceVocab suite green in scoped run); exactly ONE forced tool def (`AGENT_INTENT_TOOL_DEF` defined only in submitSuggestionTool.ts) |

App matrix: found/no-history frames parse with optionals OMITTED never `undefined`
(assistStream.ledger.test.ts, 4 tests incl. malformed-frame drop); a `ledger_answer` frame
alone renders NO accept control (chatReducer.ledgerTrace.test.tsx asserts no
`workstate-card-accept`, no button in the chip); no-history text renders with the
"lab events, not workstate" label; the never-default `const _exhaustive: never = event`
seam survives with the new case (source-pin). Reject/accept on the reattach card rides the
EXISTING `useWorkstateProposalFlow` + `applyAcceptedWorkstate` path with ZERO new code
(zero diffs there — the existing flow's reject/accept pins stay green in the right-pane/ai
suite); no new fake-timer reject test was authored because the ledger card IS the existing
card — stated, not silently skipped.

## OQ rulings implemented (binding)

- **OQ1**: capture actor = `ctx.localIdentityService.resolveRequestUser(request)`
  (server.ts:824/draftRoutes.ts:9 precedent) at the PUT seam; the assist-stream handler
  resolves the ledger actor BEFORE the turn via the new `resolveLedgerActor` seam wired in
  server.ts to exactly that call; unresolved ⇒ `ledgerActor` ABSENT (exactOptionalPropertyTypes)
  ⇒ orchestrator passes `null` ⇒ ledger answers `actor-unresolved`. NEVER a header fallback
  for ledger reads (route test 2 proves a header-only actor captures nothing; ledgerQuery
  test refuses both `null` and `'default'`).
- **OQ1b**: ledger-query dep threading PRESENT in the final commit: `server.ts` wires
  `ledgerQuery: createLedgerQueryHost(() => ({...}))` into the orchestrator deps with parts
  re-evaluated PER QUERY (journal re-reads policy per call; `canonicalReadStore(ctx)` —
  canonical READ view only, never a write-capable store; `resolveSpine` + surfaces registry
  re-loaded per call so post-boot records are queryable).
- **OQ2**: server-built frames only — the model supplies `ledgerQuery:{term?,recordId?}`
  (verbs and terms only); the host resolves through the spine, anchors ONLY on server-known
  audit `occurredAt` (policy `query.anchor` breaks ties), builds the envelope FROM THE
  SNAPSHOT via the registry inverse (`config/drafting/workstate-tab-kinds.yaml` keyed by
  RECORD kind — a run-2 bug fix: run 1 keyed it by TAB kind). Orchestrator test 1 proves
  the emitted proposal equals the HOST's frame while the model's tool args contained only a
  term. `answerText` is generated by ONE server function (`ledgerAnswerText`) and the app
  renders it verbatim.
- **OQ3**: NO capturedAt on the card — the card is the untouched `WorkstateProposalCard`
  (zero diffs); capturedAt/disclosure/links ride ONLY the `ledger_answer` frame's provenance
  lines in the chat trace.

## Pin-test rationale (stated, per spec)

`ledger_answer` is deliberately **assistStream-only**: `app/src/types/ai.ts`'s generic
`AiStreamEvent` gains NO member this task (the generic `useAiChat` stack does not consume
ledger answers — §5 out-of-scope). `aiStreamTypes.pin.test.ts` stays green untouched (5/5
verified). The mirror discipline (transport mirror of `LedgerAnswerEnvelope`, no import
from server/**, optionals OMITTED) is documented in assistStream.ts.

## Historical bug fixes made in run 2 (on top of the WIP)

1. `ledgerQuery.ts` surface derivation keyed the record-kind map by TAB kind — fixed to key
   by RECORD kind (the shipped `workstate-tab-kinds.yaml` semantics).
2. Route harness-safety: existing `workspace-session.test.ts` passes a minimal ctx (no
   schemaDir/store/localIdentityService) — the journal seam is now optional-chained so those
   4 tests stay green and a harness ctx yields capture DISABLED (missing policy ⇒ §4.2),
   main.yaml byte-unchanged.
3. `submitSuggestionTool.protocolEdit.test.ts` enum pin widened to eight intents.
4. Tool-description apostrophe escaping fixed in `submitSuggestionTool.ts`.
5. `WorkstateJournal.ts` idFields collection replaced by the ONE shared audit-event
   projection (`auditRowsToJournalView`, AuditEventService.ts:24-31 payload shape) used by
   every production seam; policy path derivation centralized as `journalPolicyPath()`.
6. `createLedgerQueryHost` re-evaluates parts per query (canonicalReadStore memoizes per
   instance — a boot-time instance would go stale for post-boot records).
7. dispatchFrame parse type gained `answer?: LedgerAnswerEnvelope` (app tsc back to 34).

## Stop boundaries respected

Zero edits to `WorkspaceSessionStore.ts`, `lab-session.schema.yaml`, `agent-action.schema.yaml`,
`workstate-intent.schema.yaml`, `useWorkstateProposalFlow.ts`, `useSessionSync.ts`,
`AuditEventService`. No audit writes added on the session path. No second tool, card,
executor path, or adapter key. Policy YAML is `schema/workflow/workstate-journal.policy.yaml`
(NOT `*.schema.yaml` — SchemaLoader auto-registration trap avoided; name verified on disk and
in `journalPolicyPath`). No core test case forced a frozen-seam edit — no stop triggered.

## Untracked non-PB-CH-8 files (never staged)

`server/model.pkl`, the cl-lane-sync untracked copies (app/src/shared/surfaces/registry.ts,
ParameterAnswerInput.*, draftChanges.*, useChatThread.deckLayout.test.tsx, server/src/ai/
material*/tube*/clarification* etc.), and the spec file itself (lane artifact) remain
untracked and unstaged.

PB-CH-8 DONE bb0c0add
