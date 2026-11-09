# SPEC (DRAFT) — VPDF-3: Honest extraction ladder — stream persists its candidate server-side, re-extract updates-in-place, dead affordances retired

Lane 1 · composed 2026-10-20 19:30 against trunk `cl/integration-1` @ `adbddaf4` · worktree `/mnt/vast/home/brad/git/cl-integration-1`
Coder contract: work in a NEW worktree off `adbddaf4` (see Worker contract). Never touch `:3092/:5192` mutatively, never restart the lane stack, never touch `:3001/:5174`, never edit the task list.

## Goal (one sentence)

Make "Extract Protocol" on `/ingestion/vendor-pdf/:recordId` actually change artifact state: the extract stream persists a `vendor-protocol-candidate` record server-side on `done` (re-extract UPDATES it in place, same recordId), links it into the VPDF's `vendorProtocolCandidateRef`, keeps an existing semantic draft honest about staleness via ONE mechanism, and retires the two dead-chrome surfaces (stale-ref silence, "run intake on it first" with no affordance).

## Binding rulings (Brad 2026-10-20, from the task block — not re-openable by the coder)

- Persist server-side on `done`; the `done` event carries the recordId, not a throwaway payload.
- Re-extraction UPDATES the existing candidate in place — never accumulates, never strands.
- ONE staleness mechanism, chosen in this spec (§Design D2); NO dual truth.
- The persist leg keys off `documentId` resolving to a real `vendor-pdf` record; requests without a resolvable document keep today's emit-only behavior.

## Recon — intake claims verified first-hand (CONFIRMED / CORRECTED) with file:line

All line numbers are trunk @ `adbddaf4`. The intake was architect-grounded same-day; per policy it was treated as hypothesis. Two claims needed CORRECTIONS, and two blockers the intake did not surface were found (R1, R2 below).

**a. Stream handler persists nothing — CONFIRMED, with exact merge point.**
`server/src/api/handlers/ProtocolBuilderHandlers.ts` — `extractProtocolStream` :719–856. The chunk loop (:781–836) collects into `chunkResults`; the merge is `const candidate = mergeChunkResults(chunkResults);` at **:838**; the `done` event emits at :839–845 and the merged candidate rides only that SSE event — no store call anywhere in the handler (the factory `createProtocolBuilderHandlers` :597–617 receives `workspaceRoot`, inference config, and `orchestratorRef` only — **it has no store dependency at all**). Route: `server/src/api/routes.ts:700` (`POST /protocol-builder/extract-stream`). Wiring site: `server/src/server.ts:862` — **persist-leg landing point: exactly between :838 (merge) and :839 (done emit), with a new store dependency threaded from `ctx.store` at server.ts:862**. `documentId` **is in scope** there — destructured at :720 from the request body (`ExtractProtocolBody` :27–33; the review page sends `documentId` = the VPDF route id, `app/src/ingestion/VendorPdfReviewPage.tsx:598`).

**b. CAN-\* id gate on the semantic-draft route — CONFIRMED.**
Route registered `server/src/api/routes.ts:657`; handler `server/src/api/handlers/ExtractHandlers.ts` `semanticDraft` :476–496: `if (!recordId || !/^CAN-[A-Za-z0-9_-]+$/.test(recordId)) → 400 INVALID_INPUT 'Invalid vendor-candidate record id (must be CAN-*)'` (:483–486). A `graph-lemur-*` ref therefore cannot ever light the semantic button.

**c. findSemanticDraft picks FIRST — CONFIRMED; same-sweep enumeration COMPLETE.**
`app/src/ingestion/protocol-review/semanticDraft.ts` `findSemanticDraft` :61–84 — the `for (const raw of records)` loop returns the FIRST envelope with `kind==='extraction-draft'`, `status!=='promoted'`, `source_artifact.id===vpdfRecordId`, and a protocol-target candidate. Call sites (the entire sweep of drafts→VPDF joins): `VendorPdfReviewPage.tsx:271` and `protocol-review/ReviewAiPanel.tsx:98` — both route through the shared function, so ONE fix covers both. `findSaidCandidate` :92–108 is first-CAN-\*-wins with a first-match fallback. `app/src/extraction/ExtractionDraftsListPage.tsx` and `ExtractionReviewPage.tsx` render `source_artifact.id` but perform no per-VPDF first-match join — out of the sweep.

