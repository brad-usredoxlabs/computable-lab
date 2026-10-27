# L2-SUITE-B — Prompt-suite acceptance, sequence leg: prompts 9-10, MSA + probe alignment with cross-surface context held

CAMPAIGN: universal-chat (Brad-approved 2026-10-26 "approved as is!"). Binding decisions
UC-D1 (universal chat is the product; AiTabPanel NOT the driven surface), UC-D2 (the ten
prompts are a standing browser-tested acceptance suite — Brad's verbatim: "make sure as part
of the lane 2 tasks that all of these prompts are browser tested"), UC-D3 (plate/sequence
split — THIS item owns prompts 9-10 only), UC-D4 (vocabulary integrity). Gate doctrine
(task-list campaign header, verbatim): every prompt-suite task ships BOTH a deterministic
headless probe per prompt (write-free where possible; byte-compare server legs) AND
vision-reviewer receipts for visual claims. Any prompt landing success + zero mountable
events + zero cards + no honest wall = whole-suite FAIL (REVISE-GHOST-1 rule).

GOAL (one sentence): extend L2-SUITE-A's committed harness with the sequence leg — prompts
9-10 VERBATIM as one held-session continuation on the sequences surface — proving per turn
the honesty trichotomy in its SEQUENCE form (grounded sequenceProposal / answerable cards /
honest wall that NAMES what is missing, never mock), that turn 10 actually holds turn 9's
alignment revision, and that both directional variants (5'->3' and reverse complement)
produce comparable artifacts with a readout a scientist can judge — with the
reverse-complement authored by the AI, never hardcoded in TypeScript.

## Base + dispatch state (verified at composition)

- Trunk cl/integration-2 @ 1875d068 (composer-verified `git log -1`, 2026-10-26 ~05:15 EDT).
  Branch cl/integration-2, worktree /mnt/vast/home/brad/git/cl-integration-2; lane stack
  backend :3093, frontend :5193; data repo /home/brad/.computable-lab/worktrees/main. Use
  `git -c core.fileMode=false` for all git (NFS mode-bit noise).
- Deps per the task (verbatim): "L2-SUITE-A merged (shared harness scripts) + mafft/blastn
  endpoint reachable per existing analysis sequenceMethod config." dispatch_gate: L2-SUITE-A
  merged (shared harness scripts) + mafft/blastn endpoint reachable per existing analysis
  sequenceMethod config.
- AT COMPOSITION .hermes/plans/harness/ DOES NOT EXIST on trunk (verified `ls`) — SUITE-A is
  unmerged, so the exact driver filenames/layout below are "expected from SUITE-A's ratified
  design"; the coder branches off the CURRENT tip at dispatch and adapts to SUITE-A's
  MERGED layout, never re-authoring it (its ratified rulings: one held ordered session,
  fail-fast with blocked-by-P<n> disclosure, node-CLI parity wrapper over FREEFORM's TS
  helper — decisions/SUITE-A-oq-rulings-l2t0315.md, OQ1/OQ2/OQ3 RULED).
- The SUITE-A draft (specs-draft/2026-10-26_L2-SUITE-A-prompt-plate-leg-DRAFT.l2t0210.md)
  explicitly instructs (its Out-of-scope, verbatim): "Prompts 9-10 (L2-SUITE-B extends THIS
  harness — design the driver with a plate/sequence leg split so B adds expectations + a
  leg, but do NOT author B's content here)." This spec is B's content. Do NOT duplicate
  SUITE-A's plate-leg harness, honesty trichotomy helper, or corpus data file — extend.

## The prompts (VERBATIM from /mnt/vast/home/brad/git/computable-lab/tmp/prompt_files.md,
## lines 19-23 — composer byte-inspected with cat -A at composition; bait B1)

9. `Go to the multiple sequence alignment tool and align all 16S sequences in this project.`
   (source line 19: `9.  Go to the multiple sequence alignment tool and align all 16S
   sequences in this project.` — TWO spaces after the list number; inside-text single space
   only.)
10. multi-line in source (lines 21-23): `10.  Holding the multiple sequence alignment in
    place, align our primary and probe sequences ` + newline + `against it.  Try both a
    5'->3' alignment and a reverse complement alignment to see which one ` + newline +
    `is the better sequence alignment` — line 21 and 22 END WITH A TRAILING SPACE;
    "against it.  Try" has a DOUBLE space; the prompt has NO terminal period.

Corpus-file rule: prompts-sequence-leg.txt is a byte slice of the corpus file (SUITE-A's
strip rule from its OQ ruling: strip the `N.` list prefix byte-wise; prompt 10's internal
newlines and trailing spaces SURVIVE unless the report names an explicit join rule and shows
both the raw and stripped sha256). The harness NEVER retypes or tidies either prompt.

## Cited anchors (ALL opened first-hand by the composer at 1875d068; re-verify at dispatch —
## SUITE-A/CHAT-1 merges move app/ cites)

