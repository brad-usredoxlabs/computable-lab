# HANDOFF l2t1735 (CHECKPOINT, soft budget exceeded) — lane 2 — 2026-10-12T19:15 EDT
# Supersedes 2026-10-12_1720. Trunk cl/integration-2 tip after this tick: report-promotion
# commit (W28-A5FIX) on top of 2c342ff6 (gate harness) <- d3f1b60a (prior checkpoint).
# Chain: 63e73e48 -> d3f1b60a -> W28-A5FIX merge -> 2c342ff6 -> report promo.

STATE: stack :3093/:5193 up (no restart needed this tick — no YAML merged; TS-only merges are
picked up by tsx/vite watch — the gate run-2 served the merged A5FIX tip, confirmed by
XDR-w211-gate panel title showing the reseeded draft). Fleet coder lock FREE (lane-1 OWN-11
released 15:29; verified FLOCK-FREE). No live workers except NONE — everything this tick
completed or was checkpointed as evidence, not as a running worker.

COMPLETED THIS TICK:
1. W28-A5FIX CLOSED-AT-CODE-GATE: the prior advc attempt (bash 3137634) was DEAD with zero
   observability (log file never created, no report). Re-shot per ladder:
   reviews/advc-w28a5fix-c1-l2t1735.md — VERDICT: accept, 0 defects, 3 mutation probes RED,
   claims cross-checked. Orch verified MYSELF: diff opened (3 production files:
   IntentCompileFromPromptHandlers.ts +27 (composeAnsweredPrompt: answers ride the compile
   prompt as a generic settled-choices block, zero domain literals — verified in the hunk),
   client.ts +92 (held-422 discriminated result), ProtocolLocalizationThread.tsx +52
   (foldHeldBundle = the 2xx branch + honest unresolved-facts note, verified in the hunk);
   3 new test files). Ran targeted suites in the worktree: server answeredPrompt 4/4, app
   heldBundle + intentCompileHeld 7/7. No YAML -> no restart. MERGED --no-ff. Report promoted
   .hermes/plans/W2-8-a5fix-report.md. W2-8 task STAYS in-progress: the A5d browser gate
   (deck route /deck/EVG-a5-fixture-method/RUN-2026-09-19-run-vwr8) is the remaining
   obligation — it was queued to run against this merged tip but the vision slot + budget
   made the W2-11 diagnosis the higher-value use of the tick.
2. W2-11 D2 ROOT-CAUSED + HARNESS FIXED (commit 2c342ff6), all evidence-backed:
   - Screenshot read first-hand: the 17:00 "Save disabled" shot showed the title ALREADY
     displaying the edited text -> fill-to-identical-string flake, not a product defect.
   - Orch deterministic probe (scripts/d2-probe.mjs, receipts
     W2-11/2026-10-12_1740-orchd2probe/ 01-03 screenshots): Enter dirties Save, Save writes,
     note "Saved." — the interactive path WORKS on the served stack.
   - Real root causes (verified against live lane data + code): (a) the VPDF upload route
     auto-extracts -> shadow draft XDR-000006; findSemanticDraft (VendorPdfReviewPage.tsx:240)
     binds the FIRST un-promoted draft for the artifact -> all UI writes re-routed there while
     the spec asserted on XDR-w211-gate; (b) XDR-w211-gate was already promoted -> draft body
     server-locked (XDR_CANDIDATE_LOCKED 409, reproduced by direct PUT) AND findSemanticDraft
     skips promoted drafts entirely -> D2/D3 can never gate a promoted record.
   - Harness fixes (mechanics only, ALL assertions kept): seedVpdf deletes un-promoted shadow
     drafts for this artifact; seedXdr force-reseeds a promoted XDR (DELETE /records/:id,
     routes.ts:238; all lane records are test data per Brad); promotion+seedRun moved from
     beforeAll into D4 (first leg needing the family); PRECHECK asserts the
     exactly-one-open-draft binding invariant; describe timeout 600s (config default 30s/test
     killed D3 mid-refusal-leg in run 1 — D3 alone budgets 90s+120s+3x60s waits).
   - D2 GREEN TWICE after fix: "XDR-w211-gate revisions=3 provenance byte-equal=true sha
     7bebcbcd->90c06095" (18:1x) and revisions=4 sha 90c06095->513442bc (run 2).
3. GATE RUN 2 (full D1-D6, trunk incl. W28-A5FIX, log w211-gate-full-l2t1735-run2.log):
   PRECHECK PASS, D1 PASS, D2 PASS, D3 FAIL — real finding now, not harness:
   refusal leg "change the vendor text on page 1" produced NO review-ai-refusal; the model
   instead emitted a schema-valid protocol_edit PROPOSAL rewording a DRAFT step
   ("step-004 ... now: Bench: Centrifuge the lysate at 4000 x g for 5 min") — screenshot read
   first-hand (test-failed-1.png; panel shows full chat + proposal card + Accept/Reject).
   D4-D6 did not run (serial abort).
4. PROTO-AI-13 recount n=184/500 (last ts 19:46Z) — INSUFFICIENT-side, no action.