**d. VendorProtocolCandidateService persist path — CORRECTED: there is NO store persist to reuse.**
`server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts` writes **filesystem artifacts only** — `writeCandidateArtifact` → `artifacts/foundry/protocol-candidates/<documentId>.json` (:80–84, :122–132; `readCandidateArtifact` :145–158). It mints NO record-store record, has NO upsert-by-documentId, and never touches `vendorProtocolCandidateRef`. An **upsert-by-documentId must be built**. `vendorProtocolCandidateRef` is written today only at ingest time in `server/src/api/handlers/VendorSearchHandlers.ts` :1140–1144, :1308–1312, :1618–1621 — and :1621 mints the ghost generator `id: \`graph-lemur-${sha256.slice(0, 12)}\``, a documentId that is never created as a record. Consumer note: `server/src/protocol/ProtocolExtractionService.ts:749–752` reads the ref as a documentId for the rule-based path (do not break).

**e. Staleness field — DECIDED: computed staleness is data-impossible today; the data-flag mechanism is the data-free option.** Evidence:
- `schema/workflow/extraction-draft.schema.yaml`: `status` enum is `[pending_review, partially_promoted, rejected, promoted]` (:89–91) — no stale value, and adding one churns review semantics. `candidates[].status` is only `[promoted, rejected]` (:84–87). **`diagnostics[]` (:96–114) already fits**: items require `[severity, code, message]`, allow an open-ended `details: { type: object }` (:111–112) — a staleness diagnostic is schema-legal with ZERO YAML edits, and the schema itself calls diagnostics "Informational; does not gate review" (:98).
- The computed alternative has no operands: `vendor-protocol-candidate.schema.yaml` is `additionalProperties: false` (:10) with **no allOf FAIRCommon** — no `createdAt`/`updatedAt` in the payload — and the live store meta carries no `updatedAt` either (probe on :3092 below: meta = `{kind, path, commitSha, contentSha}` only). The draft side DOES carry a build time (`SemanticFamilyPass.ts:320–321` folds `createdAt` camelCase into the XDR payload). Candidate-updatedAt-vs-draft-builtAt would require schema + store-meta surgery for one banner.
- **Recommendation (adopted as design D2): write a staleness diagnostic into the existing non-promoted XDR at re-extract time (server-side, one write point).** One mechanism, one truth; §reviewer bait names the traps.

**f. No-draft dead chrome — CONFIRMED gap line; CORRECTED: a real intake runner EXISTS server-side but has zero UI affordance anywhere.**
Gap line: `app/src/ingestion/VendorPdfReviewPage.tsx:1048` — `'No decision tree is attributable to this PDF yet — run intake on it first.'` The server runner exists: `POST /protocol-ide/intake/refresh` (`server/src/api/routes.ts:962`; `server/src/api/handlers/ProtocolIntakeHandlers.ts:376–396` — re-derives stored decision trees from the PERSISTED candidate artifact, no LLM; body `{documentId}` required). The app has **no client wrapper for it** (zero `refresh` matches in `app/src/shared/api/client.ts`) and no button: `app/src/intake/IntakeTreeListPage.tsx` is card-navigation only (its buttons at :60–72 just navigate to `/intake/:treeId`). A deeplink to `/intake` would show a list of trees — no runner for THIS document — so the honest fix is a button that triggers the refresh, not a link (§D5).

**g. VPDF-6C821D307E98 ghost ref — CONFIRMED live on the lane stack (read-only GET, no mutations).**
`GET :3092/api/records/VPDF-6C821D307E98` → payload `vendorProtocolCandidateRef = {kind:'record', type:'vendor-protocol-candidate', id:'graph-lemur-6c821d307e98'}`; `GET :3092/api/records/graph-lemur-6c821d307e98` → `{"error":"NOT_FOUND"}`. The record's meta carries no timestamps. (Also confirmed from this payload: thermo/PureLink doc, `source.engine='exa'` — the :1618–1621 ghost-generator path.)

**R1 (blocker the intake missed) — the append-only wall blocks update-in-place.**
`server/src/config/types.ts:528` — `DEFAULT_CONFIG.server.appendOnlyKinds = ['audit-event','signature','vendor-protocol-candidate']`; injected into the store at `server/src/server.ts:525–533` and enforced by `RecordStoreImpl.appendOnlyWallError` :273–278 on BOTH update (:741) and delete (:957), mirrored at the API (405, pinned by `server/src/integration/W25CandidateImmutability.test.ts` :116+). **A second extraction hitting `store.update` on an existing candidate returns APPEND_ONLY.** `server.appendOnlyKinds` is a DATA knob (the W2-5 design comment: "no kind-branching in TypeScript"), so the fix is data, not a code carve-out: §OQ-1, and the coder must NOT bypass the wall via direct repo writes or `skipValidation` (that would be fabricated immutability).

