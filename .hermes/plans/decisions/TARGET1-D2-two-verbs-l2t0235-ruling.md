# ARCHITECT RULING — L2-CLARIFY-TARGET-1, defect-2 "two verbs" (l2t0235)

Date: 2026-11-05 (EST). Architect: lane-2 architect, first-hand repo + gate-receipt verification.
Responds to: orchestrator question packet l2t0235 / L2-CLARIFY-TARGET-1 defect-2 (carried since l2t0205, gate c6,
never graded). Read-only on product code; this ruling only writes this decision document (uncommitted).

## 0. First-hand evidence verified for this ruling

- `app/src/agent/ChatPreviewCard.tsx` (read in full): the pane's whole-proposal accept verb is the canonical
  "Apply", pinned at :183 (spec Change 5 :376 "Apply :183 ... pins HOLD" — the enriched rows live in this surface);
  calls `chat.acceptPreview()`. Its header (:3-8) states its reason to exist: "on a phone the deck (and its
  PreviewActionBar) is off screen, so a staged proposal had no visible way to be applied or discarded" — i.e. the
  card IS the deck-off-screen (mobile) commit surface.
- `app/src/event-editor/deck/PreviewActionBar.tsx` (read in full): the deck floating bar's primary accept verb is
  "Accept" (:182), calling `adoptStagedPreview` :97 directly; it also owns the ontology term sign-off gate
  (`decisionNeeded` :52-57, `ProposedGraphModal` termDecisions :184-199) and the "View changes" drill-in. Header
  :27-29 and the D1 fix comments confirm: "accept core is the SHARED deck adoption ... the SAME module the
  universal chat-card Apply delegates to. One adopter: commit_preview nulls the preview ... whichever path
  commits first makes the other a no-op."
- `app/src/event-editor/deck/DeckChatSlice.tsx` :105-128 : the deck publishes `onPreviewAccept` = `adoptStagedPreview`
  with `termDecisions: {}` — "sign-off decisions live in the deck bar's LOCAL state, so unsigned decisionNeeded
  terms REFUSE the chat Apply visibly." The pane Apply cannot sign terms; it refuses and points to the review UI.
- `app/src/shared/hooks/useAiChat.ts` :2049-2130 (acceptPreview), :2407-2440 (clearStagedPreviewForExternalCommit):
  one-adopter invariant (either commit makes the other inert) and the cross-surface clear (L2-SUITE-A-uifix2 FIX2).
- D1 browser re-gate receipt `~/.hermes/cl/receipts/L2-CLARIFY-TARGET-1/2026-11-05_0220-d1-regate/report.md`,
  especially :166-167 Observation 5: "Two verbs still coexist — Apply in the pane bar and Accept on the deck
  floating bar, both visible in shots/final-04-answer-compiled.png. Routed to architect; not graded here." The
  same report (:120-121) shows D1's accept leg committed through the PANE APPLY (`Apply clicked`,
  `final-05-after-apply.png: Accepted 1 event`), atop the run-workspace deck-backed door at 1440×900 viewport.
- Spec `2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md` :174 names PreviewActionBar/ChangesPanel/ProposedGraphModal as
  the "deck-side review surfaces"; :376 pins the card's `Apply`/`Discard` as HOLDING; :526 the browser gate's "one
  verb everywhere."

## Empirical answer to the carried question

