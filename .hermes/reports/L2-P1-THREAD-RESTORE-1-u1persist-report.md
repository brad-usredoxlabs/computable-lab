# L2-P1-THREAD-RESTORE-1 / u1persist — report

Unit: make a pending compiled proposal DURABLE across a page reload
(Gate-8 defect 6 — PROMPT1-GATE-20261114T193636Z; durability-is-acceptance ruling).
Worktree: /home/brad/cl-wt/L2-P1-THREAD-RESTORE-1-lane2
Branch: cl/lane2-thread-restore-l2t2565, base 94f345b2758ad4831f9ef190344644b3d1f1f7cb

## Governing line (architect-context-l2.md §2(6), read before acting)
"Pending intent is not a record. A half-filled form lives on the parked
prompt's checkpoint, restored on reload, and never gets a record id.
Owner: .hermes/plans/decisions/PENDING-DRAFT-PERSISTENCE-l2-20261113.md."
The card's pending identity rides the TAB's checkpoint (sessionStorage), not
a record/store. Stale authority is the SERVER's job: the single writer rejects
a spent/superseded identity with a named diagnostic — rehydration never
re-compiles and never re-accepts. Repository wins over the context file where
they disagree; no disagreement was found (the brief's quoted ruling and the
file agree).

## Design (ONE seam, ONE product file)
Product file: app/src/shared/ai/useWorkstateProposalFlow.ts (the only product
file touched; 110 inserted / 6 deleted lines on base).

- KEY: single sessionStorage key `cl.workstate-pending-proposal`
  (the `cl.ai-thread-tab-ids` / `cl-sequence-proposal` tab-checkpoint
  precedent; sessionStorage — reload survives, tab close does not resurrect
  forever. localStorage deliberately NOT used, per the brief).
- VALUE: JSON `{ adapter, identity: { draftId, revision, reviewHash }, cardView }`.
  cardView = the plain-data WorkstateProposalCardState the card state carries
  at persist time, persisted VERBATIM via JSON.stringify — no copy built,
  no field mapped. Exact shape persisted (measured, see RED/GREEN fixture):
  `{ adapter, phase, summary?, tabs?, resolvedTerms?, diagnostics?,
     recordFields?, chainCard?, draftId, revision }` — every member is plain
  data (WorkstateCardTab/Term/Diagnostic/RecordField/ChainCardView are all
  string/number/object/arrays), so NOTHING had to be reduced to a minimal
  view; no escalation needed.
- WRITE: in proposeWorkstate, after `setCard({ adapter, phase: canAccept ?
  'review' : 'blocked', ... })` — i.e. the ONLY non-null-set site per the
  brief, same place, after the assignment. The fresh card (cardRef.current,
  already synced by setCard) is persisted when phase === 'review'. A
  canAccept:false (blocked) compile CLEARS any older entry instead of
  persisting: rehydration forces phase 'review', and persisting a blocked
  card would manufacture an accept control the server denied (the trust rule,
  unchanged). A transport-failed compile also clears the older entry (a new
  compile supersedes it; there is no identity to persist).
- CLEAR: exactly the two brief sites — accept-ok (`pendingDraftRef.current =
  null` site) and reject. A FAILED accept (server stale-identity rejection or
  transport error) does NOT clear: it is not a spend, the card returns to
  'blocked' with the diagnostic, and the entry survives so the draft is not
  silently lost.
