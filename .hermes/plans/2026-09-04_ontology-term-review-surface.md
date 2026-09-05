# Ontology Term Review / Sign-off Surface

Date: 2026-09-04 · Branch: main

## Goal (user-requested)
Surface the AI-chosen ontology CURIE terms as an explicit per-term **approve /
replace** review, so the user signs off that the AI's best-guess ontology term is
correct — the compromise we landed on — instead of Accept materializing all
minted terms implicitly.

## Decisions (confirmed with user)
1. **Surface location:** a dedicated "Review ontology terms" section inside the
   existing **View-changes modal** (`ProposedGraphModal`), opened from
   `PreviewActionBar` before Accept.
2. **Which bindings need a decision:** only `minted` / `requiresReview` /
   `draftOnly` terms get an active approve/replace row. Existing-local-match
   bindings are trusted and shown **read-only** for context.
3. **Replace mechanism:** opens the **`/m` ontology resolver** (resolve spine,
   `useResolveOntology` / `apiClient.resolve`), falling back to free-text label;
   user picks a different term/entity.
4. **Accept gating:** **HARD-BLOCKED** until every minted/requiresReview term is
   explicitly approved or replaced. Each pending term shows a "needs decision"
   badge.

## Current state (traced)
- `PreviewActionBar` (deck) → `ProposedGraphModal(preview)`. `preview.ontologyBindings`
  (`DraftOntologyBinding[]`: curie, recordId, minted, via, label, lifecycleId,
  state, requiresReview, draftOnly) rides the preview but is only shown in the
  modal's raw-JSON dump. Accept calls
  `materializeAcceptedOntologyBindings(preview.ontologyBindings)` then
  `rewriteAcceptedOntologyRefs(events, materialized)` — all minted terms
  materialize implicitly in one act.
- `acceptedOntologyBindings.ts` `materializeAcceptedOntologyBindings(bindings, createRecord)`:
  for each `draftOnly` binding, mints a proposed `material` (`MAT-…`) carrying the
  CURIE as ontology `class[]`, 409-tolerant.
- Replace = pick a different CURIE → that binding should resolve to a different
  existing material OR mint `MAT-<different>` on accept. The rewrite already keys
  off `curie` → recordId, so swapping the binding's `curie` (and reusing the
  resolver's matched recordId/tier if it's a local record) flows through.

## Implementation

### ProposedGraphModal (review section)
- Add a "Review ontology terms" section above the events list. Compute:
  `decisionNeeded = ontologyBindings.filter(b => b.minted || b.requiresReview || b.draftOnly)`
  `readOnly = ontologyBindings.filter(b => !decisionNeeded)`
- Each decisionNeeded row:
  - The AI-chosen label + CURIE (+ a "needs decision" / "approved" / "replaced" badge).
  - Actions: **Approve** (keep this CURIE), **Replace…** (open resolver), and a
    per-term **Discard**? (decision: no discard per-term — a wrong pick = discard
    whole draft. So no per-term discard.)
  - When replacing: an inline resolver input (debounced `useResolveOntology`
    driven by `apiClient.resolve({ term, kinds:['material'] })`) that lists top
    candidates; selecting one sets `{ curie, recordId (if local / tier<=1), label }`.
    Also allow free-text label entry → treated as a mint of that label.
- Track decisions in local state keyed by curie: `'approved' | { replacedWith }`.
- **Not blocked / not required rows** stay read-only chips.
- Approve-all shortcut button (for the "approved" aggregate convenience) — optional.

### PreviewActionBar (gate + report)
- Pass `state.preview` + a callback so the modal's decisions are held in the bar.
  Add `const [termDecisions, setTermDecisions] = useState<Record<string, TermDecision>>({})`.
- On `handleAccept`: before materializing, check every decisionNeeded binding has
  a decision. If any pending → block Accept (show "N ontology terms need review"
  and open the modal, or disable Accept).
- Pass decisions into `materializeAcceptedOntologyBindings` so replaced curies
  flow: `materializeAcceptedOntologyBindings(bindings, createRecord, decisions)`.
  For approved → keep curie. For replaced → use the chosen curie/recordId/label.
- Enable the Accept gate: `const pendingDecisions = decisionNeeded.filter(b => !termDecisions[b.curie]); const acceptBlocked = pendingDecisions.length > 0`. Show the block + a "Review terms" prompt.

### acceptedOntologyBindings.ts (decision-aware materialize)
- Extend `materializeAcceptedOntologyBindings(bindings, createRecord?, decisions?)`.
  When a `replacedWith` decision exists, materialize/mint against that curie+label
  (dedup by the new curie), and let `rewriteAcceptedOntologyRefs` key off the new
  curie. Keep 409-tolerant dedup.
- Type `TermDecision = { status: 'approved' } | { status: 'replaced'; curie: string; label: string; recordId?: string }`.

### Tests
- `ProposedGraphModal.test.tsx`: renders review section; decisionNeeded rows show
  badge; approve marks row approved; replace opens resolver + picks candidate;
  read-only rows shown without actions.
- `PreviewActionBar.test.tsx`: Accept blocked when pending decisions remain;
  unblocked once all approved/replaced.
- `acceptedOntologyBindings.test.ts`: replaced curie mints/dedups under the new
  curie not the original.

### Verify
- `app tsc --noEmit` clean; `app vitest` for deck + ai dirs.
- Live-browser pass (SOUL rule): stage an AI draft with a minted term → modal
  shows review rows; Accept blocked → approve → Accept enabled → materializes.
## Verification results (2026-09-04)
- Tests: 28 pass across PreviewActionBar (5), ProposedGraphModal (5), acceptedOntologyBindings (5),
  StepLocalizationPane (13). App `tsc --noEmit` clean. `LabwareGlyph.test.tsx` fails in isolation
  (jsdom SVG rect render) — pre-existing, untouched by this change.
- Live-browser pass (Playwright 1.59 driving real Chromium, per SOUL rule):
  - Confirmed served code + all review CSS classes present; deck + AI panel mount with zero JS errors.
  - **Honest finding:** in the natural AI-chat flow, an ontology material (fenofibrate → CHEBI/MESH/NCIT)
    is resolved by the chat's material-clarification loop (the AI-propose→user-confirm compromise working
    at the chat layer) BEFORE the draft ghosts, so the ghosted preview's ontologyBindings are trusted/existing
    — NOT draftOnly. The review surface (which targets minted/requiresReview/draftOnly) therefore does not
    trip in the normal chat path; the chat clarify is the de-facto sign-off there.
  - The surface fires precisely when a build emits a draftOnly/minted binding straight onto the preview
    (hand-authored/oracle/step-localization draft), which the unit tests exercise directly.
- **Design note for Brad:** because the chat clarify already resolves most ontology identities up front, the
  review surface is somewhat redundant on the chat path but valuable for (a) builds that come pre-resolved or
  oracle-driven, (b) making the Accept-time materialize explicit, and (c) the "replace term with a different
  CURIE/local record" affordance which only existed at the chat clarify before, now available at the deck.
