# THREAD-ASK-1 — DRAFT SPEC (composer l2t1350, 2026-10-13 ~14:00 EDT)

Status: DRAFT for orchestrator review — not dispatchable until promoted.
Drafted at trunk cl/integration-2 tip 99b057f8 (measured/anchored there; DECK-FOLD-1 is
LIVE right now editing the SAME primary file — see Sequencing).

## Goal (one sentence)

Make the localization thread's held 422 bar ANSWERABLE where it is shown: the thread
renders held clarifications as cards with the product's existing answer surface
(ClarificationPicker: search + mint a local term), and compile-from-prompt gains a
DATA-side clarification-answer binding consumed before resolve_nouns by the spine's
tier-1 — no imperative policy, no deck-gate move.

## Authoritative decision — VERDICT (ii), quoted verbatim

From `.hermes/plans/decisions/W2-11-d4-unknown-noun-resolution-decision.md`
(architect, 2026-10-13; trunk at decision time 79ffa518):

> ## (ii) THREAD-ASK-1 as its own spec'd product task: the thread renders held
> ##     clarifications with the answer surface (picker + mint) and the server gains
> ##     a data-side answer->slot binding on compile-from-prompt. Fact 4 is a real
> ##     product gap; D4 does NOT wait for it.

And its Product-task section, verbatim:

> Scope: make the bar answerable WHERE IT IS SHOWN.
> - Server: extend the compile-from-prompt answered-request with a DATA-side
>   clarification-answer binding (e.g. answers entries carrying the clarification
>   label + chosen recordId/mint id), consumed BEFORE resolve_nouns via the same
>   spine tier-1 that already binds minted records (fact 8 proves the store side
>   needs nothing). No imperative policy: the binding is pass-through of the
>   scientist's stated answer; the spine remains the only binder.
> - Client: ProtocolLocalizationThread's foldHeldBundle renders held clarifications
>   as answerable cards with ClarificationPicker + the mint affordance; answering
>   re-sends via the existing compile round-trip. File boundary:
>   ProtocolLocalizationThread.tsx (fold :294-308 + render region) and
>   IntentCompileFromPromptHandlers.ts.
> - OPEN QUESTION for Brad inside the spec (do not silently decide): mint is
>   MATERIAL-ONLY today (VocabHandlers MINTABLE :44-48 'material' only;
>   ClarificationPicker canMint excludes labware/equipment layers,
>   ClarificationPicker.tsx :255-262). The D4 nouns are labware-semantic objects
>   and minting them as materials works but is a LAYER SHORTCUT — whether
>   /vocab/mint gains a labware draft floor is a domain-policy call (materials
>   provenance hierarchy), not an implementation detail.
> - Sequencing vs DECK-FOLD-1: independent surfaces of the SAME file
>   (ProtocolLocalizationThread.tsx) — DECK-FOLD-1 touches
>   deriveDeckLabware/ghostEvents/deck-render; THREAD-ASK-1 touches fold + a new
>   clarification region + the server handler. Neither blocks the other; order by
>   lane throughput. Whichever lands second must rebase on the first's merge.
>   THREAD-ASK-1 additionally owns the sole overlap risk: it must not move
>   foldHeldBundle's holdForReview call (:307) out from under the deck gate.

## Why

The scientist sees the bar where it cannot be answered (decision fact 4): foldHeldBundle
collapses every held clarification into ONE infoMsg string `label (reason); label
(reason)`. The answer surface (ClarificationPicker) is consumed only by ProtocolIdeShell
and QuestionsPanel. Propose-never-write means the scientist must be able to resolve what
the spine bars, where the bar is shown.

## Scope — two legs

### Leg 1 (server): data-side clarification-answer binding

File: `server/src/api/handlers/IntentCompileFromPromptHandlers.ts`.

Today the answered-request body is `{ protocolText?, sourceProtocolId?, answers?:
Record<string,string> }` and `composeAnsweredPrompt` iterates the answers entries
VERBATIM into a settled-choices block:

