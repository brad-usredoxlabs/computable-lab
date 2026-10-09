# PB-CH-9 worker report — lane 2, dispatch l2t2355 (docs + evidence manifest ONLY)

Branch/worktree: `pb-ch-9-lane2-l2t2355` @ `/mnt/vast/home/brad/git/wt/PB-CH-9-lane2-l2t2355`,
off `cl/integration-2` tip **f9eba9cf** (code tip **c74c5214**). Zero product-code hunks: every
file written lives under `.hermes/plans/`. No stack touched, no restarts, no browsing, no
`specifications/` edits anywhere, nothing added to Brad's tree.

## Deliverables (paths in this worktree)

1. `.hermes/plans/PB-CH-9-drafts/architecture-of-record-§8-edit-DRAFT.md` — hunks A-E against
   b30b36dc COMMITTED text (Half B item 1 a-d), workstate-snapshot one-local-term rule honored,
   divergence flags recorded (not resolved).
2. `.hermes/plans/PB-CH-9-drafts/ai-drafting-adoption-table-edit-DRAFT.md` — table rows against
   b30b36dc :96-103 (Half B item 2); unadopted rows untouched.
3. `.hermes/plans/PB-CH-9-lane2-runbook-DRAFT.md` — the TEN mandated topics (Half B item 3),
   ledger section describing the MERGED PB-CH-8 shape only.
4. `.hermes/plans/PB-CH-9-evidence-manifest.md` — legs 0-8 mapped to verbatim verified-by
   clauses, named screenshots verbatim, network-capture windows, suite baselines, session pin
   406bd1c6… with three-way semantics, leg-8 REUSE receipts, budget math 5+1, disposition slots.
5. This report.

## First targeted check (spec §1 stop-and-report discipline) — RESULT

Read the b30b36dc committed versions of both spec files via `git -C /mnt/vast/home/brad/git/
computable-lab show b30b36dc:…` (READ-ONLY). Premises CONFIRMED with one honest correction:

- `architecture-of-record.md` @ b30b36dc: 185 lines; authority rule :5; §3b "Agent actions"
  bullet at :82 (names the §8.1 open edge); §8 "Known divergences & open edges" at :164-169
  (items 1-4, item 4 at :169). EXISTS AS CLAIMED.
- `ai-drafting-and-ui-projection.md` @ b30b36dc: 121 lines; adoption table header :96, rows
  :98-103; "Report unimplemented adapters as such" at :121. EXISTS AS CLAIMED.
- **Correction flagged (not a stop):** the spec says Brad's working copy shows ` M` on
  architecture-of-record.md. At check time (2026-10-09) BOTH spec files are CLEAN in Brad's
  tree: working copy == main HEAD (455232cf). The real divergence is b30b36dc vs main HEAD:
  commit `7977ec96` rewrote §8 item 4 (:169) — a one-line diff (`git diff b30b36dc..HEAD` on the
  file). ai-drafting is unchanged since b30b36dc. Drafts were authored against b30b36dc as
  instructed; the item-4 hunk carries an architect note to re-anchor against main HEAD.
- b30b36dc NOT an ancestor of the lane trunk (re-measured: merge-base check fails at f9eba9cf);
  c74c5214 and 55319ef2 (PB-CH-8 merge) ARE ancestors. `git diff --stat c74c5214..HEAD` shows
  docs-only (6 .hermes/plans files) — code citations at c74c5214 are valid at HEAD.

## Name-and-read table (every cite re-read first-hand at c74c5214 in this worktree)