Sequences surface + its chat (the driven surface — NOT AiTabPanel):
- app/src/sequences/SequencesPage.tsx:18 — `const tabs=['Editor','Assay','Analysis',
  'Setup','Import','Knowledge'] as const` (the "multiple sequence alignment tool" lands on
  the Analysis tab). :71 — onAgentAction via createSequencesAgentActionHandler (tab/record
  navigation executor). :77 — aiContext: `surface:'sequences'`, records[] (id, kind, label,
  alphabet, length, residues when <=20000, `...(r.payload.outputArtifactRefs?{...}:{})`
  conditional spread), `availableOperations:contract?.capabilities?.engines`, and
  **`lastActionResult:result`** — THE HOLDING MECHANISM: the previous action's result rides
  into the NEXT turn's context. :78 — `useAiChat({aiContext, onSequenceProposal,
  endpoint:'sequences', ...})` — endpoint here = the thread-persistence key. :83-86 —
  `act()` POSTs the action to sequenceApi('/actions') — THE WRITE PATH (Accept-and-apply).
  :149 — the "Accept and apply" button: non-save operations execute via act(), and
  `if(data.manifest)selectTab('Analysis')`. :150 — `rightPane={<HarnessChatPane
  onReviewProposal={onSequenceProposal}/>}` — the sequences chat IS the universal pane.
- app/src/shared/api/aiClient.ts:234-236 — endpoint fork (composer re-verified): only
  surface 'event-editor' rides the legacy /ai/draft-events/stream; surface 'sequences'
  posts to **/api/ai/assist/stream** — same route the plate leg drives
  (routes.ts:677 -> AIHandlers.ts:116 assistStream).
- server/src/api/routes.ts:732-734 — GET/POST /api/ai/threads/:endpoint — the sequences
  thread ('sequences' key) persists each turn; app/src/shared/hooks/useAiChat.ts:250 loads
  the thread on mount, :583 `buildConversationHistory(messages)` feeds the per-turn call
  (:589-597 streamAssist). Turn 9 -> turn 10 holding therefore rides TWO real mechanisms:
  (i) conversation history on the 'sequences' thread, (ii) aiContext.lastActionResult.
- schema/registry/surfaces/surfaces.yaml:92-98 — sequences surface: path /sequences,
  objectTypes incl. analysis-run, tabs [Editor, Assay, Analysis, Setup, Import, Knowledge]
  — YAML is king (surfacesTabsCompat.test.ts:4-14 fence).
- schema/workflow/agent-action.schema.yaml:44-45 — sequence-tab target enum
  [Editor, Assay, Analysis, Setup, Import, Knowledge].
- server/src/ai/AgentOrchestrator.ts:1147-1150 — sequences surface forces the agent_intent
  tool with the sequenceAction arm; :1197-1215 — the sequences guidance block: navigation
  ("Go to ...") is `workspace_action` open-surface with a sequence-tab target ("Navigation
  drafts nothing and writes nothing"); drafting requests are `intent=sequence_action`;
  :1207 — "Do not invent references to existing records ... Proposals do not execute until
  accepted. Ask for missing scientific information rather than guessing." :1567 — sequences
  focus guard (named refusal BEFORE the model, zero inference/writes). :2557-2572 — the
  sequence_action arm: decode -> validateSequenceAction -> returns
  `{ success: true, sequenceProposal: ... }` — PROPOSE-NEVER-WRITE (no store mutation; notes
  "Review the sequence action proposal before applying it").
- server/src/ai/submitSuggestionTool.ts:817 — intent union includes 'sequence_action';
  server/src/ai/systemPrompt.ts:319 — sequences surface role ("Emit declarative
  sequence_action proposals using the supplied contract ... Use only grounded references").
- config/drafting/shorthand-drafting.yaml:12 — `surfaces: [workspace.deck]`: 'sequences' is
  NOT a shorthand surface; sequence turns ride the sequence_action agent_intent path, so
  FREEFORM's events-bound trichotomy does NOT typecheck on this leg — SUITE-B defines the
  SEQUENCE trichotomy (§3) without editing FREEFORM's helper (bait B7).

Sequence runtime (the engines; orchestrator findings CONFIRMED first-hand):
- config/sequence-analysis/capabilities.yaml:3-25 — engines: virtual-pcr (runtime builtin,
  :4-9), mafft (local|container, versionArgs `--version`, :10-17), blastn (local|container,
  versionArgs `-version`, :18-25).
- server/src/sequences/sequenceRuntime.ts:166-183 — `discoverEndpoints()`: builtin engines
  resolve from config; local engines are found ONLY by scanning process.env.PATH for the
  executable, hashing it, and running versionArgs (:170-179). NO mafft and NO blastn on
  this host (composer: `which mafft` / `which blastn` -> not found). :63-75 —
  `inspectEndpoint()` re-checks runtime support + version match at every run. :184-187 —
  `deployEndpoint` requires a container image pinned by digest (`@sha256:` 64 hex) and runs
  `docker pull` (docker binary IS present: /usr/bin/docker, composer-verified).
- server/src/sequences/SequenceService.ts:137-159 — the run_mafft/run_blastn arm: pins
  endpointRef to a `sequence-endpoint` record (:138); REJECTS if
  `endpoint.engine !== operation` (:141, error `Select an endpoint for ${operation}.`);
  re-runs inspectEndpoint (:142); pins inputs to revision refs (:144); saves an
  **analysis-revision** with `sequenceMethod:{operation,endpointRevisionRef}` (:145),
  freezes, creates an **analysis-run** (ANR-*), executes via AnalysisRunner (:156) and
  returns the output manifest. NO endpoint record -> honest named SequenceError.
- server/src/sequences/sequenceRoutes.ts:21 — GET /sequences/contract (schema +
  capabilities — read route, probe-able); :32 — POST /sequences/actions/validate (schema
  validation WITHOUT writes — the layer (a) probe's execute-free seam); :33 —
  POST /sequences/actions (THE WRITE PATH — SequenceService.apply); :34 —
  POST /sequences/executable.
- Data-repo state (composer-verified): /home/brad/.computable-lab/worktrees/main/records/
  has NO sequence-endpoint directory and `grep -rl "kind: sequence-endpoint" records/` =
  0 hits; no analysis-run records exist. records/sequence/ holds 24 SEQ-* records, labels:
  16S-rRNA primer/probe families (Ashahii_1718F, Akk_1566F/1682R, Btheta, Bvulgatus,
  Dformici, Fpraus, Feligens, Pdist, Rint, Rtorques, Arectalis + 2x "FAM-QSY probe"),
  lengths 21-26 residues (primers, not full 16S amplicons). NOTHING is labeled "16S" (OQ2).

Reverse-complement affordance (the AI's job — what the compile path CAN express, verified):
- schema/bio/sequence-action.schema.yaml — full operation enum (composer grepped `const:`):
  save_sequence(15), create_oligo(91), save_oligo(115), save_collection(129),
  save_readout(149), save_assay(160), configure_endpoint(174), run_virtual_pcr(188),
  run_mafft(245), run_blastn(288), interpret(337), promote_oligo(371), save_interval(390),
  save_interpretation_rule(417), pin_sequence(429), discover_endpoints(440),
  deploy_endpoint(450). run_mafft inputs = {queries} only, parameters =
  {strategy auto|globalpair|localpair, maxIterations} (:245-285). run_blastn inputs =
  {queries, references}, parameters = {task blastn|blastn-short|megablast, evalue, maxHits}
  (:288-334). grep `reverse|complement|orientation` in the schema hits ONLY
  virtual-pcr's `reverse` primer input (:199) and save_interval's `strand` enum
  (+/-/na/unknown, :402-406). => NO transform/revcomp operation and NO orientation parameter
  exists on run_mafft/run_blastn.
- server/src/sequences/sequenceEngine.ts:16 — `reverseComplement` exists but ONLY inside
  the builtin virtual-pcr engine (:52-74); the mafft/blastn paths (sequenceRuntime.ts:127-158)
  never call it. No AI-facing revcomp affordance anywhere in server/src/ai or
  server/prompts (composer grepped). This is an affordance GAP -> OQ3 (architect routing),
  NOT a coder invention (bait B4).
- The ONLY honest AI-authored revcomp path on the current schema: the model emits
  `save_sequence` for the reverse-complemented probe residues (AI-computed bases, proposal
  reviewed before the human Accepts) + `run_blastn` over native and revcomp query sets —
  blastn hits are then comparable artifacts. The AI CAN also read blastn's minus-strand
  reporting (sstart/send, sequenceRuntime.ts:150-156) — but that yields ONE run, not the
  two variant artifacts the prompt demands. See OQ3.

Comparison readout (what the scientist sees):
- app/src/sequences/SequenceResults.tsx:7 — alignment artifacts render per-row
  (`sequence-alignment`, sequenceId + aligned string); :8 — array artifacts (blastn hits)
  render as a generic table keyed by hit fields (identity, length, evalue, bitScore,
  coverage — sequenceRuntime.ts:156). ONE manifest at a time (:1) — NO side-by-side
  comparison view exists (OQ4).

## Environment precondition — the spec defines BOTH branches

The dispatch_gate's second clause ("mafft/blastn endpoint reachable") FAILS on today's host
(verified: no binaries, no endpoint records). The suite must therefore be honest in BOTH
worlds, with the branch decided by a live discovery probe at run time, never by a flag in
the harness:

- Branch (a) — endpoint provisioned (mafft endpoint record exists, inspectEndpoint passes):
  turn 9 must produce an analysis-run (ANR-*) whose manifest carries an `alignment`
  artifact over the project's 16S-family records; turn 10 must produce TWO run_blastn
  artifacts (or the architect-ruled equivalent per OQ3) plus the held reference. Provisioning
  itself is OUT of coder authority: installing system packages (mafft/BLAST+ via the system
  package manager — Arch/AUR here) and writing the sequence-endpoint record into the data
  repo are orch actions (same class as stack restart); the container alternative exists
  (deployEndpoint + docker, sequenceRuntime.ts:184-187) but needs an org-approved
  digest-pinned image — smallest is local install + `discover_endpoints` ->
  `configure_endpoint` (SequenceService.ts:129-135) driven through the Setup tab or
  /sequences/actions by the ORCH pre-dispatch. OQ1 owns who/when; the harness merely
  branches on the discovery probe's output.
- Branch (b) — endpoint absent (TODAY's truth): every execute-side leg must land the honest
  wall NAMING what is missing — the service's actual message is `Select an endpoint for
  mafft.` (SequenceService.ts:141) / discoverEndpoints returning no mafft entry
  (sequenceRuntime.ts:166-183) — with NO mock, NO fake endpoint record, NO hardcoded
  executable path (task text: "or fails HONESTLY naming what is missing — no mock").
  Per the task's verified-by VERBATIM: such an honest wall "PASSES only with architect
  sign-off on the capability gap as a new block." The harness prints
  `verdict=honest-failure` and the report states plainly that acceptance under branch (b)
  is gated on that sign-off — the coder never self-declares the wall sufficient (bait B6).

## Description of work

### 1. Harness extension (the deliverable; paths assume SUITE-A's ratified layout)

    .hermes/plans/harness/
      run-suite-a.py                     # SUITE-A's, MERGED — extend, do not fork
      prompts-plate-leg.txt              # SUITE-A's — untouched
      prompts-sequence-leg.txt           # NEW: byte slice of tmp/prompt_files.md lines 19-23 (B1)
      expectations-sequence/             # NEW: P9.json, P10.json (shape below)
      lib/sequence-leg.*                 # NEW: sequence-leg classifier + node CLI arm

  If SUITE-A's merged layout differs (e.g. leg subdirs), follow IT; the report names the
  final layout. The driver gains `--leg sequence` (or equivalent) so the plate leg stays
  byte-stable, plus `--prompts 9|10`, `--single N`, `--all` semantics inherited.

Driver contract (sequence leg):
- ONE held session continuation: surface 'sequences', context BYTE-STABLE between turns 9
  and 10 except for the legitimate result-channel update (lastActionResult must legitimately
  CHANGE to carry turn 9's result — that change IS the hold; bait B5). The request is built
  from the MERGED SequencesPage/useAiChat shape captured at dispatch (SUITE-A README
  captured-shape convention), posted to /api/ai/assist/stream (:3093) exactly like
  precheck-assist-turn.py drives it.
- Turn 9 expectations: navigation observable = an agent_action frame (workspace_action,
  sequence-tab Analysis or open-surface sequences) AND/OR a sequence_action proposal
  (run_mafft over the project's 16S-family records with grounded record refs, or a
  save_collection + run_mafft pair) — outcome-asserted, never intent-name-pinned (SUITE-A
  bait B7 convention). The proposal's `queries`/members must be grounded: every referenced
  record id ∈ the request's context.records (server guidance forbids invented refs,
  AgentOrchestrator.ts:1207) — the probe asserts ref-membership.
- Turn 10 expectations: the request context / thread history CONTAINS turn 9's alignment
  identity (analysis-run/revision id if an execute leg ran, else the pinned refs/
  proposal requestId — see OQ5: what exactly "held" is observable in write-free layer (a)),
  AND both directional variants are present as two distinct proposals/artifacts whose
  queries differ by orientation with all other parameters identical.
- Environment branch: run `discover_endpoints`-equivalent evidence NON-destructively —
  GET /sequences/contract (read route, sequenceRoutes.ts:21) for the engine menu, and for
  executability evidence the driver classifies from the turn's own honest outcome
  (wall text), NEVER POSTing /sequences/actions during layer (a).

### 2. Write-free boundary (sharper than SUITE-A's — say it plainly)

Proposing is free; executing is not. Layer (a) asserts PROPOSALS via the stream (the
sequence_action arm returns sequenceProposal without store mutation,
AgentOrchestrator.ts:2572) and may use POST /sequences/actions/validate (route :32 — schema
validation only, no apply). Layer (a) NEVER POSTs /sequences/actions (:33 — that WRITES
sequence/endpoint/analysis records to the data repo). Producing the actual analysis-runs +
blastn artifacts that verified-by demands happens on the EXECUTE drive: the browser layer
(b) (Accept-and-apply, SequencesPage.tsx:149 — the product path) or an orch-owned scripted
execute replay against the lane data repo — records there are TEST DATA (Brad ruling,
SUITE-A OQ1), but the layer-(a) write-free invariant + before/after data-repo digest proof
still hold. "Both turns produce analysis-runs" is therefore asserted on the EXECUTE drive
(OQ5 names the gate split), with the write-free stream leg asserting the proposal-side
equivalent.

### 3. The honesty rule in SEQUENCE form (new classifier shape; do NOT edit FREEFORM's helper)

Per turn the verdict ∈ {`proposal` | `cards` | `honest-failure`}, where:
- `proposal` = success AND a sequenceProposal is present AND every record/revision ref in
  it resolves in the request's context.records (grounding — an ungrounded ref is NOT a
  proposal, it is bait B2 failure); or, on execute legs, an analysis-run/record id returned
  by the product write path.
- `cards` = clarificationRequests > 0 with an answerable form ("which sequences are the
  16S ones?" / "what is our primary sequence?" — prompts 9-10 contain genuinely ambiguous
  nouns; cards are a HONEST outcome, not a cheat, but the cards must name the ambiguity).
- `honest-failure` = a wall/error whose text NAMES the gap (e.g. `Select an endpoint for
  mafft.`, SequenceService.ts:141; the focus-guard's named refusal, :1567 region).
  A generic model-failure line is NOT a named wall.
- FORBIDDEN = success + no proposal + no cards + no wall = suite FAIL.
Implement as a sequence-leg arm of SUITE-A's node CLI (its OQ3 ruling keeps ONE TS
implementation home) with its OWN parity-pin vitest file (sequence-leg fixtures: grounded
proposal, ungrounded-ref proposal -> forbidden, cards, named wall, generic-failure ->
forbidden). FREEFORM's assertHonestOutcome (events-shaped) is consumed ONLY where a turn
crosses into event territory; SUITE-B edits neither helper nor the plate-leg expectations.

### 4. Per-prompt acceptance criteria

Acceptance criteria VERBATIM from the task list ("verified by"):
  Headless probes: both turns produce analysis-runs (or honest named failure);
  held-alignment reference present in turn-10 inputs; both variants produce comparable
  artifacts. Browser receipt: reviewer watches navigation + both alignments + the
  comparison readout. VERDICT:accept per suite rules; if capability is genuinely absent,
  the receipt documents the honest wall stating it (that PASSES only with architect
  sign-off on the capability gap as a new block).

And VERBATIM from the task description (the semantics this spec operationalizes):
  chat-driven navigation to the sequences surface; the existing mafft sequenceMethod path
  executes over the project's 16S records (or fails HONESTLY naming what is missing — no
  mock); the second turn HELDS the first alignment (cross-surface, cross-turn context) and
  runs both directional variants with a readable comparison the scientist can judge.
  Reverse-complement is the AI's job, not hardcoded — check the compile path supports it or
  route the gap to architect, do not fake it. Extends the same committed harness from
  L2-SUITE-A; same honesty rule per turn.

Operationalized:
- P9 layer (a): agent_action lands the sequences surface/Analysis tab (target.tab ∈
  declared registry tabs, surfaces.yaml:98) AND a grounded run_mafft proposal (or answerable
  cards naming which records are treated as the 16S set, or a named wall). P9 execute leg
  (orch drive, branch (a) world): an ANR analysis-run whose manifest carries an `alignment`
  artifact covering the selected records (SequenceResults.tsx:7 renders it).
- P10 layer (a): turn-10 request evidence shows the hold (thread history frame of turn 9 +
  aiContext.lastActionResult carrying turn 9's ids — bait B5 defines the assertion); two
  distinct proposals/artifacts, one per orientation, identical parameters except the
  oriented query refs (OQ3 rules the mechanism: save_sequence(revcomp) + run_blastn x2 is
  the current-schema honest expression; if the architect rules it a gap, this leg becomes
  the named wall instead). P10 execute leg: two manifests whose hit tables are comparable
  (same task/evalue/maxHits; differing query set).
- Comparison readout: today = Analysis tab tables (SequenceResults.tsx:7-8) + chat prose;
  "readable comparison the scientist can judge" = reviewer reads both tables'
  identity/bitScore/coverage columns and the chat's comparative answer. Any DEDICATED
  side-by-side view is new work — OQ4, not this item's coder's invention.

## First targeted check (the ONE command that proves the approach early)

cwd=/mnt/vast/home/brad/git/cl-integration-2, stack live, SUITE-A merged:
  python3 .hermes/plans/harness/run-suite-a.py --leg sequence --prompts 9 --single
Expected EARLY: the driver posts prompt 9 verbatim to :3093 on the captured sequences-surface
shape, dumps prompt-9.json under receipts, and prints exactly one of
`proposal` / `cards` / `honest-failure` — NEVER the forbidden success-with-nothing (exit
nonzero on that). On TODAY's unprovisioned trunk the honest verdict is `honest-failure` or
`cards` (no mafft endpoint); a run that prints `proposal` while its run_mafft refs do not
resolve in context.records is classifier-wrong (B2) — fix the classifier before writing
P10's expectations.

## Complete verification commands (expected outputs)

1. Sequence-leg harness re-runnable (cwd=repo root, orch execute replay where stated):
   `python3 .hermes/plans/harness/run-suite-a.py --leg sequence --all --base
   http://localhost:3093` -> exit 0; two lines `P9 verdict=<...>` `P10 verdict=<...>`;
   prompt-9.json / prompt-10.json under a receipts dir; data-repo digest identical
   before/after (layer (a) write-free); immediate re-run prints the same verdicts.