```ts
function composeAnsweredPrompt(protocolText: string, answers: Record<string, string>): string {
  const entries = Object.entries(answers);
  ...
    ...entries.map(([axisId, value]) => `- ${axisId} = ${value}`),
```

Extend the answered-request so a clarification answer — the clarification's label plus the
scientist's chosen recordId (a minted MAT- id or a picked record) — rides to the compile
as DATA. The design constraint (from the decision, binding): the binding is PASS-THROUGH
of the scientist's stated answer; the spine remains the ONLY binder; consumption is the
existing tier-1 records path (the spine's tier-1 local provider picks up a minted record
on the next search with no extra plumbing — VocabHandlers header, decision fact 8: after
minting, "the spine's tier-1 local tier BINDS them"). Zero domain literals, zero reason-
code switches, zero verb/class branches in the handler. The 422 envelope, the ask gate,
the OQ4(a) hold, and the SPINE-5 response contract stay byte-unchanged (the file header
spells the contract; classification is ORIGIN-based).

Mechanism choice (shape detail the coder may refine, boundaries are what bind): the
existing `Record<string, string>` answers map already rides verbatim into the prompt;
a clarification answer can therefore ride as an answers entry whose key is the
clarification identity and whose value carries the chosen label/recordId mention (the
same `[[material:MAT-...|label]]` mention idiom ClarificationPicker's
`answerFromMention` produces). Do NOT add a TS branch that intercepts a label and
injects a binding ahead of the spine — that is the imperative-policy failure mode this
item exists to avoid.

### Leg 2 (client): answerable cards on the held bar

File: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx`
(foldHeldBundle region + a new clarification render region).

foldHeldBundle today (verified at 99b057f8 — quoted, line numbers may drift):

```ts
  const foldHeldBundle = useCallback((held: {
    clarifications: Array<Record<string, unknown>>
    ...
  }) => {
    setNeedsAnswers(false)
    setLocalMacro(held.localMacro as LocalMacro)
    const facts = held.clarifications
      .map((c) => `${String(c.label ?? 'unnamed fact')} (${String(c.reason ?? 'unresolved')})`)
      .join('; ')
    setInfoMsg(facts
      ? `Compiled — unresolved facts to review before accepting: ${facts}`
      : 'Compiled — review the deck & labware, then place them.')
    holdForReview(held.terminalArtifacts)
  }, [holdForReview])