| File | Lines read | Used in |
| --- | --- | --- |
| app/src/App.tsx | 181, 190, 206 (Route lines) | manifest legs, runbook §10 |
| app/src/event-editor/right-pane/ai/WorkstateProposalCard.tsx | 63, 78, 121, 128, 131, 142 (testids) | manifest leg 3/7, runbook §5 |
| app/src/event-editor/right-pane/ai/AiTabPanel.tsx | 343, 354-358, 374-377, 560-574, 596-642, 657-658 | runbook §2/§5, draft hunks A/B |
| app/src/event-editor/right-pane/ai/assistStream.ts | 180-186 (AgentActionEnvelope), 190-229 (LedgerAnswerEnvelope mirror incl. asOf?/capturedAt? optional-by-contract), 247, 260-265 (ledger_answer member), 455-466 (parse/relay) | runbook §7, manifest leg 7 |
| app/src/shared/ai/useWorkstateProposalFlow.ts | 2-16 (header, fork detector), 57-60, 63, 66, 87-98 (seq/draftId continuity), 92 (compile call site), 130-176 (accept/reject), 179-206 (handleAgentAction/executeTier1) | runbook §1/§2/§4/§5 |
| app/src/shared/session/useWorkstateExecutor.ts | 1-30 (header: single writer, ZERO putSession), 48, 79, 90 (ACCEPT_ATTESTATION_MISSING) | runbook §2/§5 |
| app/src/shared/session/useSessionSync.ts | 3-14 (BOOT/PUSH/ATTACH), 24 (PUSH_DEBOUNCE_MS=500), 129-154 (debounced push) | runbook §6, manifest leg 5 |
| app/src/analysis/AnalysisChatPanel.tsx | 13, 25, 42, 72 (testid) | manifest leg 5, adoption draft |
| app/src/literature/PdfProtocolBuilder.tsx | 2, 28, 130-137 | adoption draft, manifest leg 8 |
| app/src/shared/api/client.ts | 2261 (compileWorkstateDraft method — the 2nd grep hit) | runbook §5 fork-detector honesty |
| server/src/drafts/draftRoutes.ts | 1-15 (resolveRequestUser :9-10, 401) | runbook §3 |
| server/src/drafts/FormDraftService.ts | 7, 24, 28, 68-78 (draftId/revision), 106, 131, 145-148 (canAccept/reviewHash), 152-167 (accept 409s) | runbook §1/§4 |
| server/src/drafts/workstateCompile.ts | 8, 55, 100-105, 215, 287 (UNMAPPABLE_RECORD_KIND, data path) | runbook §10 |
| server/src/api/routes/workspace-session.ts | 18, 24, 36-46 (journal at route), 53-58 (GET /session, GET /session/:userId), 60-86 (PUT: Ajv, store.put :76, resolved identity :80, maybeCapture :83) | runbook §3/§7, manifest |
| server/src/workspace-session/WorkstateJournal.ts | 5, 76, 100-102, 110-111, 124, 138-139, 186-195 (interpretPolicy off), 191, 269-291 (readPolicy per-call), 282-283 (journalDir), 302, 360-370 (captureInner policy-off + actor rule), 493-495, 526-542 | runbook §7/§8/§9 |
| server/src/workspace-session/ledgerQuery.ts | 10-14 (anchor + "as captured at" rules), 54, 62-90 (envelope, asOf? optional-by-contract), 95-100 (ServerBuiltWorkstateEnvelope), 102-110 (diagnostics codes, workstateProposal), 112-130 (deps, actor null => refuse), 295-311 (snapshot->envelope, UNMAPPABLE_SNAPSHOT_TAB), 366-374 (REASON_TEXT), 377-380 (ledgerAnswerText), 429-481 (answerText wiring, disclosure :477), 434-435 (actor refuse) | runbook §7, manifest leg 7 |
| server/src/workspace-session/WorkspaceSessionStore.ts | 73-89 (put = whole-session LWW, tmp+rename) | runbook §6/§7 |
| server/src/api/handlers/AIHandlers.ts | (file listed as query_workstate_history site; not line-cited in drafts) | — |
| server/src/ai/AgentOrchestrator.ts | 905-914 (ledger host dep), 2122-2146 (workspace_action), 2210-2258 (compose_workstate), 2365-2406 (query_workstate_history branch), 2440-2456 (reattachment emit + diagnostic forwarding) | runbook §7, adoption draft |
| server/src/ai/submitSuggestionTool.ts | 438-443 (intent enum incl. query_workstate_history; tool descriptions) | runbook §1/§7 |
| server/src/server.ts | 150, 1084-1092 (createLedgerQueryHost, canonical READ view) | runbook §7 |
| schema/workflow/workstate-journal.policy.yaml | whole file (journalVersion, capture, linkage, retention, query incl. labEventsMax boundary semantics) | runbook §7/§8/§9 |
| schema/workflow/agent-action.schema.yaml | existence (ls) | draft hunk A |
| schema/registry/surfaces/surfaces.yaml | 19, 25, 33, 41, 49, 57, 63, 69, 77, 83 (10 ids; NO literature) | runbook §10, manifest leg 8 |
| config/drafting/workstate-tab-kinds.yaml | whole file (kinds incl. PB-CH-5 analysis pair; honest limits) | runbook §10 |
| config/drafting/adapters.yaml | 10-15 (workstate adapter) | runbook §1 |
| schema/knowledge/analysis-run.schema.yaml | existence via find (NO .ui.yaml companion) | runbook §10, disposition slot 2 |
| .hermes/plans/PB-CH-7-ledger-storage-decision.md | 71, 225 (one local term), 279 (authz gap), 293-297 (CHOSEN OPTION: a) | runbook §7, drafts terminology |
| .hermes/plans/PB-CH-6-report.md | 15-19 (OQ1 ruling: approved-surface-id = literature) | manifest leg 8 |
| .hermes/plans/handoffs/2026-10-08_2350-…-pbch9-prefactbook.md | whole file (claim-gate facts, ledger read-list, pin move, dispositions) | manifest |
| .hermes/plans/handoffs/2026-10-08_1600-….md | 20-28, 50-60 (run-channel-regression inconclusive carry; ANR-UISPEC-GAP evidence) | manifest dispositions |
| /home/brad/.hermes/cl/lanes/2/task-list.md | 1028-1044 (AR-2/AR-3 rules, wave notes, YAML-restart rule) | runbook §2/§9 |
| Brad's tree (READ-ONLY): specifications/architecture-of-record.md | b30b36dc :3-6, :75-90, :160-172; diff b30b36dc..HEAD (7977ec96 one-liner); status clean | draft 1 |
| Brad's tree (READ-ONLY): specifications/ai-drafting-and-ui-projection.md | b30b36dc :90-121 | draft 2 |