**R2 (blocker the intake missed) — the merged AI candidate is not schema-legal as-is; mint must go via `store.create` with an adapter.**
`AiProtocolCandidateSummary` (`ProtocolBuilderHandlers.ts:58–79`) has steps of shape `{stepNumber, text, …}`; `vendor-protocol-candidate.schema.yaml` requires per step `id, stepNumber, sourceText, actions[minItems 1], conditions, materials, labware, equipment, notes, branches, provenance, confidence` (:68–129), top-level `steps minItems 1` (:70), closed `additionalProperties: false` (:10). Recorded finding `server/src/integration/Wave2SemanticPassE2E.test.ts:297–307`: `POST /records` CANNOT mint a VPC (the record handler stamps createdAt/updatedAt/createdBy; the closed schema rejects them → 422) — "the mint path stays `store.create` (the extraction mint path)". So the persist leg needs a **pure adapter** (AI summary → schema-legal payload) + `store.create` (extraction-service level, same as `SemanticFamilyPass`'s landing), validation ON (no skipValidation — a candidate that fails validation must fail honestly).

## The VPDF-4 seam (do not absorb, do not contradict)

VPDF-4 owns: truthful terminal stage (`FAILED` on zero parsed chunks / zero-step merge), partial-coverage honesty, the JSON tail guarantee under thinking models, per-chunk retry (max 1), and unparseable-raw-tail diagnostics. **VPDF-3 changes none of the stage/terminal semantics and none of the chunk-call shape.** VPDF-3 only adds the persist leg between merge and `done`, and must interoperate:
- Persist gate: persist ONLY when at least one chunk parsed AND the merged candidate has ≥1 step (aligns with R2's `minItems:1`). A zero-step merge on a text-bearing source stays exactly as VPDF-4 will find it today (empty success emitted, no record) — do NOT "fix" the terminal stage here.
- VPDF-3 ADDS `candidateRecordId?: string` to the `done` event only; VPDF-4 will change stage/`error` events. Touch nothing else on `ExtractionProgressPanel` beyond the label (§D6) and the stored-record note (§D4) — keep the panel's props contract additive so VPDF-4's diff stays clean.
- Do not persist "nothing was parsed" as a candidate, and never emit `done` claiming a record that failed to persist (§D3 failure semantics, verified-by test).

## Design decisions (with the evidence above)

**D1 — Server-side persist (task (1)).**
Location: `extractProtocolStream`, after `mergeChunkResults` (ProtocolBuilderHandlers.ts:838), before `done` (:839). New dependency: thread `ctx.store` (typed `RecordStore`) into `createProtocolBuilderHandlers` at `server.ts:862` (keep the existing positional style; server tsconfig has `exactOptionalPropertyTypes: true` — optional deps go through the options object or conditional spread, never `undefined`-valued properties). Legs, in order, all required for a success `done`:
1. Resolve `documentId` → `store.get(documentId)`; require `payload.kind === 'vendor-pdf'`. Not resolvable (absent id, missing record, other kind) → **emit-only, exactly today's behavior, `done` without `candidateRecordId`** (task-block notes; the standalone `/protocol-builder/extract` page and any other caller pass no resolvable document — keep the blocking `extractProtocol` endpoint emit-only and untouched, §Stop boundaries).
2. Upsert: list kind `vendor-protocol-candidate`, filter `payload.source.documentId === documentId`. None → `store.create` a **deterministic recordId `CAN-vendorpdf-<sha256(documentId).slice(0,16)>`** (deterministic = one candidate per document by construction; matches the route regex `^CAN-[A-Za-z0-9_-]+$`). Existing → `store.update` SAME recordId, new payload (see OQ-1 for the wall). Exactly ONE candidate must exist after any number of runs (verified-by 1).
3. Adapter (new pure function, recommended home: `VendorProtocolCandidateService.ts` — it owns the candidate shape; do NOT loosen the schema). Map AI summary → schema-legal payload: `kind`, `source {documentId, filename, vendor?, pageCount}`, `title` (fall back to the VPDF title, not 'Untitled Protocol'), `sections/materials/equipment/labware/notes/outputs/tables`, steps → `{id: 'step-N', stepNumber, sourceText: text, actions:[{actionKind:'other', sourceText: text, provenance}], conditions:{}, provenance, confidence}` — see OQ-2 for the provenance/page-anchor ruling; the merged candidate's `diagnostics` fold through (diagnostics items allow extra keys). Unit-test schema legality through the REAL registry (W25 `loadAllSchemas` + `AjvValidator` pattern), not a fixture mock.
4. Ref update: `store.update` the VPDF envelope with `vendorProtocolCandidateRef = {kind:'record', type:'vendor-protocol-candidate', id: canId}` (vendor-pdf is not append-only; not in `revisionOnEditKinds`). This heals the ghost on re-extract — no data migration for other `graph-lemur-*` ghosts (task (5)).
5. `done` gains `candidateRecordId` (conditional spread — exactOptionalPropertyTypes bait). App mirror: `app/src/shared/api/client.ts:5482+` `ExtractionStreamEvent` done variant.
Failure semantics (honesty): any persist leg failing (validation, lint, APPEND_ONLY if OQ-1 is NOT adopted, store error) → emit `{type:'error', message:'Extraction succeeded but the candidate could not be persisted: <cause>', index}` INSTEAD of `done`. Never a `done` that claims a record it did not write; never a silent fall-through to emit-only for a document that DID resolve (emit-only stays reserved for non-resolvable documents). Pin with a fake-store-failure arm.

**D2 — Staleness: the data-flag mechanism (task (2)). ONE mechanism.**
On a run that UPDATES an existing candidate (step-2 found a prior record) and PERSISTS: enumerate `extraction-draft` records with `source_artifact.id === documentId` and `status !== 'promoted'` server-side; for each, `store.update` appending (dedupe by code — never accumulate copies) one diagnostic:
`{ severity:'warning', code:'CANDIDATE_SUPERSEDED_BY_REEXTRACT', message:'The candidate this draft was built from was re-extracted — re-run the semantic pass to refresh it.', details:{ candidateRecordId, supersededAt: <ISO> } }`
Schema-legal with zero YAML edits (evidence §Recon e). Truth is computed at ONE write point (re-extract); the UI only READS the flag — no recomputation, no timestamps to disagree, no dual truth. Honesty note in code comment: this write is service-level `store.update`, so it does NOT capture a `record-revision` (`revisionOnEditKinds` fires in the API handler layer, `server.ts:787`) — acceptable for an append-only diagnostic; say so in the diff, do not invent a second revision path. Promotion/accept are unaffected: `diagnostics` do not gate review (schema :98) and the promoter gates `status`/`ambiguity_spans` — a test proves promotion still succeeds on a flagged XDR (verified-by 2). UI (§D4): when the joined view's `xdr.payload.diagnostics` carries the code, render a persistent banner above `SemanticDraftPanel`: "This draft was built from an older extraction — re-run the semantic pass." Do NOT block the editor on it (friction, not gate).

**D3 — Update-in-place under the wall (R1) — see OQ-1.** The spec writes to the OQ-1-adopted outcome. If the orchestrator confirms the recommendation (drop `'vendor-protocol-candidate'` from `DEFAULT_CONFIG.server.appendOnlyKinds`, config/types.ts:528 — a pure DATA edit): update `W25CandidateImmutability.test.ts` in the same commit (its rows pin 405 for this kind — they become the regression test for the NEW truth: candidate updates succeed through `store.update`, governance kinds still answer APPEND_ONLY), and fix the vocabulary note `schema/registry/provenance-ladder/rung-vocabulary.yaml:44–47` ("the candidate is immutable") to state the re-extract update-in-place contract (same mint: extraction, sole writer; DATA, needs the orchestrator to restart the lane stack — `tsx --watch` does NOT reload YAML/schema data).

**D4 — Post-extract UI loop.** `VendorPdfReviewPage.tsx` `done` handler (:636–640): on `candidateRecordId`, set the note "Candidate stored as <id>. The semantic pass drafts the protocol from the stored candidate." and `setDraftToken(n => n + 1)` — the existing data-state reload (:243–278) re-runs the SAID join, so the "Draft the semantic protocol" button (:978–998, gated on `canCandidateId`) lights against the fresh CAN-\* with no new state machinery. Stale-ref honesty (task (5)): when `record.payload.vendorProtocolCandidateRef` names a non-CAN-\* id or a CAN-\* that fails to load, render in the SAID pane (where `SaidFactsPane` otherwise sits, :934–940) an honest block, e.g. data-testid `vpdf-stale-candidate-ref`: "Candidate ref names nothing (`<id>`) — re-extract to mint a candidate." Not a silent fall-through. Staleness banner per D2.

**D5 — Dead-chrome sweep (task (6)).** Replace the instruction-with-no-affordance (`VendorPdfReviewPage.tsx:1048`) with a button "Run intake on this document" wired to a new client method `refreshIntakeTrees(documentId)` in `shared/api/client.ts` (`POST /protocol-ide/intake/refresh`, body `{documentId}`; the runner exists — §Recon f). On success bump `reviewToken` (existing reload, :284–305) so the tree lands through the normal review payload; the panel's honest no-branches gap (:1047, the `activeReview` present variant) stays. On failure show the server message verbatim (friction-first: the biologist gets the runner where the sentence lived, and an honest refusal if derivation fails). **Coder live probe before wiring** (read-only GET, allowed on :3092): determine which documentId the trees key on for this document — `GET /api/protocol-ide/intake/trees?documentId=VPDF-6C821D307E98` AND `?documentId=graph-lemur-6c821d307e98` — and send whichever the intake service recognizes (the handler's documentId is the candidate-artifact documentId; the VPDF-review surface's `getIntakeReview` uses the VPDF route id — the two differ for ghost-ref records; §OQ-3). If the probe shows the runner can never derive trees for the ghost-doc, the sentence goes instead (task (6) explicitly allows deletion — but only if the affordance truly can't exist).

**D6 — Button truth (task (4)).** `app/src/ingestion/protocol-review/ExtractionProgressPanel.tsx:83` — `"Extract Protocol (AI)"` → `"Extract candidate"` (it drafts a candidate; the semantic pass drafts the protocol — the one-vocabulary rule: the entity is the candidate everywhere). Update the wave2 suite's label expectations. The legacy standalone `app/src/components/protocol-builder/ExtractionPanel.tsx` "Extract Protocol" heading is a DIFFERENT surface (non-persisting blocking endpoint) — leave it (out of scope; if it changes, that's a boundary violation).