```

Keep holding the macro and calling `holdForReview(held.terminalArtifacts)` EXACTLY as
now (HARD CONSTRAINT — see Out of scope). ADD state holding the structured
clarifications and render an answerable card per clarification, reusing
`ClarificationPicker` (`app/src/event-editor/right-pane/ai/ClarificationPicker.tsx`,
props `{ request: AiClarificationRequest; onPick: (answer: AiClarificationAnswer,
request: AiClarificationRequest) => void }`). On pick, record the answer and RE-SEND via
the existing `apiClient.intentCompileFromPrompt` round-trip (the same call
`handleSubmitAnswers` / `handleSendCorrection` use — do not invent a new endpoint or a
new fetch path).

SHAPE GAP THE CODER MUST BRIDGE (verified, the spec's core design point): the held 422
clarifications are `ScientistIntentUnresolvedFact[]`
(`server/src/compiler/scientistIntent/types.ts`:115-120 —
`{ label, reason, candidates?: [{label, confidence?}], actionLocation? }`) while the
picker consumes `AiClarificationRequest` (`app/src/types/ai.ts`:212-230 — needs
`id`, `kind`, `prompt`, `menuProvider`, `options`, ...). There is NO adapter today.
Write ONE explicit adapter (fact -> request) in the thread (or beside it), mapping:
label -> query/prompt, reason + `Create local term` candidates -> options, unknown-noun
-> the menu provider that actually carries a mint floor. The existing consumers are your
pattern:
- `app/src/event-editor/right-pane/ai/QuestionsPanel.tsx` (decision cited :112 —
  verified): `requestHasPicker(request) ? <ClarificationPicker key={request.id}
  request={request} onPick={(ans) => onAnswer(request.id, ans)} /> : <ParameterAnswerInput ...>`
- `app/src/protocol-ide/ProtocolIdeShell.tsx` (decision cited "ProtocolIdeShell.tsx:521"
  — PATH CORRECTION: the file lives in `app/src/protocol-ide/`, not right-pane/ai;
  verified picker call site `hasInlinePicker(request) ? <ClarificationPicker
  request={request} onPick={record} />`)
Mint flow to reuse verbatim: `ClarificationPicker.command` awaits
`item.resolveMention` -> `resolveMaterial` pushes the `mint:<q>` suggestion whose
`resolveMention` calls `apiClient.mintLocalTerm('material', q, q)`
(`app/src/shared/taptab/slashMenu/resolvers.ts`:69-90) -> `groundedAnswerFromMention`
-> `AiClarificationAnswer` with `ref: { kind:'record', id: MAT-..., ... }`.

## Explicitly OUT of scope

- NO move/removal/conditioning of `foldHeldBundle`'s `holdForReview(held.terminalArtifacts)`
  call (decision: HARD CONSTRAINT; currently the fold's last statement, cited :307 at
  79ffa518, verified still the fold's last statement at 99b057f8). The 422-fold stays
  under the deck gate; nothing may reach the canvas that skips `holdForReview`.
- NO DECK-FOLD-1 surface: `deriveDeckLabware`, ghostEvents, deck-render,
  `resolvedLabwares` propagation, `CompileContracts.ts`, `compileScientistIntent.ts`,
  `DeckLabwareSuggestion` — all DECK-FOLD-1's (live coder, same file, different region).
- NO decision on whether `/vocab/mint` gains a labware draft floor — Brad's OQ (below).
  Coder implements the material-only floor that exists TODAY.
- NO change to `VocabHandlers.ts` (incl. the MINTABLE map), `routes.ts`, the SPINE-5
  response contract interfaces, `resolveNounsPass.ts` / `resolutionEngine.ts` / spine
  internals (decision fact 8: "the store side needs nothing"), the apiClient
  `intentCompileFromPrompt` discriminated-union 422 handling, or the e2e/orch harness
  (orch-owned).
- NO touch to the pre-existing app tsc error
  `ProtocolLocalizationThread.tsx(193,35): error TS2339: Property 'runDeckLock' does
  not exist on type 'EventEditorState'` — do not fix, do not suppress.
- `answers` axis semantics (branch-axis axisId -> value) stay byte-unchanged; the
  clarification answer rides ADDITIVELY.

## File boundary (IN scope)

- `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (fold region
  + new clarification-card render region + its state)
- `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` (answered-request binding)
- Riding tests: `ProtocolLocalizationThread.*.test.tsx` (new file for this leg),
  `IntentCompileFromPromptHandlers.*.test.ts` (new targeted file)
- Only if genuinely required, minimal: the thread's CSS and an explicit adapter module
  beside the thread. Anything else out.

## Acceptance criteria (verbatim from THE LIST, verified by)

> RED-first: unit — a held 422 renders answerable cards; answering with a minted
> recordId re-sends and the compile binds tier-1 (no unknown-noun for that
> label); the deck-gate holdForReview path byte-unchanged. Server — the
> clarification-answer binding is data-only (no domain literals). PLUS
> cl-browser-reviewer receipts against :5193 (new surface).

## First targeted check (prove the approach early, before writing UI)

The whole design stands on decision fact 8 re-measured at 99b057f8: a minted label is
bound by tier-1 so the SAME label no longer bars. Prove it in one command — mint a
throwaway label via the live lane backend and run an answered compile that carries it,
then assert the label is absent from the unknown-noun clarifications:

```
curl -s -X POST localhost:3093/api/vocab/mint -H 'content-type: application/json' \
  -d '{"refKind":"material","label":"Threadask Probe Gadget"}'   # expect success + MAT- id
```

then a supertest/vitest against the real handler (no stack mutation): body
`{protocolText: "...add Threadask Probe Gadget...", answers:{<key>:"<value carrying MAT- id>"}}`
-> expect 200 (or a bar WITHOUT reason 'unknown-noun' for that label). If that check
fails, STOP and hand back: the spine, not the UI, is the defect.

