# DECK-FOLD-1 SPEC (draft l2t0330) — Deck review must surface resolved inventory as placement offers — fold resolvedLabwares

Item: DECK-FOLD-1 (lane-2 task list, status todo, deps none).
Architect ruling: .hermes/plans/decisions/W2-11-d4-deckreview-empty-decision.md (VERDICT (c), stage (b)). md5-prefix 3c366dee.
BASE: trunk cl/integration-2 @ 79ffa518799905d9c752525216437d3a5373ceb3 (79ffa518) — every file:line below was RE-VERIFIED first-hand at this HEAD by the composer (the decision doc's refs were anchored at a28d9789; the code lines cited below have NOT moved — only docs/harness commits landed since). MANDATORY: `git -c core.fileMode=false` on every git command (NFS mount).

## Goal (one sentence)

When a localized macro's labware hints resolve against REAL inventory, the compile's terminalArtifacts carry those bindings as `resolvedLabwares`, the deck review lists them as checkable PLACEMENT offers of the EXISTING records (never re-authoring them), and picking one ghosts a real placement so the Brad-pinned accept gate (>=1 placement) can open on the chat path.

## Acceptance criteria (VERBATIM from the task list, `verified by:`)

  RED-first: a fully-resolved macro yields >=1 deck-review placement offer and accept
  enables after picking (unit + Playwright receipts against :5193); zero-match legs
  unchanged; existing W2-8/W2-11 legs keep passing WITHOUT removing the trap-warning
  guard; cap/rank bound pinned by a fixture with a broad inventory.

(Playwright receipts against :5193 are the post-merge cl-browser-reviewer gate — NOT the coder's run; the coder delivers the unit half RED-first. The trap-warning guard lives as a comment + intent-UNmatched fixtures inside the orch-owned harness; the coder must not touch that file at all — see OUT of scope.)

## The verified chain (first-hand at 79ffa518)

Server, producer side:
- `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts`
  - `ResolvedLabware` (the pass output type, EXACT shape to reuse): `:1521-1525` — `{ hint: string; recordId: string; title?: string }`.
  - `LabwareResolveOutput = { labwareAdditions: AiLabwareAdditionPatch[]; resolvedLabwares: ResolvedLabware[] }`: `:1530-1533`.
  - Pass arms (verified unchanged from the decision doc): zero-match -> addition `:1652-1658`; one-match -> `resolvedLabwares.push({hint, recordId: matches[0]!.recordId, title: matches[0]!.title})` `:1659-1661` (+ addition ONLY when `cand.deckSlot` `:1664-1670`); multi-match -> top pick `:1671-1691`; authoritative SPINE-4 arm -> `resolvedLabwares.push` with conditional-spread title `:1631-1648` (+ addition only with deckSlot `:1640-1646`); mention-fold arm `:1609-1616`. On the scientist-intent shorthand path candidates NEVER carry a deckSlot (normalizeScientistIntent.ts:324-333 builds labwareInstances from symbolic labels only; ProtocolIntentLowering.ts:195-223 maps deckSlot from labware.deckSlot — absent there). Addition emits are ZERO-MATCH-ONLY on this path. Decision-doc claim confirmed.
- `server/src/compiler/pipeline/CompileContracts.ts` — `TerminalArtifacts.labwareAdditions?: Array<{recordId; reason?; deckSlot?}>` `:341-345`; `labwareRequirements?: Array<{classCurie; deckSlot?; constraints?}>` `:350-354`; NO `resolvedLabwares` field (confirmed absent; note the DISTINGUISHED existing fields `resolvedRefs` `:310` and `resolvedLabwareRefs` `:312` — prior-lab-state/registry refs, a DIFFERENT entity; do not reuse them).
- `server/src/compiler/scientistIntent/compileScientistIntent.ts` — `resolveLabwareOutput` already reads `resolvedLabwares` off the pass slot `:276-279` (data in hand, confirmed); `labwareAdditions` propagates via non-empty conditional spread `:292-294`; `resolvedLabwares` is then NEVER propagated (confirmed). The 422 needs-clarification branch's artifacts are `{events:[], directives:[], gaps, protocolIntent?}` `:255-260` — decision fact 5 confirmed; it must STAY that way (goldens pin key absence).
- Wire: the whole `compile.terminalArtifacts` is returned verbatim by `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` (`:323`, `:344`) and typed `Record<string, unknown>` client-side (app/src/shared/api/client.ts:3991+), so no DTO layer blocks the new key.
- Cap-config precedent (verified surfaces): `config/drafting/` YAMLs loaded PER CALL, never process-cached — `server/src/ai/shorthandDrafting.ts` (path via `import.meta.url` `:18`, absent-file => null, malformed => throw), and the EXISTING positive-integer cap precedent `grounding.maxPerKind` (`config/drafting/analysis-composition.yaml:34` value 6; validation `server/src/ai/analysisReferenceGrounding.ts:84-85` "must be a positive integer"). There is NO existing deck-limit config surface (grep-verified: config/drafting has no deck caps; platforms carry geometry, not offer limits).

App, consumer side (`app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` — lives under `protocol/`, NOT right-pane/ directly):
- `DeckLabwareSuggestion` `:88-94`: `{ key: string; label: string; deckSlot?: string; reason?: string; requirement: boolean }` (decision doc's `:88-94` confirmed). Key = recordId (additions) or classCurie (requirements).
- `deriveDeckLabware` `:108-135`: folds ONLY `labwareAdditions` + `labwareRequirements`, dedup via `seen` Set; resolvedLabwares invisible (confirmed at HEAD).
- `holdForReview` `:277-282` feeds `deriveDeckLabware`; `foldHeldBundle` `:294-308` folds the 422 held bundle through the SAME `holdForReview` (do not change).
- `ghostEvents` — that IS the real function name, `:230-274`: picks map `!requirement` -> `reviewedAdditions` `:242-248` and `requirement` -> `reviewedRequirements` `:249-254`, then `buildPreviewFromDraft` `:255-264` with `existingLabwares/activeDeckScope/existingPlacements`; `hasPreview = >=1 placement or event` `:265-267`; the ONLY ghost path. Checkbox UI renders `proposedLabware` with `data-testid={'deck-labware-'+key}` `:613-627`; empty-state `pl-deckreview-empty` `:608-611`; `pl-load-deck` `:649-656`.
- Accept side needs NO change (CONFIRMED): `handleAccept` `:475-532` gates on `editorState.preview` >=1 placement/event `:477-480` and sends `intentAccept` with localMacro/answers only `:491-498`; placements live in committed editor state (`commitPreview` `:488`, acceptedGraph `:489`). `canAccept` `:534-540`.

`app/src/event-editor/right-pane/ai/draftPreview.ts` (traced first-hand, decision refs :281-339 confirmed):
- `BuildPreviewArgs` `:79-94` takes `labwareAdditions` / `labwareRequirements` (+ optional equipmentRequirements/recordCreations/alsoPlace).
- The placement lands via the `proposedLabware` array `:281-292` (requirements arm then additions arm), loop `:294-339`: slot/implicit-single-slot/lawn location `:298-314`, `scopeAllowsPreviewPlacement` `:101-105` + `validatePlacement` `:326-330` guards UNCHANGED, push into `previewPlacements` `:333-338`.
- CRITICAL for the submitSuggestionTool.ts:311 rule ('a record the lab already owns must be PLACED, not re-created', confirmed at :311): the additions arm materializes `labwareRecordToEditorLabware(labwarePayloadForAddition(addition))` — `labwarePayloadForAddition` `:62-65` = static definition-catalog lookup (`labwareDefinitionRecordToPayload`, app/src/types/labware.ts:1669) falling back to `labwareRecordFallbackPayload` `:28-60` (string-guessed geometry); `labwareRecordToEditorLabware` (types/labware.ts:1694-1708) keys the editor labware BY THE RECORD ID (`labwareId: record.recordId`, `sourceRecordId: record.recordId`) and never sets `proposedRecord`. AUTHORING happens ONLY through the `recordCreations` arm (`proposedRecord: true`, `:375-404`). So a pick whose recordId IS a lab-owned record id is already a placement of the existing record, never a re-creation — the fold must never route resolved picks through `recordCreations`.

## Design

### 1. Server contract (additive, non-empty-only)

`CompileContracts.ts` `TerminalArtifacts` gains, adjacent to `labwareAdditions` (:341-345), mirroring its comment style:

  resolvedLabwares?: Array<{ hint: string; recordId: string; title?: string }>;

Shape copied EXACTLY from `ResolvedLabware` (ChatbotCompilePasses.ts:1521-1525) — same field names, same optionality (title present only when the pass had a title: `:1614`, `:1633-1638` conditional spreads; one-match/multi-match always set title `:1661`, `:1673`).

`compileScientistIntent.ts` complete-branch assembly gains, immediately after the labwareAdditions spread (:292-294), the SAME non-empty-only idiom:

  ...(resolveLabwareOutput?.resolvedLabwares && resolveLabwareOutput.resolvedLabwares.length > 0
    ? { resolvedLabwares: <capped list, see §3> }
    : {}),

The needs-clarification branch (:255-260) gains NOTHING (decision fact 5; golden pins key absence — `goldens/goldenIntentToClarification.test.ts:31-38` asserts the bar arm's EXACT key set and explicitly `not.toContain` labware keys; do not touch).

`labwareRequirements` keeps having no writer on this pipeline — do not "helpfully" emit one.

### 2. App thread — the third kind

`DeckLabwareSuggestion` `:88-94`: replace `requirement: boolean` with `kind: 'addition' | 'requirement' | 'resolved'` (compiler vocabulary — one term per entity; the two-boolean alternative yields 4 combos for 3 kinds). Verified blast radius: `DeckLabwareSuggestion` has NO consumers outside ProtocolLocalizationThread.tsx (grep, incl. no `.requirement` references in ProtocolLocalizationThread*.test.tsx); ghostEvents filters `:243`/`:250` and the render loop are the only sites.

`deriveDeckLabware` `:108-135` gains a third fold AFTER requirements+additions (order = render order; requirements first as today):
- read `terminalArtifacts.resolvedLabwares` as `Array<{hint: string; recordId: string; title?: string}>` (guard non-objects/non-strings defensively, matching the file's existing loose-guard style);
- `key = recordId`; `label = title ?? recordId` (the record's REAL title, not a string-guess); `kind: 'resolved'`; conditional-spread deckSlot/reason if ever present (they aren't on this path today; keep the shape tolerant via `...(x ? {y} : {})`, never `: undefined`).
- dedup: push resolved LAST through the same `seen` Set, so if an addition already carries the same recordId (the deckSlot arms on non-shorthand pipelines) the entity gets ONE checkbox, addition-kind winning — never two local rows for one record.

`ghostEvents` `:230-274` gains a third picked-list mapping (`kind === 'resolved'` -> `reviewedResolved: AiResolvedLabware[]`, `{ recordId, ...(deckSlot), ...(reason? no — reason stays addition-only) }`; carry `title` from the row label when kind resolved) and passes it to `buildPreviewFromDraft` as a NEW optional arg `resolvedLabwares` (see §4). Do NOT merge into `reviewedAdditions` — an explicit arm is what makes "PLACE, not author" structural and testable (and preserves the row label = real title).

Accept path: NO CHANGE (verified above).

### 3. Cap/rank bound — DATA, with stated default

- Rank = PASS-OUTPUT ORDER, verbatim (candidate order = protocol order; deterministic — this is the same determinism the goldens pin). No ranking logic in code.
- Cap = server-side at the propagation point (§1), the single choke every consumer shares. New policy file `config/drafting/deck-review.yaml` (config/drafting/ is the drafting-surface policy dir; deck review is a drafting surface):

    maxResolvedOffers: 12

  Stated default rationale: measured reachable-slot counts of the shipped platform variants (probe of config/platforms/*.yaml, variant slot lists minus trash/special/unreachable): ot2_standard 11, ot3_standard 10, assist_plus_3pos 3 / assist_plus_4pos_portrait 4, manual 1/0 — the widest deck any shipped platform can offer holds 11 physical slots (+lawn overflow), so 12 covers 'every hint could still land' on the largest shipped deck while capping a broad-inventory echo. Say this in the YAML header comment.
- New loader `server/src/compiler/scientistIntent/deckReviewFold.ts` following shorthandDrafting.ts EXACTLY: `import.meta.url` relative path (cwd-independent), parse per call, NEVER process-cache; ABSENT file/section => no cap (legacy pass-through, same absent-means-off doctrine); PRESENT-but-malformed (not a positive integer) => THROW naming the key (analysisReferenceGrounding.ts:84-85 wording precedent). Zero numeric cap literals in TS (repo rule #1).
- Truncation is a silent `slice(0, max)` of the already-deterministic list — do NOT emit a gap (gaps flip `outcome` to 'gap' via `computeOutcome` :205-209; that would change compile outcomes).
- Because the loader reads per call, the lane stack needs NO restart for YAML edits (contrast the task-list note about process-cached schema/pipeline YAML).

### 4. draftPreview — explicit resolved arm

`app/src/types/ai.ts` (adjacent to `AiLabwareAddition` :254-258) gains:

  export interface AiResolvedLabware { recordId: string; title?: string; deckSlot?: string }

`draftPreview.ts`: `BuildPreviewArgs` gains `resolvedLabwares?: AiResolvedLabware[]` (default `[]` in the destructuring like `equipmentRequirements = []`); `proposedLabware` `:281-292` gains a THIRD arm appended after additions:

  { label: r.recordId, deckSlot: r.deckSlot,
    labware: labwareRecordToEditorLabware({ ...labwarePayloadForAddition(r), ...(r.title ? { name: r.title } : {}) }) }

(never `name: undefined` — exactOptionalPropertyTypes; payload stays best-effort: definition catalog, else fallback geometry — the SAME honest best-effort the additions arm already ships, decision doc blesses that mechanism at draftPreview.ts:62-65). The shared loop `:294-339` gives it identical slot/implicit-single-slot/lawn location and the identical scope+validate guards and skip strings — the placement lands in `previewPlacements` `:333-338` keyed `labwareId = recordId` with `sourceRecordId = recordId` and NO `proposedRecord`. That IS the submitSuggestionTool.ts:311 rule expressed as data flow; state it in the arm's code comment citing :311.

### 5. Golden drift is EXPECTED and must be re-blessed deliberately

The goldens run the REAL handler; every 200 golden whose hints reach `resolvedLabwares` (via the authoritative arm or the hint arm) will gain the key in its live replay and FAIL `deepEqualGolden` byte-equality (replayKernel.ts:418-435). Measured near-certain: `labware-hint-regression` (probe: `lookupAgainstFixtureStore('hint plate') -> [{recordId:'LAB-hint-plate',title:'hint plate'}]` -> one-match arm -> resolved entry). Expected to also drift: `transfer-read` + `roles-seam` (their labels bind via the SPINE-4 authoritative arm which pushes resolvedLabwares at :1631-1639 — entry-EMIT is verified in code; post-change replay UNVERIFIED, confirm with the drift probe). No blessed-writer script exists (server/scripts/ has none) — the blessed-record doctrine is a HAND edit: regenerate the drifted `__records__/*.golden.json` bodies from the kernel's normalized replay output, update each record's `sha256` in `goldens/MANIFEST.yaml` (records: block :26-42), and say so in the commit message. NEVER widen `normalizeIncidental`/normalization to dodge it (that's the vacuity guard), NEVER assert on the changed goldens with `toMatchObject`.

## Files

IN scope (product):
1. server/src/compiler/pipeline/CompileContracts.ts (additive optional field)
2. server/src/compiler/scientistIntent/compileScientistIntent.ts (complete-branch propagation + cap call)
3. server/src/compiler/scientistIntent/deckReviewFold.ts (NEW per-call policy loader) + config/drafting/deck-review.yaml (NEW policy data) — counts as one seam
4. app/src/types/ai.ts (AiResolvedLabware)
5. app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx (kind union, deriveDeckLabware, ghostEvents)
6. app/src/event-editor/right-pane/ai/draftPreview.ts (resolved arm + optional arg)

Tests riding the same items (coder-owned, RED-first): scientistIntent.test.ts (or scientistIntentContract.test.ts) neighborhood; CompileContracts.test.ts / TerminalArtifactsShape.test.ts neighborhood; ProtocolLocalizationThread.test.tsx; draftPreview.test.ts; goldens re-bless (records + MANIFEST hashes).

OUT of scope (explicit):
- `app/e2e/w2-11-campaign-demo.spec.mjs` — ORCH-OWNED; the coder MUST NOT touch it.
- Un-seeding / A5e re-seeding per the trap warning — rides a LATER tick after this ships (see post-ship note).
- The 422 held-branch (compileScientistIntent :250-268 / foldHeldBundle) — stays zero-labware-field.
- `server/src/ai/runChatbotCompile.ts` chatbot path (separate response assembly :416) — not the deck-review surface.
- labwareRequirements writers, platformRegistry/deck-scope/validatePlacement changes, AddToDeckDialog, `resolvedRefs`/`resolvedLabwareRefs` fields.
- Any dev-stack run (:3001/:5174 forbidden; lane :3093/:5193 are the ORCH's post-merge gate surface).

## Baselines — RE-MEASURED by composer at 79ffa518 (all real runs)

- server tsc: `cd server && npx tsc --noEmit` -> exit 0, **0 error lines** (raw, file /tmp/deckfold-server-tsc.txt). Expected after: still 0.
- app tsc: `cd app && npx tsc --noEmit` -> **23 error-TS lines** (grep -c 'error TS'; 28 raw lines). CRITICAL: the baseline INCLUDES a pre-existing error INSIDE an owned file — `src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx(193,35): error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'` (pre-existing at :193, deckLocked flag; do NOT fix it, do NOT count it against yourself). Gate = sorted-diff of the error list identical to baseline, NOT the raw count.
- server targeted: `cd server && npx vitest run src/compiler/scientistIntent/scientistIntent.test.ts src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts src/compiler/scientistIntent/goldens` -> **5 files / 79 tests passed** (ChatbotCompilePasses 44, scientistIntent 20, goldenRolesSeam 7, goldenIntentToGraph 3, goldenIntentToClarification 5).
- server contract trio: `npx vitest run src/compiler/pipeline/CompileContracts.test.ts src/compiler/pipeline/TerminalArtifactsShape.test.ts src/compiler/scientistIntent/scientistIntentContract.test.ts` -> **3 files / 26 passed** (15/8/3).
- golden replay script: `cd server && npx tsx scripts/golden-replay.ts` -> **32/32 checks passed, exit 0**.
- app targeted: `cd app && npx vitest run src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.familyAxes.test.tsx src/event-editor/right-pane/ai/draftPreview.test.ts` -> **4 files / 31 tests passed** (draftPreview 15, heldBundle 3, thread 6, familyAxes 7).

## First targeted check (the single command that proves the approach early)

After ONLY the server propagation (§1 + §3) lands, from `server/`:

  npx vitest run src/compiler/scientistIntent/goldens/goldenIntentToGraph.test.ts

Expected: the `labware-hint-regression` (and per the probe, `transfer-read`/`roles-seam`) FULL-body deep-equal fails with `blessed vs replay diverge at char i:` pointing INSIDE the new `resolvedLabwares` block — i.e. the fold's data demonstrably reached the real handler payload end-to-end (real pipeline, real pass, real route — replayKernel doctrine). That failure, showing the resolved entries, is the proof; re-bless (design §5) turns it green. If the diff does NOT show resolvedLabwares, stop — the propagation is dead and nothing downstream matters.

Companion /tmp probe (never committed; the composer ran the pre-change version of this — it prints live-vs-blessed key deltas and per-fixture hint-lookup hits; scripts at /tmp/deckfold-probe-golden.mts and /tmp/deckfold-probe-drift.mts in the composer log, re-create in your own /tmp, import replayKernel by absolute path, run with `cd server && npx tsx <file>`): use it to enumerate the exact drifting golden set BEFORE editing any blessed file.

## Verification commands (expected outputs, mine at baseline -> yours post-change)

From `server/` (vitest per workspace, right dir):
- `npx vitest run src/compiler/scientistIntent/scientistIntent.test.ts src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts src/compiler/scientistIntent/goldens` -> after: same 5 files, >=79 tests, **0 failed** (goldens green via deliberate re-bless, not assertion-loosening).
- `npx vitest run src/compiler/pipeline/CompileContracts.test.ts src/compiler/pipeline/TerminalArtifactsShape.test.ts src/compiler/scientistIntent/scientistIntentContract.test.ts` -> after: 3 files, >=26 tests, 0 failed (new shape/propagation/cap cases included, counts rise).
- `npx tsx scripts/golden-replay.ts` -> **32/32 checks passed, exit 0** (manifest hashes current after re-bless — a stale MANIFEST sha fails HERE first).
- `npx tsc --noEmit` -> exit 0 (0 errors).

From `app/`:
- `npx vitest run src/event-editor/right-pane/protocol/ src/event-editor/right-pane/ai/draftPreview.test.ts` -> after: 0 failed files (compare per-file failures against the composer's 4-file/31-test baseline for the named files; run the whole dir once and report zero NEW failing files).
- `npx tsc --noEmit` -> 23-error-line baseline, sorted-diff identical (the :193 runDeckLock error stays).

Cap/rank fixture pin (RED-first, server): an intent fixture with MORE distinct labware labels than the cap (>=13 vs default 12) whose `searchLabwareByHint` resolves EVERY label — the seam exists: scientistIntent.test.ts:132 idiom `searchLabwareByHint: async (h) => [{ recordId: 'LAB-'+h, title: h }]` with `spine: createResolveSpine({})` (declared test seam). Assert `Object.keys(terminalArtifacts)` CONTAINS resolvedLabwares, `length === maxResolvedOffers` from the YAML, first-N in pass order, and that flipping `maxResolvedOffers` in a temp policy path changes the cap WITHOUT a code change (the loader must take an injected path like shorthandDrafting does).

Fully-resolved thread pin (RED-first, app): a `holdForReview`ed terminalArtifacts with ONLY resolvedLabwares (no additions, no requirements) renders >=1 `deck-labware-<recordId>` checkbox (NOT `pl-deckreview-empty`), row label = the record title; check one, click `pl-load-deck`, assert the committed preview placement's labwareId === the existing recordId and `proposedRecord` absent; `pl-accept` becomes enabled (the ghostEvents hasPreview guard opens). Zero-match pin: the existing additions fixtures keep their EXACT current testids/behavior byte-stable.

## RED-first commit plan (ONE coder run)

- C1 `test(server): RED — resolvedLabwares fold on terminalArtifacts` — new contract/propagation/cap/absence tests (cap fixture per §3; bar-branch key-absence pin). Expected RED, goldens untouched yet (still green).
- C2 `feat(server): fold resolvedLabwares into TerminalArtifacts, capped by config/drafting/deck-review.yaml` — CompileContracts field, propagation, deckReviewFold.ts + YAML. Goldens flip RED here for the drifting 200 fixtures.
- C3 `test(goldens): re-bless records gaining resolvedLabwares (deliberate, named)` — regenerate drifted `__records__/*.golden.json` + MANIFEST sha256 updates; commit body lists WHICH goldens and WHY (the fold). golden-replay 32/32 green again.
- C4 `test(app): RED — resolved rows ghost placements of the EXISTING record` — thread + draftPreview tests (fully-resolved -> checkbox -> pick -> labwareId===recordId, no proposedRecord, accept enables; zero-match byte-stability pin).
- C5 `feat(app): third deck-review kind 'resolved' (PLACE, not author)` — kind union, deriveDeckLabware, ghostEvents, AiResolvedLabware, draftPreview resolved arm. C4 green.
- C6 report to the unique path below.

## Worker contract

- Worktree: `wt/DECK-FOLD-1-lane2-<tickid>` off trunk `cl/integration-2` HEAD AT DISPATCH TIME (this spec anchors 79ffa518; re-verify `git -c core.fileMode=false log --oneline -1` at claim; if trunk moved, re-anchor the file:line table above before writing code — verify each anchor with the quoted code, not the line number).
- Branch: same name as the worktree. Deliverable report: `.hermes/plans/DECK-FOLD-1-report.wip-<tickid>.md` (unique path; orchestrator promotes).
- Every git command with `-c core.fileMode=false` (NFS mount). No commits outside the IN-scope + riding-test files; `git -c core.fileMode=false diff --stat` against trunk goes in the report.
- Never run/restart the lane stack; browser gate against :5193 is post-merge, orchestrator-arranged, with the Playwright-receipts half of the acceptance criteria.
- All fixture records are TEST DATA.

## Reviewer-bait (pre-empt these; the adversarial review will hunt them)

1. exactOptionalPropertyTypes is ON (server/tsconfig.json:13): every optional must be absent-or-value. `title`/`deckSlot`/`reason`/`name` propagate via `...(x ? {k: x} : {})`, NEVER `k: undefined`; absence is asserted via `Object.keys(...)not.toContain` (golden doctrine), NEVER toEqual-with-undefined.
2. YAML-reload trap: `config/drafting/deck-review.yaml` MUST be read per call via `import.meta.url` (shorthandDrafting.ts:16-18 idiom). A `const CAP = load()` module-level cache is a defect — the cap test flipping the policy mid-run proves the loader isn't process-cached; also do NOT claim a stack restart is needed for YAML edits (per-call load means none).
3. Hardcode boundary: zero numeric cap literals in TS (repo rule #1); loader must THROW on malformed (non-positive-integer) and pass through uncapped ONLY when the file/section is absent; the cap fixture + the injected-path flip test pin both.
4. One entity, one term: field/kind/type names are `resolvedLabwares` / `kind:'resolved'` / `AiResolvedLabware` mirroring `ResolvedLabware` (ChatbotCompilePasses.ts:1521) — do NOT invent 'existing'/'owned'/'placedOffer' synonyms; and do NOT confuse with `resolvedRefs`/`resolvedLabwareRefs` (CompileContracts :310/:312, a DIFFERENT entity — prior-lab-state refs).
5. The existing-record rule: a resolved pick must never reach the `recordCreations`/`proposedRecord` path (draftPreview.ts:375-404); assert on the ghost: `labwareId === recordId`, `sourceRecordId === recordId`, no `proposedRecord` (submitSuggestionTool.ts:311).
6. Bar-branch discipline: the 422 needs-clarification terminalArtifacts must stay EXACTLY `{events,directives,gaps,protocolIntent?}` (assertBarZeroArtifact + decision fact 5) — propagating resolved fields 'while we're there' is the trap.
7. Golden integrity: re-bless = hand-edited records + MANIFEST hashes, named in the commit; loosening `deepEqualGolden`, widening normalization, or swapping the deep-equal for `toMatchObject` is a rejection.
8. Dedup: same recordId as both an addition (deckSlot arm, non-shorthand pipelines) and a resolved row = ONE checkbox, addition kind wins (seen Set, resolved folded last).
9. Zero-match bytes: every existing additions/requirements behavior and testid stays byte-identical — the trap-warning's UNmatched-hint legs must keep passing with the guard intact (they live in the orch harness you never touch).
10. Scope skips unchanged: a resolved ghost is still subject to `scopeAllowsPreviewPlacement`/`validatePlacement` (`:101-105`, `:326-330`) and lands on lawn/slot by the SAME rules; the accept gate opens on >=1 REAL placement, not on checkbox count. Do not special-case resolved past the guards.

## Post-ship note (NOT this item's scope)

When this lands, the decision doc's TRAP WARNING LIFTS: seeded-resolvable-record legs (A5e/W2-8) reopen because one-match hints now produce visible placement offers. The UN-SEEDING direction ("keep >=1 hint UNmatched" guards inside the orch-owned w2-11 harness) is removed by the orchestrator on a later tick — the coder for this item does not touch app/e2e/w2-11-campaign-demo.spec.mjs in either direction.

## Open questions (composer could not resolve locally; recommended defaults)

OQ1 — Cap enforced server-side at propagation vs app-side at fold? Default: SERVER-side (single choke point, honest payloads, one cap covers every consumer incl. future ones). Checked: the terminalArtifacts wire path is verbatim (IntentCompileFromPromptHandlers :323/:344), the app has no config-loader precedent for server policy files, and the config/drafting per-call loaders are all server-side.
OQ2 — Replace `requirement: boolean` with the `kind` union vs add an optional `resolved?: boolean`? Default: kind union. Checked: zero external consumers of `DeckLabwareSuggestion` and zero `.requirement` references in the thread test files (grep at HEAD); two booleans encode 4 states for 3 kinds and invite the `(requirement && resolved)` nonsense state.
OQ3 — Exact drifting golden set post-propagation: labware-hint-regression is NEAR-CERTAIN (probe-verified one-match hit); transfer-read and roles-seam entry-EMIT is code-verified via the authoritative arm (:1631-1639) but their post-change replay is UNVERIFIED (composer cannot run post-change code against blessed records without editing trunk). Default: re-bless exactly what the drift probe + first goldens run enumerate; do not pre-emptively re-bless a golden whose replay does not change. Probe command given in the first-targeted-check section.
