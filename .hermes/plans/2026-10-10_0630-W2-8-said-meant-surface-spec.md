# W2-8-SAID-MEANT-SURFACE — spec DRAFT (l2t2310, 2026-10-09 ~23:40 EDT)

DRAFT ONLY — cl-spec-composer output, NOT canonical, NOT dispatched. Orchestrator reviews +
promotes to `.hermes/plans/<canonical>-W2-8-said-meant-surface-spec.md`.

GOAL (one sentence): repoint the existing protocol-review host's composition so the left pane is
the immutable SAID (PDF + vendor-candidate truth, read-only for wave-2 flows, anchor-jump target)
and the right pane is the draft semantic protocol (MEANT = the extraction-draft's
candidates[].draft) edited via the TapTab path with edits riding PUT /records/:XDR + revisions,
semantic-evidence clicks jumping the PDF pane, family branches all visible with question-asking
moved to the realization entry, and no visible action on the route producing a literal-step
protocol.

Base examined: lane trunk /mnt/vast/home/brad/git/cl-integration-2 @ docs tip **78bee2c8** (W2-4
merged 7d301c1f). W2-5 (cl-coder LIVE at l2t2310) and W2-6 (draft spec only) are UNMERGED —
EVERY bind to their shapes reads **CAMT = CONFIRM AGAINST MERGED TRUNK AT PROMOTION**. The merged
trunk wins over every shape assumed here. Screening inputs (corroborating, NOT authority;
load-bearing claims re-opened first-hand this session): cl-scout logs
/home/brad/.hermes/cl/lanes/2/logs/scout-W28-{taptab-apply,realization-entry}-l2t2310.log — the
taptab scout mispathed protocolEditOps.ts under `right-pane/ai/` (actually `right-pane/protocol/`,
corrected in §0.6); the realization scout's StepInvestigationPanel claim was NOT leaned on
(the local-protocol mint verified first-hand is server-side, §0.7).
git ALWAYS `-c core.fileMode=false`. NEVER :3001/:5174/:3093/:5193 interaction — the lane stack
belongs to the orchestrator; the browser gate belongs to cl-browser-reviewer. NEVER touch
/mnt/vast/home/brad/git/computable-lab.

## 0. TRUNK REALITY (every file:line OPENED by the composer this session at 78bee2c8)

0.1 THE HOST + THE ROUTE:
- app/src/App.tsx:55 — lazy import of ProtocolReviewHostPage; :150 — Route
  `/ingestion/vendor-pdf/:recordId` -> DeferredRoute(ProtocolReviewHostPage). One route only;
  IngestionPage owns `/ingestion` + `/ingestion/:tab` (:146-147).
- app/src/ingestion/ProtocolReviewHostPage.tsx (73 lines, read in full) — tab host: AppShell
  layout="workspace", `leftPane={<VendorPdfReviewPage embedded />}` (:66-72), registers the
  `protocol-review` tab (:55-63), header comment states the full-width single-pane choice and
  that the old AI panel is absent here (D2 note). W2-9 (not here) mounts the AI pane.

0.2 VENDORPDFREVIEWPAGE.TSX (1038 lines, read in full) — the composition W2-8 repoints:
- :35-41 imports BranchQuestionsPanel + BOTH literal mappers (reviewCandidateToProtocolPayload,
  candidateToProtocolPayload, normalizeProtocolPayload).
- :44 PROTOCOL_SCHEMA_ID; :136-149 fetches the protocol-surface TapTab projection ONCE via
  `apiClient.getEditorDraftProjection(PROTOCOL_SCHEMA_ID)` (client.ts:2169, POST
  /ui/schema/:schemaId/editor-draft).
- :422-426 handleGotoPage — `document.querySelector('[data-vpdf-page="N"]')?.scrollIntoView`;
  the canvases (:853) and text pages (:872) both carry data-vpdf-page — this is the anchor-jump
  machinery semantic evidence reuses.
- :433-528 handleExtract (legacy /protocol-builder stream extraction); :451-460 applyCandidate
  calls `candidateToProtocolPayload(c, 'DRAFT-'+recordId, sourceText)` at **:455** — the literal
  completion action to RETIRE on this route.
- :540-548 handleUseExtractedProtocol ("Use the extracted protocol (N steps)" button, testid
  `vpdf-use-extracted`, :910-919) -> `reviewCandidateToProtocolPayload` — also a literal-step
  payload; acceptance says NO visible action produces a literal-step protocol, so this button
  goes too on the wave-2 route.
- :559-565 overrides/skippedSteps handlers feeding the EDITABLE ProtocolCandidatePreview
  (:991-998, onGotoPage wired at :997) — the current "editable candidate" half. Left-pane
  read-only for wave-2 means these edit controls are gone from the route.
- :575-642 branchAxesForSave + handleSave + handleSaveAs: Save PUT/POSTs a `PRT-*` protocol with
  `state:'approved'` (updateRecord :596 / createRecord :600) — literal-protocol completion;
  buttons `vpdf-save` (:785) / `vpdf-save-as` (:794) + Save-As modal (:1004-1036) disappear on
  the wave-2 route (they PRODUCE a literal-step protocol today).
- :934-979 the questions block: tree-select (:947-963, testid `vpdf-tree-select`) +
  `<BranchQuestionsPanel axes={activeReview?.tree.axes ...}/>` (:964-975) — REMOVED from
  extraction review per the task; BranchQuestionsPanel the component stays (realization entry).
