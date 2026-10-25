# LANE 2 HANDOFF — l2t2235 (2026-10-24T23:10 EDT) — ATTEMPT-9 ADJUDICATED FIX-CLASS (2 real UI defects, first-hand); FIX RUN 3 LIVE on fleet lock; checkpoint

Trunk: 0f62c95f (docs tip; product tip 718fe21d unchanged — nothing merged this tick).
Stack UP: :5193 200, :3093 200 (/health 404 is the known route shape; the tick's
own curl logged it). Proxy unit cl-l2-orproxy-l2t2130 active — DO NOT stop.
Brad's stack untouched all tick.

## ATTEMPT-9 ADJUDICATION (orch first-hand; the reviewer's own narrative overridden)

Gate exited rc=0 ~22:18. No report.md; log narrative claims "VERDICT: BLOCKED —
proxy not applied, NO-PROPOSAL class persists". That claim is DISPROVED first-hand:
backend.log shows the gate's canonical send [agent 999d95] produced the 2-card hold
(clarifications=2), the harness answered card 0 (picked LAB-w211-sample-plate), the
DETERMINISTIC FOLD fired ([agent f2mjyr] "shorthand answer folded deterministically
... no model call", events=3, elapsed 65ms), ChangesPanel mounted with "3 events" +
enabled Accept (screenshots f1-03-draft-ghosts.png; orch vision-checked). The proxy
route WORKS end-to-end through the lane stack. AS-LANE2-INFERENCE-PROVIDER-ROUTE-
VIA-PROXY evidence debt CLOSED.

But the receipts carry NEW first-hand evidence of two REAL UI defects -> fix verdict
with new evidence (rule 7: this is not "same failure, no new evidence"):

- D1 GHOSTS NEVER MOUNT (criterion (2) violation): with the folded 3-event draft
  live, the plate renders ZERO preview nodes (trail ghost-state-pre-revise +
  measure-f1-03-draft-ghosts: slotPreview/wellPreview/dataPreview/ghostTiles/
  ghostRects all 0; previewBar=1 "3 events"). Orch vision-checked
  f1-03-draft-ghosts.png + f1-03b-ghost-plate-element.png: empty plate "Click to
  choose labware" while the Interpretation tab shows the full shorthand YAML.
  Screened recon: DeckSlot.tsx ~174 ghost tile needs previewPlacement &&
  previewLabware from state.preview; buildPreviewFromDraft (AiTabPanel.tsx ~609)
  likely yields previewEvents w/o previewPlacements when the labware answer
  resolved to an EXISTING registry labware.
- D2 REVISE-HOLD STUCK PANE (spec never-stuck-empty rule): the revise send
  [agent q3kibt] returned a HOLD (events=0 clarifications=1 success=true, 66.5s);
  the pane sat INTERPRETING "No operations parsed yet" with cards=0 chatSend=0
  chatInput=0 honestWall=0 no failure line (trail measure-f1-04-revise-remount,
  f2-not-sendable) — F2 leg never sendable. Candidate arm (screened): revise
  strand's `if (!hasPreview) return` (AiTabPanel.tsx ~623) swallowing the
  zero-event hold before any clarifications-needed dispatch.
- OBS: composition card unresolved-c-68d65279c6 offered no reading-option rows
  during answer-round (driver timed out; fold rescued the turn). Separate task
  candidate — noted in fix prompt, scope NOT expanded.

## FIX RUN 3 (LIVE at checkpoint)

Fleet lock acquired 23:01:00 by queue unit cl-l2-rg1-fix3-l2t2235 (flock holder
pid 1104694, wrapper 1104674). Prompt prompts/coder-REVISEGHOST1-fix3-l2t2235.txt
(D1+D2 verbatim defect lists, absolute receipt/screenshot paths, screened recon
flagged as screening, RED-first, app-side, no merge/restart/push, marker
RG1-FIX3 DONE <sha>). SAME worktree wt/REVISE-GHOST-1-lane2-l2t2050 @ d5a7be9d,
branch cl/lane2-revise-ghost-1-l2t2050. Report owed
deliverables/REVISEGHOST1-fix3-report.l2t2235.md. Log
logs/coder-REVISEGHOST1-fix3-l2t2235.log. Expected exit ~00:00-00:45 EDT;
2x-watch ~01:30, 3x rule. Do NOT re-dispatch while alive. Do NOT dispatch a
second coder fleet-wide.

## NEXT TICK (priority order)

1. Fix3 exit? -> advc cycle (scope d5a7be9d...HEAD; unique suffix; cloud
   OpenRouter deepseek-v4.1-flash) -> on ACCEPT: orch self-verify (vitest touched
   suites + app tsc comm-diff vs baseline) -> merge --no-ff into cl/integration-2
   -> stack RESTART via cl-lane-stack.sh 2 (background=true; blocking script) ->
   ATTEMPT-10 browser gate (tier-2 cloud, drive10-attempt10 derived from
   /tmp/rg1/drive10-attempt9.mjs; receipts REVISE-GHOST-1/2026-10-25-attempt10/).
   Gate must assert: ghosts>0 pre-revise, ghosts remount post-revise, F2 sendable
   and hold renders cards-or-honest-line with no Apply-visible. Second fix
   verdict on fix3 scope -> architect with both defect lists.
2. If fix3 STARVED 3h (exit 75 in its log): fleet lock was held longer than
   expected — check `flock -n` holder and other-lane activity before re-queueing.
3. MATRES-REPLAY: unchanged Brad-blocked (MATRES-0 ratification) — do NOT re-ask.
4. Equipment-schema product gap stays NOTED for Brad/architect.
5. W2-11-ZYMO-GOLDEN-DEMO D4: adjudicate off attempt-10's receipts once REVISE-
   GHOST-1 gates clean (its flows ride the same surfaces).

## Blockers / open obligations (carried)

- REVISE-GHOST-1: in-progress; sole gate = browser F1/F2 accept with ghosts
  mounting; fix run 3 LIVE. attempt-6/7/8 acceptance debt carries; a9 supersedes
  as fix-class evidence.
- MIXFRAC-1 gate obligations carry unchanged. GAPCARD/CELLRATE main-promotion
  debts carry.
- OPEN evidence debt (new): AS-LANE2-FIXRUN3-DEFECT-ATTRIB-SCREENED (D1/D2 arm
  attributions are screened, not proven; clears on fix3 RED-proofs).
- CLEARED this tick: AS-LANE2-INFERENCE-PROVIDER-ROUTE-VIA-PROXY (drafting, fold,
  and revise-turn payloads all routed via the proxy with real arguments during
  the live gate).

## assumptions:
- NEW: AS-LANE2-A9-BLOCKED-CLAIM-OVERRIDDEN (reviewer narrative vs first-hand
  evidence; closed at write-time), AS-LANE2-FIXRUN3-DEFECT-ATTRIB-SCREENED (OPEN,
  clears on fix3 RED-proofs) — appended to lanes/2/assumptions.md.
- CLEARED: AS-LANE2-INFERENCE-PROVIDER-ROUTE-VIA-PROXY.
- CARRIED (no change): AS-LANE2-DRIVE-GAP-READING-CARDS, AS-LANE2-STACK-RESTART-
  STALE-HOLDER, AS-LANE2-EQUIPMENT-WIP-SYMLINK-RESIDUAL, AS-LANE2-TASKLIST-EDIT-
  INSERT-ONLY, AS-LANE2-ADVC-C2-PROMPTS-RATIFICATION-EMBED, AS-F4-1/F4-2/F4-3,
  QUEUE-PIDWATCH-BELT, ADVC-PRESTALL-PROMPTS, D1C3-STRAY-RECEIPTS, QUEUELOCK-
  FILE-RESIDUE, FIXQUEUE-FIFO-ORDER, MENU CAND set, READCARD-CODER-SELFREPAIR,
  READCARD-D1-RATIFIED, CHAING1C-TIER2-DIRECT, CHAIN-CARD-LOCATION, APP-TSC-
  BASELINE-28, PLAYWRIGHT-EXEC-PIN, PANEL set, CHAIN-DEFECTS-ORCH-VERIFIED,
  CHAIN-OQ2-CORRECTION, ANSWERFOLD-FIXTURE-FRACTIONS, FULFIL-CWD-CONVENTION,
  GAPCARD-PARAMINPUT-TRACKED-COPY, CELLRATE-OQ1-PRECLEARED-TRACKED-COPY,
  PROTOAI13-MENU-DRIFT-NEW-PREREG, CHAIN-G1B-VISION-FIFO, ANSWERFOLD-BASE-
  PRECELLRATE, SPECCOMP-EMPTYARG-QUIRK, ROLEAXES-COMPRESSION-EXIT-COMPLETE,
  BACKEND-HEALTH-ROUTE, FLOCK-NOFIFO-RACE, TASKLIST-STATUS-NOT-LANDED-TWICE,
  ATTEMPT6-TRUNK-NOFIX, ROWCOUNT-MATCHER-CALIBRATION, AS-LANE2-ARCH-SUPERSEDES-
  PRESTAGED-GATE.

## live-worker checkpoint at exit (~23:10 EDT; tick started ~22:10)
- LIVE: cl-coder fix run 3 (unit cl-l2-rg1-fix3-l2t2235; flock pid 1104694; log
  logs/coder-REVISEGHOST1-fix3-l2t2235.log; report owed
  deliverables/REVISEGHOST1-fix3-report.l2t2235.md; started 23:01).
- SCOUT cl-l2-scout-rg-ghostmount2-l2t2235 exited rc=0 (findings screened into
  the fix prompt; log logs/scout-rg-ghostmount-l2t2235.log). NOTE PITFALL: first
  scout launch died instantly — the inner prompt contained single quotes that
  broke the systemd-run bash -c quoting; prompts must go through "$(cat file)".
- LIVE INFRA: cl-l2-orproxy-l2t2130 (Restart=always; DO NOT stop).
- Trunk HEAD 0f62c95f; :5193 200, :3093 200. Brad's stack untouched.
- Pins: /tmp/rg1/drive10.mjs + /tmp/rg1/drive10-attempt9.mjs, attempt-9 receipts
  under /home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-24-attempt9/.