## Measurements taken this session (facts, not assumptions)

- Session pin: `sha256sum …/USR-BRAD/main.yaml` = 406bd1c6710c02f863f50d8a809f7dd31efb6df813f3d6abf3d8e4431b465d36 (matches dispatch pin).
- PB-CH-7 decision md5 = 6b9f7e3cf23d53f5fdbbf7ddf88a9c87 (matches spec).
- lane2-config.yaml md5 = cf7e833c721751f2406e0ee57ef2d810 (matches reviewer-bait pin).
- Leg-8 reuse receipts present: receipts/PB-CH-6/2026-10-08_orchgate2/generic-literature-{proposal,action}.png (116575 B each; note: the two files are byte-size-identical — flagged for the gate reviewer to confirm distinct captures, not assumed).
- Fixtures present: RUN-2026-09-19-run-vwr8 (runs/ + run/ yaml), PRT-4iaey2/g5zy9e/wlj0qm (records/protocol/), ANR-000002 analysis-run record, USR-BRAD journal dir with 000001-… entries.
- Fork detector re-run: `grep -rn compileWorkstateDraft app/src` (non-test) = flow :5/:92 + client.ts:2261 — ONE flow call site, honest two-hit reading recorded.
- Receipts root is `/home/brad/.hermes/cl/receipts/` (NOT `…/cl/lanes/2/receipts/` as the spec's scope section spells it — the spec path is a composition-time shorthand; actual on-disk paths used in the manifest).

## Could NOT verify / did NOT do (honest gaps)

1. Suite baselines (compiler 17-set, session 116, app 34/47-24, full-app 53-set, server 26 or
   15/6-normalized): NOT re-run by this worker — docs-only item, worktree has no node_modules
   bootstrap by design (no TS written). Carried from spec pin table + handoff 2026-10-08_2350;
   the orchestrator re-measures at gate time. The manifest states this explicitly.
2. Leg-0 preflight live asserts (health, served module, session wire hash): carried from the
   orchestrator's 23:38 run; I re-ran only the git ancestor checks. I did not probe :3093/:5193
   (hard rule: worker never touches the stack).
3. The two reused generic-literature PNGs are byte-size-identical; I did not open them (no
   browsing/vision budget spent). Flagged in the manifest for the gate reviewer.
4. Brad's ` M` working-copy divergence claimed by the spec did not reproduce (both spec files
   clean at check). Flagged, not resolved — the b30b36dc-vs-main-HEAD one-line §8-item-4 drift
   is recorded instead.
5. PB-CH-8 canonical bare report `.hermes/plans/PB-CH-8-report.md` remains ABSENT on trunk
   (handoff :118-121); gate closure of record is the DONE note + receipts. Noted in the manifest;
   not blocking.

## Reviewer-bait pre-emption check (self-audit against spec §Reviewer-bait)

- Screenshot names verbatim in manifest; leg 8 reuse named with receipts path; rename fallback
  documented. No leg marked passing without an artifact — all gate legs are RESERVED slots.
- No unmerged-internals citations: every ledger cite re-read at c74c5214 (table above).
- Terminology: "workstate-snapshot" used throughout; zero uses of revision/record/history-record
  for the ledger concept in the drafts (grep-able).
- No merge claims: both doc drafts say DRAFTED, PENDING ARCHITECT; specifications/ untouched in
  every checkout (verified: files don't exist on lane trunk).
- No config secrets embedded; CONFIG_PATH stated as the effective-config rule.
- YAML traps stated in runbook §9 (tsx --watch no-reload, blocking restart via background=true,
  per-call policy read, never restart mid-gate).
- No TS written => exactOptionalPropertyTypes applies only as a note carried for potential fix
  dispatches (manifest red-before-green section).

## VERDICT-ready summary

Half B worker deliverables COMPLETE: 2 spec-edit drafts (against b30b36dc committed text, with
the main-HEAD drift + clean-working-copy findings flagged for the architect), the 10-topic
runbook grounded entirely in code merged at c74c5214 (ledger section = merged PB-CH-8 shape:
query_workstate_history / ledger_answer frame / optional-by-contract asOf?+capturedAt? /
ledgerAnswerText wording authority / ServerBuiltWorkstateEnvelope reattach / policy-off rule /
route-call-site capture with resolved identity), and the evidence manifest mapping every Half A
gate artifact to its verbatim verified-by clause with claim-time facts (pin 406bd1c6… three-way
semantics, leg-8 REUSE of the two orchgate2 PNGs, 5+1 send budget, run-channel-regression re-run
obligation, AS-LANE2-PBCH6-ANR-UISPEC-GAP slot marked OWED AT CLOSE — not closed by this worker).
Half A (the gate itself) is orchestrator-owned and NOT run by this worker. One logical commit
follows this report.

PBCH9_DOCS_DONE_L2T2355