**Find-newest (task (3)).** `findSemanticDraft`: evaluate ALL matching envelopes and return the NEWEST by `payload.createdAt` (camelCase, ISO — written by SemanticFamilyPass:320–321; missing createdAt sorts oldest; ties → later list position). Same determinism in `findSaidCandidate`'s fallback. Both call sites (:271, ReviewAiPanel:98) inherit the fix. Pin: unit test two drafts with different createdAt → newest returned, regardless of input order (verified-by 3).

## Acceptance criteria — verbatim from the task list (task-list.md:6216–6268)

REQUIRED END-STATE:
(1) SERVER-SIDE PERSIST: the extract stream handler, on a merged candidate that parses, writes/updates a vendor-protocol-candidate record via the store and links it into the VPDF's vendorProtocolCandidateRef (the handler already receives documentId; it must resolve the VPDF and update the ref). The `done` event carries the recordId, not a throwaway payload.
(2) UPDATE-IN-PLACE, NOT ACCUMULATE: extraction for a document that already has a candidate UPDATES that record (new payload, same recordId) — never mints a second. Define honestly what re-extract invalidates: an existing non-promoted XDR whose semantic draft was built from the superseded candidate must not keep claiming freshness — either mark it stale in data (status or diagnostics field per schema — spec decides against extraction-draft.schema) or the UI computes candidate-vs-draft staleness (candidate updatedAt > draft builtAt ⇒ "the draft was built from an older extraction — re-run the semantic pass"). ONE mechanism, chosen in spec; NO dual truth.
(3) FIND-NEWEST: findSemanticDraft (app/src/ingestion/protocol-review/semanticDraft.ts:61) picks the FIRST non-promoted join — with re-extracts producing re-derived drafts, deterministically pick the NEWEST (by updatedAt) and pin with a test. Same sweep: anything else joining drafts→VPDF.
(4) BUTTON TRUTH: label becomes "Extract candidate" (it drafts a candidate; the semantic pass drafts the protocol). Post-extract the semantic-draft button lights against the freshly persisted CAN-*.
(5) STALE-REF HONESTY: a vendorProtocolCandidateRef naming a nonexistent or non-CAN-* record renders visibly in the SAID pane ("ref names nothing — re-extract to mint a candidate") — not a silent fall-through. For the stranded corpus: re-extract is the repair path; no data migration needed for graph-lemur-* ghosts beyond the honest display.
(6) DEAD-CHROME SWEEP on the no-draft state: the "run intake on it first" gap line either links to the real intake runner (deeplink or button that triggers it) or the sentence goes; no instruction with no affordance.

