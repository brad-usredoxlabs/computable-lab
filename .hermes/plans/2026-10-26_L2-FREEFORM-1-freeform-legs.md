# L2-FREEFORM-1 — Free-form prompt legs: no silent success-with-zero-events arms outside the honest wall (RCA-folded)

CAMPAIGN: universal-chat (Brad-approved 2026-10-26 "approved as is!"). Binding decisions
UC-D1 (universal chat is the product; AiTabPanel NOT restored), UC-D2 (the ten prompts are a
standing acceptance suite), UC-D3 (plate/sequence split), UC-D4 (vocabulary integrity).
Gate doctrine: every leg ships a deterministic headless probe; ANY turn landing
success + zero mountable events + zero cards + no honest wall = FAIL (REVISE-GHOST-1 rule).

GOAL (one sentence): close every enumerated silent-success arm (H1–H5) so that every free-form
draft turn — the shapes the canonical seeded flow never exercised — lands exactly one of the
three honest outcomes: events>0 that actually bind, cards>0, or an honest failure that names
itself.

## HARD PRECONDITION (non-colliding dispatch)
DISPATCH ONLY AFTER **L2-CHAT-1 HAS MERGED into cl/integration-2 and the lane stack has been
restarted**. This spec is written against trunk dac9f515 for composition-time cite
verification, but the coder branches off the CURRENT trunk tip at dispatch (which will include
CHAT-1's port: the honest-wall extraction, universal-path ghost mount, accept wiring).
L2-FREEFORM-1 deps = [L2-CHAT-1] per the task list. Do NOT dispatch while either live
dac9f515-era coder (L2-TERM-1 slot-0, L2-CHAT-1 slot-1) is alive or unmerged.
H1/H2/H3 DUAL-COVERAGE RULE (task text, verbatim intent): the fixes must land in the
UNIVERSAL chat path (CHAT-1's port) AND the legacy AiTabPanel until AiTabPanel retires —
the wall/ghost logic currently exists in AiTabPanel only. Where the fix is server-side
(H1 bind, H2 server leg, H4, H5 server guard) a single server change covers both panes;
where it is client-side, both panes must render the refusal/wall (see §Boundary).

## Cite verification (all re-verified first-hand by the composer at dac9f515; drift from
## the b7a3dd8c-era task cites is called out per leg)
Source is unmoved between b7a3dd8c and dac9f515 (two docs commits); line numbers below are
the CURRENT truth and supersede the task's cites where they differ.

- server/src/ai/shorthandChat.ts:199 — `bindShorthandEventsToDeck(events, deck, resolved?)`
  (3rd arg added by REVISE-GHOST-1 fix3). Fail-open core: `bindRef` at **:244-252** —
  deck-name map built at :216-229 (duplicate name => `ambiguous` flag :226), resolved-offer
  map at :230-243; a miss or an ambiguous hit returns `undefined` (:249-251) and the event is
  returned UNCHANGED with its raw scientist-label `labwareId` (:253-261) — zero refusal, zero
  signal. Task cite ":245-250 / :215-222" verified as this same region.
  Exact-match-only is structural: `name.trim().toLowerCase()` (:223) vs `ref.trim().toLowerCase()`
  (:247) — "the plate" can never hit unless a deck labware is literally named "the plate".
  Chat-path call site with the resolved offers: `shorthandResultFromCompile` **:1266-1277**
  (resolved 3rd arg at :1276).
- server/src/api/handlers/IntentCompileHandlers.ts **:148** — VERIFIED:
  `bindShorthandEventsToDeck(result.terminalArtifacts.events, deck)` — NO third `resolved`
  argument (grep `resolvedLabwares` in the file = 0 hits). Store-resolved labware therefore
  ghost-empties on the /intent/compile round-trip leg.
- app/src/event-editor/right-pane/ai/draftEmptiness.ts **:40-51** — `draftProducedNothing`:
  the ONE client predicate (server's 7 canonical channels + equipmentRequirements). Note
  `events` is the FIRST term (:42): an H1 event-bearing-but-unbound result is NOT "nothing",
  so the wall cannot fire — this is why H1 has no wall coverage.
- app/src/event-editor/right-pane/ai/AiTabPanel.tsx — honest wall arm **:551-563**
  (`result.success === true && draftProducedNothing(result)` -> `setHonestWall`),
  state :379, render :1432-1438 (`data-testid="ai-tab-honest-wall"`).
  `hasPreview` + discard at **:631-633** (VERIFIED: `if (!hasPreview) return` — the `skips`
  array from `buildPreviewFromDraft` at :617 rides onto the preview ONLY at :656, which is
  never reached when hasPreview is false — the named skip reasons are DISCARDED).
  Recompile leg **:746-757** (VERIFIED: the `buildPreviewFromDraft` call passes
  `labwareAdditions: [], labwareRequirements: [], equipmentRequirements: [], recordCreations: []`
  and OMITS `resolvedLabwares` entirely — H2 client drop, confirmed).
- app/src/event-editor/right-pane/ai/draftPreview.ts — placement skips: deck-not-loaded
  :338-341, locked run-deck scope :343-346 (`scopeAllowsPreviewPlacement`),
  `validatePlacement` refusal :348-352 (task cite :345-370 = this region + equipment loop).
- server/src/ai/shorthandChat.ts needs-clarification re-ask **:1248-1258** (VERIFIED:
  `events: []` + `clarificationRequests` re-emitted every turn; task cite :1246-1257 = here).
- server/src/ai/AgentOrchestrator.ts —
  loop detector **:3918-3925** (`detectClarificationLoop` fires ONLY on an identical repeat,
  `parsed.error = clarificationLoopMessage(...)`; task cite :3917-3929 = here; helpers in
  server/src/ai/clarificationLoop.ts:64/:87);
  7-channel empty guard **:4064-4078** (VERIFIED: `const emptyResult = ...`, lives INSIDE the
  draft-tool arm only);
  shorthand return **:2676-2687** (`shorthandResultFromCompile(...)` then `return shResult` —
  VERIFIED it returns BEFORE :4064, i.e. NO emptiness guard exists on any shorthand return;
  task cite 2680-2695 = here);
  doc-discussion leg: `isDocDiscussionTurn` gates tool defs at :1920-1924, prose-only result
  at **:2460-2462** (`{ success: true, clarificationNeeded: <prose>, events: [] }` — VERIFIED
  the wall false-fires on this shape: `draftProducedNothing` counts
  `clarificationRequests`, NOT `clarificationNeeded`, so :551 walls a legitimate prose answer);
  assurance CONFIRM empty-bypass **:1763-1789** (VERIFIED: `shouldConfirm` holds `events`
  absent; with empty blockers AND empty gaps the result is success:true with zero deliverable
  channels AND zero requests, returned via the chatbot-compile bypass (:1757) that never
  passes the :4064 guard — server-unguarded, task cite 1763-1782 = here);
  `conversationKey = deriveContextCacheKey(surface, context)` :1288; deck labwares read from
  `context?.labwares` :1298 (the probe injection point).
- SH-QA-3 mint gate: config/drafting/shorthand-drafting.yaml `nounShape.mintRefusePatterns`
  :35+, consumed by server/src/compiler/resolution/nounShape.ts (:133 `canMint`-shaped check)
  — DATA, per-call load, never process-cached.
- Lane stack live: GET :3093/api/health -> 200 at composition time (probes can run now).

## Scope

IN SCOPE (server-first):
- server/src/ai/shorthandChat.ts — H1 bind-refusal signal, H4 repeat-escalation, plus the
  returned-result emptiness contract.
- server/src/ai/AgentOrchestrator.ts — smallest-touch: route the shorthand return (:2676-2687)
  and the assurance-CONFIRM bypass (:1763-1789) through the existing empty-result discipline;
  doc-discussion arm honesty for H5.
- server/src/api/handlers/IntentCompileHandlers.ts (+ IntentCompileHandlers.roundTrip.test.ts)
  — H2 server leg: pass the resolved offers as the third argument.
- NEW server probe tests (the committed gates): server/src/ai/freeformLegs/H1..H5 probes, or
  one file server/src/ai/AgentOrchestrator.freeformLegs.test.ts with describe-per-leg — coder's
  choice, name it in the report. Plus an exported, reusable
  `assertHonestOutcome(result)` helper (events>0 OR cards>0 OR honest failure — never none)
  that L2-SUITE-A's harness imports (suite-hook, see acceptance).
- app client legs ONLY after CHAT-1 merge, in CHAT-1's post-merge layout: the H2 recompile
  call site (AiTabPanel.tsx :746-757, or wherever CHAT-1's extraction moved it) and — only if
  OQ1 rules client-side card render needed — the universal pane's error/card rendering REUSES
  CHAT-1's extracted honesty module.

OUT OF SCOPE (do not touch):
- app/src/shared/taptab/slashMenu/resolvers.ts + badge vocabulary — L2-TERM-1's surface.
- app/src/agent/ (HarnessChatPane, ChatLog, useSurfaceChat), RunWorkspacePage.tsx,
  RightPane.tsx, the useAiChat.ts done-handler/accept-wiring ZONE — L2-CHAT-1's surfaces;
  FREEFORM reuses what CHAT-1 merged, never re-wires it.
- The ten-prompt harness scripts + browser receipts — L2-SUITE-A owns those (this task gets
  NO separate vision drive, per the task's verified-by).
- config/drafting/shorthand-drafting.yaml `surfaces:` membership — surface membership is
  DATA and CHAT-1's spec says propose-in-report, implement only with proof; a FREEFORM
  surface add needs its own ruling (OQ4).
- The records data repo (/home/brad/.computable-lab/worktrees/main): probes are WRITE-FREE;
  main-stack :5174/:3001 never touched.
- No second forced tool, no free-prose drafting path, no AiTabPanel restoration (UC-D1).

## Acceptance criteria (VERBATIM from task list, "verified by")
  Per-leg headless probe committed green on trunk; the ten-prompt suite's plate leg
  (L2-SUITE-A) cannot pass unless every turn it drives lands one of the three honest
  outcomes. Browser receipt only via L2-SUITE-A (no separate vision drive).

## Orchestrator-verifiable acceptance block
1. PER-LEG PROBE GREEN ON TRUNK — after merge, on the merged tip, cwd=server:
   npx vitest run src/ai/AgentOrchestrator.freeformLegs.test.ts (or the per-leg file names
   the report lists) -> all PASS. Each leg probe asserts the honest-outcome trichotomy on a
   REAL shipped shape (see per-leg designs), zero model calls where the fold/compile is
   deterministic (usage.turns=0 leg where applicable, ANSWER-FOLD discipline).
2. SUITE-HOOK FOR L2-SUITE-A — the committed helper exists and is importable:
   `assertHonestOutcome(result)` returning a discriminated verdict
   ("events-bound" | "cards" | "honest-failure"), FAILING (throwing with the delivered-
   channel dump) on none. SUITE-A's harness consumes it; do not let SUITE-A re-implement it.
   Test: a probe-internal unit test that feeds it (a) events-bearing result, (b) cards result,
   (c) error result — pass; (d) success:true + empty everything — throws; (e) H1's shipped
   shape (events>0 with an UNBOUND raw-label labwareId and no cards/error) — throws
   ("events-bound" requires every event's labwareId ∈ deck ids ∪ resolved record ids).
3. SERVER TESTS — cwd=server:
   npx vitest run src/ai/shorthandChat.labwareIdBinding.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts src/ai/AgentOrchestrator.shorthandChat.test.ts src/api/handlers/IntentCompileHandlers.roundTrip.test.ts
   -> the roundTrip leg GAINS the resolved-offer assertion (currently 0 mentions); the
   shorthandDeckBinding fail-open pins are DELIBERATE golden updates (see bait B4). Full
   sweep `npx vitest run` cwd=server: failing-FILE set must be set-identical to the
   pre-work baseline captured at branch start (sorted set-diff empty), zero new failures.
4. TSC BASELINE DISCIPLINE — `npm run typecheck -w server` from repo root: sorted error-line
   diff vs the branch-start baseline = ZERO NEW lines (report must include both dumps). If a
   client leg was touched: same discipline for the app workspace (`npm run typecheck -w app`),
   compared against the post-CHAT-1-merge tip baseline, not the dac9f515 one.
5. WRITE-FREE PROOF — every probe asserts the data repo untouched: probe records the sha of
   every record it references before/after (or asserts zero store write-call invocations via
   the spy precedent, ANSWER-FOLD "spies on store/repo prove ZERO mutation calls").

## First targeted check (the ONE command that proves the approach early)
cwd=/mnt/vast/home/brad/git/cl-integration-2/server:
  npx vitest run src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts
Expected BEFORE any edit: all PASS — these tests pin TODAY's fail-open contract (ambiguous
deck name and unknown ref return the event UNCHANGED, :240's duplicate-name case). The coder's
first act is flipping exactly those pins to the new fail-loud expectation and watching them go
RED. If they do not go RED, you are not exercising the right seam. This single file is H1's
entire contract surface; write the refusal shape before touching the orchestrator.

## The probe idiom (all legs)
Established lane-2 idiom = /home/brad/.hermes/cl/lanes/2/precheck-assist-turn.py: POST the
EXACT request shape the UI builds to the shipped endpoint on :3093
(/api/ai/assist/stream), parse the SSE frame trail, classify every `done` result by the
trichotomy. The committed per-leg gates are the VITEST form of the same drive — the shipped
handler + real AgentOrchestrator in-process with a scripted inference client (precedent:
AgentOrchestrator.shorthandChat.test.ts), so they are deterministic and trunk-runnable with
zero model spend. The live :3093 SSE drive (python, write-free, mirroring precheck-assist-
turn.py byte-for-byte in framing) is run once per leg by the ORCH post-merge as the
live-confirmation replay (ANSWER-FOLD precedent) — the coder commits the script under
.hermes/plans/ (probe-freeform-live-<item>.py) but the vitest file is the gate.
Multi-turn legs (H4): `conversationKey = deriveContextCacheKey(surface, context)`
(AgentOrchestrator.ts:1288) — the probe MUST send byte-identical `surface` + `context` across
turns or the held shorthand intent (:2674 `holdShorthandIntent`) silently misses and the leg
vacuously passes. Deck injection: `context.labwares` (:1298) is read verbatim into the bind
pass — the probe feeds deck labware summaries there; this is what makes H1/H2 probe-able
without touching the data repo's deck.

## Per-leg design

### H1 — unbound raw scientist-label events (PRIMARY; client+server; NO wall covers it)
ROOT CAUSE (verified): bindShorthandEventsToDeck fail-opens — shorthandChat.ts bindRef
:244-252 returns undefined on ambiguous (dup deck names, map :225-227) or unmatched
("the plate", exact trim+lowercase only :223/:247) refs; the event rides through with its raw
label (:253-261). events>0 makes draftProducedNothing false (draftEmptiness.ts:42),
previewEvents>0 satisfies hasPreview (AiTabPanel.tsx:631-633) — happy "N events" panel over
an empty plate, zero placements bucket. No wall anywhere sees it.
NEW BEHAVIOR (the correct behavior per the task): ambiguous or unmatched binding must REFUSE
LOUDLY — a card (pick the deck item) or an honest failure naming the label — never silently
un-ghost. Placement: SERVER TS in the bind pass (bindShorthandEventsToDeck returns the
bound events PLUS a structured `unboundRefs` report — new export, no vocabulary involved:
ambiguity/miss is STRUCTURE, not lexicon; see bait B3). The refusal channel is decided by
OQ1 (recommendation: per-event granularity — if ANY event binds cleanly, keep those and emit
a clarificationRequest naming the unbound label + the candidate deck items; if NOTHING binds,
return the honest-failure error via the existing emptyDraftMessage family,
draftArgDiagnostics.ts:118, so the client's error arm and CHAT-1's honest wall both fire).
Dual coverage note: server-side fix covers both panes automatically; the CARD/ECHO rendering
in the universal pane is CHAT-1's merged machinery — reuse, do not re-render.
RED TEST SHAPE (vitest, unit arm mirroring shorthandDeckBinding.test.ts:197-240):
  - deck = [plateA "Plate One", plateB "Plate One"] (duplicate name); event labwareId
    "Plate One" -> MUST refuse: no event survives with labwareId==="Plate One", and the
    result carries cards>0 or error (assertHonestOutcome). TODAY: event returned unchanged
    (that's the :240 pin you flip).
  - deck = [plateA]; event labwareId "the plate" -> unmatched -> same refusal shape.
  - deck ids present as refs -> untouched (existing pin stays green).
  - resolved-offer hit -> binds (fix3 pins stay green).
  - mixed: 2 events, one binds, one ambiguous -> bound event survives, unbound one is
    reported, cards>0. (Granularity per OQ1.)
HONEST-OUTCOME ASSERTION: no result shape { success:true, events>0, cards==0, no error }
where any event's labwareId ∉ (deck ids ∪ resolved record ids). That exact shape is the
shipped defect; the probe asserts it CANNOT exit the server.

### H2 — recompile/resolved-offer drop (client + server)
ROOT CAUSE (verified): (server) IntentCompileHandlers.ts:148 omits the third `resolved`
argument — store-resolved labware ghost-empties after any shorthand edit on the
/intent/compile round-trip. (client) AiTabPanel.tsx:746-757 recompile call omits
`resolvedLabwares` and passes empty labwareAdditions/requirements/creations, so a recompiled
draft mounts events with zero ghost placements (the exact fix3 Defect-1 shape the main
done-handler already fixed at :608/:623).
FIX: server — pass `result.terminalArtifacts.resolvedLabwares` as the third argument (the
type already exists, shorthandChat.ts:193); client — thread `resolvedLabwares` through the
recompile call exactly as :617-630 threads it (conditional-spread / eOPT discipline; empty
arrays only where they are genuinely the recompile's contract).
RED TEST SHAPE: IntentCompileHandlers.roundTrip.test.ts gains the byte-compare leg the file
header (:29) already promises but never asserts — a compile whose compile-side binding used
a resolved offer produces client-side events whose labwareId EQUALS the record id (reuse
bindShorthandEventsToDeck, never re-implement). App-side (post-CHAT-1): a recompile-unit test
feeding a result with resolvedLabwares and asserting buildPreviewFromDraft receives them
(mirror draftPreview.resolved.test.ts).
HONEST-OUTCOME: round-trip probe (H2): compile with deck+resolved offers -> probe classifies
the response: events>0 requires every labwareId bound; else the clarifications channel rides
verbatim (SH-QB-1 :150-157 already guarantees reasons; assert it).

### H3 — wall-suppressed skip discards
ROOT CAUSE (verified): all placements skipped by locked run-deck scope (draftPreview.ts
:343-346) or validatePlacement (:348-352) or deck-not-loaded (:338-341) while a deliverable-
only channel (equipmentRequirements etc.) suppresses the wall; then
`if (!hasPreview) return` (AiTabPanel.tsx:631-633) DISCARDS the named skip reasons — the
skips only ride :656's setPreview, never reached.
NEW BEHAVIOR: skips are deliverable information. When hasPreview is false but skips>0, the
turn must surface them — client leg: render the skips as the honest failure text (reuse
CHAT-1's extracted wall/honesty module — §Boundary, never a second wall), not a silent
return. No server change needed if the skips are genuinely client-computed (they are —
draftPreview is client).
RED TEST SHAPE: AiTabPanel.ghostRemount-style test: preview with zero placements + skips
["Plate One: outside locked deck scope"] + an equipmentRequirements deliverable -> the honest
wall text (data-testid ai-tab-honest-wall or CHAT-1's universal equivalent) NAMES the skip
reason; today the arm at :633 returns and the wall is suppressed -> RED.
HONEST-OUTCOME: cards>0 OR wall-naming-skips; never preview-empty-silence beside a polished
deliverable card.

### H4 — unresolvable-noun card loop (server)
ROOT CAUSE (verified): shorthandChat.ts:1248-1258 re-emits identical clarificationRequests
every turn on workspace.deck; detectClarificationLoop (AgentOrchestrator.ts:3918-3925)
escalates ONLY on an IDENTICAL repeat; SH-QA-3 mintRefusePatterns
(shorthand-drafting.yaml:35, nounShape.ts:133) can refuse the mint affordance, leaving a
card that cannot be answered and is re-asked forever in paraphrase.
NEW BEHAVIOR: the loop detector keys on requestId (factRequestId already exists —
exported, see AgentOrchestrator.shorthandChat.test.ts:29), so a PARAPHRASED re-ask of the
same slot escalates after N repeats without touching the answerable path (the pick still
works — ANSWER-FOLD escapable-loop ruling stands). Escalation = honest failure naming the
unresolvable noun and WHY the mint affordance is closed when mintRefusePatterns refused it
(the refusal "never removes the QUESTION — only the mint affordance" per the YAML header —
so the escalation text must say so).
RED TEST SHAPE: orchestrator leg with scripted inference client: turn1 draft with
unresolvable noun -> cards; turn2 re-send a NON-identical-paraphrase re-ask (same
requestId) -> must escalate (error present), today: identical-only detector misses it ->
cards again, RED. Negative leg (never-guess bait): identical repeat WITH a valid pick
available keeps the existing card+pick path green; mint-refused noun's escalation text names
the shape-refusal reason, asserted against a fixture shape ONLY — no vocabulary strings in
TS (patterns stay in YAML).
HONEST-OUTCOME: turn-k lands cards-answerable, a valid pick, or the escalation — never a
k+1-th silent re-ask.

### H5 — doc-discussion prose leg + assurance CONFIRM empty-bypass (server)
ROOT CAUSE (verified): (a) ANY attached-file turn is docDiscussion (:1920-1924 disables
tools) and returns prose-only `{success:true, clarificationNeeded, events:[]}` (:2460-2462);
the client wall predicate does not count `clarificationNeeded`, so the honest wall
FALSE-FIRES on a legitimate prose answer (AiTabPanel.tsx:551 + draftEmptiness.ts:40-51).
(b) assurance CONFIRM at :1763-1789 with empty blockers + empty gaps returns
success:true, no events, no requests through the chatbot-compile bypass (:1757) that never
reaches the :4064 empty guard — server-silent.
FIX PLACEMENT (the task's policy-vs-TS question): (b) is SERVER-SIDE — the emptiness guard
belongs on the shorthand/compile return sites themselves, not only on the draft-tool arm:
extract the existing 7-channel check (:4064-4071) into ONE server helper and apply it to
the shorthand return (:2676-2687, catching a needs-clarification with ZERO generated
requests, shorthandChat.ts:1254 conditional-spread) and the assurance-CONFIRM arm
(:1777-1789). This is a STRUCTURAL guard (channel emptiness), not vocabulary — TS is correct
here; the client's draftEmptiness stays the pinned SUPERSET (CLIENT ⊇ SERVER, drift pin in
draftEmptiness.ts:15-21 — do not add terms to one side without the drift pin). (a) is an
ARM-ORDER/predicate question — see OQ3: teach the wall to recognize the doc-discussion
deliverable (a prose answer is a deliverable) vs making the server mark it; RECOMMENDATION:
the server marks the doc-discussion result with an explicit deliverable marker channel
(structural field, data-shaped), the client predicate gains ONE term via CHAT-1's extracted
module — never a surface-name branch (repo rule #1).
RED TEST SHAPE: (b) scripted orchestrator leg: assurance decision CONFIRM with empty
blockers/gaps -> result MUST carry error (server-guarded), today success:true empty -> RED.
(a) orchestrator leg: docDiscussion result probe-classified: prose answer +
zero events/cards -> verdict "honest-failure" only if an actual wall would fire client-side;
the committed assertion is the SERVER-side guarantee: a doc-discussion success result is
never indistinguishable from an empty draft at the wire (marker field present; today
absent -> RED).
HONEST-OUTCOME: prose answer delivered (marker), or the wall fires — never "produced
nothing" over a paragraph of answer, never silence over a CONFIRM hold.

## Boundary with L2-CHAT-1's honest wall: REUSE, NEVER DUPLICATE
CHAT-1's spec §scope-3 extracts the wall/REPORTED-failure logic into a shared module both
panes consume ("prefer EXTRACTING ... over duplicating"). L2-FREEFORM-1:
- MUST NOT create a second wall predicate, second wall UI, or second honest-failure string
  family. Import CHAT-1's extracted module (whatever it is named at the post-merge tip —
  read the merged code first; the CHAT-1 spec suggested a shared/ai/chatHonesty.ts style).
- H3's client fix renders through that module. H1/H5's server-side error channel feeds the
  module's existing error arm — both panes, zero new chrome.
- draftEmptiness stays the ONE client predicate (drift pin intact). If a term must change,
  it changes in CHAT-1's module + the drift pin updates in the SAME commit, tests both sides.
- The server-side 7-channel guard extraction (H5) lives in SERVER and must preserve the
  pinned CLIENT ⊇ SERVER relationship: server gains the shorthand-return application, NOT a
  new channel list.
- If CHAT-1 merged WITHOUT the extraction (report says duplicated), do not build on sand:
  file it in the report as an open blocker, work server-side legs only, and let the orch
  route the client legs after a fix.

## Reviewer bait (the likely edge errors for this item — pre-empt them in the report)
- B1 exactOptionalPropertyTypes sites: every new/optional AgentResult channel
  (`unboundRefs`, doc-discussion deliverable marker, clarificationRequests threading) uses
  CONDITIONAL SPREAD (`...(x.length > 0 ? { x } : {})`) — key ABSENT, never undefined.
  Precedent pinned at shorthandChat.ts:1254, :1274, AiTabPanel.tsx:653-664. eOPT is ON for
  backend; tsc gate #4 catches it only if the coder's own tests type the shapes.
- B2 YAML-reload trap: if ANY policy YAML lands (it should not — see B3), tsx --watch does
  NOT reload YAML; the live :3093 replay MUST run after an orch stack restart, and the
  vitest probes load config per-call (nounShape.ts precedent) — a probe that green-washes
  against a stale cached config is worthless; assert the config actually loaded (bad-YAML
  must throw naming the path, nounShape.ts:74 precedent).
- B3 hardcode boundary: the bind refusal is STRUCTURAL (map miss / ambiguity flag) — ZERO
  deck-name or material-name literals anywhere in the new TS. `toLowerCase()` normalization
  already exists; do NOT add fuzzy matching or a "the plate" literal (that is vocabulary in
  TS — instant reject; the nounShape YAML is the ONLY place sentence-shape vocabulary lives,
  and H4's escalation text must be composed from requestId-scoped data, not literals).
  Also: no surface-name literal branches in AgentOrchestrator (repo rule #1;
  shorthand-drafting.yaml header).
- B4 golden-pin flips: AgentOrchestrator.shorthandDeckBinding.test.ts :226-240 pins TODAY's
  fail-open (ambiguous -> unchanged event passes). H1 deliberately flips these. That is a
  DELIBERATE contract change — the report must show old pin, new pin, and WHY; a reviewer
  seeing silently-updated pins here rejects. Likewise the roundTrip header comment (:29)
  already claims a guarantee the file never asserted — the fix makes comment true.
- B5 vacuous multi-turn probes: conversationKey derives from surface+context (:1288); a
  turn-2 probe that mutates context between turns misses the held intent and "passes" by
  never compiling. Assert the arm-log/fold line or the held-intent hit, not just the
  response shape (ANSWER-FOLD arm-log discipline).
- B6 ontology terms: the L2-TERM-1 vocabulary surface (badges, resolver tiers) is NOT this
  item; the H4 escalation card must use EXISTING card vocabulary — if the report shows any
  new badge/term wording, it collided with TERM-1's ruling (UC-D4).
- B7 never-guess: H1's "keep the bound events, card the unbound" granularity must NEVER
  guess a deck item for an ambiguous name (two "Plate One"s stay two candidates in the
  card; sole-candidate auto-binding is out of scope — OQ2). The mint affordance refusal
  never removes the QUESTION (YAML header) — H4 must not close the question either.
- B8 dual-coverage drift: a client leg fixed in AiTabPanel only, or universal only, fails
  the task's NOTE. State per-leg in the report which panes carry the fix and where the
  shared code lives.
- B9 write-free invariant: probes must not Apply; assert zero mutations (acceptance #5). An
  SSE probe that hits an accept/apply route to "prove" the fix has broken the invariant.

## Worker contract
- Branch: cl/lane2-l2freeform1-l2t<tick> OFF THE CURRENT cl/integration-2 TIP AT DISPATCH
  (post-CHAT-1-merge; NOT dac9f515).
- Worktree: /mnt/vast/home/brad/git/cl-integration-2/wt/L2-FREEFORM-1-lane2-l2t<tick>.
- Deliverable: /home/brad/.hermes/cl/lanes/2/deliverables/L2-FREEFORM-1-report.l2t<tick>.md
  — write even if partial; end with a STATUS: line. Sections: files changed, per-leg
  RED->GREEN evidence tails, golden-pin diff (B4), tsc baselines both dumps, failing-file
  set-diff, write-free proof, dual-coverage table (B8), assumptions block.
- git -c core.fileMode=false everywhere; lane stack :3093/:5193, restart is ORCH-owned
  (YAML); never touch :5174/:3001 or Brad's stack.

## Assumptions
- AS-FREEFORM-BASE-POST-CHAT1: trunk at dispatch includes CHAT-1's honest-wall extraction
  and universal-path wiring; all client-leg line numbers are re-derived at dispatch from the
  merged tip (this spec's app cites are dac9f515-era).
- AS-FREEFORM-SOURCE-STABLE: b7a3dd8c -> dac9f515 moved zero source lines (composer verified
  all cites); CHAT-1's merge WILL move app/ cites — server cites (:199, :244-252, :1266-1277,
  :1248-1258, :148, :4064-4078, :2676-2687, :1763-1789, :2460-2462, :3918-3925, :1288, :1298)
  are CHAT-1-untouched zones per its spec (server only "if wire contract genuinely
  requires"), so treat them as stable but re-verify at dispatch.
- AS-FREEFORM-PROBE-VITEST-GATE: the committed vitest probes (real orchestrator, scripted
  inference, zero model spend) are the trunk gate; the python :3093 SSE drive is the
  orch-owned live replay (precheck-assist-turn.py idiom), not the coder's gate.
- AS-FREEFORM-NO-SUITE-BROWSER: no separate vision drive for this item (task's verified-by).

## Open questions for the orchestrator (rule before dispatch)
- OQ1 (H1 refusal granularity/channel): per-event card for unbound refs while keeping
  cleanly-bound events, or whole-draft refusal? Recommendation: per-event cards when ANY
  event binds (scientist keeps progress, ANSWER-FOLD never-guess keeps ambiguous out),
  whole-turn honest failure only when NOTHING binds. Checked: bind is per-event today
  (:253-261), cards channel exists on the same result (:1254), client arms consume both.
- OQ2 (H1 sole-candidate fuzzy): when exactly ONE deck labware exists and the ref is a
  unmatched label ("the plate"), auto-bind or refuse+card? Recommendation: REFUSE (never-
  guess; sole-candidate guessing is a vocabulary-shaped inference; the card is one click).
  Checked: nothing in the current bind or lint-YAML layer expresses candidate scoring; a
  data-driven alias policy is possible but is NEW policy surface needing Brad.
- OQ3 (H5a doc-discussion wall): server marks the prose deliverable (recommended: structural
  marker channel + ONE predicate term in CHAT-1's module + drift pin), or client special-
  cases the docDiscussion turn? Special-casing risks a surface/turn-kind branch in the wall
  (bait B3). Checked: draftEmptiness.ts:15-21 pins CLIENT ⊇ SERVER with
  equipmentRequirements as the ONLY sanctioned superset member — adding a term reopens that
  ruling, hence the ask. Also: does the wall even reach docDiscussion on the universal pane
  post-CHAT-1 (CHAT-1 may already gate it)? Coder re-checks at dispatch; the server marker is
  needed either way for the wire-level distinguishability RED.
- OQ4 (H4 escalation threshold + surface scope): N=1 paraphrase-repeat escalation (looped
  flag flips on second occurrence of a requestId) vs N=2? And does the escalation need the
  shorthand surface only (workspace.deck today, shorthand-drafting.yaml:12) — CHAT-1's
  spec says surface membership edits are propose-in-report; FREEFORM should NOT add
  surfaces. Checked: detectClarificationLoop keys on request text identity today
  (clarificationLoop.ts:64), requestId identity is stable across folds (factRequestId).

DRAFT STATUS: complete

## Orchestrator rulings on OQ1–OQ4 (l2t0135, 2026-10-26 01:50 EDT — binding for coder dispatch)
- OQ1 RULED: per-event granularity. Any cleanly-bound events survive; unbound refs produce
  clarification cards naming the raw label + candidate deck items (never-guess: ambiguous
  candidates stay ALL listed); whole-turn honest failure ONLY when nothing binds.
- OQ2 RULED: REFUSE + card on sole-candidate unmatched labels. No auto-bind, no fuzzy
  matching. Alias policy would be NEW vocabulary policy surface — needs Brad; out of scope.
- OQ3 RULED: server marks the doc-discussion prose deliverable with a structural marker
  channel; client predicate gains ONE term via CHAT-1's extracted module + drift pin updated
  in the SAME commit. No surface/turn-kind branch in the wall.
- OQ4 RULED: escalation keyed on requestId identity, N=1 (looped flag flips on the second
  occurrence of the same requestId, paraphrase or not). No surface-membership change to
  shorthand-drafting.yaml (surface adds are propose-in-report only).
- Cite spot-check by orch at dac9f515: shorthandChat.ts bindRef :244-252,
  IntentCompileHandlers.ts :148 (resolvedLabwares grep = 0), AgentOrchestrator.ts :2676-2687
  early return, :4064+ empty guard inside draft-tool arm, :2460-2462 doc-discussion shape,
  draftEmptiness.ts :40-51 — ALL CONFIRMED first-hand. Draft approved as canonical spec.
