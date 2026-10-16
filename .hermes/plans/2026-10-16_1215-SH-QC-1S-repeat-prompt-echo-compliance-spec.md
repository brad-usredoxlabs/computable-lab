# SH-QC-1S — forced-tool compliance for the shorthand surface: repeat-prompt echo must re-draft or fail honestly

Item: SH-QC-1S (lane 2, server territory: `server/src/ai/*`, `server/config/drafting/*`)
Trunk at spec time: 468dcb9e (SH-QC-1 wiring half merged).
Worktree: /mnt/vast/home/brad/git/wt/SH-QC-1S-lane2-l2t1210
Branch: cl/SH-QC-1S-lane2-l2t1210 (off 468dcb9e; lane-exclude symlinks ALREADY repaired — 63 linked, clean status; do NOT re-run cl-lane-sync into it)
Source of truth: architect decision /home/brad/.hermes/cl/lanes/2/decisions/SHQC1-server-payload-decision-l2t1115.md (D1-D4). Orch independently verified ALL load-bearing cites at trunk 468dcb9e before dispatch (md5 AgentOrchestrator.ts 3d074a5a unchanged since f66eb5b9; every line cite below re-opened by orch).

## The defect (verified, do not re-derive)

Repro (F4 recipe, SH-QC-1 spec): run-chat prompt -> Cancel -> re-prompt the IDENTICAL text
with no clarificationAnswers. Cycle 1 drafts fine (model emits agent_intent toolCall + prose
summary). On the verbatim repeat the serving model PATTERN-COMPLETES: re-emits the 86-char
cycle-1 draft-summary prose (which rides back as raw assistant history) with finish=stop and
ZERO tool calls. Both recovery arms fail:
  - the coerce slow path (AgentOrchestrator.ts:~2105-2129, orch-verified) re-sends the same
    polluted history with buildForcedDraftJsonPrompt — no anti-echo clause — and the model
    echoes again;
  - the bounded one-retry compliance arm EXISTS but is gated `if(surface==='sequences')`
    (:2075, orch-verified; retry at :2084, honest compliance-failure return at :2097-2099) —
    surface workspace.deck never gets it.
The captured return path: :2177 zero-tool gate (:2177 block orch-verified) -> :2194
`finalProse = assistantMsg.content.trim()` -> :2195 `proseRouted = finalProse.length > 0`
(TRUE on the echo; W2-9 g2c DEFECT-2 prose-refusal exemption, orch-verified comment at
:2182-2193) -> returns `{success:false, notes:[finalProse], toolCalls:0}` (:2225-2235,
orch-verified). The notes-echo launders a compliance failure into a sidebar card with no
events; deck stays dead. Live traces: backend.log:1462/:1691 `turn 1 finish=stop
contentLen=86 toolCalls=0` vs healthy :942/:1038/:1134 `toolCalls=1`.

History renders raw into the prompt: `historyTurns = 4` (:1008, orch-verified) and
`...historyMessages.slice(-historyTurns)` (:1154-1162 and the build path at :1725).

## Fix shape (architect D2, two parts, ONE task)

### R1 — Generalize the compliance arm via DATA (repo rule #1: no surface literals in TS)

Replace the `if(surface==='sequences')` gate (:2075) with a DATA-declared per-surface
forced-tool compliance policy, following the existing drafting-YAML precedent
(server/config/drafting/shorthand-drafting.yaml declares `surfaces: [workspace.deck]` —
loaded PER call, never process-cached; presence-checked; review-write-wall.yaml parity).
Suggested placement: a new `forcedToolCompliance:` section in server/config/drafting/
shorthand-drafting.yaml (or a sibling file — coder's choice; a new sibling is cleaner since
sequences is not a shorthand surface). Shape guidance:

  - per-surface entry keyed by surface id, declaring at least: bounded retry count (keep 1)
    and the nudge text (verbatim strings ride in data);
  - sequences: carry the CURRENT nudge text over EXACTLY (it is pinned by HARNESS-SEQ-2
    tests — moving it to data must not reword it; if an existing test asserts the nudge
    inline in TS, re-point the assertion at the data value, wording byte-identical);
  - workspace.deck (shorthand): a nudge that (a) demands the agent_intent emission, (b)
    carries the anti-claim clause from :2093 — "Do not claim to have saved or changed
    anything; no action has executed" — verbatim, that clause is aimed exactly at this echo,
    and (c) names the fresh-request rule: a repeat prompt with no clarification answers is a
    NEW drafting request; answering with your prior summary is not a drafting action;
  - after the bounded retry, the honest compliance-failure return (:2097-2099 shape:
    `{success:false, error:...}` naming the model, the tool and the attempt count,
    "Nothing was saved") — generalized message text, no "sequence" wording on other
    surfaces (make the tool name + surface-neutral phrasing come from the data or generic
    constants, not a per-surface TS branch).
  - ALSO place anti-echo/anti-claim wording INSIDE the coerce slow-path prompt
    (buildForcedDraftJsonPrompt at :~815-829 / call site :2112, orch-verified) so the second
    call stops pattern-completing on the echo. Same data-sourced clause if practical.
  - rename the `sequenceRepairAttempts` counter to a surface-neutral name (:1771).

Absent policy data => NO retry, current pre-fix behavior for unlisted surfaces (silent-off,
disclosed — the drafting-config convention). Present-but-malformed => throw naming the path.

### R2 — Structural echo guard (deterministic, no policy string)