VERIFIED BY:
(1) Server test RED-first: run the stream with a stubbed inference result -> a vendor-protocol-candidate record EXISTS, VPDF ref updated, done event carries its recordId; run AGAIN with different steps -> SAME recordId, updated payload, exactly ONE candidate for the document.
(2) Staleness: after re-extract with an existing XDR, the chosen mechanism (data flag or computed) is observable — UI says the draft is from an older extraction (or the flag is set); promoting/accepting still works per existing rules.
(3) findSemanticDraft newest-wins unit test (two drafts, newest returned).
(4) Live lap on :3092/:5192 against a text-bearing VPDF with no candidate: Extract candidate -> CAN-* appears + semantic button lights -> semantic pass -> XDR -> MEANT editor renders; re-extract -> one candidate, staleness honest.
(5) Browser gate (UI change, async): button reads "Extract candidate"; SAID pane shows the graph-lemur ghost honestly on VPDF-6C821D307E98; no dead "run intake first" without an affordance.

## RED-first test plan

Harness: copy the REAL-store pattern from `server/src/integration/W25DraftLifecyclePromotion.test.ts` (real `RecordStoreImpl` via `createLocalRepoAdapter` under `/tmp` — git on the NFS worktree blows the vitest budget; the file says so) + the stubbed-SSE-fetch pattern from `server/src/api/handlers/ProtocolBuilderStream.test.ts` (:15–53). Seed a real `vendor-pdf` record; stub inference to return a parseable chunk JSON.