2. Sequence-leg classifier parity pin: `cd server && npx vitest run <parity file the report
   names>` -> PASS on the five sequence-leg fixtures (grounded-proposal, ungrounded-ref,
   cards, named-wall, generic-failure) through both the TS helper and the driver classifier.
3. Corpus byte-parity: `sha256sum` of prompts-sequence-leg.txt vs the byte slice `sed -n
   '19,23p' /mnt/vast/home/brad/git/computable-lab/tmp/prompt_files.md | sha256sum` — report
   shows both hashes plus the strip-rule diff (B1).
4. Typecheck: `npm run typecheck -w server && npm run typecheck -w app` -> sorted error-line
   diff vs branch-start baseline = ZERO NEW (both dumps in the report). Harness-only
   landing: both dumps byte-identical to baseline.
5. Execute-branch proof in branch (a) world (ORCH-OWNED replay, per SUITE-A OQ3 ruling that
   live drives are orch budget): with mafft endpoint provisioned (OQ1), the execute drive
   returns `recordId: ANR-*` and a manifest artifact `dataKind:'alignment'` for turn 9, two
   ANR runs for turn 10; in branch (b) the drive instead returns SequenceError text naming
   the missing endpoint (curl of POST /sequences/actions run_mafft shows
   `Select an endpoint for mafft.`) — evidence attached either way.