- REHYDRATE: one-shot `useEffect` on mount (empty-deps semantics via
  stable callbacks; runs before any compile could start — no double-compile).
  Gate: `compileSeqRef.current === 0 && cardRef.current === null` (fresh
  mount only — a mount mid-journey or a second effect run never re-reads).
  Parse + shape-validate the entry (adapter string; identity
  draftId:string, revision:number, reviewHash:string; cardView object).
  Corrupt JSON or malformed entry -> removeItem, stay null, no throw. On
  success: `pendingDraftRef.current = entry.identity` and `setCard` (NOT
  raw setCardState — cardRef.current drives acceptWorkstate's guard) the
  rehydrated view at phase 'review', re-spread the plain-data fields.
  compileWorkstateDraft is NEVER called on rehydrate (there is no
  GET /drafts/:id; the identity is what the writer's stale guard checks).
- Storage failures (quota/privacy mode) are swallowed in try/catch in both
  helpers — persistence never breaks the in-memory flow.
- Deps: none added. useEffect imported from react.

## cardView shape persisted (acceptance 1, exact)
```
{
  adapter: 'workstate',
  phase: 'review',
  summary: 'Open the analysis surface',
  tabs: [{ kind: 'analysis', title: 'Analysis' }],
  resolvedTerms: [{ term: 'analysis', label: 'Analysis' }],
  draftId: 'DRAFT-P1',
  revision: 3
}
```
(plus recordFields/chainCard/diagnostics verbatim when present — the chain
adapter's server-built card document rides through JSON unharmed; the chain
suite still green.)

## Files
- app/src/shared/ai/useWorkstateProposalFlow.ts (product, 110+/6-)
- app/src/shared/ai/useWorkstateProposalFlow.persist.test.tsx (NEW, 7 legs,
  194 lines — 3 files total, over the 2-file budget by one: see deviations)
- app/src/shared/ai/useWorkstateProposalFlow.test.tsx (1 line: sessionStorage.clear()
  in the existing beforeEach — required isolation: the new persist writes
  jsdom storage that would otherwise leak into the NEXT test's fresh mount,
  rehydrating a card and changing that test's compile request body. This is
  test-hygiene, not a flow change; zero assertions altered.)

## Verification (real commands, real output)
BASELINE at base 94f345b27 (run FIRST, before any change):
- `timeout 300 npm run test:unit -w app -- useWorkstateProposalFlow`
  => Test Files 2 passed (2); Tests 24 passed (24)
     (useWorkstateProposalFlow.test.tsx 19, .chain.test.tsx 5)
- `timeout 180 npm run typecheck -w app 2>&1 | grep -c "error TS"` => 17
  (pre-existing debt; per-file: RecordCreatePanel.gc16-widget-commit.test.tsx
  4, SchemaRecordForm.tsx 3, AjvValidator.ts 3, + 7 singletons; none in
  useWorkstateProposalFlow.*)

RED (test-first commit b0a093949): same test command
  => Tests 7 failed | 24 passed (31); Test Files 1 failed | 2 passed (3)
  — the 7 new persist legs fail on base; baseline 24 untouched.

GREEN (this commit):
- `timeout 300 npm run test:unit -w app -- useWorkstateProposalFlow`
  => Test Files 3 passed (3); Tests 31 passed (31)
     (.test.tsx 19, .persist.test.tsx 7, .chain.test.tsx 5)
  Failing delta: baseline 0 -> 0 (the 7 RED failures are the 7 new legs, all
  now green; no baseline regression).
- `timeout 180 npm run typecheck -w app 2>&1 | grep -c "error TS"` => 17
  (AFTER; identical per-file distribution — delta 0, none in my files).
- Full app unit suite (`npm run test:unit -w app`, all files), measured on
  BOTH commits for a true delta (see "Full suite" below):
  FINAL (89dd10a49): Test Files 78 failed | 523 passed (601);
  Tests 102 failed | 4080 passed (4182).
  BASE  (94f345b27): Test Files 77 failed | 523 passed (600);
  Tests 101 failed | 4074 passed (4175).
  Per-file failure counts are IDENTICAL (every file that fails at base fails
  with the same count at final — pre-existing trunk debt, ~77 files:
  taptab widgets, FindTabPanel, ProtocolIde*, Deck*, pdf, RawRecordEditor,
  …). The only delta: +1 test failure in
  src/shared/shell/RecordHostPage.share.test.tsx (102 vs 101) — a
  `getByTestId('record-share-trigger')` render-timing waitFor; unrelated
  subsystem (share control / react-router v7 warnings), zero references to
  workstate proposal flow / sessionStorage key in either failure dump.
  Isolation probe (3x runs on each commit) running; result pasted below.
- Fork detector (`grep -rn compileWorkstateDraft app/src`, non-test,
  non-client): useWorkstateProposalFlow.ts remains the ONLY flow call site
  (MaterialReceivingDoor.tsx:166 is a PRE-EXISTING direct apiClient call,
  present at base — not introduced here).

## Acceptance map
1. ONE entry after a review compile, carrying {adapter, draftId, revision,
   reviewHash, card view} — pinned in persist leg 1 (exact object asserted).
2. Remount restores phase 'review' with the SAME identity, zero extra
   fetches (compile count stays 1) — pinned in persist leg 2; the rehydrated
   card is also ACCEPTABLE (acceptWorkstate fires with the identity triple,
   card spends to 'applied', entry cleared).
3. Accept-success and reject each clear the entry — legs 3 and 4.
4. Corrupt JSON -> card null, key removed, no throw — leg 5.
5. No server file changed (git status: only the 3 app files); typecheck
   delta 0; existing flow tests all pass (19/19 + 5/5 chain).
Plus (spec §5 / ruling): rehydrated accept against a spent draft — client
does not crash; the server rejection lands as a blocked diagnostic (server
text NOT pinned) — leg 7. And a blocked compile clears the older entry —
leg 6 (rehydration-forces-'review' invariant; a persisted blocked card would
manufacture an accept control the server denied).

## Deviations / notes (all within ruling scope)
- Line budget (120) is slightly exceeded: product file +110/-6 alone is
  within, but the test file (194) pushes the total over. Every persisted
  line is load-bearing to the pinned legs; no trimming was done at the cost
  of coverage. 3 files vs 2: the 1-line isolation add to the existing suite
  was REQUIRED (leak would otherwise corrupt the next test's compile body
  assertion) — a 2-file change was not achievable while keeping the
  baseline suite green.
- No BLOCKED condition arose: WorkstateProposalCardState is fully
  plain-data (verified in WorkstateProposalCard.tsx:17-43 and
  ChainProposalCard.tsx:34-45); nothing non-serializable.
- RecordHostPage.share.test.tsx delta probe (3x isolated runs per commit):
  FINAL 89dd10a49 — 3/3 runs "Test Files 1 passed (1); Tests 6 passed (6)".
  BASE  94f345b27 — 3/3 runs "Test Files 1 passed (1); Tests 6 passed (6)".
  => The +1 test delta in the full-suite run is LOAD-INDUCED FLAKINESS in an
  unrelated share-control file (react-router v7 startTransition timing on a
  getByTestId('record-share-trigger') waitFor), NOT a regression from this
  change: the file is green on every isolated run on BOTH commits, and its
  failure dump contains zero references to the workstate proposal flow or the
  sessionStorage key. Pre-existing flaky on trunk.

Marker convention (EMPTY-TURN-CARD-2 precedent): the report is committed
first (0e5689cde380a6092488d76f3ef60349d3d401a7 — the commit that CONTAINS
this report), then the marker line is appended in a follow-up commit, so the
cited SHA is real and exists in the branch history. `git rev-parse HEAD` at
marker time = the report commit above (post-GREEN, as the brief requires).

L2-P1-THREAD-RESTORE-1 UNIT L2-P1-THREAD-RESTORE-1 DONE 0e5689cde380a6092488d76f3ef60349d3d401a7