Both `Apply` (ChatPreviewCard) and `Accept` (PreviewActionBar) ARE reachable simultaneously in the
clarify-assumed deck flow. The D1 browser gate measured this directly on the graded run-workspace/deck-backed door
at 1440×900: `final-04-answer-compiled.png` shows the pane proposal bar ("Proposed deck changes ... Apply ·
Discard") AND the deck floating bar's primary "Accept" in the same viewport, both interactive during the
staged-pre-proposal window. The dock does NOT subsume the card's Apply: the "one adopter ... whichever commits
first makes the other a no-op" invariant only de-duplicates a SECOND click; it does not suppress the simultaneous
presentation of two identically-fated commit verbs. This is the precisely the defect.

## Rejection of option (b) — there is no distinct second semantics

The two verbs are the SAME action: both commit the full staged proposal (events + previewLabwares +
previewPlacements + ontologyBindings) through the identical `adoptStagedPreview` core (DeckChatSlice's
`onPreviewAccept` IS that core with `termDecisions:{}`; the bar calls it directly). There is no verb-semantics
difference to assert — asserting one would be fabricating a distinction the code refutes (the computable-lab rule:
never fabricate). Option (b) is therefore rejected.

## Rejection of option (c) — the measurement already exists

The task asked "do both verbs reachable simultaneously ... or does the dock already subsume the card's Apply?" That
is an empirical question and D1 answered it: both are live in the same staged-pre-proposal window at desktop width.
No further measurement is needed before deciding. Option (c) would defer on an already-established fact.

## RULING (option (a)) — ONE commit verb: the pane "Apply" survives; the deck bar's duplicate
accept/reject primaries are retired as a second approval surface in any flow where the staged chat preview card is
present, and stay legal only on a deck with no staged chat preview.

WHY the pane "Apply" wins (not the deck bar "Accept"):

1. It is the spec-of-record commit verb: Change 5 pins `Apply` (:183, :376) as HOLDING through every re-gate, and
   the whole P7 enrichment ("readable rows, one verb, inside the existing surface") targets the ChatPreviewCard.
2. It is the D1 browser-graded commit path: the accepted round-trip applied through the pane Apply and is
   REQUIRED to remain valid (the ruling "does not reopen D1"). Retiring the card's Apply would reopen D1 by
   construction; retiring the deck bar's floating "Accept" does not touch any graded assertion.
3. It is reachable in every flow (mobile deck-off-screen AND desktop), which is its stated design role (:3-8):
   the universal chat-card commit. The deck floating bar is reachable only when the deck is on-screen.

BINDING DISPOSITION:

A. In the clarify-assumed flow (a deck-backed surface — event-editor door or run-workspace door — with a staged
   chat preview, i.e. `chat.hasPreview` true), the ChatPreviewCard IS the whole-proposal commit surface: it is the
   sole accept verb, reading "Apply", and the sole reject verb, reading "Discard". The PreviewActionBar's floating
   primary "Accept" (:182) and its floating "Discard" (:159) are NOT rendered as commit controls in this flow —
   they are a second approval surface for the identical action and are retired as dead chrome per SOP rule 12.

B. The deck bar RETAINS its genuinely distinct, non-duplicative affordances even when the card is present:
   - "View changes" / `ProposedGraphModal` (:163-165, :183-200) — the ontology term sign-off + raw-JSON drill-in,
     which the card structurally cannot do (the card refuses on unresolved refs; it has no termDecisions state). It
     becomes the review/decision entry point: the scientist signs terms there, then commits by "Apply" on the card.
   - The floating bar that would otherwise render only a duplicated accept/reject may be hidden OR reduced to the
     "View changes" launcher; both are SOP-12-clean as long as no second commit/reject verb reads. Implementation
     shape is the coder's call keeping this doctrine.

C. The deck bar's full Accept/Discard commit verbs STAY LEGAL, unchanged, on any deck-side surface where there is
   NO staged chat preview (`chat.hasPreview` false — the legacy deck-side-only commit path, e.g. a bare deck with
   no universal chat). There, the bar is the sole commit surface; `PreviewActionBar.test.tsx`'s "Accept
   persistence" leg stays meaningful and intact.

D. One-adopter invariant not weakened: whatever commit facet is reachable calls `adoptStagedPreview` exactly once;
   the first commit makes the other inert. The `clearStagedPreviewForExternalCommit` cross-clear stays.

## PREREQUISITE (binding, must be met or the fix is not SOP-12/safe)

Term sign-off must become visible to the card's Apply gate. Today the deck bar's `termDecisions` are bar-LOCAL, and
the card's Apply refuses any `decisionNeeded` term (:DeckChatSlice 108-110). After retiring the bar's floating
"Accept", a term-heavy desktop proposal must still be committable: signing terms in the retained "View changes"
modal must unblock the card's "Apply" (unresolved/decision state must reach `acceptPreview`, or the card must consume
the signed decisions). If this cannot be met without larger surgery, that residual is reported as a named follow-up
task with the deck bar's "Accept" retained ONLY for term-heavy proposals — never as two live verbs.

## Copy / test pins (what the remaining TARGET-1 legs must grade)

- Accept-verb pin: after "Add DMEM to A1 (no volume)" → approve the assumed chip → submit answers → the staged
  preview renders (browser, desktop 1440×900), there is EXACTLY ONE whole-proposal accept control in the viewport:
  `[data-testid="chat-preview-apply"]` reading "Apply". No second accept primary (deck floating "Accept") renders
  while `chat.hasPreview` is true.
- Reject-verb pin: exactly one whole-proposal reject control reads "Discard" (`chat-preview-discard`); the row
  reject verb stays the bar's own word `Discard`/`Restore` (D1 guardrail unchanged — the per-row toggle still
  calls `setPreviewEventState` and adds no second approval surface).
- Persistence/one-adopter pin: committing via the card's "Apply" writes the event(s) once (server read-back), and a
  subsequent deck-bar commit is a no-op; committing on the no-chat deck path still lands via the deck bar "Accept".
- Term-only pin (if term-heavy proposal reachable): after signing terms in "View changes", "Apply" on the card is
  enabled and commits; unresolved-ref state is not silently consumed.
- No-fabrication pin: the accept core remains `adoptStagedPreview` for both facets; no new commit pathway is added.

## Acceptance condition for the remaining legs

Browser-graded on the deck-backed door (event-editor or run-workspace) and the bare no-chat deck, each must show
exactly one whole-proposal accept verb at staged time, matching the pins above, with D1's accept-leg behavior
(number-carries into the commit) observationally unchanged. Unit/tsc: `app` green, delta confined to the two named
components and their tests.

## Disposition summary

- (a) ONE commit verb: ChatPreviewCard "Apply"/"Discard" survive; PreviewActionBar's floating
  "Accept"/"Discard" are retired as a second approval surface only where a staged chat preview card is present,
  staying legal on the no-chat deck path (C) and keeping its "View changes"/term-sign-off review affordance (B).
- (b) rejected: the verbs have identical semantics (same one-adopter core). (c) rejected: D1 already measured the
  coexistence.
- D1 stays CLOSED: the pane Apply it graded remains the commit verb; only the alongside floating bar is retired in
  that flow. Prerequisite (term sign-off visibility to Apply) is binding, with the term-heavy fallback named.
- This ruling changes no spec, no golden, no server file.

END-RULING