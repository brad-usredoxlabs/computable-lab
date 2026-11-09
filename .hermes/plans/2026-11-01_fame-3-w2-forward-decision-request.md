# FAME-3 W2 platform gap — architect decision request (lane 1, tick 226TH addendum, 05:55 -0500)

## Decision needed
FAME-3's W2 (interactive peak->compound picker rendering the NEW assignment fields live) is
BLOCKED on a forwarding gap the coder classed as beyond its ownership list (spec §15) and beyond
named OQ-1..5. Coder's full stop note: /home/brad/.hermes/cl/lanes/1/fame-3-report-l1t0430.md
(sections W2-BLOCKED, ~:150-240). RULING REQUESTED on exactly one thing:

RATIFY or DECLINE "part 3": ONE generic, shape-only, additive forwarding of the DECLARED nested
ui.yaml member (slot.properties/fields family — same class as the adjacent items/fields/props
forwards) so newly-declared record-surface members reach the client projection for ALL record
types. Coder's own framing: shape-only, zero policy, zero data, no kind/field-name branch, no
schema/lint/write-wall change, additive.

Options:
  OPT-A RATIFY the generic forward (server/app forwarding change, out-of-list but tiny+generic).
  OPT-B DECLINE — keep platform surfaces frozen; FAME-3 W2 takes a DATA-only route (like FAME-1
        fix2's option (a): flattened sibling slots that ride ALREADY-consumed shapes) or returns
        requires-rescope for the whole editor leg.

## Evidence (orchestrator-verified first-hand unless marked)
- FAME-3 coder report W2-BLOCKED section (worker-authored; cites inside = worker's): the
  assignment_state/provenance/reporting_basis_ref fields (merged-schema W3 commit 393fee16) do not
  reach the rendered record surface without the forward; gates W2 picker, W4 editor round trip,
  W8 provisional-state visibility legs.
- SAME FORWARDING CLASS is live in FAME-1 fix2 RIGHT NOW (convergence risk): reviewer cycle-2
  proved the client documentMapper keys object decomposition on slot.properties {name,..} while the
  server projection emits slot.fields {path,..} (app/src/editor/taptab/documentMapper.ts:222,:309;
  slot.fields read nowhere; array/items path IS consumed :335-347). I routed FAME-1 to the
  DATA-only flattened-slot route (reviewer's option (a)) precisely to AVOID a documentMapper
  platform change (out of FAME-1 ownership). FAME-3 now asks for the generic forward instead.
  If you RATIFY (OPT-A), FAME-1's flattened shape and FAME-3's forward must be reconciled (both
  in flight: FAME-1 fix2 live on slot-0 coder, wt/fame-1-lane1-l1t0100).
  If you DECLINE (OPT-B), FAME-3 W2 resumes with the flattened-sibling DATA route — the exact
  pattern FAME-1 fix2 is proving now, and its boundary test shows whether it renders.
- Coder's part 3 text is at report :~200-240 (forward sketch: ProjectionSlot type member +
  generic map; worker did NOT commit it — NO W2 code committed, correct per stop rule).
- Trunk state: cl/integration-1 tip 5fb19a9e (FAME-2 merged b654a8d6; FAME-3 W3 commit 393fee16
  on wt/fame-3-lane1-l1t0245, uncommitted W6-in-flight drafts files preserved in that wt).
- Fleet note: FAME-3 coder session died at the engine context cap ("HTTP 400: prepared prompt
  exceeds Engine max_context 262144", coder-FAME3-slot1-l1t0430.log, exit 05:37:25) — the RESUME
  dispatch will be brief-slimmed; your ruling is its gate.

## Attempted/considered
- OPT-B precedent: FAME-1 cycle-2 reviewer explicitly labeled the mapper normalization as
  "needs architect sign-off (out of this lane's ownership)" and offered the DATA-only option (a)
  as in-scope — the DATA route is proven-consumable at documentMapper.ts:335-347 (array/items)
  and readonly-scalar siblings.
- OPT-A upside: ONE generic forward serves every future record-surface field (both items' gaps are
  the same class); downside: touches app/editor platform code (WIDGET-R1 history owns that area).

## Recommendation (orchestrator, non-binding)
Prefer OPT-B for THIS cycle: keep both in-flight fix runs free of platform-code changes, let
FAME-1 fix2's boundary test prove the DATA route renders; route the generic forward (OPT-A) as a
separate platform item at next intake with WIDGET-R1 history attached. If you judge the flattened
route creates duplicate local vocabulary or permanent slot-spam on many record types, OPT-A with a
reconciliation order (land forward first, FAME-3 resumes; FAME-1 flatten may be simplified later).

## Uncertainty
- Not verified whether the coder's part 3 alone (server forward) suffices or the client mapper
  ALSO needs the {name,..}<->{path,..} reconciliation (reviewer's probe says client expects
  {name,..}: a server-only 'fields' forward may still land inert — part 3's exact seam matters;
  worker's sketch claims shape-only sufficiency, unverified by me).

Return: write your decision to
/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-11-01_fame-3-w2-forward-decision.md
ending with a `DECISION: OPT-A` or `DECISION: OPT-B` line + rationale + any ordering conditions.