D3 WALL FINDING (next tick's top item, fully armed): the server wall IS DATA
(config/drafting/review-write-wall.yaml, loaded per-call — G2c phrases live). The W2-9 gate's
B2 leg ("rewrite vendor text" wording, receipts/w29-B2-rewrite-vendor-text.png) DID refuse at
this same trunk. Hypotheses, in order to test: (H1) the model routed the request as a
MEANT-legit draft-step reword (never a SAID referent) so the wall legitimately never fired —
then the DEFECT is model prompt-compliance / the refusal vocabulary, i.e. the D3 phrasing
hits a path where the wall's referent-match cannot see the intent; route to a bounded coder
run to extend the wall DATA or the prompt contract — architect only if scope is in question.
(H2) the review-ai-refusal element only renders for wall-refusals, not honest model refusals
(ReviewAiPanel.tsx check — the G2c fix routed prose turns through the notes channel; a
model-side refusal bubble may not carry the testid). CHECK backend.log req-ids for the D3
window first: if the server logged a wall refusal and the client didn't render the testid
element, that's an app wiring defect (cheap fix, owns ReviewAiPanel). The D3 turn reached the
server (model replied visibly) so it is neither harness nor seed.
NEXT TICK ORDER: (1) D3 wall finding (H2 first — one grep in ReviewAiPanel.tsx + backend
log). (2) D4-D6 legs after D3 green. (3) A5d browser gate for W2-8 (tier-1, bounded; deck
route above, candidate = current trunk; receipts W2-8/<ts>-a5d/). (4) W2-9 G2d gate re-shoot
(per prior handoff §(2), ask (d)/(e)). (5) SHORTHAND-COMP-1 dispatch_gate stays CLOSED until
A5d + G2d accept. (6) PROTO-AI-13 recount (n=184).

LIVE WORKERS: none. Fleet coder lock FREE.

assumptions:
- AS-LANE2-W211-GATE-HARNESS-SHADOW-DRAFT-DELETE-L2T1735 (NEW, open until gate accept): the
  gate spec now DELETEs un-promoted shadow extraction-drafts auto-minted by the VPDF upload
  route for this artifact, and force-reseeds XDR-w211-gate when found promoted. Mechanics
  only; assertions unchanged; lane records are test data (Brad standing ruling).
- AS-LANE2-W211-GATE-TIMEOUT-600S-L2T1735 (NEW): describe timeout 600s matches the per-test
  waits the spec already budgeted; replaces the 30s default that killed D3 in run 1.
- AS-LANE2-W28A5FIX-EVIDENCE-LISTS-COMMITTED-L2T1735: 8 committed .hermes/evidence files rode
  the merge (advc scope observation, documentation only).
- AS-LANE2-W28-GATE1-INVALID-ACCEPT (carried, open): W2-8 stays in-progress until real A5d
  receipts; this tick's advc+orch gates cover the CODE track only.
- Evidence debt carried forward (open): AS-LANE2-SEMANTICPASS-DEBT-IS-LIVE-TREE-ONLY-L2T1530,
  AS-LANE2-EXA-CREDENTIAL-DEAD-FLEETWIDE-L2T1325 (BRAD-side), AS-LANE2-WS6-R3-THUNDERBEAST-
  NONCOMPLIANT-2OF2-L2T1150, AS-LANE2-WS6-R2-INVALID-NOCHART-ROUTE-L2T1050,
  AS-LANE2-BROWSER-REVIEWER-FABRICATED-ROUTE (standing), AS-LANE2-SHORTHANDCORPUS-CLI-
  VERBATIM-L2T1010, AS-LANE2-SHORTHANDCHAT-CRIT4-WORDING-L2T0610, AS-LANE2-BASELINE-PROBE-
  LANEEXCLUDE-L2T0610, AS-LANE2-W289-PROMPT-REBUILT-L2T0315, AS-LANE2-SHORTHANDCHAT-GATE1-
  INVALID-NAV-L2T0410, AS-LANE2-SHORTHANDCHAT-GATE3-REPAIR-ATTEMPTS-L2T0810,
  AS-LANE2-W211-ORCH-APPLIED-DOC-NITS-C2-L2T1615 (closes at W2-11 gate accept),
  AS-LANE2-W211-GATE-HARNESS-ORCH-OWNED-L2T1615 (superseded-in-scope by the -L2T1735 entry,
  closes at gate accept), AS-LANE2-W211-MAGWASH2-KIND-AS-MATERIAL-L2T1615 (open),
  AS-LANE2-W211-LANESYNC-SYMLINK-LOADER-GAP-L2T1615 (infra, open).
  CLOSED this tick: none (COERCION-PINS closed last tick).

blocker: none blocking lane flow. Open evidence obligations: W2-11 D3 wall finding (product
or app-wiring, NOT harness — evidence armed above); W2-8 A5d gate receipts; W2-9 G2d gate.
next check: (1) backend.log D3-window req-ids + ReviewAiPanel.tsx refusal-render path;
(2) w211 run 3 after the D3 fix; (3) A5d tier-1 gate; (4) events.jsonl recount;
(5) coder lock free — no stale holder (verified free at 18:5x).