## RED-first test plan

Unit (app, vitest — new `ProtocolLocalizationThread.clarificationCards.test.tsx`):
1. A held 422 (mock `apiClient.intentCompileFromPrompt` resolving the `{held:true,
   clarifications:[{label:'BashingBead Lysis Module', reason:'unknown-noun', candidates:[...]}],
   localMacro, terminalArtifacts}` union arm) renders an answerable card per
   clarification (picker present per `requestHasPicker`; the label is visible).
2. Picking a minted answer (mock `mintLocalTerm`) RE-SENDS compile-from-prompt with the
   answer riding as data in the request body (assert the captured body carries the
   clarification label + the MAT- recordId) — the existing round-trip, no new endpoint.
3. `holdForReview` path byte-unchanged: with the card render added, the held fold still
   ends in `holdForReview(held.terminalArtifacts)` — pin via the same observable
   side-effects the existing `ProtocolLocalizationThread.heldBundle.test.tsx` pins
   (pendingDraft/derived deck labware), and pin that a card pick does NOT bypass the
   gate (the re-send's held result re-folds through the same path).
4. The existing infoMsg honesty text stays for reasons with no answer surface (fallback,
   no picker-less card).

Unit (server, vitest — new `IntentCompileFromPromptHandlers.clarificationAnswers.test.ts`):
5. An answered request carrying a clarification-answer entry produces a compile prompt
   that includes the scientist's stated label + recordId VERBATIM (spy the driver prompt
   like `IntentCompileFromPromptHandlers.answeredPrompt.test.ts` does today).
6. Data-only proof: the binding test passes with an INJECTED spine stub and asserts the
   handler emits no branch on reason/label (adversarial grep: no new string literals
   resembling domain names/reason codes in the handler diff); the spine stub receives
   the same label, i.e. the spine remains the binder.
7. Regression: all three existing IntentCompileFromPrompt test files green; the 422
   envelope and zero-artifact bar byte-unchanged.
8. End-to-end spine leg (mirrors the first targeted check): minted MAT- + answered
   re-send -> tier-1 binds; no unknown-noun for that label (real store via existing
   test-store conventions, live :3093 optional in handoff only).

Server tsc / app tsc / targeted suites per the verification commands below.

## Verification commands (REAL baselines measured at trunk 99b057f8, this session)

```
# server targeted (IntentCompileFromPrompt handlers): expect 3 files / 19 tests PASSED
cd server && npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts \
  src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts \
  src/api/handlers/IntentCompileFromPromptHandlers.test.ts
# spine tier-1 leg files: expect 2 files / 33 tests PASSED
cd server && npx vitest run src/compiler/resolution/resolveNounsPass.test.ts src/compiler/resolution/nounResolution.test.ts

# thread's existing test files: expect 3 files / 16 tests PASSED
cd app && npx vitest run src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx \
  src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx \
  src/event-editor/right-pane/protocol/ProtocolLocalizationThread.familyAxes.test.tsx

# pattern-consumer files (picker wiring must stay green): expect 3 files / 18 tests PASSED
cd app && npx vitest run src/event-editor/right-pane/ai/ClarificationPicker.test.tsx \
  src/shared/api/client.intentCompileHeld.test.ts src/protocol-ide/ProtocolIdeShell.clarifications.test.tsx

# typecheck: server 0; app EXACTLY 23 error lines incl. the pre-existing runDeckLock TS2339
npx tsc --noEmit -p server    # -> 0 (verified)
npx tsc --noEmit -p app 2>&1 | grep -c "error TS"   # -> 23 (verified)
```

Measured baselines at 99b057f8 (report these numbers in the handoff; zero NEW failures
and zero NEW tsc lines is the bar):
- app tsc: 23 error lines, INCLUDING
  `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx(193,35):
  error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'`
  — PRE-EXISTING, do not fix.
