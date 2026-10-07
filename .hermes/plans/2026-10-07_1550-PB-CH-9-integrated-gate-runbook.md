# SPEC DRAFT — PB-CH-9: Integrated campaign browser gate + operating-contract docs (spec edits via architect review)

Status: DRAFT (cl-spec-composer, thunderbeast, 2026-10-07). NOT dispatchable until the
orchestrator reviews + promotes. Written at lane trunk `cl/integration-2` tip **1ce6d282**
(code tip **43cddb26**; tip moved 7f595da1 -> 1ce6d282 under the composer — docs-only handoff
commits, verified via `git -c core.fileMode=false log`; every cite below re-read at 1ce6d282).
Re-verify all cites at claim time; the tip WILL move (PB-CH-8 merge + gates are in flight).

## Goal (one sentence)

Close the page-builder-channel campaign with one integrated, deterministic-script browser gate
on :3093/:5193 that independently observes every shipped behavior across waves 1–3 (with the
two-device accept-in-A=>visible-in-B proof on real network evidence), and DRAFT (never merge)
the operating-contract edits to `specifications/architecture-of-record.md` §8,
`specifications/ai-drafting-and-ui-projection.md`'s adoption table, and a lane-2 runbook —
all routed through architect review per the binding rule.

## Acceptance contract — VERBATIM from the task block

Source: `/home/brad/.hermes/cl/lanes/2/task-list.md`, item `id: PB-CH-9` (block at :1937-1970).
The description and verified-by are the contract; nothing below weakens them.

Description (:1943-1953), verbatim:
> Clean integrated gate on :3093/:5193 with isolated fixtures, lane backend restarted after YAML
> changes. Verify red-before-green evidence for every behavioral change; run compiler, draft,
> session, streaming, analysis, and ledger suites. Then DRAFT (not merge) the updates to
> specifications/architecture-of-record.md §8 and specifications/ai-drafting-and-ui-projection.md
> adoption table + a lane runbook (compilation vs execution, trust tiers, actor binding,
> proposal/revision lifecycle, shared executor, current LWW/attach semantics, approved ledger
> semantics, seeding/cleanup, YAML restarts, known-unsupported). ARCHITECT reviews spec edits
> before merge (binding rule). Wave note: if PB-CH-7/8 are still open, report wave-1 (PB-CH-1..4)
> acceptance as its own milestone; campaign completion stays blocked on the ledger, and this task
> may run a wave-1-scoped gate with architect sign-off.

Stop-boundary (:1954-1955), verbatim (restated again in "Stop-boundaries" below — that
restatement is the operational copy):
> Stop-boundary: no broad visual sweeps, no main/live-stack testing, no success claims for blocked
> portions; unresolved safety/sync/architecture conflicts returned, not documented away.

Verified by (:1959-1968), verbatim:
> Independent Playwright reviewer, single vision slot SERIAL, named surfaces only (run AiTabPanel +
> context header + proposal cards + tab strip; Analysis panel + composition + ViewRenderer; the
> PB-CH-6 approved consumer). Re-run: tier-1 arrival; unresolved no-op; unsaved-work preservation;
> pending/rejected no-push; revision recompiles; analysis acceptance; (if unblocked) historical
> reattachment. BOTH workstate classes prove accept-in-A => visible-in-B with network evidence on
> the existing push/attach path and zero accept-time AI calls. final-run-focus.png,
> final-pending-unchanged.png, final-accepted-A.png, final-attached-B.png, final-analysis.png,
> (ledger-final-reattach.png if unblocked) + approved generic-surface shot. Every 404/blank
> re-verified via API + reload. New defects get failing tests before fixes.

Files (:1969): `integration/browser tests, evidence manifest, DRAFT spec edits for architect
review, lane runbook`.

## Scope + file ownership

IN scope (worker-owned deliverables, all under `.hermes/plans/` — zero product-code diffs):
- `.hermes/plans/PB-CH-9-drafts/architecture-of-record-§8-edit-DRAFT.md` — proposed replacement
  text for §8 (+ the §3b "Agent actions" bullet flagged to the architect as §8-dependent copy),
  in exact `current text -> proposed text` hunks with code cites valid at merge time.
- `.hermes/plans/PB-CH-9-drafts/ai-drafting-adoption-table-edit-DRAFT.md` — proposed rows for the
  adoption table (`ai-drafting-and-ui-projection.md:96-103`, same hunk format).
- `.hermes/plans/PB-CH-9-lane2-runbook-DRAFT.md` — the lane runbook (10 topics in Half B below).
- `.hermes/plans/PB-CH-9-evidence-manifest.md` — maps every gate artifact (trail.json entry,
  screenshot, network capture, suite output) to the verbatim verified-by clause it proves.
- `.hermes/plans/PB-CH-9-report.wip-l2t<HHMM>.md` — unique worker report path.
- Browser artifacts: `/home/brad/.hermes/cl/lanes/2/receipts/PB-CH-9/<ts>/` (orchestrator-owned
  receipts dir: trail.json, the named screenshots, network captures, report.md with the verdict).
- Gate plan data: `~/.hermes/cl/browser-receipts/plans/integrated-campaign.json` (HARNESS-1
  convention: plans are data outside the repo, retried via `retryUntilVisible`, never selectors
  hardcoded in product code).