6. Vision gate (ORCH-owned after merge, campaign convention): cl-browser-reviewer at :5193 —
   navigation lands the Analysis tab, both alignment readouts render, comparison readout
   legible; receipts /home/brad/.hermes/cl/receipts/L2-SUITE-B/<ts>/browser/ ->
   VERDICT: accept; under branch (b) the receipt documents the honest wall verbatim and the
   verdict carries "PASS CONDITIONAL: pending architect sign-off on the capability gap."

## In scope / out of scope (exact paths)

IN SCOPE:
- .hermes/plans/harness/** additions for the sequence leg (prompts-sequence-leg.txt,
  expectations-sequence/, lib/sequence-leg arm, run-suite driver extension) — extend, never
  fork or rewrite the plate leg.
- ONE sequence-leg parity-pin test file (server or app vitest, named in the report).
- /home/brad/.hermes/cl/receipts/L2-SUITE-B/** (runtime state; outside the repo).
- Fix-runs the prompts expose (server/src/sequences/**, server/src/ai/** sequences arm, app
  sequences-surface files) — each its OWN commit on the same branch, RED first, reviewed per
  cycle (task files-field: "sequences surface + analysis chaining fixes the prompts expose").

OUT OF SCOPE (do not touch):
- FREEFORM's assertHonestOutcome and per-leg probe files; SUITE-A's plate-leg files,
  corpus slice, expectations/ — consume only.
- config/sequence-analysis/capabilities.yaml engine declarations; schema/bio/
  sequence-action.schema.yaml operation vocabulary (adding a revcomp OPERATION is schema
  design = OQ3 architect routing, NOT a fix-run; "op vocabulary ... never TypeScript
  branches" cuts both ways — no revcomp if/else in server TS either, task text + repo rule 1).
- mafft/blastn system installs, container pulls, and sequence-endpoint record writes
  (ORCH-owned provisioning — OQ1). Data repo /home/brad/.computable-lab/worktrees/main as a
  layer-(a) write target; Brad's main stack :5174/:3001 — never.
- AiTabPanel as a driven surface (UC-D1); prompts 1-8 semantics.

## Reviewer bait (the likely edge errors for this item — pre-empt them)

- B1 multi-line verbatim drift: prompt 10 is a 3-LINE prompt with trailing spaces on lines
  1-2 and a double space after "against it." — a harness that joins lines into one tidy
  sentence or strips trailing spaces is a FAKE suite. Report shows raw+stripped sha256 and
  the exact strip/join rule.
- B2 ungrounded-ref laundering: `proposal` verdict requires EVERY ref in the proposal to
  resolve in the request's context.records (server guidance AgentOrchestrator.ts:1207
  forbids invented ids — the probe enforces what the prompt only asks). A harness that
  counts any sequenceProposal-shaped frame as `proposal` without ref-membership is the
  forbidden fourth outcome wearing a costume.
- B3 mock engine: any fake mafft/blastn executable, stub endpoint record, or harness-side
  "simulate alignment" fallback = instant reject (task: "no mock"). The honest branch (b)
  path exists precisely so nobody fakes branch (a).
- B4 hardcoded reverse complement: no revcomp vocabulary in server TS (sequenceEngine's
  reverseComplement is the builtin virtual-pcr engine's, sequenceEngine.ts:16 — NOT an
  AI-path affordance), no revcomp branch in the harness, no pre-mutated fixture sequences
  smuggled in as "the revcomp variant." The variant must be AI-proposed (or the gap routed
  per OQ3 to architect, per the task's "do not fake it").
- B5 vacuous hold: asserting "lastActionResult key exists" is vacuous (the key is always
  present, SequencesPage.tsx:77 builds it every turn). The pin: turn-10's captured request
  context.history / aiContext.lastActionResult contains turn 9's ACTUAL ids (proposal
  requestId / ANR / revision id from the receipts' prompt-9.json), and the
  deriveContextCacheKey-stable evidence line (AgentOrchestrator.ts:1288 convention) in both
  prompt-N.json. A driver that rebuilds sequences context between turns silently resets the
  hold — prompt 10 would then "pass" on fresh guessing.
- B6 honest-wall laundering: the wall must NAME the gap; the message must match the real
  service text class ("endpoint"/"mafft"/"engine" naming — SequenceService.ts:141,
  inspectEndpoint :63-75 errors). A generic "model failure" or focus-guard refusal for the
  WRONG reason is not branch (b); and NO coder verdict under branch (b) may claim
  acceptance — the architect sign-off clause (verified-by) is orch/architect-owned.
- B7 helper-edit temptation: the events-shaped assertHonestOutcome cannot classify a
  sequenceProposal turn; editing it (or the plate-leg expectations) to make a sequence
  verdict pass = instant reject — the sequence-leg arm is additive (its own fixtures).
- B8 exactOptionalPropertyTypes: any fix-run touching optional channels (sequenceProposal,
  metadata.sequenceProposalRequest, useAiChat.ts:399-400/438-439 spread sites,
  SequencesPage.tsx:77's conditional spreads) uses CONDITIONAL SPREAD — key ABSENT, never
  undefined (eOPT on backend). Expectations JSONs use absent keys, never null.
- B9 YAML-reload trap: surfaces.yaml / agent-action.schema.yaml / capabilities.yaml are YAML;
  tsx --watch does NOT reload them. If any fix-run or provisioning lands a YAML change, the
  live drive MUST run after an orch stack restart and the report names the restart.
- B10 execute-vs-propose confusion: layer (a) POSTing /sequences/actions (route :33) writes
  analysis-runs/endpoints into the data repo and breaks the invariant (digest-proof will
  show it); conversely, a "write-free probe" that then claims analysis-runs were produced
  is a false claim — artifact production is asserted ONLY on the execute drive (§2, OQ5).

## Worker contract

- Branch: cl/lane2-l2suiteb-l2t<tick> OFF THE CURRENT cl/integration-2 TIP AT DISPATCH
  (post SUITE-A merge; NOT 1875d068 if the tip moved).
- Worktree: /mnt/vast/home/brad/git/cl-integration-2/wt/L2-SUITE-B-lane2-l2t<tick>.
- Deliverable: /home/brad/.hermes/cl/lanes/2/deliverables/L2-SUITE-B-report.l2t<tick>.md —
  write even if partial; end with a STATUS: line. Sections: files changed;
  first-targeted-check output; environment-branch determination (discovery evidence,
  which branch the run exercised); per-turn verdict table (layer (a)); corpus sha256 pair +
  strip/join rule (B1); parity-pin tail; write-free digest proof; ref-membership evidence
  per proposal (B2); hold-evidence lines (B5); tsc baselines both dumps; fix-run ledger;
  OQ3/OQ4 dispositions taken; assumptions block.
- `git -c core.fileMode=false` everywhere. Lane stack :3093/:5193; YAML changes and stack
  restarts are ORCH-owned (B9). Never :5174/:3001. Browser acceptance + live --all execute
  replay are orch-owned post-merge (SUITE-A OQ3 ruling convention); coder ships harness +
  scripted/write-free legs green + development screenshots only.

## Open questions for the orchestrator (rule before dispatch)

- OQ1 (provisioning authority + timing — branch (a) owner): smallest path is a LOCAL mafft
  install on this host (Arch: pacman/AUR `mafft`; BLAST+ likewise) then
  `discover_endpoints` -> `configure_endpoint` writing the sequence-endpoint record via the
  product path (SequenceService.ts:129-135) — coder must not install packages or write
  endpoint records (§out-of-scope). Alternative: container image pinned by digest +
  deployEndpoint (sequenceRuntime.ts:184-187; /usr/bin/docker present) — needs an approved
  digest. RECOMMEND: orch installs mafft locally pre-dispatch (blastn can lag — turn 10's
  hold assertion is branch-(b)-honest meanwhile), then orchestrates the endpoint configure
  and a stack-visible restart check. Checked: which mafft/blastn (absent), docker present,
  discoverEndpoints PATH-scan semantics (:170-179), zero sequence-endpoint records in the
  data repo (grep 0 hits).
- OQ2 (the "16S" fixture): the 24 library records are 16S-rRNA primers/probes (21-26 nt,
  labels like Ashahii_1718F) — NOTHING is literally labeled 16S, and a mafft alignment of
  21-26 nt primers is thin-but-real. Options: (i) accept the primer family as "the 16S
  sequences" (the labels ARE 16S-position primer names — the reviewer's judgment call, cards
  are honest too); (ii) orch seeds ~4-6 real 1.5 kb 16S records (TEST DATA, via the product
  save_sequence path) before the execute replay. RECOMMEND (i) for layer (a), (ii) for the
  execute replay if the alignment readout looks vacuous. Checked: all 24 labels + lengths
  enumerated above.
- OQ3 (reverse-complement affordance gap — architect routing, per the task's own instruction
  "check the compile path supports it or route the gap to architect"): VERIFIED the schema
  has NO revcomp/transform operation and NO orientation parameter on run_mafft/run_blastn
  (schema grep results above); the AI's only current-schema expression is
  save_sequence(AI-computed revcomp residues) + run_blastn x2, with correctness of the
  model-computed complement itself unverified (never-guess says do not let the suite
  "correct" it — blastn's own minus-strand reporting could cross-check). RULING NEEDED:
  (a) accept save_sequence+run_blastn x2 as the honest expression of the prompt, or (b)
  declare a capability gap (new schema op or blastn strand parameter as DATA) as a new
  block — branch (b) makes P10 an honest named wall pending that block. Checked: schema
  operation enum complete; sequenceEngine.ts revcomp is builtin-engine-only; no
  prompts/ai-side revcomp affordance grepped in server/src/ai + server/prompts.
- OQ4 (comparison readout): no side-by-side artifact comparison view exists
  (SequenceResults.tsx renders one manifest). Is "readable comparison the scientist can
  judge" satisfied by the Analysis-tab tables across the two runs + chat comparative prose,
  or is a dedicated comparison view a new block (recommend: accept the two-tables+prose
  readout as the standing-suite definition; route any view work as a separate item)?
  Checked: SequenceResults.tsx read in full (13 lines).
- OQ5 (gate split for the "produces analysis-runs" clause): verified-by's analysis-run
  clause inherently writes (SequenceService.ts:137-159), so it cannot live in the write-free
  layer (a) nor in coder-run vitest-without-side-effects; recommend the clause is
  ORCH-owned post-merge execute replay (browser Accept-and-apply or scripted
  /sequences/actions against the lane data repo — TEST DATA), mirroring SUITE-A OQ3's
  live-drive-is-orch ruling; the coder's trunk gate is the proposal-side stream leg +
  validate route (:32) + parity pin. Checked: routes.ts :32/:33 semantics opened;
  SequenceResults render path confirmed client-side from manifest.

STATUS: complete

## ORCH DISPATCH ADDENDUM (2026-10-27T02:45 EDT, orch l2t0230) — PROMOTION + DISPATCH FACTS

Promoted from specs-draft/2026-10-26_L2-SUITE-B-prompt-sequence-leg-DRAFT.l2t0511.md
(composer draft, OQ3 RULED (c) per decisions/SUITE-B-revcomp-affordance-l2t0650.md).

1. OQ1 RESOLVED — provisioning is DONE, by orch, pre-dispatch (orch action, out of coder
   scope per this spec's own OUT-OF-SCOPE clause). Branch (a) is the live world on lane 2:
   - POST /api/sequences/actions configure_endpoint x2 against :3093 (x-user-id: USR-BRAD),
     mafft: {recordId:"SEQEND-mafft-lane2", ready:true, versionOutput:"v7.526 (2024/Apr/26)"}
     blastn: {recordId:"SEQEND-blastn-lane2", ready:true, versionOutput:"blastn: 2.17.0+"}
   - Executable pins verified against the live sha256sums this tick:
     mafft 9e6a14d9...f8da (/home/brad/.local/bin/mafft),
     blastn 33b64bc6...98b5, makeblastdb c1ffdcf6...8fce.
   - Read-back via GET /api/sequences/catalog confirms BOTH sequence-endpoint records.
   - Closes AS-L2T0755-MAFFT-USERPROVISION + AS-L2T0055-BLASTN-PROVISION evidence debts
     (endpoint-record leg done).
   - Therefore: the harness branch fires branch (a); the honest-wall branch (b) code path
     must STILL exist and be tested (classifier fixtures keep the named-wall case), but
     trunk acceptance evidence is the branch-(a) drive. Coder MUST NOT attempt any
     provisioning (it is done) and MUST NOT create fake endpoints (B3 stands).

2. LANE DATA-REPO FACT (harness env): the lane-2 backend (:3093) persists under
   CL_DATA_DIR=/home/brad/.computable-lab-lane2 -> the write-free digest target is
   /home/brad/.computable-lab-lane2/worktrees/main, NOT the default in run-suite-a.py
   (CL_DATA_REPO defaults to /home/brad/.computable-lab/worktrees/main). The sequence-leg
   driver MUST point its digest + any orch execute-replay at the LANE 2 repo
   (CL_DATA_REPO=/home/brad/.computable-lab-lane2/worktrees/main or equivalent flag).
   Records there are TEST DATA (Brad ruling).

3. Sequences corpus on the lane data repo (verified this tick via catalog): 3 sequence
   records — labels "pUC19 probe", "Gate Seq Alpha", "Gate Seq Beta" (all iupac_dna).
   No label literally says "16S": prompt 9's "all 16S sequences" is a GENUINE ambiguity —
   answerable cards naming which records are treated as the 16S set are an HONEST verdict
   (see classifier); the coder must not pin the verdict to a guessed record set.

4. SUITE-A harness layout at merge (harness/l2-suite-a/: run-suite-a.py, lib/,
   expectations/, test-channel-selfcheck.py, test-honest-cli.sh): the sequence leg EXTENDS
   run-suite-a.py per §1 of this spec; plate-leg files byte-stable.

5. OQ4/OQ5: orch adopts the composer RECOMMENDs as written (two-tables+prose readout;
   execute-replay clause orch-owned). OQ3 ruled (c): P10 asserts the TWO-PROPOSAL
   structural expression (save_sequence AI-revcomp + run_blastn x2), never model-complement
   correctness; the disposition note rides the receipt.