- server tsc: 0 error lines.
- thread test files: 3 files / 16 tests green.
- server IntentCompileFromPrompt files: 3 files / 19 tests green.
- Vocab handlers: NO dedicated test file exists today (grep-verified: no `*.test.ts`
  references `mintTerm`/`/vocab/mint`); nearest regression = route-level behavior via
  the above + mint probe. If the coder adds a VocabHandlers test, it is a new file,
  not a baseline.
- Known baseline noise: `ClarificationPicker.test.tsx` run can print ONE unhandled
  `TypeError: Cannot read properties of undefined (reading 'then')` while all 18 tests
  pass (observed at baseline, pre-existing; do not chase).

## Browser gate

New surface -> cl-browser-reviewer receipts against :5193 AFTER merge (orchestrator-
arranged; coder never runs/restarts the lane stack). Criteria: a held 422 on the
localization thread shows per-fact cards; searching + minting a local term answers it;
the re-send either completes (deck review appears under the same gate) or re-bars with
that fact GONE from the bar; screenshots mandatory.

## Worker contract

- Worktree `wt/THREAD-ASK-1-lane2-<tickid>` off trunk `cl/integration-2` HEAD AT
  DISPATCH TIME; branch = worktree name. Deliverable report (unique path, orchestrator
  promotes): `.hermes/plans/THREAD-ASK-1-report.wip-<tickid>.md`.
- SEQUENCING (DECK-FOLD-1 IS LIVE RIGHT NOW in `ProtocolLocalizationThread.tsx`, region
  resolvedLabwares/propagation — a different region from this item's fold + clarification
  cards). Branch off the THEN-CURRENT trunk; do NOT assume 99b057f8's line numbers —
  re-anchor EVERY cite in this spec by quoted code (the quoted blocks above are the
  anchors; line numbers are hints only). Merge order: whoever lands second rebases.
- Every git command with `-c core.fileMode=false` (NFS mount). READ-ONLY outside the
  worktree. `git -c core.fileMode=false diff --stat` vs trunk goes in the report.
- All fixture records are TEST DATA; minted MAT- proposals from probing are test data.

## Reviewer-bait (pre-empt these; the adversarial review will hunt them)

1. exactOptionalPropertyTypes ON (server + app): every optional field on the new
   request/response/adapter types must be ABSENT-or-value — build the object, then
   `...(v !== undefined ? { k: v } : {})` (the handler file's own apiKey idiom,
   `shorthandCorpus.ts:68-70` doctrine); NEVER `k: undefined`. Assert absence via
   `Object.keys(...)` not toEqual-with-undefined.
2. Two clarification shapes, ONE adapter, NO renaming: `ScientistIntentUnresolvedFact`
   (server, `{label, reason, candidates?, actionLocation?}`) vs `AiClarificationRequest`
   (app picker prop). Do not "unify" them, do not fork a third clarification type, do
   not rename either. The adapter lives client-side and invents nothing.
3. Deck-gate byte-diff target: the review will diff foldHeldBundle. `holdForReview(
   held.terminalArtifacts)` must remain the fold's LAST statement, unconditional, with
   the SAME argument; the new card state is set BEFORE it, never after it conditionally.
   A pick that re-sends must route its held result back through foldHeldBundle, not
   straight to the canvas.
4. Hardcode boundary: no domain literals (labels, 'unknown-noun' switches, 'material'
   branches) in `IntentCompileFromPromptHandlers.ts` — the binding iterates request DATA
   exactly like composeAnsweredPrompt does today. A TS `if (reason === 'unknown-noun')`
   server-side = rejection. (Client-side mapping of reason->menu is presentation and
   belongs in the client adapter, still as a DATA table, not scattered branches.)