- :981-989 TapTab block (testid `vpdf-taptab`): ProjectionTapTabEditor over
  `protocolPayload` — the TapTab edit path; :645-648 handleTapTabUpdate keeps dirty serialized
  payloads in local state ONLY (no persistence today — why "edits survive reload" needs W2-5's
  PUT path).
- :650-712 split-drag machinery (pointer capture + keyboard), :122 default 40:60 split.

0.3 candidateToProtocolPayload.ts (336 lines, read in full) + CALLERS (grep, whole app/src):
callers are ONLY VendorPdfReviewPage.tsx (:40-41, :455, :544) and candidateToProtocolPayload.test.ts.
There is NO other legacy route consuming it — the LiteratureBody/ExtractionReviewPage surfaces
(app/src/extraction/ExtractionDraftsListPage.tsx, ExtractionReviewPage.tsx) fetch
`/api/records?kind=extraction-draft` and render their own views; neither imports this module.
:185-212 candidateToProtocolPayload (steps kind always 'other' — literal), :236-257
treeAxesToBranchAxes, :290-336 reviewCandidateToProtocolPayload, :50-76
normalizeProtocolPayload (PROSE_STRING_FIELDS coercion — DROPS keys whose value isn't a
string-compatible prose; NEVER run an intent-step MEANT payload blindly through it, §8 bait 7).

0.4 BranchQuestionsPanel.tsx (305 lines) — presentational: props {axes: IntakeAxis[],
proposals: IntakeProposal[], gap, onResolved, onRedrafted, onBuildBranch} (:32-61); it never
fetches, never invents questions (:9-13 header). Its owner (the page) loads
`apiClient.getIntakeReview(recordId)` (client.ts:4542; response shape
IntakeReviewDetailResponse client.ts:1637-1660 incl. handbook `trees[]`). Its test
(BranchQuestionsPanel.test.tsx) must stay green — the component is RELOCATED, not deleted.

0.5 THE MEANT SHAPE (CAMT):
- extraction-draft.schema.yaml — XDR-* (:20-23); `candidates[]` items required
  [target_kind, draft, confidence], `draft` object "unvalidated at this layer" (~:44-56);
  per-candidate `ambiguity_spans[] {path,reason}`, `status` enum [promoted,rejected]; record
  `status` enum [pending_review, partially_promoted, rejected, promoted]; `source_artifact`
  {kind enum [file,publication,freetext], id, locator?} — the join key: ExtractHandlers.ts:197-203
  reads `draft.source_artifact.id` and store.get()s it (comment :192: a vendor-pdf draft
  references it with kind:'file' + the VPDF-* id). The frontend can enumerate drafts via
  GET /records?kind=extraction-draft (client.ts:2052 listRecordsByKind; precedent:
  ExtractionDraftsListPage.tsx:55) and filter `source_artifact.id === <VPDF recordId>`.
  CAMT: W2-6 mints the XDR (its §3/§4: one XDR, target_kind 'protocol'); CAMT W2-6 OQ1 ruling
  for the trigger endpoint (recommended (ii) POST /extraction/vendor-candidates/:recordId/
  semantic-draft — W2-6's own text says the endpoint "lands with W2-8's review surface",
  W2-6 draft :450).
- W2-5 canonical spec .hermes/plans/2026-10-09_1720-W2-5-draft-lifecycle-spec.md (PROMOTION
  RECORD attached at l2t2310): the MEANT edit path IS `PUT /records/:XDR` — "§0.4 ... the
  allowed edit surface" + revisions + audit (its §3.4, §3 table row 'MEANT edit path');
  vendor-protocol-candidate + VPDF go behind the append-only 405 wall (appendOnlyKinds config,
  RecordHandlers.ts:728-738). CAMT at claim: the merged xdr-* lint rule names, whether
  revisionOnEditKinds covers XDR (ruled OQ1 = config knob), and the merged StepProvenanceRef
  widening (promotion record: type const at protocol.schema.yaml :1029 AND :1032 — both sites).
- W2-7 draft (:530, A2): "Persistence via the ordinary store paths is a later surface
  (W2-8 entry)" — W2-7 mints nothing; nothing else persists MEANT edits. This item owns the
  client save loop.

