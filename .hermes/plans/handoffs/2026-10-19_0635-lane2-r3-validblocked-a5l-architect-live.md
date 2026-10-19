# LANE 2 HANDOFF — l2t0555b (2026-10-19T06:3x EDT) — r3 GATE VALID-BLOCKED -> ARCHITECT W28-A5L DISPATCHED (UI-vs-headless fold divergence)

(Supersedes the earlier same-tick note 2026-10-19_0610 for the W28-A5D-R3 half; that note's
QUAL-1 prep facts stand.)

Trunk: cl/integration-2 @ e4f98475 (docs tip; code tip 55d6d6bb). Stack :3093/:5193 200.
Fleet coder lock FREE. No coder dispatched this tick (see routing).

## GATE r3 RESULT (validated before acting)

Tier-2 gate (bash 1543470) exited code=0 ~06:20 with VERDICT: BLOCKED. VALIDATION FIRST-HAND:
receipts/W28-A5D-R3/2026-10-19_0540/ has REPORT.md + trail.json + 3 supplement trails +
shots/ 10 PNGs with ZERO duplicate md5; the named residual-set strings ARE present in
trail-run2-supplement (bead beating duration x6, microcentrifuge x7) and trail-run3-supplement2
(lysis duration/cycles x2); 'No labware resolved' + acceptDisabled present in canonical trail.
This is NOT an r2/r8 zero-evidence class — it is a real BLOCKED with the named set.

Verdict shape: rule A (surface assertion) PASSED. Question/answer/compile legs PASSED.
Accept leg UNREACHABLE: every UI compile leaves residual facts that DRIFT/GROW across answers
(canonical 1->2->2->1 moving labels; supplement2 1->6), never empty -> pl-accept disabled,
zero ghosted events, no LPR. Named stable set (>=2 byte-identical consecutive draws):
{microcentrifuge tube /l DUPLICATED, lysis reagent /m, bead beating duration /m MINT-ONLY,
sample /m, lysis duration /m, lysis cycles /m, variant facts /m}. Answered axis fact reappears
(cyc3 /m:Lyse (variant b)) — U5 binding-stability class. Secondary: F1 duplicate /l card,
F2 sample on /m (NOT /l — SAMPLE-CARD-1 browser obligation stays OPEN), F3 `Accept &amp; Save`
over-escape.

## THE DIVERGENCE (why architect, not coder)

Headless probe r4 on the SAME trunk 55d6d6bb + SAME profile = 5/5 completing draws, ZERO
survivors (logs/step0-probe-a5d-r4-l2t0510.log). The A5j fold demonstrably works headless and
NOT in the UI channel at the identical revision. Orch first-hand pre-check of the divergence
surface: normalizeScientistIntent.ts :26-36 consumes foldDeclaredOptionalAbsentHedges;
IntentCompileFromPromptHandlers.ts :148/:425 composeAnsweredPrompt rebuilds the prompt per
answer-set — the hypotheses (request shape / answer re-hydration / fold bypass / stochasticity)
are adjudicated by the architect packet.

DISPATCHED: architect (hermes -p architect, wrapper pid 1642250, log
logs/architect-W28A5l-l2t0625.log). Decision path
decisions/W28-A5l-ui-residual-set-fold-divergence-decision.md, terminator 'W28-A5l DECIDED'.
Packet prompts/architect-W28-A5l-l2t0625.txt (receipts + probe evidence, prior-decision list,
H1-H4, explicit no-code/no-scope-invention rules). Task block now status: blocked with full
structured blocker fields + blocker_watch_paths on the decision file (on-change).

## NEXT TICK (priority order)

1. W28-A5l: watch the decision file; at 'W28-A5l DECIDED': if fix-surface named -> claim +
   dispatch cl-coder on the fleet lock with the ruling verbatim + defect list w/ absolute
   screenshot paths; after merge + step0 probe + containment -> A5 re-shoot r4 (tier ladder
   resets at tier 1; receipts dir fresh). If architect names a new scope -> Brad.
2. W211-QUAL-1 CLAIM + DISPATCH: backend must be idle >=3 min (architect is read-only — it
   does NOT load :3093; only a live A5 gate would). Fill placeholders in
   tmp-orch/qual1-exec-prompt-l2t0555.txt (+ append the then-current tip sha to the containment
   pin), claim under queue lock, dispatch executor. Smoke P1 first: expect 422; 200/500 = STOP.
   If W28-A5l lands a resolution-mechanism fix BEFORE the cohort, the cohort must run at the
   post-fix tip (requalification trigger 2 is inherent — the pin captures the sha anyway).
3. PROTO-AI-13 recount each tick (318/500 flat 11th, last ts 2026-10-19T00:29:49Z).
4. SAMPLE-CARD-1 browser obligation rides F2 (open); MACH-1 browser obligation likewise (its
   gate leg was never rendered in an accepted run — carry until an accepted A5-adjacent run
   covers it or a dedicated gate runs).

## Blockers / open obligations
- W28-A5D-R3: BLOCKED on architect W28-A5l (structured fields in task block; on-change watch).
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY — carried.
- Residual Brad item (unchanged): OR-profile forced-tool 400
  decisions/PROTO-AI-9-or-reasoning-amendment.md.
- D3/D5 fold-hardening + channel-alive permanent pin + argumentPresent duplicate: next
  fold-decision packet must cite them — W28-A5l packet cites the A5j lineage; ADD these to
  the coder fix dispatch when the ruling lands.

## assumptions:
- No new consequential assumptions this tick. The architect ruling is pending — no placeholder
  semantics were supplied for it (that would be inventing a domain contract: it is a blocker,
  not an assumption).
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY only (carried).
- Carried ledger unchanged (see 2026-10-19_0610 + lanes/2/assumptions.md).

## live-worker checkpoint at exit
- Architect W28-A5l: wrapper pid 1642250, started ~06:27, log
  logs/architect-W28A5l-l2t0625.log; expected 30-45 min; 2x ~07:15, 3x ~08:00 (rule 7b: at 3x,
  orch writes the ruling PROVISIONAL from the evidence pack and flags it for architect
  ratification). Do NOT re-dispatch while alive.
- No coder live; fleet lock FREE. Gate r3 process EXITED (adopted).
