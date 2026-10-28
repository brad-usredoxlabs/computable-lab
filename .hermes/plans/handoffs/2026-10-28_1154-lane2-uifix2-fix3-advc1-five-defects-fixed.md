# LANE2 HANDOFF — 2026-10-28 11:54 UTC (l2t1154) — L2-SUITE-A uifix2 FIX RUN 3 (advc1 defect fixes)

Branch: cl/lane2-suite-a-uifix1-lane2-l2t1755 | base 6d793b5a
Reviewer: cl-adversarial-reviewer (fix2b advc1, l2t0530) — VERDICT: fix — 5 defects.
All five fixed, RED-first, one commit per defect. No trunk merge; commits land
on the lane branch only.

## Commits (fix-run 3, in order)

- bd827a79 [L2SUITEA-uifix2-fix3][ADVC1] (MAJOR) — the deck-layout text
  resolver (server/src/ai/deckLayoutResolution.ts) never GUESSES: bench/
  plate/deck are no longer stop words (a word that appears in a declared
  title is a NAME word), a word shared by several declared variants is not
  distinctive and never scores, and a TIE for the best score resolves to
  null (the wall) — never "first declared wins". "open the Manual Bench"
  now resolves to manual_freeform (the declared title it names) instead of
  silently mounting manual_collapsed; "switch to the manual deck" (shared
  token only) gets the wall. P1 ("Navigate to the freeform manual deck")
  still mounts manual_freeform. NEW pure pin
  server/src/ai/deckLayoutResolution.test.ts (9 tests, real YAML, source
  asserted 'yaml', synthetic tie registry for the tie rule).
- 858e9cc5 [L2SUITEA-uifix2-fix3][ADVC2] (MINOR) — the D1 acceptance test
  (AgentOrchestrator.deckLayoutResolution.test.ts) now reads the REAL
  config/platforms YAML: REPO_ROOT was server/ ('..','..'), so
  loadPlatformRegistry silently fell back to DEFAULT_PLATFORM_MANIFESTS;
  REPO_ROOT is the repo root (three levels up) and beforeAll asserts
  source === 'yaml'. Proven: with manual.yaml renamed away the suite now
  FAILS (previously 8/8 green).
- a642af37 [L2SUITEA-uifix2-fix3][ADVC3] (MINOR) — the placed-vessel
  attribution fallback (eventWellIndex) fires ONLY on "no offer binding",
  never on "multiple offer bindings": the per-batch binding is TRI-STATE
  (absent = no offer → fallback allowed; a recordId = single offer; an
  explicit ambiguous marker — OFFER_BINDING_AMBIGUOUS symbol in
  committedOfferByEvent or the committedOfferAmbiguousByEvent state set —
  = multiple offers → fallback FORBIDDEN). The marker is captured per-event
  at commit_preview from the batch's own resolvedLabwares
  (committedOfferCapturesForPreview). The reviewer's probe shape (committed
  {e1:null} + placements ['PLATE-1']) now attributes to NOTHING; staged
  multi-offer batches do too; the D2 single-placed-vessel arm and
  explicit-ref events are unaffected. 4 new RED-first legs in
  eventWellIndex.uifix2.fix2.test.ts.
- b7266ade [L2SUITEA-uifix2-fix3][ADVC4] (MINOR) — the visible mint row
  (ClarificationPicker) honors the "rows empty" precondition:
  showMintRow also requires (request.options?.length ?? 0) === 0. The
  reviewer's probe (allowCreateLocal + seeded query + TWO options) renders
  NO mint row; the gate DMSO shape (rows: []) still does. New pin in
  ClarificationPicker.test.tsx; the test's resolver mock also gained the
  mintLocalTermLabel export the product reads since D5 (without it the
  render throws).

## ADVC5 (report accuracy, no code)

The fix2b report's evidence was corrected IN PLACE (correction note
appended, history untouched) in the deliverable
/home/brad/.hermes/cl/lanes/2/deliverables/L2-SUITE-A-uifix2-fix2b-report.l2t0530.md:
- app typecheck: measured 20 error lines base / 20 head (identical sets),
  NOT 21/21 as the report stated. Re-measured this run: 20 head, set
  IDENTICAL to the pre-fix3 measurement (zero new, zero gone).
- ChatPreviewCard.mixedetails.uifix2: 3 tests, not 4.
The zero-new-typecheck conclusion holds; the counts were off by one.

## Gate (measured, this run)

- app pins (cwd app): eventWellIndex.uifix2.a (8) + .fix2 (11, was 7) +
  ClarificationPicker.test (17, was 16) + ClarificationPicker.mintrow
  (7) + resolvers.dedupe (4) + ChatPreviewCard.mixedetails (3) +
  useAiChat.navuifix2 (3) + useAiChat.externalcommit.fix2 (5) +
  DeckStage.twoplate.fix2 (1) = 9 files, 59 tests, ALL GREEN.
- server (cwd server): deckLayoutResolution.test (9) +
  AgentOrchestrator.deckLayoutResolution.test (8) +
  platform-registry/defaultManifests (3) = 20/20 GREEN.
- typecheck: app `npm run typecheck` 20 error lines head vs 20 at pre-fix3
  head — sorted sets IDENTICAL (zero new); server `npm run typecheck`
  0 errors.

## For the orchestrator

- Acceptance is pending: the orchestrator dispatches cl-browser-reviewer;
  screenshots/trail are the evidence. The D1 change alters WHICH prompts
  mount vs wall (never-guess) — the P1 sentence still mounts
  manual_freeform; ambiguous phrasings now get the plain-language wall
  (actionable: it offers the declared titles).
- The lane stack (:5193/:3093) still needs the D3 YAML restart (unchanged
  from fix2b; tsx --watch does not reload YAML).
- Worktree hygiene: app/node_modules + server/node_modules + root
  node_modules are SYMLINKS to the trunk tree's node_modules (the worktree
  dirs were hollow; vitest runs need them). They are git-ignored; remove
  before any worktree removal.
