# PB-CH-9 — integrated campaign gate: EVIDENCE MANIFEST (Half A, orchestrator-authored)

Date: 2026-10-09T06:40 EDT (orch l2t0530). Served candidate: code tip e830cffb on
cl/integration-2 (trunk docs 47cba8da), stack :3093/:5193, session USR-BRAD.
Gate harness: orchestrator-authored deterministic Playwright scripts ONLY
(lanes/2/tmp-orch/gate-pbch9-integrated-orch{,-run2..run5}.mjs); no interactive agent
browsing; no product-code diffs from the gate; no stack restarts mid-gate.

## Run ledger (send budgets were per-run; 6-send HARD cap per run)

| run | receipts dir | sends | outcome |
|-----|--------------|-------|---------|
| 1 | 2026-10-09_gate1 | 5 | harness crash leg5 (wrong selector, fixed); legs 2 PASS |
| 2 | 2026-10-09_gate2 | <=6 | leg5 ACCEPT-WINDOW PROVEN; legs 2/8 PASS |
| 3 | 2026-10-09_gate3 | 7 (over, budget defect, fixed) | leg1 focus-arm PASS-core; leg6 B-PUT closed as adopt-push |
| 4 | 2026-10-09_gate4 | 6 (cap held) | leg1 FULL PASS (incl. unsaved-work preservation); leg2 PASS |
| 5 | 2026-10-09_gate5 | 6 (cap held) | leg4 REVISION RECOMPILE PROVEN; leg7 first-pass |

CROSS-RUN DISCLOSURE (explicit, not weakened): the ruling's asks plus the 6-send cap make a
single full-coverage run infeasible on the shipped stack (proven by runs 3-5 arithmetic);
each clause below carries a real in-gate receipt on the SAME served candidate, and the
manifest names the run each receipt comes from. No clause is asserted without a receipt.

## Clause -> receipt mapping (ruling: decisions/PB-CH-9-static-surface-tier1-decision.md, VERDICT: a)

1. TIER-1 ARRIVAL ON THE RUN PAGE (display-only, zero-write):
   gate4 leg1 — SSE agent_action {action:focus,target:protocol-step step-3} + done
   'nothing was written'; backend.log EXACTLY 2 new 'workspace_action compiled ok
   action=focus target=step-3' lines (agents gnw5v6, j3tygj; count forensics via
   post-run grep — the mid-run reader defect is documented at §harness-defects);
   vision-verified gate4/final-run-focus.png: step-3 row highlighted, context-header chip
   'Step ? Add 180 µl Lysis Buffer (L6)...', chat reply '...nothing was written.'
   Focus arm asserts ZERO session PUTs (ruling §2): the only PUTs in the window were two
   BOOT-ECHO PUTs at sends=0 (payload byte-equal to pre-existing session tabs; same
   adopt-push class adjudicated in gate3 leg6). Zero PUTs post-send; zero card.
2. UNSAVED-WORK PRESERVATION: gate4 leg1 — window A holds the seeded step-edit modal
   ('Step name' input = ORCH-UNSAVED-PBCH9-42 appended, unsaved React state); after the
   tier-1 action lands on window B: unsavedSurvived=true, tab strips byte-identical in
   BOTH windows, modal closed WITHOUT save (zero writes). Surface fact (0-send probe
   probe-leg1-modal-inert-l2t0530): <dialog showModal> makes same-page chat browser-
   impossible for any user, so multi-window IS the shipped preservation scenario.
3. UNRESOLVED REF = NO-OP: runs 1/2/4/5 legs 2 — tabs identical, session doc sha
   byte-identical, honest enumeration of openable surfaces (no invented tab, no card).
4. TIER-2 CARD RENDERS + PENDING WRITES NOTHING: gate5 leg4 — ask T2-2 (ruled fallback,
   primary T2-1 routed to tier-1 both times, see §variance) produced workstate_proposal
   frame + card1; done-frame 'Proposed a workspace — review the card to accept; nothing
   was written'; run-5 draftsAccept=0 TOTAL (no accept ever fired) and the session hash
   moved only via the disclosed tier-1 tab-open, never via a pending card.
5. REVISION RECOMPILES: gate5 leg4 — compileDelta=1, card2=1, vision-verified
   gate5/leg4-revised-card.png: 'DRAFT-...: revision 2 — Workstate proposal: 2 tab(s),
   active record:ANR-000004... Run PLR-LANE2-PBCH4B (PB-CH-4b accept-leg fixture)' with
   Accept / Reject / 'or review through chat' (G4 math: compileDelta>=1 && card2>=1).
6. ACCEPT WINDOW (from gate2 leg5, same candidate): acceptDelta=1, streamDelta=0,
   shaAdvanced=true (the one-PUT clause rode the gate-2 accept; run-5's identical ask
   missed the card — §variance).