5. The mint-floor trap / OQ boundary: `ClarificationPicker`'s `canMint` and
   `resolveLabware` have NO mint floor (material-only, by today's policy). Do NOT add
   labware minting to "make the cards work" — that is Brad's OQ (below). If an
   unknown-noun fact needs a mintable menu under material-only policy, the adapter maps
   it to the menu that HAS the floor TODAY (the /m material menu — decision fact 8
   proves minted MAT- binds tier-1 regardless of the noun's labware semantics).
6. YAML-reload trap: N/A unless you touch YAML — and you should not; if you do,
   per-call `import.meta.url` load only (shorthandDrafting.ts idiom), never a
   module-level cache.
7. Client union discipline: `apiClient.intentCompileFromPrompt` returns a discriminated
   union (`held: true` arm vs the 2xx arm). Narrow with `'held' in res && res.held ===
   true` exactly as the thread's three call sites do; do not widen the apiClient types
   or the held-422 recovery in client.ts.
8. Byte-stability of what you don't own: the ask-vs-answer gate, needsAnswers flow,
   familyAxes fold, corrections fold, QuestionsPanel + ProtocolIdeShell picker behavior,
   the 422 envelope keys, and every existing test's testids. Additive rendering only.

## OPEN QUESTION FOR BRAD (unresolved — do not silently decide; spec carries it as open)

`/vocab/mint` is MATERIAL-ONLY today — VocabHandlers `MINTABLE` declares exactly one
entry, `material:` (`const MINTABLE: Record<string, {schemaId; idPrefix; build}> = {
material: { ... idPrefix: 'MAT', ... } }`, verified at 99b057f8), and
`ClarificationPicker`'s `canMint = !request.materialLayer || request.materialLayer ===
'material'` keeps labware/equipment menus mint-free. The unknown-noun facts this item
makes answerable (e.g. "BashingBead Lysis Module") are LABWARE-SEMANTIC objects. Brad
must choose; this spec implements NEITHER extension on its own authority:

- Option A (what this spec assumes, = status quo, zero VocabHandlers change): mint
  stays material-only; the thread's unknown-noun answers mint as MATERIAL drafts.
  Consequence: tier-1 binds the LABEL for resolve_nouns (decision fact 8 measured:
  unknown-noun set shrinks 3->1->0 per cycle), the noun clears, and the object still
  lands on the zero-match labwareAdditions arm at deck time — the layer shortcut the
  decision names. Ships THREAD-ASK-1 fully; the provenance hierarchy keeps materials
  as the only mintable layer.
- Option B (deferred behind Brad): `/vocab/mint` gains a `labware` entry in MINTABLE
  (draft labware record, LAB- prefix) and the picker/menu floors follow. What it
  changes: the answered noun could resolve as real labware (resolve_labware matches ->
  resolvedLabwares/placements instead of the additions arm) — which INTERACTS with
  DECK-FOLD-1's placement offers and with the W2-11 trap-warning guard; it is a
  materials-provenance-hierarchy domain-policy call, not an implementation detail.
  Not in this item's file boundary either way.

Coder default under an unanswered OQ: Option A, plus a one-line comment at the client
adapter's menu-mapping site naming this OQ — never a silent labware mint.

## Open questions I could not resolve locally (composer)

1. Card lifecycle after a SUCCESSFUL re-send: should answered cards stay visible
   (audit trail) or collapse into the honest infoMsg line the 2xx branch shows? Checked:
   QuestionsPanel collapses on submit, the thread's needsAnswers axes persist. Coder may
   pick either; both satisfy "re-sends via the existing compile round-trip".
2. Whether ambiguity bars (reason 'ambiguous-noun' with candidates) should render the
   same cards (candidates as option buttons, like ProtocolIdeShell does) or stay
   infoMsg-only. Checked: the picker renders options today and the decision only pins
   the unknown-noun mint arm; gate run-9 evidence shows ambiguous churn is real. Spec
   allows rendering ALL held clarifications as cards (facts without a picker fall back
   to text) — Brad/orch can narrow if desired.
3. No further question; everything else in this spec was verified first-hand at
   99b057f8 (foldHeldBundle + holdForReview position, ClarificationPicker props and
   both consumers with the ProtocolIdeShell PATH CORRECTION, composeAnsweredPrompt +
   answers body shape, resolve_nouns pass location (server/src/compiler/resolution/,
   wired via compileScientistIntent.ts deps), MINTABLE material-only, mint route at
   routes.ts:497, all baseline numbers re-run this session).
