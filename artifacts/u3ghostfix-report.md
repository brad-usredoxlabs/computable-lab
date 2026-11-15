# L2-P1-LABWARE-INSTANCE-RECORD-1 — unit u3ghostfix (cycle-2 fix of u2ghostgate)

Worktree: /home/brad/cl-wt/L2-P1-LABWARE-INSTANCE-RECORD-1-u2ghostgate-lane2
Branch: cl/lane2-instrec-u2ghostgate-0232 (base 0840632b4, prior HEAD 71ef8a194)
Disposition: adversarial review c1 FIX-FUNCTIONAL
  (.hermes/cl/lanes/2/reviews/L2-P1-LABWARE-INSTANCE-RECORD-1-u2ghostgate-advc-c1.md)

Decision (architect-context-l2 §2.7 identity is a record id / §2.16 recording not
gated on inventory): the ghost-gate removes r10 defect 4 without refusing
legitimate creates.

## Defect -> fix

D1 (pre-check tested creation key == deck key; production never emits that shape)
  `findUnplaceableLabware` no longer builds a `creatable` Set. It calls the
  mint's own `resolveLabwareDefinitionId` (now exported) with a PROJECTION of
  step 2: one `{key, kind:'labware', recordId: localRecordIdFor(...)}` per
  labware creation whose NAME `sameEntity`-matches the vessel's name — exactly
  the stamp `materializeAcceptedRecordCreations` performs. `sameEntity` is
  exported from acceptedRecordCreations (no second copy). Arms kept, unchanged:
  vessel recordId, LAB/LW-shaped deck key, creation-backed definition.
  Files: labwareInstanceMint.ts, acceptedRecordCreations.ts (export only).

D2 (minted.skipped was discarded; a failed definition CREATE still persisted the ghost)
  New step 2c in deckAdoption.adoptStagedPreview, immediately after the mint and
  BEFORE materializeAcceptedOntologyBindings/persistAcceptedEventGraph:
  `if (minted.skipped.length > 0) return refuseUnplaceableLabware(minted.skipped)`.
  Both refusal sites (1b pre-check, 2c mint) go through one helper, so the refusal
  shape cannot drift. The false "A skipped key is impossible here" comment is
  deleted and replaced with the reason it is possible. File: deckAdoption.ts.

D3 (ghost-gate refusal rendered the ontology sign-off sentence)
  `DeckAdoptionResult` refusals carry `reason?: 'ontology-signoff' |
  'unplaceable-labware'` plus `unplaceable?: string[]`; both sites set it.
  useAiChat's refusal branch (only that branch) words from it: an
  'unplaceable-labware' refusal names the deck keys, says they were placed
  without a resolvable labware definition record, that nothing was applied and
  the ghost stays on the deck; the sign-off wording is byte-identical.
  `reason` is optional in the type only so legacy refusal stubs (e.g.
  useAiChat.d1full.test.tsx's inline seam) stay assignable — no such stub is in
  the production path. Files: deckAdoption.ts, useAiChat.ts.

D4 (PreviewActionBar 7/11 red)
  Fixture `'plate-1'` now carries `recordId: 'LBW-PLATE-1'` (a resolvable
  definition record id) and the test stubs the network only
  (apiClient.createRecord/searchRecords) — the real mint runs, so the 11 pins
  still lock a legitimate accept (ordering, error path, double-click).
  File: PreviewActionBar.test.tsx.

D5 (ghostgate "resolvable" pins used deck key == creation handle)
  Rewritten on the production shape: deck key `lbw-proposed-*`, vessel
  `{ name, proposedRecord: true, recordId: undefined }`, creation
  `{ kind:'labware', name }` no handle. The module mock DELEGATES to the real
  materializer and runs the real mint; only the network and the persistence
  boundary are stubbed. Negative cases kept (no creation / other name / no
  recordId => refused, callOrder empty, nothing persisted); create-fails path
  = createRecord rejects for the name => refused at 2c with callOrder
  ['creations','definition'] and no persistAcceptedEventGraph call.
  File: deckAdoption.ghostgate.test.ts.

Files changed: 7 (6 in scope + deckAdoption.test.ts, one line — the sign-off
refusal literal must track the new `reason` field; a stale pin, not a weakened
gate). Diff: 3 commits, ~200 diff lines of which ~120 are code/comment.

## Pins for D1/D2 (producer shape, as required)
(a) "a proposed-creation accept still mints": `lbw-proposed-...96-well plate` +
    creation `{kind:'labware', name:'96-well plate'}` =>
    adopted:true, labwareCount 1, exactly ONE instanceId, persisted vessel
    recordId 'LBW-96-WELL-PLATE' and proposedRecord removed; callOrder
    ['creations','definition','instance','ontology-mint','rewrite','persist','commit'].
(b) "create fails": same shape, createRecord throws for '96-well plate' =>
    `{adopted:false, blocked:1, reason:'unplaceable-labware', unplaceable:[key]}`,
    callOrder ['creations','definition'], persistAcceptedEventGraph NOT called,
    commit not called.

## Verification (real output, on final commit 06ff22ebc)

  cd app && npx vitest run src/event-editor/deck/PreviewActionBar.test.tsx \
      src/event-editor/deck/deckAdoption.ghostgate.test.ts \
      src/event-editor/deck/deckAdoption.test.ts \
      src/event-editor/deck/labwareInstanceMint.test.ts
  ->  ✓ deckAdoption.ghostgate.test.ts (10 tests)
      ✓ labwareInstanceMint.test.ts (8 tests)
      ✓ deckAdoption.test.ts (4 tests)
      ✓ PreviewActionBar.test.tsx (11 tests)
      Test Files 4 passed (4) | Tests 33 passed (33)

  (baseline at HEAD 71ef8a194: PreviewActionBar 7/11 FAILED; the 3 deck files
   21/23 with the 2 known DeckSurfaceChat.ghost.test.tsx failures excluded.)

  npx tsc --noEmit -p .   -> 4 errors, all pre-existing:
      SchemaRecordForm.tsx x3 (TS2607/TS2786/TS7006), RefCombobox.ontologyref.test.tsx x1.
  Delta 0. (An earlier draft made `reason` required and added a 5th error in
  useAiChat.d1full.test.tsx; fixed by declaring the discriminant optional —
  both production sites still set it.)

  Wider sweep `npx vitest run src/event-editor/deck src/shared/hooks`:
  62 files, 291 passed / 16 failed in 8 files. Verified PRE-EXISTING by stashing
  the work and re-running those 8 files at 71ef8a194: identical 16 failed /
  8 files (server-vocabulary YAML + React Router invariant environment
  failures: DeckSurfaceChat.deckLayout.uifix1, DeckSurfaceChat.ghost,
  DeckSurfaceChat.threadScope, LabwareGlyph x2, LawnSurface x2,
  useAiChat.card1fix5 x2). Zero new failures.

## Not covered
AC4 (chat wording) is pinned by the discriminant + code, not by a new test: no
owned test file holds that branch (useAiChat.test files are out of scope; the
existing refusal-wording pins still pass unchanged). Flagged for the reviewer.

## Commits
  1a83bfa50  D1+D2: ONE resolution rule for the ghost-gate
  6f437d3cf  D3: word the ghost-gate refusal as one
  06ff22ebc  D4+D5: pins on the PRODUCTION shape

Remaining blockers: none. Owner of the next state: adversarial/browser review
(acceptance, not implementation, complete).