New server suite `server/src/api/handlers/ProtocolBuilderStreamPersist.test.ts` (verified-by 1 + failure arms):
- Run stream once → `CAN-vendorpdf-<hash>` EXISTS via `store.get`, VPDF ref names it, `done.candidateRecordId ===` that id. **This test is the spec's RED — write it first; against trunk it fails because the handler mints nothing.**
- Run again with different steps → SAME recordId, updated payload, `store.list` shows exactly ONE candidate for the document (under OQ-1 adopted; if OQ-1 were rejected this arm fails APPEND_ONLY — that IS the discriminator).
- Emit-only arms: body without `documentId` → stream completes, ZERO candidate records; `documentId` pointing at a non-vendor-pdf or missing record → same.
- Persist-failure arm (store whose `create` fails) → `error` event, NO `done`, no partial ref write.
- Zero-step merge (stub returns JSON with `steps: []`) → no candidate persisted (aligns VPDF-4 seam).
- XDR staleness arm (verified-by 2): seed a non-promoted XDR joined to the VPDF (W25 `seedDraft` shape, payload.createdAt set); re-extract → XDR carries `CANDIDATE_SUPERSEDED_BY_REEXTRACT` exactly once (re-run twice, still one — dedupe); promote endpoint still succeeds.

Updated/new app tests (vitest + testing-library, mirror `VendorPdfReviewPage.wave2.test.tsx` mocks):
- `semanticDraft.test.ts`: newest-wins join (verified-by 3), input-order independence, missing-createdAt sorts oldest.
- `VendorPdfReviewPage.wave2.test.tsx` (+ siblings touching the label): button reads "Extract candidate"; `done` with `candidateRecordId` → note shows the CAN-\* + semantic affordance lights; ghost ref → `vpdf-stale-candidate-ref` block with the id named; staleness banner renders from the diagnostic code; intake button posts refresh and bumps review / failure shows verbatim message.
- `W25CandidateImmutability.test.ts` flips its vendor-protocol-candidate rows ONLY if OQ-1 lands as recommended (governance-kind rows unchanged).

First targeted check (proves the approach before any handler wiring):
```
cd <worktree>/server && npx vitest run src/api/handlers/ProtocolBuilderStreamPersist.test.ts -t 'mints'
```
Expect: mint arm PASSES against trunk (store.create path + adapter prove the schema/mint story, R2), while the update arm (`-t 'updates'`) fails `APPEND_ONLY` — that single run confirms both R1 and R2 and the OQ-1 need in one shot, before a line of production code.

Full verification (expected outputs):
```
cd <worktree>/server && npx vitest run src/api/handlers/ProtocolBuilderStream.test.ts \
  src/api/handlers/ProtocolBuilderStreamPersist.test.ts \
  src/integration/W25CandidateImmutability.test.ts \
  src/integration/Wave2SemanticPassE2E.test.ts        # all green
cd <worktree>/app && npx vitest run src/ingestion/protocol-review/semanticDraft.test.ts \
  src/ingestion/VendorPdfReviewPage.wave2.test.tsx \
  src/ingestion/protocol-review/ReviewAiPanel.test.tsx   # all green
cd <worktree>/server && npx vitest run                 # server-wide green (LabSettingsHandlers' 2 failures are the known lane-exclude symlink artifact — do NOT chase)
npm run typecheck -w server                            # ZERO errors (exactOptionalPropertyTypes: true — see bait 1)
npm run typecheck -w app                               # delta-ZERO vs the trunk error set (measure the baseline on adbddaf4 FIRST and pin it in the report; app/tsconfig has NO exactOptionalPropertyTypes)
```
Live lap (verified-by 4) is orchestrator/gate territory, not coder: any YAML/schema or DEFAULT_CONFIG data change needs a lane-stack restart (`tsx --watch` reloads TS but NOT YAML/schema data); the coder never restarts :3092 and never makes mutating calls. Read-only GETs allowed. The browser gate (verified-by 5) is async and MANDATORY (two-track rule — this item changes UI).

## Worker contract