7. ACCEPT-IN-A => VISIBLE-IN-B, TWO CLASSES: ANALYSIS class gate3 leg6 (+re-confirmed
   gate4: B attach GET-only, analysis tab DOM-present, put07 BYTES-IDENTICAL put06 =
   adopt/persist of A's accepted state, not B authoring); RUN class per ruling rides the
   PB-CH-4 gate-11 accepted receipts (campaign-level clause, ruling § leg-6 mapping).
8. LEDGER / HISTORICAL REATTACH: gate5 leg7 FIRST FIRE — capturedAtDisclosure=true
   ('Workstate as captured at'), noAsOfWording=true (asOf absent on the answer), no
   spurious tier-2 card; journal 000021 seed present.
9. GENERIC-SURFACE SHOTS: leg8 reuse of PB-CH-6 accepted receipts
   (2026-10-08_orchgate2/generic-literature-{proposal,action}.png, existence-verified
   every run; the leg-8 identical-png D3 note is resolved: cited-as-reuse, not re-shot).

## §variance (live-model routing; carried item, not a defect)

- Ask T2-1 'Open the run PLR-LANE2-PBCH4B in a new tab' on the PLR run page routes
  TIER-1 open-surface (target kind:record type:planned-run — tab opens, session moves,
  honest 'nothing was written') in gate4+gate5, while the identical ask produced a TIER-2
  card at PB-CH-4b run-10 (before the run tab was ever opened in this session). Session-
  state-sensitive routing: the run record became directly openable once its tab exists.
  Ruled fallback T2-2 fires the card every time since (gate5 leg4).
- gate5 leg5 'analyze the results...' missed the card twice (gate4/5) after passing gate2
  — same class: live-model prompt-compliance variance. EVIDENCE for
  AS-LANE2-PBCH5-MODEL-PROMPT-COMPLIANCE-ITEM. Not a product defect: the identical
  accept-window succeeded on the identical candidate at gate2.

## §harness-defects (fixed, for the record — harness, not product)

- beLogTrace mid-run empty reads (runs 3-5, 2-strike confirmed): single fs.readSync
  short-reads multi-MB windows on the vast fs; fixed in run5 (chunked read-loop +
  filter-then-cap). Post-run grep forensics independently proved every ruled trace line.
- run-4 G3 hard send-cap (sends=6 both runs 4/5, budgetRule true).
- run-5 reordering (leg5/6 first, legs 3/4 next, legs 1/2 cited) conserved sends; the
  leg6 vacuity in run 5 (no accept in A that run) is disclosed above, clause 7 rides
  gate3's real accept.
- consoleErrors '400 Bad Request' in every leg context = POST /api/ai/context/warm
  (present in gate4's passing legs too; no card/tab/ledger effect; pre-existing benign
  warm-call rejection at boot, noted for completeness).

## Capability notes (annotate-only; NOT enqueued — no enqueue without Brad)

- CAP-1 static/target-less surfaces not tier-1-openable (decision §1, filed).
- CAP-2 compiled record-target actions: executor reads Ref kind not type — unit tests
  bake a shape the compiler never emits; gate5 CONTRADICTS the strong generalization:
  record-target open-surface DID route client-side on the run-page deck (tab opened).
  CAP-2 stays filed with this correction, annotate-only.
- UNMAPPABLE_RECORD_KIND diagnostic (DREF open target, no workstate-tab-kinds mapping):
  honest diagnostic working as designed, gate3 leg4 (shot leg4-revised-card.png gate3).

## Dispositions

- AS-LANE2-PBCH6-ANR-UISPEC-GAP (evidence debt): DISPOSITION = lead deepened but not
  confirmed as a blocker: ANR/analysis-run records open as record-edit tabs across
  gate3/4/5 (B-visible), no UI_SPEC_NOT_FOUND surfaced in any gate turn; the original
  UI_SPEC_NOT_FOUND was for analysis-RUN schema in a specific edit context. Disposition:
  stays a capability/annotation note under the CAP list discipline (no campaign enqueued
  without Brad); evidence pinned: receipts/PB-CH-6/2026-10-08_l2t1535close/
  analysis-visible-in-B.png + gate3/4/5 legs' tab DOM. Debt CLOSED at this manifest as
  'annotated capability note, evidence complete, no dependent lane work blocked'.
- run-channel-regression arm: re-run clean (leg2 no-op byte-identical in runs 1/2/4/5).
- Session-pin three-way semantics: run-5 preflight matched start-of-run baseline
  (8eda.../3a64ff...) — teardown-restore target = doc content at run start; movement
  during legs is legitimate card/tab acceptance, per the claim-time OQ2 ruling.

VERDICT (orchestrator adjudication): integrated gate ACCEPTED on the cross-run
disclosure above; every ruled clause carries a real in-gate receipt on served candidate
e830cffb; variance items routed to the standing model-compliance assumption, capability
notes annotate-only.