OUT of scope (zero hunks; any diff here = scope violation):
- ANY product code: `server/src/**`, `app/src/**`, `schema/**`, `config/**` in the lane trunk or
  any worktree. New defects found by the gate do NOT get drive-by fixes: they get a failing test
  FIRST and go back to the orchestrator as a separate coder dispatch (fleet lock), then the
  affected gate leg re-runs. "New defects get failing tests before fixes" is a gate output
  (a defect entry naming its RED test), not an in-gate edit.
- Brad's tree `/mnt/vast/home/brad/git/computable-lab` — READ-ONLY and here only for the two
  spec files (they exist ONLY there, see "Where the doc targets live" below). Never edit, never
  `git add` anything there.
- :3001/:5174, `/home/brad/.computable-lab/` (main data dir), main/live stack testing — forbidden
  by the stop-boundary (verbatim below).
- Merging the doc drafts. Architect reviews and merges; the worker/verdict trail records
  "drafted, pending architect" — never "merged".
- PB-CH-8's internals: no edits, no re-derivation (claim-time read list below instead).

Where the doc targets live (composer-verified, load-bearing for Half B):
`specifications/architecture-of-record.md` and `specifications/ai-drafting-and-ui-projection.md`
are tracked ONLY on `main` @ **b30b36dc** ("docs(specs): architecture of record + AI-drafting/UI-
projection implementation contract"); `git merge-base --is-ancestor b30b36dc HEAD` FAILS on
cl/integration-2 (merge-base is d290a7fc), and the lane trunk's `specifications/` contains neither
file (`git ls-files specifications/` + `find`, both checked). The PB-CH-8 spec §6 recorded the same
finding independently. ALSO: Brad's working copy of `architecture-of-record.md` shows an
UNCOMMITTED modification (` M` in git status) — draft hunks against the b30b36dc COMMITTED text,
and note the divergence for the architect instead of resolving it. Consequence for the gate plan:
the drafts are standalone DRAFT files in the lane's `.hermes/plans/PB-CH-9-drafts/`; the architect
applies them (presumably on main, then lane-sync). PB-CH-9 never touches `specifications/` in any
checkout.

## Half A — the integrated gate plan (deterministic-script-ONLY)

Lane precedent binding this section: runs 7/8/9 on this lane BANNED interactive browser tools for
gates (AI-14 precedent, task-list RUN-7/RUN-8 notes; PB-CH-5/PB-CH-6/PB-CH-4b prompts all follow
the same template). The gate is ONE orchestrator-authorable Playwright .mjs (or harness plan) run
with `node <script>` / `npx playwright test --project=chromium` from cwd =
`/mnt/vast/home/brad/git/cl-integration-2/app` (module resolution requires this cwd); the reviewer
judges ARTIFACTS only. Trail JSON mandatory; every negative claim cites the exact selector probed
(never `.chat-page__msg` on the run page — banned selector); every 404/blank claim re-verified
via API + reload before it enters the report (two false-positive incidents on record,
architecture-of-record.md §4 UI line, read in Brad's tree @ b30b36dc working copy).

Hard rules (from verified-by + lane template, e.g. prompts/review-PB-CH-6-gate-run1-20261007T1320.txt):
- Single vision slot, SERIAL. Named surfaces ONLY — no broad visual sweeps.
- 6 model sends TOTAL across the gate (each `POST /api/ai/assist/stream` counts; track in
  trail.json). Budget exhausted with criteria uncovered => VERDICT: blocked, listing what was
  measured — never "fix", never a 9th-blind-gate escalation.
- Fresh browser context + fresh chat thread per ask.
- Zero accept-time AI calls: from Accept-click to settled state, network capture MUST show
  exactly one `POST /api/drafts/accept`, ZERO `POST /api/ai/assist/stream`, and exactly ONE
  `PUT /api/session` landing within ~1.5 x `PUSH_DEBOUNCE_MS` (500 ms,
  `app/src/shared/session/useSessionSync.ts:24`, timer at :154 — verified). A gate whose accept
  leg shows an assist/stream hit is INVALID, not a defect report.
- Visible-in-B proof rides the EXISTING attach path: context B is a second browser context;
  adoption happens via the ATTACH re-GET (`GET /api/session` on focus/visibilitychange) — the
  network evidence is B performing GET only (no PUT from B) and B's DOM reflecting A's state.
- Do NOT restart the stack during the gate (a live gate is the stack's only business then);
  the restart-after-merge obligation is in the claim gate below.
- Lane AI profile: qwen3.8-thunderbeast via CONFIG_PATH `/home/brad/.hermes/cl/lanes/2/lane2-config.yaml`
  (effective config is the env CONFIG_PATH, NOT repo config.yaml — 15:30 handoff pitfall; model
  compliance known-good on analysis/literature/run surfaces per coder prechecks + prior gates).

Named routes (verified in `app/src/App.tsx` at 1ce6d282): run surface
`/runs/RUN-2026-09-19-run-vwr8` (:190 `Route path="/runs/:runId"` -> RunWorkspacePage ->
AgentChatPane -> AiTabPanel); analysis `/analysis` (:206); generic consumer
`/literature?view=build` (:181, LiteratureBody view=build hosts the PB-CH-6 approved consumer
PdfProtocolBuilder — PB-CH-6-report.md:17 OQ1 ruling fixes `<approved-surface-id> = literature`
AS A SURFACE LABEL; note `schema/registry/surfaces/surfaces.yaml` registers 10 ids at this tip —
find:19, run-plan:25, run-design:33, run-execute:41, results:49, analysis:57, knowledge:63,
project:69, ingestion:77, protocol-review:83 — and does NOT register `literature`; a model
proposing `knowledge` from the literature pane is registry-mapping, recorded not failed, per the
PB-CH-6 gate note).

Isolated fixtures on the lane stack (composer-verified on disk): lane data dir is
`/home/brad/.computable-lab-lane2` (dataDir in lane2-config.yaml), records at
`worktrees/main/records/`. Available and re-read today: run `records/runs/RUN-2026-09-19-run-vwr8/`
(+ `records/run/RUN-2026-09-19-run-vwr8__2026-09-19-run.yaml`), protocols `PRT-4iaey2`
(PureLink genomic DNA extraction), `PRT-g5zy9e`, `PRT-wlj0qm`. Session dirs: `default`,
`USR-BRAD`, `USR-LOCAL-ADMIN`; `var/sessions/USR-BRAD/main.yaml` sha256 =
`8107ef6e1b88ee296dd29fc552e1709c8bf844366bfe45fcd5afe6008b1e85b9` — the full pin, matching the
handoff "8107ef6e…" (2026-10-07_1020 handoff :71). ALL lane records are test data (Brad's ruling):
isolation gaps against this pool are not acceptance hazards; "do not use Brad's live DNeasy data"
means never :3001/:5174 or the main data dir.

Gate legs (each: fresh context, named ask, measurements, named screenshot EXACTLY as
verified-by spells them; ledger legs are CONDITIONAL — see claim gate):

- Leg 0 — preflight (0 sends). Script asserts: `GET :3093/api/health` 200 (never probe `/` — 404
  is expected there); `GET :5193/src/shared/ai/useWorkstateProposalFlow.ts` serves the real module
  (served-checkout assert, PB-CH-6 gate precedent); ancestor checks from the claim gate hold;
  `GET :3093/api/session` (x-user-id USR-BRAD) hashes to the claim-time session baseline.
  Any failure => VERDICT: blocked at preflight (zero budget spent).
- Leg 1 — tier-1 arrival + unsaved-work preservation (1 send). On the run surface: seed an
  unsaved value in a currently-editable field (measure + persist its selector); fresh thread; ask
  a tier-1 navigation ("open the analysis surface"). Tier-1 (focus|open-surface) applies ON
  ARRIVAL after compile (AR-2): assert the tab appears in the tab strip (rect/testid), the
  context header reflects the new working focus, the unsaved value SURVIVES (tier-1 must lose
  nothing), and exactly one `PUT /api/session` follows (the tab change IS session movement).
  Screenshot **final-run-focus.png**.
- Leg 2 — unresolved no-op (1 send). Ask for an unregistered surface/term. Expect the visible
  compile diagnostic, ZERO tab movement: tab-strip DOM identical, `GET /api/session` byte-identical
  before/after (paste hashes). Trail names the diagnostic selector probed.
- Leg 3 — tier-2 pending/rejected no-push (1 send). Ask a compose_workstate turn on the run
  surface. Assert the tier-2 card renders (data-testid `workstate-card`,
  WorkstateProposalCard.tsx:78; accept :128, reject :131 — verified); while PENDING, `/api/session`
  hash unchanged; click Reject; hash STILL unchanged and tab store DOM unchanged. Screenshot
  **final-pending-unchanged.png** (pending state, before the click).
- Leg 4 — revision recompiles (1 send). From a fresh card (same ask as leg 3's flow or its own),
  send a revision ask; assert a SECOND `POST /api/drafts/compile` with an advanced draft
  revision (draftId continuity in the capture), card re-renders recompiled content. Measurement,
  not screenshot, per verified-by; trail entries both sides.
- Leg 5 — analysis acceptance (1 send). `/analysis` (AnalysisChatPanel, data-testid
  `analysis-chat-panel`, app/src/analysis/AnalysisChatPanel.tsx:65 — verified), fresh thread: ask
  an analysis composition ("analyze the trace for revision … in a new run" phrasing proven by the
  PB-CH-5 run-2 prompt); card appears; measure the composition/ViewRenderer region before;
  Accept; apply the hard network rule above (one accept, zero stream, one PUT); measure
  after-accept visible change. Screenshots **final-analysis.png** (analysis surface with the
  accepted composition) and **final-accepted-A.png** (run-surface tab strip in A reflecting the
  accepted workstate; same measurement, second pane crop).
- Leg 6 — accept-in-A => visible-in-B, BOTH workstate classes (0 sends). Open context B on
  :5193, focus event triggers ATTACH (GET only). Assert B's tab strip contains BOTH the Leg-1
  tier-1-opened tab AND the Leg-5 tier-2-accepted tab(s) — one attach proves both classes if both
  moves are on the session doc; the network capture proves B moved nothing (no PUT from B, no
  assist/stream anywhere near the attach). Screenshot **final-attached-B.png**.
- Leg 7 — CONDITIONAL historical reattachment (0-1 send; requires PB-CH-8 merged AND its own
  browser gate at VERDICT: accept; instantiate per the claim-time read list below): query the
  seeded fixture batch in the run chat; expect the ledger answer with `capturedAt` disclosure
  ("as captured at", never "as of") + the SAME tier-2 card (`workstate-card` testid, server-built
  envelope); screenshot **ledger-final-reattach.png**. If any PB-CH-8 shape is missing at claim
  time, record the leg as NOT RUN-BLOCKED with the exact missing artifact — never as passing.
- Leg 8 — approved generic-surface shot (0-1 send). Preferred (0 sends): reuse the accepted
  PB-CH-6 gate receipt for the `/literature?view=build` PdfProtocolBuilder card, cited into the
  evidence manifest with its receipts path. Fallback (1 send, only if budget remains): fresh
  context on `/literature?view=build`, one ask, card renders via the shared flow, screenshot
  named `final-generic-surface.png` (the approved generic-surface shot; name it so in the
  manifest if the orchestrator renames).

Budget math: legs 1,2,3,4,5 = 5 sends; leg 7 = 6th; leg 8 fallback only if a leg was skipped.
If the lane profile misbehaves, `retryUntilVisible` plan-data retries (HARNESS-1 primitive,
`~/.hermes/cl/browser-receipts/harness/capture.ext.spec.ts`) absorb waiting WITHOUT extra sends —
only a fresh ask counts.

Suite runs ("run compiler, draft, session, streaming, analysis, and ledger suites" — verbatim
clause; commands, all re-baselined at claim time, expected = zero NEW failures vs claim baselines,
surfacesAjv excluded):
- Compiler: `cd server && npx vitest run src/compiler`
- Draft: `cd server && npx vitest run src/drafts`
- Session (server): `cd server && npx vitest run src/workspace-session src/api/routes`
  (baseline at 3b9e2a18: 11 files / 116 tests / 0 failed — PB-CH-8 spec measured; re-measure)
- Session (app): `cd app && npx vitest run src/shared/session` (baseline 7 files / 70 tests, 0 fail)
- Streaming: `cd app && npx vitest run src/event-editor/right-pane/ai` (set-diff vs claim set)
- Analysis: `cd server && npx vitest run src/analysis` and `cd app && npx vitest run src/analysis`
- Ledger: `cd server && npx vitest run src/workspace-session` (post-PB-CH-8: WorkstateJournal /
  ledgerQuery suites are green-by-definition once merged — paste counts)
- Typechecks: `npm run typecheck -w server` => **26 error lines / SAME 6-file set** (comm -3 of
  sorted file lists empty); `cd app && npx tsc --noEmit` => **34 error lines, FILE-SET identity**
  (comm -3 empty).
- Full app: `cd app && npx vitest run` => failing-FILE-SET set-identical to the claim-time 53-file
  baseline (comm -3 empty; pass count is NOT the bar).
Red-before-green: PB-CH-9 itself changes no behavior, so the red-before-green clause applies to
any gate-found defect: its failing test lands in the defect entry BEFORE the fix dispatch, and the
affected leg re-runs green post-fix. Paste both.

## Half B — DRAFT doc edits + lane runbook (drafts only; architect merges)

1. architecture-of-record.md §8 edit (target: §8 "Known divergences & open edges" at
   :164-169 and the §3b "Agent actions" bullet at :82, both read in Brad's tree @ b30b36dc
   working copy). The edit must, at merge time: (a) mark the agent-action runtime wiring SHIPPED
   for the compiled page-emission path (tier-1 apply-on-arrival + tier-2 card via the ONE shared
   executor — the very §8.1 "open edge" the doc itself names at :82/:166) with code cites to the
   merged tip's files; (b) add the LWW + append-only journal semantics of the session doc (§8
   new item): main.yaml stays last-writer-wins, journal is append-only transport snapshots
   outside the records git tree; (c) keep item 4 (`specifications/` file permissions/ownership,
   :169) truthful and add the b30b36dc-not-on-lane-trunk fact if uncorrected; (d) NOT describe
   the ledger as knowledge: the doc's own authority rule governs — "docs follow the shipped code
   — label the divergence" (:5) — every claim cites shipped code AT MERGE HEAD, re-verified.
   Also flag to the architect: the ledger's one local term is **workstate-snapshot** (PB-CH-7
   decision §4.1) — never "revision" (reserved: `record-revision`), never "record"; the doc edit
   must use the term exactly (controlled-vocabulary rule, CLAUDE.md non-negotiable 7).
2. ai-drafting-and-ui-projection.md adoption table edit (target table at :96-103, read same
   checkout). Add rows, in the table's own terse register, for the shipped PB-CH surfaces AS THE
   PROJECTION CONTRACT describes them: run workspace AiTabPanel + /analysis + the ONE generic
   consumer (`literature` PdfProtocolBuilder at `/literature?view=build`) — tier-1 auto-on-arrival,
   tier-2 Accept/Reject/revise on the ONE shared card+executor; and workstate-ledger reattachment
   riding the SAME tier-2 card with a server-built envelope. Preserve the table's discipline:
   adoption is per-surface and honest — "Report unimplemented adapters as such" (:121) stays;
   anything the gate recorded blocked/absent is drafted as NOT adopted.
3. Lane-2 runbook — `.hermes/plans/PB-CH-9-lane2-runbook-DRAFT.md`, ten mandated topics
   (task description, verbatim list), each grounded in cite-verified shipped code + the adopted
   decision:
   - compilation vs execution (compile is write-free; Accept applies without a second AI call);
   - trust tiers (AR-2: tier-1 focus|open-surface applies on arrival after compile; tier-2
     session-document emission is ALWAYS a card — never an auto-push, the "LWW 500 ms push =
     silent cross-device vandalism" rule, task-list :1030-1033);
   - actor binding (drafts bound to `ctx.localIdentityService.resolveRequestUser`,
     draftRoutes.ts:9-10 pattern; ledger never trusts raw-header identity; the
     `GET /session/:userId` unauthenticated-read gap is documented as KNOWN-UNSUPPORTED/backlog,
     PB-CH-7 §5, not papered over);
   - proposal/revision lifecycle (draftId+revision+reviewHash, stale-hash rejection, D4-style
     no-auto-re-propose, reject restores baseline);
   - shared executor (`useWorkstateProposalFlow` as the ONE compile->card->accept implementation —
     fork-detector grep `grep -rn compileWorkstateDraft app/src` shows one call site at :92,
     verified; `applyAcceptedWorkstate` the only sanctioned apply);
   - current LWW/attach semantics (BOOT/ATTACH adopt-newer, PUSH debounce 500 ms, one writer via
     replaceState; useSessionSync.ts:24/:154 verified);
   - approved ledger semantics — describe ONLY what `.hermes/plans/PB-CH-7-ledger-storage-decision.md`
     records (md5 6b9f7e3cf23d53f5fdbbf7ddf88a9c87, re-measured this session; CHOSEN OPTION: a at
     :297, re-read) PLUS the merged PB-CH-8 surface at claim time (read list below). Capture
     policy is DATA — the runbook states the policy-off rule (no policy YAML => capture DISABLED,
     not defaulted) and the honest "no history stored then" contract with capturedAt disclosure;
   - seeding/cleanup (the fixture pool above; session-doc snapshot/restore procedure; ledger
     journal seeding via real policy-passing PUTs per PB-CH-8's own gate plan — never hand-written
     journal files);
   - YAML restarts (tsx --watch does NOT reload YAML — lane header rule; restart is via
     `cl-lane-stack.sh 2 restart` which is BLOCKING => run with background=true, 15:30/13:25
     handoff pitfall; NEVER while a gate is live);
   - known-unsupported (unregistered surfaces => diagnostic + no-op, not a guessed route —
     surfaces.yaml 10 ids at 1ce6d282, `literature` is NOT one; kinds absent from
     `config/drafting/workstate-tab-kinds.yaml` (verified: planned-run/execution-run->run,
     study->project, protocol->record-edit, vendor-pdf->protocol-review) produce
     UNMAPPABLE_RECORD_KIND, never a guessed tab; ledger historical surface no longer mountable =>
     blocked card; generic component-tree page building remains deferred).

## Dependency / claim gate (what must be true on trunk AT CLAIM TIME)

1. PB-CH-1..6 done, each with its own gate at VERDICT: accept (PB-CH-4b run-6 accept leg,
   PB-CH-5 run-2, PB-CH-6 run-1 are open debts at composition time — 16:00 handoff queue; the
   integrated gate re-proves behavior but cannot substitute for per-item verdicts — attribution).
2. **PB-CH-8 MERGED** (hard): the orchestrator pastes at claim
   `git -c core.fileMode=false merge-base --is-ancestor <PBCH8_MERGE_SHA> HEAD` + claim SHA.
   The PB-CH-8 browser gate must also be at VERDICT: accept before PB-CH-9's final integrated
   gate runs (the integrated gate subsumes but does not pre-empt its verdict).
3. Lane backend restarted AFTER the PB-CH-8 merge (it adds
   `schema/workflow/workstate-journal.policy.yaml`; YAML does not hot-reload for schema/policy
   registration at boot) — restart with background=true, then :3093 /api/health 200 + :5193 200,
   and NOT again during the gate.
4. Session-doc baseline re-measured at claim: USR-BRAD main.yaml currently 8107ef6e1b88… (full
   sha above); PB-CH-8's own gate will legitimately move it via accept legs — claim-time baseline =
   the fresh measure, and the runbook's snapshot/restore uses that.
5. First targeted check (the single command proving the approach early — BEFORE any budget
   spend): the orchestrator runs Leg 0 preflight as a standalone bounded script (health +
   served-module fetch + ancestor checks + session hash). Expected: all four asserts green in one
   pass. If served-checkout or hash fails, the gate does not launch — a stale serving checkout
   would produce an INVALID verdict, not a defect (run-8 lesson).

The ledger-reattachment legs are CONDITIONAL on the merged PB-CH-8 shape. The claim-time
orchestrator reads these files on trunk to instantiate Leg 7 + the runbook's ledger section —
they do not exist at composition time (PB-CH-8 is in flight in `wt/PB-CH-8-lane2-l2t1405`,
dir verified present at /mnt/vast/home/brad/git/wt/):
`server/src/workspace-session/WorkstateJournal.ts`, `server/src/workspace-session/ledgerQuery.ts`,
`schema/workflow/workstate-journal.policy.yaml`, the capture hook in
`server/src/api/routes/workspace-session.ts` (put() call site now at :57 — verified line at this
tip), the `ledger_answer` member in `app/src/event-editor/right-pane/ai/assistStream.ts`, plus
`.hermes/plans/PB-CH-8-report.md` and its gate receipts `receipts/PB-CH-8/<ts>/`. Name the
query-intent id, frame shape, and disclosure string from those files at claim time; THIS SPEC
intentionally does not freeze them (draft cites of unmerged internals would be fabricated
contracts — the exact thing the contested-state briefing forbids).

Gate scope recommendation (the wave note): run the FULL integrated gate as the default. PB-CH-7
is DONE (decision recorded, CHOSEN OPTION: a at :297, md5 6b9f7e3c confirmed) and PB-CH-8 is
expected merged + gated before PB-CH-9 claims. Trigger conditions that legitimately downgrade to
a wave-1-scoped gate WITH architect sign-off (never unilaterally): (a) at claim time PB-CH-8 is
not merged (ancestor check fails) or died again with unmerged WIP; (b) PB-CH-8 is merged but its
browser gate has failed/repeatedly blocked such that its ledger behavior is unverified — then
ship wave-1 acceptance as its own milestone (task-list :1039 permits), drop Leg 7 +
ledger-final-reattach.png + the ledger runbook section from PASSING status, mark them
NOT RUN-BLOCKED in the evidence manifest, and campaign completion stays blocked on the ledger
(verbatim wave-note consequence). A wave-1-scoped verdict is a milestone, not a campaign close.

## Baselines to re-measure at claim (pins; all composer-context sourced)

| Pin | Value | Source / how to re-measure |
| --- | --- | --- |
| app tsc | 34 error lines, 24-file FILE-SET identity | `cd app && npx tsc --noEmit \| sort`; comm -3 vs claim pre-change. Reaffirmed 43cddb26 (PB-CH-6 merge note) and PB-CH-8 spec measured 34 at e629b0c6 AND 3b9e2a18 |
| server tsc | 26 error lines / 6-file set (AgentOrchestrator, ProtocolIntakeHandlers, RecordHandlers, AuthoringGuard, bootstrapAdmin, RecordStoreImpl) | `npm run typecheck -w server`; comm -3 file-set empty |
| full app suite | 53 failed FILES — SET identity is the bar, not counts | `cd app && npx vitest run`; save claim FAIL list, comm -3 post-change |
| session-doc | USR-BRAD main.yaml = 8107ef6e1b88ee296dd29fc552e1709c8bf844366bfe45fcd5afe6008b1e85b9 (measured by composer today) | `sha256sum /home/brad/.computable-lab-lane2/worktrees/main/var/sessions/USR-BRAD/main.yaml`; re-measure at claim (PB-CH-8 gate may move it legitimately) |
| server scoped session suite | 11 files / 116 tests / 0 failed @ 3b9e2a18 | `cd server && npx vitest run src/workspace-session src/drafts src/api/routes` |
| app session suite | 7 files / 70 tests / 0 failed | `cd app && npx vitest run src/shared/session` |
| surfacesAjv | 5 known FAILS — gitignored symlink into Brad's tree; NEVER "fix", exclude by scoping | PB-CH-8 spec baseline table + handoffs (repeat rule verbatim in every paste) |

## Stop-boundaries (verbatim restatement — operational copy)

> Stop-boundary: no broad visual sweeps, no main/live-stack testing, no success claims for blocked
> portions; unresolved safety/sync/architecture conflicts returned, not documented away.

Operationalization (not weakening): named surfaces/routes only; never :3001/:5174/main data; any
leg not run gets VERDICT-receipt text "NOT RUN-BLOCKED: <exact failed step>" — never a passing
screenshot borrowed from an earlier leg's artifact; and the runbook's known-unsupported section +
the report's open items RETURN conflicts (e.g. the `GET /session/:userId` authz gap, any
gate-found sync anomaly) instead of writing them away. The gate worker/verdict may not resolve a
safety or architecture conflict by documentation; it files it.

## Worker contract

- Branch `pb-ch-9-lane2-l2t<HHMM>` off claim-time `cl/integration-2` HEAD (which must include the
  PB-CH-8 merge — paste `git -c core.fileMode=false merge-base --is-ancestor <PBCH8_SHA> HEAD`).
  Worktree `wt/PB-CH-9-lane2-l2t<HHMM>` per lane convention; NFS bootstrap pitfalls apply.
- EVERY git command in trunk/worktree with `-c core.fileMode=false` (NFS fakes mode-bit
  "modified" files); NEVER `git add -A`; one logical commit + optional report commit.
- Unique deliverable paths exactly as in Scope (`.wip-l2t<HHMM>` report pattern enforced by the
  orchestrator's promote step).
- The worker writes docs/manifest ONLY; the browser gate is orchestrator-authored script +
  artifact-judging reviewer (deterministic-script-only), on the single vision slot, after the
  claim-gate restart. The worker NEVER touches the stack, never restarts it, never browses
  interactively.
- Coder lock: the worker must not collide with PB-CH-8's exit -> adversarial -> merge cycle;
  claim only when the fleet coder lock is free.

## Reviewer bait (what the adversarial review will attack — pre-empt all of it)

- **Verbatim-verified-by weakening = reject.** Screenshot names exactly: final-run-focus.png,
  final-pending-unchanged.png, final-accepted-A.png, final-attached-B.png, final-analysis.png,
  ledger-final-reattach.png (if unblocked), + the approved generic-surface shot. Any rename,
  merge ("one shot covers both"), or leg skipped without a NOT RUN-BLOCKED entry = invalid gate.
- **Success claims for blocked portions** = the run-8/9 invalid-verdict class. Every negative
  claim names the selector probed; every 404/blank re-verified API+reload; blocked = blocked.
- **Zero accept-time AI calls** is checkable: the reviewer must paste the network capture window
  from Accept-click to settled; absent capture = unproven = not accepted.
- **Citing unmerged PB-CH-8 internals as contract** in the runbook/doc drafts = reject. Doc drafts
  cite only code merged on the measured trunk tip (architecture-of-record's own rule: docs follow
  shipped code). If PB-CH-8 shape differs from its spec, the runbook describes THE MERGED shape.
- **Ontology terms:** the ledger concept's ONE local term is `workstate-snapshot` (PB-CH-7 §4.1);
  drafts calling it a revision/record/history-record, or minting new nouns, violate the
  controlled-vocabulary rule and the transport-not-knowledge boundary = reject.
- **Hardcode boundary:** fixture run/protocol ids are gate DATA (plan JSON / receipts), NEVER
  strings added to product code; the runbook documents commands and hashes, never embeds config
  secrets; effective lane config is CONFIG_PATH lane2-config.yaml (md5 cf7e833c…) — the runbook
  says so instead of hardcoding config paths as truth.
- **YAML-reload traps:** the runbook must state that tsx --watch does NOT reload YAML, that the
  journal policy file is read per-call by design (policy-off proof belongs to PB-CH-8, not
  re-litigated), and that the only sanctioned restart is `cl-lane-stack.sh 2 restart` via
  background=true (the BLOCKING-restart pitfall burned this lane already).
- **exactOptionalPropertyTypes:** PB-CH-9 itself writes no TS; if the gate finds a defect and a
  fix is dispatched, backend optional fields mean absent-never-undefined (lane header rule) —
  defect entries must carry that note so the fix worker can't "simplify" it.
- **Doc-drift overclaim:** the drafts must NOT merge-claim, must NOT edit specifications/ in any
  checkout (they don't even exist on the lane trunk — b30b36dc is not an ancestor, verified), and
  must NOT resolve Brad's uncommitted `architecture-of-record.md` working-copy diff — flag it
  (re-checked at append: Brad's tree shows ` M` on both architecture-of-record.md AND
  computable-lab-principles.md — both pre-existing, neither touched by the composer).
- **Pin identity discipline:** server 26/6-file and app 34 pins are FILE-SET diffs, full-app 53 is
  a SET diff; the surfacesAjv symlink (gitignored, into Brad's tree, 5 known fails) is NEVER
  "fixed" — scoping the vitest command is the sanctioned exclusion.
- **Budget discipline:** >6 sends = invalid gate regardless of what the shots show; retry waits
  belong in plan data (retryUntilVisible), not in fresh asks.

## Open questions (3, each with recommendation)

1. **Where/how the doc edits merge, given b30b36dc is main-only.** Checked: `git merge-base
   --is-ancestor b30b36dc HEAD` fails on trunk; neither file is in trunk `specifications/`
   (ls-files + find); PB-CH-8 spec §6 concurs. Recommendation: drafts land as standalone hunks
   under `.hermes/plans/PB-CH-9-drafts/` against b30b36dc committed text; architect applies on
   main and decides lane-sync timing. Orchestrator should confirm this delivery shape at review
   (it is the only reading that satisfies "DRAFT (not merge)" + the binding rule + trunk reality).
2. **Session-doc pin vs accept-legs by design.** The 8107ef6e pin is the byte-identity anchor for
   the NO-PUSH legs (2/3) and restore target for teardown, but legs 1/5/6 LEGITIMATELY move
   USR-BRAD's main.yaml (that is the feature). Checked: handoff 1020 used 8107ef6e as pre/post
   on zero-accept gates; useSessionSync debounce/attach verified. Recommendation: treat the pin
   as (a) pre-gate baseline, (b) invariant within pending/rejected legs, (c) teardown-restore
   target (restore snapshot copy + paste final sha == baseline); all lane records being test data
   makes restore safe. State this three-way semantics in the manifest to defuse "you broke the
   pin" vs "the feature pushed" arguments.
3. **Leg 8 sourcing — reuse vs spend.** The approved generic-surface shot has a 0-send path
   (cite the accepted PB-CH-6 gate receipt for `/literature?view=build`) and a 1-send path
   (fresh turn, needs the 6th budget slot). Checked: PB-CH-6 gate prompt staged, candidate
   >= 43cddb26 (13:25/16:00 handoffs); PB-CH-6-report.md:17 fixes the surface label;
   surfaces.yaml has no `literature` registry id (grep at 1ce6d282). Recommendation: reuse the
   PB-CH-6 accepted receipt IF it exists at gate time (it's the same product build, and verified-by
   says "the PB-CH-6 approved consumer" — an accepted prior receipt of that consumer is exactly
   that evidence); spend the send only if PB-CH-6's gate is still unaccepted, in which case also
   consider the wave-note downgrade for leg 7 to keep total <= 6.

## Cite-verified appendix

All cites re-read FIRST-HAND by the composer in the lane trunk checkout at HEAD **1ce6d282**
(initial pass at 7f595da1; delta is docs-only handoff commits; code tip 43cddb26 — re-verify all,
tip will move; FINAL TIP SEEN AT APPEND: 01de772f, again docs-only — `git -c core.fileMode=false
status --porcelain` shows no tracked modifications and no code commit intervened; code tip
unchanged 43cddb26). No cl-scout used this session: every bounded question resolved faster and to
primary sources via read_file/grep (scout output would have been redundant, and per procedure
scout is screening, not authority).
- task-list.md PB-CH-9 block :1937-1970 (description :1943-1953, stop-boundary :1954-1955,
  verified-by :1959-1968, files :1969); campaign header wave notes :1036-1044; PB-CH-8 block
  :1881-1935 incl. RESUME note :1884-1893; PB-CH-7 DECISION CLEARED :1873-1878.
- PB-CH-7 decision (lane trunk): `.hermes/plans/PB-CH-7-ledger-storage-decision.md` — 297 lines,
  CHOSEN OPTION: a at :297 (re-read); md5 6b9f7e3cf23d53f5fdbbf7ddf88a9c87 (measured).
- PB-CH-8 promoted spec `.hermes/plans/2026-10-07_1405-PB-CH-8-ledger-implementation-spec.md` —
  baselines table (:84-94), browser-gate legs (:429-444), symlink note (:96-102); its §6 (:324-325)
  independently records the missing specifications/ files.
- Handoffs (newest 5): 2026-10-07_1600, _1530, _1325, _1140, _1110 (read; facts used: trunk tips,
  worker states, CONFIG_PATH pitfall :47-50, pins :60-65).
- Trunk code (all re-read at 1ce6d282): WorkstateProposalCard.tsx testids :63/:78/:128/:131/:142;
  AnalysisChatPanel.tsx:65; useSessionSync.ts :24/:154; useWorkstateProposalFlow.ts:92 (+fork-
  detector comment :5); assistStream.ts :210/:393/:398; WorkspaceSessionStore.ts :74;
  workspace-session.ts PUT :43-58 (store.put :57, Ajv :50); server.ts :1522-1523;
  AgentOrchestrator.ts workspace_action :2098 / compose_workstate :2186; App.tsx routes :181/:190/:206;
  surfaces.yaml 10 ids :19-:83 (NO literature); config/drafting/adapters.yaml workstate :13-15;
  config/drafting/workstate-tab-kinds.yaml kinds block (read whole).
- Doc targets (READ-ONLY, Brad's tree `/mnt/vast/home/brad/git/computable-lab`, main @ b30b36dc;
  architecture-of-record.md working copy has uncommitted ` M` — flagged): architecture-of-record.md
  185 lines, authority rule :5, §3b agent-actions :82, §8 :164-169; ai-drafting-and-ui-projection.md
  121 lines, adoption table :96-103, "Report unimplemented adapters as such" :121. b30b36dc NOT an
  ancestor of cl/integration-2 (merge-base d290a7fc) — measured.
- Lane data (read-only, live dir): `/home/brad/.computable-lab-lane2/worktrees/main/` — runs incl.
  RUN-2026-09-19-run-vwr8, PRT-4iaey2/g5zy9e/wlj0qm; sessions default/USR-BRAD/USR-LOCAL-ADMIN;
  USR-BRAD main.yaml sha256 8107ef6e1b88…5b9 (full measure above). lane2-config.yaml dataDir +
  CONFIG_PATH facts.
- Gate template: prompts/review-PB-CH-6-gate-run1-20261007T1320.txt (read whole); harness/plans
  dirs `~/.hermes/cl/browser-receipts/{harness,plans}/` (listed); app/e2e/ + app/playwright.config.ts
  exist (listed). PB-CH-8 worktree dir present at /mnt/vast/home/brad/git/wt/PB-CH-8-lane2-l2t1405.
- PB-CH-6 report `.hermes/plans/PB-CH-6-report.md:17` (OQ1 ruling: consumer PdfProtocolBuilder,
  approved-surface-id `literature`); PB-CH-6 spec `.hermes/plans/2026-10-07_1100-PB-CH-6-generic-mount-spec.md`
  (:45-47, :71-76, :188-191).

---
Report: DRAFT complete at this path. Summary: PB-CH-9 spec = Half A, a deterministic-script-only
integrated gate (8 legs mapped clause-by-clause to the verbatim verified-by, 6-send budget with
explicit math, named routes/screenshots verbatim, network-evidence rules for zero-accept-time-AI
and accept-in-A=>visible-in-B across both workstate classes on the existing push/attach path,
ledger legs CONDITIONAL with a claim-time read list for the in-flight PB-CH-8 shape) + Half B,
draft-only doc edits (architecture-of-record §8, projection-doc adoption table) and the 10-topic
lane runbook, delivered as standalone drafts against b30b36dc because those files are main-only
(b30b36dc not an ancestor of trunk — verified) with architect-merges-before-entry as binding.
Full gate recommended as default with explicit wave-1-downgrade trigger conditions; stop-boundary
restated verbatim; pins (app 34 / server 26/6-file / full-app 53-set / session 8107ef6e full sha
re-measured today) listed for claim-time re-measure; reviewer-bait covers the run-8/9
invalid-verdict classes, unmerged-internals-as-contract, workstate-snapshot terminology, budget
discipline, and the surfacesAjv symlink rule. Open: doc-merge delivery shape, three-way session-
pin semantics, leg-8 reuse-vs-spend. Final trunk tip seen while writing: 1ce6d282.