- Branch: `cl/lane1-vpdf3-l1t<TICK>` off trunk `cl/integration-1` @ `adbddaf4`; worktree `wt/VPDF-3-lane1-l1t<TICK>` with the standard node_modules symlinks (orchestrator creates; coder never branches off another item's branch). QMS8-B may merge before dispatch — rebase onto the new trunk head if it moves; QMS8-B touches server+lint YAML, so re-run the server suite after rebasing.
- Deliverable/report: `~/.hermes/cl/lanes/1/vpdf3-report-l1t<TICK>.md`, ending `STATUS: complete`; pin in it: app tsc baseline set + delta, the OQ-1/OQ-2/OQ-3 outcomes you coded to, the live intake-trees documentId probe output, every test file touched with counts.
- Commit style: RED test commit first (failing), then implementation, one final message per leg.

## Ownership — files the coder owns

IN: `server/src/api/handlers/ProtocolBuilderHandlers.ts` (persist leg, `done` event extension ONLY); `server/src/server.ts` (wire `ctx.store` at :862 only; if OQ-1 lands, also nothing here — the store already reads the data list at :532); `server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts` (upsert-by-documentId + adapter); `server/src/config/types.ts` :528 (ONLY per adopted OQ-1); `server/src/integration/W25CandidateImmutability.test.ts` (ONLY per adopted OQ-1); `schema/registry/provenance-ladder/rung-vocabulary.yaml` note (ONLY per adopted OQ-1; DATA — flag restart need in the report); `app/src/ingestion/protocol-review/semanticDraft.ts` (newest-wins); `app/src/ingestion/VendorPdfReviewPage.tsx` (done handler, stale-ref block, staleness banner, intake button, reviewToken wiring); `app/src/ingestion/protocol-review/ExtractionProgressPanel.tsx` (label + additive props only); `app/src/shared/api/client.ts` (done-event type + `refreshIntakeTrees`); test files named above.

OUT (stop boundaries): `ExtractHandlers.ts` (route/gate already correct); `SemanticFamilyPass.ts` (SAID is read-only to it; do not touch); any VPDF-4 surface — chunk prompt, `completeStream` call shape, terminal-stage semantics, retry, raw-tail diagnostics (`ProtocolBuilderHandlers.ts` merge/emit legs are touched, the loop at :781–836 is NOT); `VendorSearchHandlers.ts` (the ghost generator is NOT fixed here — re-extract is the repair path, task (5)); `ProtocolExtractionService.ts` (must keep reading the ref — covered by not touching it); the standalone `/protocol-builder/extract` blocking endpoint and `components/protocol-builder/*` (emit-only legacy); the task list; the lane stack; any `graph-lemur-*` data migration.

## Reviewer bait (adversarial-review anticipations — defuse these in the diff itself)

1. **exactOptionalPropertyTypes (server tsconfig:true)**: `done` gains `candidateRecordId?: string` — never write `candidateRecordId: undefined`; conditional-spread like the codebase idiom. Same at the store-wiring seam (no `store: undefined` into the factory) and at `Envelope.meta` spreads.
2. **YAML-reload trap**: if OQ-1/OQ-2 touches schema YAML or DEFAULT_CONFIG data, every claim about :3092 behavior BEFORE an orchestrator restart is INVALID. Report YAML-touching files explicitly; make no live claims.
3. **Ontology/vocabulary**: one vocabulary per entity — the record is `vendor-protocol-candidate`, the button says "candidate", the XDR stays "extraction-draft"/semantic draft. No new kind, no new status enum value, no invented term like "extraction result" or "draft refresh".
4. **Hardcode boundary**: no kind string, CAN- prefix logic, or staleness policy branching in TS beyond the mint itself; the append-only answer is the DATA knob (`appendOnlyKinds`), not an `if (kind === …)` carve-out. Deterministic id uses sha256 over the documentId, not a `Date.now()` (that would accumulate on retry).
5. **Fabricated success**: `done` without a persisted record for a RESOLVED document = hard-stop class; so is persisting a candidate that failed validation (`skipValidation` is banned in this leg); so is stamping page provenance you cannot see (OQ-2 must resolve before the adapter's provenance lines are written).
6. **Dual truth**: the staleness banner must read the written diagnostic ONLY — no UI-side timestamp comparison sneaking in as a second mechanism; no `updatedAt` stamped into the candidate payload (schema forbids it and the store doesn't provide one).
7. **Dedupe, not accumulate**: two re-extracts against one XDR must yield ONE `CANDIDATE_SUPERSEDED_BY_REEXTRACT`; the test pins it.
8. **APPEND_ONLY bypass**: any direct-repo write or update-bypass is a reject — the wall changes through its data list or not at all.
9. **Wall-test drift**: if OQ-1 lands, `W25CandidateImmutability.test.ts` changes are part of THIS diff in the same commit; leaving them red or "adapting" them away rather than flipping the rows honestly is a reject.

## Open questions for orchestrator (you decide; Brad is not to be escalated)

**OQ-1 — Append-only wall vs Brad's update-in-place ruling (R1).** The wall (`config/types.ts:528`, enforced `RecordStoreImpl.ts:273–278/741/957`) makes "same recordId, updated payload" impossible today; W2-5 chose candidate immutability assuming candidates are minted once, and Brad's 2026-10-20 ruling supersedes that posture. RECOMMENDATION: drop `'vendor-protocol-candidate'` from `DEFAULT_CONFIG.server.appendOnlyKinds` (pure DATA), flip the W25 rows, update the rung-vocabulary `mints_on` note (extraction stays the SOLE writer — the immutability wording is what changes), restart the lane stack post-merge. Alternatives: keep the wall and delete-then-create (delete is ALSO walled — dead end) or bypass the wall (rejected: fabricated immutability). Evidence: Recon R1.

**OQ-2 — Page anchors for AI-chunk candidates (R2).** `$defs/Provenance` requires `pageStart ≥ 1` per step/item, but the chunk stream merges per-chunk JSON without per-page offsets, so the adapter cannot see true page anchors. RECOMMENDATION (coded into D1-3 unless decided otherwise): adapter stamps `provenance.documentId` = the real VPDF/documentId (the document-level anchor the VENDOR rung's lineage actually requires) and `pageStart: 1` as a conservative floor, PLUS one top-level candidate diagnostic `{severity:'warning', code:'AI_CHUNK_ANCHORS_APPROXIMATE', message:'…page anchors are document-level under AI chunk extraction…'}` which `SaidFactsPane` already renders honestly; pin a test that the anchor is never page-FABRICATED beyond the declared conservative floor. Alternative: DATA edit making `pageStart` optional + the `prov-vendor-facts-document-anchored` lint + `rung-vocabulary.yaml` lineage note — bigger data blast radius for the same banner; a follow-up item could send per-page offsets from the review page for true anchors.

**OQ-3 — Intake button's documentId + fallback (D5).** `POST /protocol-ide/intake/refresh` takes the documentId the trees key on; for ghost-ref docs the VPDF route id and the candidate-artifact documentId (`graph-lemur-*`) differ (ghost generator :1618–1621; tree consumer `ProtocolExtractionService.ts:749–752`). Recommendation: coder's read-only probe (`GET /api/protocol-ide/intake/trees?documentId=` both ids on :3092) decides which id the button sends (candidates: always the VPDF id, or the ref id when the VPDF id derives nothing); if the runner can derive nothing for the ghost doc at all, the sentence is DELETED per task (6) rather than shipping a button that can only fail. Checked: handler :386–396 (documentId required, no LLM, reads persisted candidate artifact), client has no wrapper, trees-list page has no runner.

STATUS: draft-complete

## Orchestrator spec review (binding, tick l1t1920, 2026-10-20 20:30)

OQ-1 = RECOMMENDATION ADOPTED: drop 'vendor-protocol-candidate' from
DEFAULT_CONFIG.server.appendOnlyKinds (server/src/config/types.ts:528 — verified first-hand by
the orchestrator; the entry is live, enforced via RecordStoreImpl append-only wall). Brad's
2026-10-20 update-in-place ruling explicitly supersedes the W2-5 candidate-immutable posture;
the wall changes through its DATA list, with the W25CandidateImmutability row flips IN THE SAME
commit and the rung-vocabulary note (verified live at schema/registry/provenance-ladder/
rung-vocabulary.yaml:44-47) corrected honestly. Governance kinds (audit-event, signature) stay
walled. Restart the lane stack post-merge (DEFAULT_CONFIG + schema data).
OQ-2 = RECOMMENDATION ADOPTED: document-level provenance anchor + conservative pageStart:1
declared as such + top-level AI_CHUNK_ANCHORS_APPROXIMATE diagnostic; no schema loosening, no
page fabrication.
OQ-3 = composer's probe plan APPROVED as written: read-only GET probes on :3092 decide which
documentId the intake button sends; if the runner derives nothing for the ghost doc, DELETE the
sentence per task (6).
Recon spot-verified by the orchestrator first-hand: appendOnlyKinds line, rung-vocabulary note,
graph-lemur generator (VendorSearchHandlers.ts:1125,:1233), and the live ghost ref on
VPDF-6C821D307E98 (GET :3092 confirms thermo/PureLink, source.engine exa). STATUS of this file:
canonical spec; draft remains as provenance. Claim is gated on the fleet coder slot (QMS8-B
live); dispatch off the trunk HEAD AT CLAIM TIME (rebase if QMS8-B merged first).