At the prose-routing site (:2194-2195, orch-verified): route `finalProse` to the notes
channel ONLY when it is NOT a normalized-verbatim copy of the immediately preceding
assistant turn in `historyMessages` (whitespace-collapsed comparison against the last
assistant-content). An echo is a compliance failure -> the error channel (:2237+), never
notes. This is a structural equality check, not hardcoded policy. Tradeoff accepted by the
architect: a refusal that word-for-word repeats the prior assistant turn is routed as error —
acceptable, it still never carries a proposal payload.

## RED-FIRST test mandate (architect-mandated; no fix without it)

Server-side vitest, stub-inference deterministic leg FIRST (no live model; mirror the
AgentOrchestrator.shorthandChat.test.ts stub harness):
  1. RED: drive a forced-tool shorthand-surface turn whose history's last assistant message
     is the draft-summary prose, with NO clarificationAnswers; the stub returns prose-only
     finish=stop zero-tool (the echo). Assert TODAY's captured wrong shape first
     (`success:false, notes:[<echo>]`) to pin the defect, then flip to the required shape:
     the retry nudge is issued (bounded, logged) and either (a) the stub's second response
     emits agent_intent and the turn succeeds, or (b) after the exhausted budget the return
     is `{success:false, error:...}` — NEVER `notes:[<echo of prior assistant turn>]`.
  2. R2 leg: prose identical-after-whitespace-collapse to the prior assistant turn -> error
     channel; a GENUINE distinct refusal prose -> still routes to notes (W2-9 DEFECT-2
     behavior must survive — keep its existing test green).
  3. Data-declaration leg: shorthand surface membership + nudge come from the YAML (mutate
     the loaded data in-test or pin that changing data changes the nudge; no TS surface
     literal for 'workspace.deck' compliance gating — test the absence of the literal the
     way the :696 'membership is DATA' test does).
  4. Sequences parity: existing HARNESS-SEQ-2 compliance tests stay green with the nudge
     moved to data (byte-identical wording).
Secondary receipt (orch runs it, NOT the coder): live F4 pair on :3093 after merge —
prompt -> Cancel -> identical re-prompt must produce a fresh proposal (toolCalls>=1) or an
honest error, never the notes-echo.

## Must NOT change (architect D2/D4 — violations are blockers)

- UI Cancel client semantics (client half exonerated, merged 468dcb9e); propose-never-write;
  the single forced tool (agent_intent terminal emission).
- The fold arms (:1253-1328 takeHeld/fold, gated on clarificationAnswers PRESENCE) and the
  re-extraction arm (:1737-1739). INVARIANT (D4): answer-turn iff clarificationAnswers in the
  request payload; no-answers turn = fresh request, always runs extraction/drafting.
- The retry arm must NEVER call takeHeldShorthandIntent or mutate heldIntents; the honest
  compliance-failure return leaves heldIntents byte-for-byte untouched; a legitimate
  needs-clarification hold (:2469) on a retried turn must survive into the answer turn.
- The honesty suite builders; raw-history fidelity contract (AgentOrchestrator.test.ts:58);
  warm/real prefix parity (:1049-1098) — do NOT strip history turns, do NOT change
  deriveContextCacheKey, do NOT add history to any cache key (architect-REJECTED shapes).
- app/ files: NONE (SH-QC-1 owns the client side; it is merged).

## Worktree / toolchain notes (measured, lane 2)

- This worktree already has the 61-63 lane-exclude symlinks repaired and
  core.excludesFile=/home/brad/.hermes/cl/lanes/2/lane-exclude set (worktreeConfig). Status
  is clean. Run tsc only inside THIS worktree; compare sorted error-line SETs, never raw
  counts across worktrees (AS-LANE2-SHQC1-TSC-BASELINE-TRAP: a fresh unrepaired worktree
  reports app tsc 27 vs repaired baseline 23; app baseline measured at d668920f = 23).
- Server tests: `cd server && npx vitest run <file>` (vitest, NOT playwright). Run at least
  AgentOrchestrator.shorthandChat.test.ts, AgentOrchestrator.test.ts (raw-history pin), the
  sequences compliance tests, workstateComposeRules.test.ts (parity :229) and the honesty
  suite. Record exact commands + outputs in the report.
- Do NOT restart or touch the lane stack (:3093/:5193) — it serves trunk 468dcb9e and the
  live-F4 receipt is the orchestrator's post-merge step.

## Deliverables

- Commit code+tests+YAML on branch cl/SH-QC-1S-lane2-l2t1210.
- Report (commit it too): /mnt/vast/home/brad/git/wt/SH-QC-1S-lane2-l2t1210/.hermes/plans/SH-QC-1S-report.wip-l2t1210.md
  — RED outputs (before/after), data file shape, every must-not-change guard with its test
  cite, bars (server test runs, app+server tsc sorted-set compare), assumptions.
- End with marker line `SH-QC-1S DONE <sha>` (or `SHQC1S-BLOCKED <reason> <sha>`) as the
  report's final line. Log file (orch-owned): /home/brad/.hermes/cl/lanes/2/logs/coder-SQC1S-l2t1210.log

## Stop boundaries (state in handoff, do not push through)

1. If honoring the sequences nudge byte-for-byte in data is impossible without rewording (an
   unmovable TS interpolation), STOP and report — do not reword a pinned nudge.
2. If R2 requires touching historyMessages rendering (raw-history fidelity) rather than a
   read-only compare at the routing site, STOP and report.
3. If the fix requires any client/wire-protocol change, STOP and report (out of scope;
   architect D2 assumes server-only).
4. If evidence implicates heldIntents in this path after all, STOP and report (architect
   ruled it disjoint; contradiction is a decision-packet reopen, not a coder fix).