0.6 THE TAPTAB/PROPOSE-APPLY DISCIPLINE (the pattern W2-8's edits follow):
- app/src/event-editor/right-pane/protocol/protocolEditOps.ts — `applyProtocolEdit` :367-393:
  read record -> meta.contentSha as human lock (:377-378, no token = refuse), PURE apply,
  double-accept idempotence via deepEqual (:382), ONE atomic `apiClient.updateRecord(...,
  {expectedSha})` (:384), stale-409 -> STALE_PROTOCOL_WRITE_MESSAGE (:56,
  'Someone changed this protocol - reload and try again.') with NO auto-retry (:390).
- app/src/event-editor/right-pane/ai/ChangesPanel.tsx — `protocolDiff?` prop (:24) selects
  protocol mode, ProtocolDiffView (:63), single Accept -> onApply (:101); `protocolEditDiffFrom`
  (:271). That panel is CHAT-proposal plumbing (W2-9 reuses it); W2-8's DIRECT edits need the
  SAME lock/idempotence/stale discipline, not the chat panel.
- client.ts updateRecord (:2403-2415) already supports `{ signatureRefs?, message?,
  expectedSha? }` — no client change needed for the PUT.

0.7 THE REALIZATION ENTRY (where questions move to) — verified first-hand, scout-corrected:
- app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx — chat-first
  one-shot localization hosted by ProtocolTabPanel (:32 import, :1788 mount, run workspace
  right pane). It ALREADY asks branch questions (axes state :98, asked :243-248, rendered
  :436-460) and sends `answers` with the accept (:289, :320, :380).
- server/src/api/handlers/IntentAcceptHandlers.ts:77 (POST /intent/accept, client.ts:3964) —
  persists `branch_resolution` on the minted LPR from body.answers
  (`{axisId, matched:true, branchIds:[chosen], choices:{axisId:chosen}}`).
- schema/workflow/local-protocol.schema.yaml:88-110 — branch_resolution[] required
  [axisId, matched], optional branchIds + `choices` object ("the localization choices that
  produced this resolution (provenance)").
- The family's questions are DATA on the protocol: protocol `branch_axes[].conditions[]`
  (MappedBranchAxis doc-comment candidateToProtocolPayload.ts:214-228) and
  ResolveBranchAxesPass.ts:76 BLOCKS compilation when a branch_axes protocol has no LPR
  branch_resolution ("localize it with branch choices first") — the downstream gate already
  exists; W2-8 only moves the ASKING surface.

0.8 SAID / ANCHOR / RUNG DATA:
- vendor-protocol-candidate.schema.yaml — kind const, additionalProperties:false (:10), required
  11 fact arrays (:11), source{documentId,filename,pageCount} (:17-27). VendorPdfBlobHandlers.ts
  :25 `^VPDF-` — the route's recordId is the VPDF artifact; the blob URL is
  `apiClient.vendorPdfBlobUrl(recordId)` (VendorPdfReviewPage.tsx:167). CAMT: how merged W2-6
  binds a vendor-protocol-candidate to a VPDF (W2-6 §reads the VPC; T5's documentId guard) —
  the SAID-facts pane must resolve the candidate via the merged W2-6/W2-4 join, NOT a guessed
  convention; if merged trunk shows no queryable join from the client, the left pane degrades
  to PDF + extractedText truth (existing :868-881 text fallback) and the report says so.
- protocol.schema.yaml intent arm (:940-1050 read): `intent.semanticVerb` SemanticVerbRef,
  `materialNeeds`, `constraints` ($ref constraint), `provenance: StepProvenanceRef[]`;
  StepProvenanceRef required [kind,type,id,pageStart], type const
  vendor-protocol-candidate, optional pageEnd/sectionId/spanStart/spanEnd — `pageStart` is the
  anchor semantic evidence clicks jump with (§0.2 machinery).
- protocol.ui.yaml :52-111 — the 'Intent' + 'Provenance (DERIVED)' READ-ONLY sections shipped by
  W2-3/W2-4 explicitly as "DATA for the W2-8 SAID/MEANT surface to consume" (:59-60, :91) +
  rung badges "RENDERED from this data by the W2-8 surface". Note (F-W28-2): protocol.ui.yaml's
  form has NO `$.branch_axes` field (grep clean) — family questions are not in the generic
  projection; the surface renders them from payload data.
- schema/registry/provenance-ladder/rung-vocabulary.yaml + schema/core/datatypes/
  provenance-rung-ref.schema.yaml — the rung datatype SHIPS UNMOUNTED ("W2-5/W2-7/W2-8 mount
  it", rung-ref :26); merged StepProvenanceRef (read first-hand) is RUNG-AGNOSTIC — no rung
  field. No server route serves the registry YAML to the app (grep: only biological-types.ts /
  surfaces precedents serve registries; no rung endpoint) — F-W28-3.

0.9 TEST/BASELINE REALITY:
- App unit tests: vitest + Testing Library; page-level precedent
  VendorPdfReviewPage.treeSelect.test.tsx. E2E precedent checked-in gate spec
  app/e2e/gate-pbch6.spec.mjs (targets localhost:5193 + :3093 health precheck); playwright
  projects include 'chromium' (app/playwright.config.ts:16-20). App-side run form:
  `cd app && npx playwright test <file> --project=chromium`.
- app tsconfig: strict + noUnusedLocals/Parameters; exactOptionalPropertyTypes is
  SERVER-ONLY (server/tsconfig.json:13) — but wave-2 payloads are round-tripped DATA, so the
  `...(x !== undefined ? {x} : {})` idiom still governs (§8 bait 2).
- App tsc baseline: 34 primary error lines (orch pin); fail-file SET {EGE,LPG} is server-side
  reference only. No VPDF/VPC/XDR seed records exist on trunk (records/seed has
  equipment/labware/materials/protocols/etc., grep for extraction-draft/VPDF clean) — the
  browser gate needs a seeding leg (F-W28-5).

## 1. SCOPE / OUT OF SCOPE

IN: the frontend composition of the wave-2 review route + its client save loop + the question
relocation + the retirement of literal completion on this route + the checked-in gate spec.
OUT: W2-5's server lifecycle (xdr lint rules, append-only wall, revisions) — this item RIDES it;
W2-6's pass + endpoint (this item may CALL it if ruled, never re-implements); W2-9's AI panel
mount (do NOT touch AppShell rightPane / ChangesPanel); W2-7's lowerer (branch_resolution
persistence stays server-side as shipped); promotion UI (promotion is routes.ts:632 / a later
surface — see OQ3); schema/lint YAML edits (none planned; rung-ref mount is OQ4, default NO);
docs/knowledge-layer surfaces (unchanged; the canonical example was checked — this item touches
none of claim/context/assertion/evidence records).

## 2. DECLARATIVE SURFACES FIRST (repo principle: data, not TS)

1. The Intent/Provenance read-only hints ALREADY EXIST as data (protocol.ui.yaml :52-111) —
   W2-8 RENDERS from them; adds NO new widget unless a rung badge needs one, and then the widget
   string goes in app/src/types/uiSpec.ts + app/src/editor/taptab/types.ts unions + the
   ui.yaml field — never a TS map keyed by record kind.
2. Rung badge LABELS come from rung-vocabulary data if the display is needed (OQ4); the rung
   VALUE (if a merged ref carries `rung`) renders verbatim. NO hardcoded TS badge/color map of
   the four rungs (§8 bait 4).
3. Pane layout: the split geometry data already exists (splitGeometry.ts DEFAULT/MIN/MAX);
   wave-2 keeps 40:60 — no TS-tuned layout constants added.
4. Questions placement at the realization entry rides the EXISTING thread machinery
   (ProtocolLocalizationThread already renders axes from data); do not mint a
   per-question TS config.
5. No new record kinds, no new lint rules, no new schema files, no new CURIEs anywhere.

## 3. OWNED FILES + EDITS

W1 (EDIT) app/src/ingestion/VendorPdfReviewPage.tsx — the repoint:
  (a) Detect the MEANT draft: fetch `listRecordsByKind('extraction-draft')` (client.ts:2052)
      filtered `source_artifact.id === recordId && status !== 'promoted'` (shape CAMT); memoize
      as `semanticDraft` (candidates[0], shape CAMT).
  (b) WAVE-2 RENDER (semanticDraft present): right pane = new SemanticDraftPanel (W2); left pane
      = existing pdfjs/text pane (unchanged machinery) with the SAID facts read-only via
      SaidFactsPane (W3); NOT rendered on this route: vpdf-save/vpdf-save-as block (:778-799),
      Save-As modal, vpdf-use-extracted button (:910-919), the BranchQuestionsPanel block
      (:934-979), the editable ProtocolCandidatePreview overrides path (:991-998 kept ONLY as
      the no-candidate extraction fallback without edit controls — decide: render nothing
      editable; the literal preview stays read-only or goes; acceptance is no editable
      candidate, no literal completion).
  (c) NO-wave-2 state (no draft): right pane shows the semantic-draft affordance — "Draft the
      semantic protocol" button calling the merged W2-6 endpoint (OQ1 ruling; CAMT) or, if
      ruling is (i), an honest empty state naming the pending pass. The legacy
      /protocol-builder extract stream stays for the non-wave-2 legacy flow ONLY if the merged
      trunk still needs it; default: same affordance path, zero literal completion.
  (d) Delete :40-41/:455/:544 call sites (module stays, OQ2).
W2 (NEW) app/src/ingestion/protocol-review/SemanticDraftPanel.tsx + .test.tsx — MEANT editor:
  props {draft (XDR envelope), recordId, projection, onGotoPage}; renders
  ProjectionTapTabEditor over `draft.candidates[0].draft` (protocol projection already fetched
  by the host, :136-149 pattern; projection over the PROTOCOL schema because the draft body is
  a protocol payload — CAMT W2-6 target_kind 'protocol'); renders each step's
  `intent.provenance[]` as evidence chips (label + pageStart, rung badge if present) — chip
  click calls `onGotoPage(pageStart)` (disabled + explanation when pageStart > candidate
  source.pageCount, CAMT lookup); branch/variant steps visible unfiltered (family clause);
  SAVE = `apiClient.updateRecord(xdr.recordId, nextXdrPayload, {expectedSha: meta.contentSha})`
  rebuilding the XDR envelope around the edited draft body (surgical: replace ONLY
  candidates[i].draft), mirroring applyProtocolEdit discipline (protocolEditOps.ts:367-393:
  refuse-without-token, no-op idempotence, stale-409 -> reload message, no auto-retry);
  on 405/409/422 show the server's machine-readable error verbatim.
W3 (NEW) app/src/ingestion/protocol-review/SaidFactsPane.tsx + .test.tsx — read-only SAID
  facts (sections/steps/tables/materials/equipment/labware with their page anchors), ZERO
  inputs/buttons that mutate (page anchors clickable ONLY for onGotoPage — a jump is not a
  mutation); degrades honestly per §0.8 join CAMT.
W4 (EDIT) app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx — realization
  entry gains the FAMILY's questions: when `sourceProtocolId` is set, load the protocol record
  and surface its `branch_axes[]` as answerable axes MERGED with (deduped by axisId against) the
  AI-emitted axes already rendered (:436-460), answers flowing into the existing `answers`
  state so POST /intent/accept records them as branch_resolution (server side UNCHANGED,
  :77). Pure adapter fn (protocol branch_axis -> BranchQuestionAxis) lives in the thread file
  or a sibling util + unit test.
W5 (NEW) app/e2e/w28-said-meant-surface.spec.mjs — the gate spec (§6.2), baseUrl from
  `process.env.BASE_URL ?? 'http://localhost:5193'`, health precheck leg against
  `API_URL ?? http://localhost:3093/api/health` (gate-pbch6.spec.mjs precedent), seeding leg
  (§6.3), receipts per acceptance clause.
W6 (EDIT, minimal) app/src/ingestion/VendorPdfReviewPage.css — styles for the two new panes only.
ZERO edits to: candidateToProtocolPayload.ts (module + test byte-untouched, OQ2 default),
BranchQuestionsPanel.tsx (+test), protocolEditOps.ts, ChangesPanel.tsx, client.ts (updateRecord
already takes expectedSha), any schema/lint/ui YAML (unless OQ4 rules otherwise), server/* (the
one possible server touch is W2-6's own endpoint — theirs, not ours).

## 4. ROUTES / FLOWS (no new route)

- `/ingestion/vendor-pdf/:recordId` (App.tsx:150) — the one review route; wave-2 vs legacy is a
  DATA state (semantic draft present?), never a URL fork.
- Flows: open review -> left pdfjs PDF + SaidFactsPane; right SemanticDraftPanel over
  candidates[0].draft -> TapTab edit (dirty local state) -> Save PUTs XDR with expectedSha ->
  revision + audit server-side (W2-5) -> reload re-reads XDR, edits + intent.provenance intact.
  Evidence chip -> handleGotoPage(pageStart) -> left pane scroll. Realization entry: run
  workspace protocol tab -> localization thread shows family axes -> answer -> accept ->
  GET /records/LPR-* shows branch_resolution.

## 5. ACCEPTANCE-CLAUSE -> PROOF MAP (criteria VERBATIM §10)

| # | Clause (verbatim excerpt) | Automated proof | Browser receipt (gate) |
|---|---|---|---|
| A1 | "SAID unmutable via any UI path incl. overrides/save" | W3/W1 unit tests: wave-2 render contains ZERO editable controls over candidate/VPDF facts (query for inputs/toggles absent); no updateRecord call ever targets a VPDF/CAN id (violation-spy on apiClient.updateRecord/createRecord) | reviewer attempts every left-pane control incl. keyboard; none mutates; record sha unchanged before/after (GET /records) |
| A2 | "anchor navigation works from semantic evidence" | SemanticDraftPanel test: chip click fires onGotoPage(pageStart); out-of-range pageStart renders disabled reason | click chip -> left pane scrolls to `[data-vpdf-page=N]` in view; screenshot both panes |
| A3 | "edits survive reload with provenance intact" | panel test: Save calls updateRecord(XDR, ..., expectedSha) with ONLY candidates[0].draft changed; no-op save idempotent; stale-409 shows reload message, no retry | edit a step label + title -> Save -> F5 -> value present; GET XDR shows revision + `steps[].intent.provenance` byte-equal to pre-edit (plus the human edit); receipts incl. GET /records/:XDR/revisions response |
| A4 | "family shows all branches, no extraction-time questions" | unit: wave-2 render shows every branch/variant step unfiltered; NO BranchQuestionsPanel/testid on the route; no step-count filtering anywhere | screenshot right pane: all branches visible; DOM has no branch-question inputs |
| A5 | "realization entry shows questions persisting to local-protocol" | W4 unit test: protocol branch_axes -> axes rendered, answers -> accept body carries them | at the run workspace the family's questions appear -> answer -> accept -> GET the LPR record: branch_resolution[].choices match; receipt names the LPR id |
| A6 | "no visible action produces a literal-step protocol" | unit: vpdf-save/vpdf-save-as/vpdf-use-extracted ABSENT on wave-2 render; repo grep: `candidateToProtocolPayload(` has zero call sites in app/src outside its own test | DOM audit screenshot of the full route chrome; grep output pasted in receipt |

## 6. RED-FIRST TEST PLAN + BROWSER GATE

6.1 HEADLESS (vitest, all under app/; write RED first):
- T1 (W1) VendorPdfReviewPage.wave2.test.tsx: mocked listRecordsByKind returns an XDR fixture
  (source_artifact kind 'file' + VPDF id, candidates[0].draft = a W2-3-shape intent protocol —
  regenerate fixture against MERGED trunk at claim) -> RED: no SemanticDraftPanel / literal
  buttons still present. Then GREEN per §3(b).
- T2 (W2) SemanticDraftPanel.test.tsx: chip->onGotoPage; out-of-range disabled; save payload
  diff (only candidates[0].draft), expectedSha missing -> refuse, stale 409 -> reload msg +
  no retry, no-op -> no write.
- T3 (W3) SaidFactsPane.test.tsx: zero mutating controls; facts render with anchors.
- T4 (W4) thread test: branch_axes merged into axes; dedupe with AI axes; answers reach accept
  body (existing POST /intent/accept client mock).
- FIRST TARGETED CHECK (single command proving the approach early):
  `cd app && npx vitest run src/ingestion/VendorPdfReviewPage.treeSelect.test.tsx src/ingestion/candidateToProtocolPayload.test.ts src/event-editor/right-pane/protocol/`
  -> ALL GREEN at the claim base (every machinery this item repoints works today). Then T1 RED
  naming the missing wave-2 composition is the approach proving itself.
- VERIFICATION (expected): `cd app && npx vitest run src/ingestion src/event-editor/right-pane`
  -> all green; `cd app && npm run typecheck` -> error SET byte-equal to the claim-base baseline
  (34 primary lines at 78bee2c8 — capture at claim, set-equality not count-only);
  `grep -rn "candidateToProtocolPayload(" app/src --include='*.tsx'` -> EMPTY.

6.2 BROWSER-GATE FLOW (cl-browser-reviewer against :5193, VERDICT: accept owed):
 0. precheck :3093 /api/health 200 + :5193 200; localStorage cl.currentUserId=USR-BRAD;
 1. seeding leg (W5 spec's beforeAll, idempotent): ensure a VPDF record with a stored blob
    (seed via the lane's vendor-pdf upload path) + a semantic draft XDR pointing at it (POST
    /records with the MERGED W2-6 draft fixture) — fixture JSON checked in beside the spec;
 2. A4+A6: open /ingestion/vendor-pdf/<VPDF> -> screenshot full route; DOM assertions (no
    save/save-as/use-extracted/branch-question controls; all branches visible);
 3. A2: click a semantic-evidence chip -> left PDF pane scrolled to the page; screenshot;
 4. A1: probe every left-pane control; capture GET /records/<VPDF> sha before/after — equal;
    attempt an overrides-style edit if any control found -> FAIL-LOUD receipt (there should be
    none);
 5. A3: edit MEANT title -> Save -> hard reload -> value present; fetch
    /api/records/<XDR>/revisions -> a revision exists; intent.provenance unchanged (paste both
    GETs);
 6. A5: navigate the realization entry (run workspace -> protocol tab -> localization of the
    reviewed protocol) -> family questions visible -> answer -> accept -> fetch the LPR ->
    branch_resolution present (paste JSON);
 7. write receipts, verdict line. The spec runs ONLY against a stack the orchestrator started;
    the coder never starts/touches :5193.

## 7. WORKER CONTRACT

- Branch `W2-8-lane2-l2t<token>` off the lane trunk `cl/integration-2` TIP AT DISPATCH (deps
  W2-5+W2-6 MERGED is the promotion gate; queue dispatch re-derives every CAMT cite).
- Worktree `<integration>/wt/W2-8-lane2-l2t<token>` (coder creates; 61 lane-exclude symlinks +
  node_modules wiring per lane standard — orchestrator's exclude file).
- Unique deliverable: report at TRUNK checkout `.hermes/plans/W2-8-report.wip-l2t<token>.md`;
  final log line `W28 DONE <sha>`.
- Owned files ONLY (§3). Every report citation is an opened file:line. git always
  `-c core.fileMode=false`. NEVER :3001/:5174/:3093/:5193 (no stack, no gate run — the gate spec
  is CHECKED IN and exercised by the reviewer). Do not re-pin W2-5/W2-6 server files; if the
  merged trunk contradicts this spec, STOP-and-report, don't improvise.

## 8. REVIEWER BAIT (the adversarial cycle WILL hunt these; pre-empt all)

1. RETIRE != DELETE: candidateToProtocolPayload.ts and its test stay byte-untouched (OQ2
   default); reviewer greps for scope creep. Conversely reviewer MUST catch any surviving
   CALL SITE on the route (:455/:544 and the Save family of actions).
2. exactOptionalPropertyTypes is server-only (app/tsconfig.json has no such flag — bait is a
   reviewer claiming it and a coder "fixing" a non-issue), BUT MEANT payloads round-trip as
   data: never write `key: undefined` into an XDR/step; use `...(x!==undefined?{x}:{})` — and
   the PUT rebuild must PRESERVE untouched XDR fields (source_artifact, ambiguity_spans,
   statuses, diagnostics), reviewer diffs pre/post PUT payloads field-by-field.
3. YAML-RELOAD TRAP: no schema/lint/ui YAML edits planned; if OQ4 rules a mount, that's a
   stack restart + boot-lint collision re-check (LintEngine global duplicate-id throw) —
   reviewer rejects silent YAML touches.
4. ONTOLOGY TERMS / HARDCODE BOUNDARY: rung names VENDOR/DERIVED/INFERRED_INVARIANT/
   LOCAL_REALIZATION appear in the app ONLY as rendered data (ref values / vocabulary fetch),
   never in a TS badge map, never a kind mint, never a new CURIE; branch_axes axisIds flow
   verbatim from the protocol record (no invented ids).
5. normalizeProtocolPayload EATS INTENT STEPS: PROSE_STRING_FIELDS coercion would stringify/drop
   non-string prose and must never be applied to the wave-2 draft body — reviewer probes a save
   of an intent step with nested payloads and demands byte-preservation of intent.provenance.
6. THE STALE-SAVE RACE: two tabs edit -> second save MUST stop with the reload message and zero
   writes (applyProtocolEdit precedent); a silent last-write-wins is a CRITICAL.
7. ANCHOR OUT-OF-RANGE / TEXT-FALLBACK: pageStart beyond source.pageCount -> disabled chip with
   a reason, not a crash; the jump must also work in the plain-text fallback pane (same
   data-vpdf-page attribute, :872) and not steal focus mid-extraction; extraction stream events
   must never clobber MEANT state (:451-460 applyCandidate is dead on this route — reviewer
   proves no protocolPayload churn from stream events).
8. SAID IMMUTABILITY IS SERVER-BACKED: the UI removing controls is necessary, not sufficient —
   the 405 wall is W2-5's; if at claim time the wall is NOT merged, the acceptance clause
   "unmutable via ANY UI path incl. overrides/save" is UI-side only and the report says exactly
   that (no claiming the wall). Reviewer: try PUT /records/<VPDF> via UI-driven paths AND note
   any 200.
9. QUESTION RELOCATION: BranchQuestionsPanel component + its test stay green (relocation, not
   deletion); the realization-entry axes must be the FAMILY's (protocol branch_axes), not
   re-derived guesses, and dedupe cleanly when the AI pass emits the same axisId.
10. FAKE-GREEN HUNTS: mocked listRecordsByKind fixtures are fine for vitest; the gate's A3
    reload proof is a REAL server round-trip — a receipt that reloads but re-reads from a
    captured fixture is fake; demand the GET /records/:XDR/revisions paste.
11. tsc/error baseline: set-equality vs claim-base baseline; the fail-file SET {EGE,LPG} is
    server-side and out of this item's blast radius (empty server diff proves it).

## 9. DECLARED FINDINGS (not repaired here)

- F-W28-1: VendorPdfReviewPage.tsx is a 1038-line god-component mixing extraction, literal
  completion, questions, and split mechanics; W2-8 thins it by extracting W2/W3 but does NOT
  finish the decomposition (later hygiene item).
- F-W28-2: protocol.ui.yaml form has no `$.branch_axes` field — family questions invisible to
  the generic projection; W2-8 renders them from payload data at the realization entry; a ui
  hint could be added by a later item.
- F-W28-3: no server route serves rung-vocabulary.yaml to the app (only biological-types/
  surfaces precedents exist); badges render from ref-carried values only unless OQ4 adds a
  read route (10-line biological-types.ts-style GET if ruled — that would be the item's ONLY
  server diff).
- F-W28-4: scout corrections — protocolEditOps.ts is under right-pane/protocol/ (log said
  right-pane/ai/); the realization entry's local-protocol mint is server-side
  (IntentAcceptHandlers), not StepInvestigationPanel "Accept".
- F-W28-5: no VPDF/VPC/XDR seeds on trunk (records/seed grep clean) — the gate spec carries its
  own idempotent seeding leg (orchestrator ratifies the fixture at promotion).

## 10. ACCEPTANCE CRITERIA (VERBATIM from the task block `verified by:`)

Browser receipts (VERDICT: accept): SAID unmutable via any UI path incl. overrides/save;
anchor navigation works from semantic evidence; edits survive reload with provenance intact;
family shows all branches, no extraction-time questions; realization entry shows questions
persisting to local-protocol; no visible action produces a literal-step protocol.

## 11. OPEN QUESTIONS FOR ORCHESTRATOR

OQ1 — NO-DRAFT AFFORDANCE (trigger surface). If no XDR exists for the artifact, what does the
right pane offer? (a) a button calling the merged W2-6 endpoint (its OQ1 recommendation (ii),
POST /extraction/vendor-candidates/:recordId/semantic-draft — W2-6's own draft says the endpoint
"lands with W2-8's review surface" :450); (b) honest empty state only, run the pass elsewhere.
Checked: W2-6 draft §3-W6/§10-OQ1, routes.ts has no semantic endpoint at 78bee2c8, client.ts
has no such method. RECOMMENDATION: (a) if W2-6 promoted with the endpoint (client method added
as a 3-line client.ts edit — the ONLY client.ts touch, call it out at promotion since §3 says
"zero edits to client.ts" otherwise); (b) if W2-6 promoted service-only. SMALLEST RULING: "(a)"
or "(b)".
OQ2 — DEAD LITERAL MAPPERS. After retirement, candidateToProtocolPayload.ts has ZERO app
consumers (verified §0.3 — its only caller WAS this route; no LiteratureBody/ExtractionReviewPage
usage). (a) keep module+test byte-untouched (this spec's default, smallest diff, module is pure);
(b) delete module+test in this diff. Checked: grep whole app/src; the legacy /extraction routes
render their own views. RECOMMENDATION: (a) — a browser-UI item shouldn't delete a pure module;
W2-11's negative goldens ("literal wave-2 output refused") are the natural place to kill it.
SMALLEST RULING: "(a)".
OQ3 — PROMOTION BUTTON. Should the wave-2 route offer "Promote draft" (POST
/extraction/drafts/:id/candidates/:i/promote, routes.ts:632)? (a) NO (this spec's default):
promotion is W2-5's lifecycle act, the acceptance clauses never ask for it, and W2-9's
"chat cannot skip promotion" implies promotion gets its own surfaced care; (b) YES, one button
gated on zero blocking lint. Checked: W2-5 §3 (route exists, extended by it), acceptance clauses
verbatim (no promotion wording), W2-9 block. RECOMMENDATION: (a). SMALLEST RULING: "(a)".
OQ4 — RUNG BADGE MOUNT. rung-vocabulary.ui.yaml (:35) promises rung badges "RENDERED ... by the
W2-8 surface", but merged StepProvenanceRef is rung-agnostic (verified §0.8) and no route serves
the vocabulary. (a) this item renders anchor chips + DERIVED-section labels WITHOUT rung badges,
declaring F-W28-3, no schema/TS badge-map invented; (b) mount provenance-rung-ref into the
protocol intent ref (schema change, stack restart, lint re-check — bigger, schema-territory diff
on a UI item); (c) badges from a new 10-line registry GET (server diff). Checked:
provenance-rung-ref.schema.yaml:26 ("SHIPS UNMOUNTED"), protocol.schema.yaml StepProvenanceRef
(no rung property), no /registry route. RECOMMENDATION: (a), with the badges filed to whichever
later item mounts the datatype (W2-7's LOCAL_REALIZATION carrier or the ladder review surface).
SMALLEST RULING: "(a)".

COMPOSED 2026-10-09 ~23:40 EDT by cl-spec-composer (l2t2310). All §0 cites opened FIRST-HAND at
trunk 78bee2c8 this session; cl-scout screening used twice (both corrected where wrong, §9
F-W28-4). Every W2-5/W2-6 shape bind reads CAMT — merged trunk wins at promotion. Nothing here
is promoted.

---

# PROMOTION RECORD (orch l2t0630, 2026-10-10 ~06:45 EDT) — bindings re-derived FIRST-HAND at trunk a2391897 (over f19cfa95 = W2-6 merge over 9a68f26c over a4ce2d58 over fcce2212 = W2-5 merge). The merged trunk WON every CAMT; all M-binds below were opened directly this tick, not inherited.

- M1 — W2-6 TRIGGER ENDPOINT MERGED (OQ1 CONDITION SATISFIED, no degrade to (b)):
  POST /extraction/vendor-candidates/:recordId/semantic-draft at server/src/api/routes.ts:636
  -> ExtractHandlers.ts:476 `semanticDraft`. THE PATH PARAM IS THE CAN-* CANDIDATE ID
  (validated ^CAN-[A-Za-z0-9_-]+$), NOT the route's VPDF-* id — the affordance button must pass
  the candidate id the page already loads. Success body: {recordId: <XDR id>, diagnostics};
  failure codes: SEMANTIC_PASS_UNAVAILABLE 503, INVALID_INPUT 400, SEMANTIC_PASS_NO_CANDIDATE
  404, SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL 400, SEMANTIC_PASS_STEP_COVERAGE 422, else 502.
  The 3-line client.ts method stays the ONLY sanctioned client.ts touch.
- M2 — SAID/XDR JOIN CONFIRMED IN MERGED CODE (draft's guessed join is the shipped join):
  SemanticFamilyPass.ts :296-313 builds source_artifact {kind:'file',
  id: candidate.source.documentId ?? candidateRecordId, locator: filename};
  candidates:[{target_kind:'protocol', draft:{kind:'protocol',
  recordId:`PRT-<CAN>-semantic`, title, steps, branch_axes?}, confidence:0.9}] +
  ambiguity_spans_by_candidate. Frontend enumeration = listRecordsByKind('extraction-draft')
  filtered source_artifact.id === <VPDF route id>, status !== 'promoted' (draft §3 stands).
- M3 — MEANT EDIT PATH MERGED AS SPEC'D: config defaults (server/src/config/types.ts:520-521)
  appendOnlyKinds includes vendor-protocol-candidate, revisionOnEditKinds includes
  extraction-draft. PUT /records/:XDR + expectedSha + revisions is live; VPDF/VPC 405 wall is
  the merged default, not a config ask.
- M4 — MERGED XDR LINT RULE NAMES (tests reference these exact ids):
  xdr-promoted-candidate-anchored, xdr-promote-blocked-by-unresolved,
  xdr-promote-requires-resolvable-target (schema/workflow/extraction-draft.lint.yaml :24/:61/:95).
- M5 — StepProvenanceRef WIDENING MERGED AT BOTH SITES (protocol.schema.yaml $defs/StepProvenanceRef
  :1013+:1025-1037): type enum [vendor-protocol-candidate, evidence] in the allOf constraint AND
  properties. Semantic-step provenance refs ride {kind:'record', type:'vendor-protocol-candidate',
  id, pageStart, pageEnd?, label?}; additionalProperties:false.
- M6 — rung-vocabulary.ui.yaml :33-36 still says badges are 'RENDERED ... by the W2-8 surface':
  OQ4 ruling STANDS — NO rung badges this item; the comment is data for whoever mounts
  provenance-rung-ref later; inventing a rung value is a banned re-mint.
- M7 — LINE-PIN RE-VERIFICATION AT CURRENT TRUNK (all CONFIRMED, zero drift):
  VendorPdfReviewPage.tsx :455 candidateToProtocolPayload, vpdf-save :785, vpdf-save-as :794,
  vpdf-use-extracted :915, vpdf-tree-select :953, BranchQuestionsPanel mount :964,
  saveas-modal :1005; App.tsx :55 lazy import, :150 route; protocolEditOps.ts
  applyProtocolEdit :367. Pins safe for the coder.
- M8 — OQ2/OQ3 RULINGS CARRY UNCHANGED (module+test byte-untouched; NO promotion button).
- M9 — BASELINES AT CLAIM (from l2t0550 handoff): server tsc 26 /tmp/l2t0415-tsc-server.txt;
  app tsc 34 /tmp/l2t2230-tsc-app.txt; scoped fail SET 11 files
  /tmp/l2t2310-w25-baseline-failfiles.txt (identical at f19cfa95, 100 passed); MANIFEST file hash
  873e1343 byte-untouched; lintRules 81. W2-8 is app/**-only + client.ts 3-line: the app suites
  and browser gate are the acceptance track.
- M10 — W2-7 (in flight, server-side) has app/** as a HARD STOP -> app pins above cannot drift
  before W2-8's dispatch base; if W2-7 merged first anyway, re-grep M7 pins at claim (5 min).
