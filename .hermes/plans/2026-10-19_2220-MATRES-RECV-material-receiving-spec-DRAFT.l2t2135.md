# MATRES-RECV — Material-receiving record — implementation spec (DRAFT l2t2135, 2026-10-19 22:20 EDT)

Status: DRAFT for orchestrator review. NOT canonical, NOT dispatchable until promoted.
Composer: cl-spec-composer (l2t2135). Trunk at draft time: 558d7bae (code tip ae0c6cbf).
DEPENDENCY IS REAL, NOT PAPER: coding starts ONLY after MATRES-ATTEST merges to
`cl/integration-2` — RECV rides the merged attestation envelope, not this spec's description
of it. §1 lists the ATTEST surfaces RECV assumes; at dispatch, verify each against the MERGED
code (the ATTEST coder l2t2135 may have deviated; a deviation at a §1 surface is a spec patch,
not a coder improvisation).

Goal (one sentence): Ship the lab-domain receiving attestation — an immutable record that a
physical thing entered lab custody (vendor-scoped lot, receivedBy, evidence-as-data-references,
occurredAt/attestedAt via the ATTEST envelope), created atomically WITH its material-instance,
reachable as an ELICITED retrospective action from chat (case 4) and never as a mint option in
the clarification panel — so custody history can be honestly recorded after the fact without
manufacturing dates, actors, or duplicate arrivals.

## 0. Inputs and posture

- Task block: LANE-2 list, `id: MATRES-RECV` (campaign 2). Acceptance criteria verbatim in §6.
- ATTEST canonical spec (foundation, being coded on `cl/lane2-matres-attest-l2t2135`):
  `.hermes/plans/2026-10-19_2140-MATRES-ATTEST-attestation-foundation.md` — with orchestrator
  rulings 0' (OQ-1..OQ-4). BINDING on RECV: **OQ-2 — one generic correction mechanism**
  (`supersedes` + `correction`, no `material-receiving-correction` kind, no second envelope);
  OQ-1 (attestor ref stored, no bespoke auth branch — RECV adds none either); OQ-3 (deviation
  fact = `attestation` claim `claimStatus: unknown`); OQ-4 (claimStatus never server-derived).
- Contracts memo r1 (`~/.hermes/specs/intake/2026-10-19_material-resolution-attestation/
  contracts-memo-r1.md`): Q1-Q8 PROPOSED DEFAULTS, ratify-by-silence 2026-10-21 18:00 EDT
  (sha e8d81658… unchanged as of the l2t2135 handoff). THIS SPEC DRAFTS AGAINST THE PROPOSED
  DEFAULTS; every dependent decision is tagged `[DEFAULT-PENDING-RATIFICATION: Qn]` so a veto
  is a targeted patch, not a rewrite. Dispatch-under-defaults per the l2t2135 orchestrator rule.
- r2 audit (`gpt6-round2-answer.md`): §1 "Retrospective receiving must not become compulsory
  invented history" (no manufactured date/actor; an honestly reported not-yet-resolved lot
  inscription must not be DISCARDED by the lot lint); §1 purpose-based lookup (catalog lookup
  may establish catalog identity, NEVER custody — P4); §2 case 5 (correction after descendants).
- Campaign header P1-P8 (task-list :10425-10464). P4 (purpose-scoped discovery), P7 (honest
  naming), P8 (no new resolution intelligence) bind every section below.

## 1. ATTEST surfaces RECV assumes (verify against MERGED code at dispatch)

From the ATTEST spec (dispatch-time verification checklist — re-cite file:line post-merge):

1. `schema/lab/attestation.schema.yaml` — envelope: `claims[]` with `claimStatus` enum
   `[proposed|completed|unknown|reported-by-other]`, `assertion {verb, about}` (free-shape —
   RECV supplies the receipt assertion payload shape, §2a), time triple `occurredAtStatus
   [known|approximate|unknown]` + `occurredAt` + `approximation`, identity triple
   `performer/accountSupplier/attestor` (absent = unknown, never presumed), `attestedAt`
   server-stamped at accept, `against` pinning block, `supersedes` + `correction` defs.
2. `schema/lab/attestation.lint.yaml` — occurredAtStatus pairing rules; supersedes/correction
   pairing; artifactKind `attestation-chain` => no `proposed` claims (P2 wall).
3. `server/src/attestation/AttestationAcceptService.ts` — accept with `{draftId, revision,
   reviewHash}` re-check (FormDraftService.ts:168/180 pattern), deterministic content-hash
   record id, `attestedAt` injectable-clock stamp, repeat-accept early-return (:169 pattern),
   plan = envelope + planned record writes (ATTEST §2b: "RECV/CHAIN will feed it; this item
   proves the mechanism with envelope-only fixtures").
4. `server/src/attestation/CurrentAssertionView.ts` — most-recent-un-superseded fold. RECV's
   corrected-receipt discovery (case 5) is tested THROUGH this view, never by re-reading
   superseded payloads.
5. `server/src/config/types.ts` DEFAULT_CONFIG `appendOnlyKinds` += `'attestation'`
   (config/types.ts:528 today = `['audit-event','signature','vendor-protocol-candidate']`;
   wall is the generic `appendOnlyWallError` at server/src/store/RecordStoreImpl.ts:273-278,
   :957). RECV adds `'material-receiving'` to the SAME data list (§2a) — never a new TS guard.
6. `schema/workflow/events/plate-event.schema.yaml` gained optional `occurredAtStatus`/
   `occurredAt` (ATTEST §2e). RECV touches plate events NOT AT ALL.
7. `artifactKind` enum exists envelope-side only (`attestation-chain` is the value RECV
   receipts declare); emission-side artifactKind machinery was explicitly OUT of ATTEST —
   RECV ships the minimum emission-side declaration its own action needs (§2c), no more.

If the merged ATTEST envelope is NOT decomposable (no `$defs` / no composition point a
specializing schema can `$ref`), the sanctioned fix is an ADDITIVE `$defs` extraction inside
`schema/lab/attestation.schema.yaml` (behavior-preserving, its own test-pinned commit);
RE-declaring envelope vocabulary in RECV files is the forbidden alternative (§7 bait 3).

## 2. Deliverables, mapped to files

### 2a. `schema/lab/material-receiving.schema.yaml` (NEW) + `material-receiving.lint.yaml` (NEW) + `material-receiving.ui.yaml` (NEW)

Triplet convention holds here (schema + lint + ui, cf. `schema/lab/material.{schema,lint,ui}.yaml`;
the task block states "(+lint/ui)"). Unlike ATTEST's envelope, material-receiving DOES ship
the `.ui.yaml`: the review-card field projection is read from the ui spec, never TS literals
(`server/src/drafts/recordDraftCompile.ts:20-31` — `UI_SPEC_MISSING` is a named diagnostic).

Record kind `material-receiving`, `recordId` pattern `^RECV-[A-Za-z0-9][A-Za-z0-9_-]*$`
(pattern-style precedent sample-receipt `^RCPT-…$`, schema/services/sample-receipt.schema.yaml:30).
`unevaluatedProperties: false` throughout; `FAIRCommon` via `$ref` (repo convention).

Composition decision (spec stance, OQ-1): material-receiving IS an attestation RECORD in its
own kind — the schema COMPOSES the ATTEST envelope defs (§1.1/§1.7) via `$ref` (claims[],
occurredAtStatus triple, identity triple, attestedAt, against, supersedes/correction) and adds
receiving-specific fields. This satisfies OQ-2's ruling: corrections are the SAME mechanism
(`supersedes` + `correction` refs, one vocabulary, defined once in the envelope); there is no
`material-receiving-correction` kind and no second envelope. `CurrentAssertionView` then folds
over receipt records + corrections without a kind-branch if its merged implementation reads the
envelope fields (verify at dispatch; if it filters `kind: attestation` literally, that literal
becomes a data list — say so in the report, do not fork the module).

Receiving-specific fields (all business rules in lint YAML, never TS):

- `vendorProductRef` — ref-shaped `{kind:record, type:vendor-product, id}` (ref datatype
  `schema/core/datatypes/ref.schema.yaml`). Vendor-product record exists and already carries
  vendor + catalog_number + `material_ref` concept join (schema/lab/vendor-product.schema.yaml:14,
  27-35) — its header literally says vendor products exist "without requiring inventory
  receiving workflows" (:5-7); RECV is the receiving side of that split.
- `lot` — `{ lot_number: string (required-in-object), expirationDate?: date }`. LOT IS
  VENDOR-SCOPED, NEVER GLOBALLY UNIQUE: identity of a lot is (vendorProductRef, lot_number),
  never lot_number alone. Existing precedent for vendor-scoping: material-instance `lot` object
  bundles vendor/catalog_number/lot_number together (schema/lab/material-instance.schema.yaml:70-77);
  material-lot keeps `supplier.vendor_lot` beside `lot_number` (schema/lab/material-lot.schema.yaml:27-40).
  HARD RULE (§6 AC-2): a bare lot number NEVER mints an id, NEVER keys a lookup, and no lint,
  schema, or code anywhere in this diff may imply global lot uniqueness.
- **LOT-WITHOUT-VENDOR-PRODUCT = lint ERROR** (`material-receiving-lot-requires-product`,
  severity error, scope record): `when exists lot -> assert exists vendorProductRef`, error
  names the offending path. The DSL covers this with exists-only (ops verified present:
  exists/nonEmpty/regex/equals/allIn/everyItem/all/any/not, schema/lint/lint-v1.schema.yaml:155-334;
  no interpreter change). r2 boundary (audit §1, last paragraph): the ERROR gates the ACCEPTED
  normalized record; it must not DISCARD an honestly reported, not-yet-resolved lot inscription —
  the inscription lives verbatim in the draft/claim (claimStatus `proposed`, §2c) and the draft
  stays blocked (canAccept=false) until vendor lookup resolves catalog identity; nothing is
  silently dropped. This is the r1-vs-r2 reconciliation the reviewer will probe.
- `receivedBy` — ref-shaped person (pattern precedent `receivedByRef`,
  schema/services/sample-receipt.schema.yaml:64-71) + `receivedByStatus` triple
  `[known|approximate|unknown]` on the Q5 pattern: `known` => receivedBy present; `unknown` =>
  ABSENT and VALID (terminal-honest, no manufactured actor). Absent never defaults to attestor
  (P3: performer/receiver ≠ attestor presumption). `[DEFAULT-PENDING-RATIFICATION: Q5]`
- `evidenceRefs[]` — optional, array of the FILE-REF datatype
  (`schema/core/datatypes/file-ref.schema.yaml` — file_name/media_type/sha256/stored_path/source_url):
  data-references only, NEVER inline blobs (no base64, no byte payloads — `additionalProperties:false`
  already forecloses it). Precedent: vendor-product `documents[].file_ref`
  (schema/lab/vendor-product.schema.yaml:77-78).
- `createdInstanceRef` — ref-shaped `{kind:record, type:material-instance, id}`; REQUIRED on an
  accepted receipt: the receipt names the instance it brought into custody (§2b). A receipt with
  `claimStatus` containing `proposed` claims is a draft state, not an accepted record (ATTEST
  lint rule 3 already forbids `proposed` claims under artifactKind `attestation-chain`).
- Corrections: a corrected receipt is a NEW material-receiving record carrying `supersedes`
  (ref to the superseded RECV/ATT record) + `correction` `{claimTarget.mode:
  [same-entity-reattribute|entity-substitution], changedFacts (minProps 1), resolutionNote?}` —
  refs reused from the envelope defs, vocabulary declared once. Entity-substitution touching an
  already-CONSUMED ref cannot reach accepted state without the deviation fact (ATTEST §2c
  mechanism, reused not rebuilt; carrier per OQ-3 ruling: `attestation` claim, `claimStatus:
  unknown`, `about` = consumed ref). Content-hash idempotent id (ATTEST §2c/termId discipline,
  `server/src/materials/termId.ts`): duplicate submission lands on the SAME record id.
  `[DEFAULT-PENDING-RATIFICATION: Q4]`
- `appendOnlyKinds += 'material-receiving'` in `server/src/config/types.ts` DEFAULT_CONFIG
  (one data-list entry + comment, mirroring ATTEST's `'attestation'` entry; wall at
  RecordStoreImpl.ts:273-278/:957 is already generic — verified first-hand this session).
  Do NOT add `'sample-receipt'` (ATTEST §2b ruling: its declarative-only immutability
  (schema/services/sample-receipt.schema.yaml:8 is prose) is a separate audit decision;
  `sample-receipt-truth-recorded` in schema/services/sample.lint.yaml:22 stays untouched).
- ui.yaml: field labels + select option vocabulary projection for the review card (ui-v1
  conventions, cf. schema/lab/material.ui.yaml). No new UI component ships here.

### 2b. Server receive path — `server/src/receiving/` (NEW, small) + draft wiring

- One reviewed payload per receiving act: the attestation envelope (receipt claim) + planned
  writes = [material-receiving record, material-instance record], accepted ATOMICALLY through
  the ATTEST `AttestationAcceptService` (§1.3) — which rides the FormDraftService discipline:
  reviewHash re-check (server/src/drafts/FormDraftService.ts:168/:179-180), zero writes until
  the whole plan revalidates (:185-197), repeat-accept early-return (:169), per-write
  create-if-absent. Do NOT build a parallel accept path; do NOT fork FormDraftService.
- **material-instance created BY the receipt, never free-standing**: the instance create is a
  planned write inside the receipt accept. It rides the EXISTING schema untouched
  (schema/lab/material-instance.schema.yaml already declares `vendor_product_ref` :35-36,
  `lot` :70-77, `storage`, `status`). RECV adds NO fields to material-instance (the receipt<->instance
  link is: receipt side = `createdInstanceRef`; instance side resolves provenance THROUGH
  CurrentAssertionView over receipts about it — no back-ref field, no schema touch).
  `[instance-side back-ref is a candidate only if dispatch-time inspection shows the merged
  view needs one — do not pre-add.]`
  Double-receipt rule (AC "idempotent-or-supersession, never 2 arrivals"): (i) re-accept of the
  same draft revision -> early-return, one receipt (ATTEST idempotence); (ii) re-DRAFT of
  identical content -> deterministic content-hash lands the SAME record id (termId/mint-idem
  law); (iii) a NEW payload asserting a changed fact about an entity that already has an
  accepted receipt, WITHOUT `supersedes` -> refused at the accept re-check with a named error
  ("already received — submit a correction (supersedes) or a genuinely distinct arrival");
  a genuinely distinct second bottle of the same product/lot has a distinct entity claim
  (`about` ref to a NEW instance) and is legal. Two bottles of lot X ≠ two arrivals of one entity.
- `server/src/receiving/MaterialReceivingDraft.ts` (or equivalent small module — coder's call,
  it must be small): compiles the elicited receiving intent into the envelope + the two staged
  writes; runs the REAL schema validate + lint at compile via the staging store
  (`server/src/drafts/StagingStore.ts` — nothing durable before reviewHash-verified accept);
  `humanReviewedCreate` semantics per the record-drafting adapter precedent
  (config/drafting/adapters.yaml `record-drafting` block: staged create is HUMAN-REVIEWED,
  never auto-create).

### 2c. ELICITED action from execute/retrospective chat (case 4) — placement + boundary

Case 4: "the Sigma bottle that arrived last week, lot 09231" (execute/retrospective chat) ->
the AI elicits the minimum completing questions ONCE (Q5: "I don't know" is a complete answer),
MAY run vendor-product lookup for CATALOG IDENTITY ONLY (P4/r2: knowing the vendor ≠ knowing
the product; the lookup's result may never serve as evidence of custody or use — the receipt,
attested by the named scientist, is the custody assertion; the catalog hit only fills
`vendorProductRef`). OccurredAt defaults from the account ("last week" ->
occurredAtStatus `approximate` + `approximation: "last week"`); NEVER silently `known=today`
for a retrospective receipt (that is the manufactured-history failure r2 §1 names). Present-
tense receiving ("a bottle just arrived") defaults known=now at DRAFT time only — the server
never synthesizes occurredAt (ATTEST §2d carries this rule; RECV inherits it).

The real emission surface today (verified first-hand; the word "elicited" exists NOWHERE in
server/src, app/src, schema/ — grep clean, so no existing elicited-action affordance is being
extended — this is net-new shape on an existing rail):
- The chat rail is the ONE forced `agent_intent` tool (`server/src/ai/submitSuggestionTool.ts:438`,
  intent enum :453 — menu grew to ten with `compose_record_draft` in QMS7-7; precedent that
  a new intent value on the SAME tool is the house pattern, never a second forced tool).
- `compose_record_draft` dispatch: `server/src/ai/AgentOrchestrator.ts:3183-3243`; emission
  type `record_draft_proposal`; app consumption `app/src/shared/hooks/useAiChat.ts:597`.
- Compile/accept routes: `server/src/drafts/draftRoutes.ts:6-16` (POST /drafts/compile|accept,
  FormDraftService, actor from localIdentityService).
- Adapter registration is DATA: `config/drafting/adapters.yaml`.

**Spec stance (OQ-2, orchestrator must ratify at promotion):** RECV does NOT push receiving
through `compose_record_draft` (that adapter creates exactly one governed DRAFT record —
wrong semantics: a receipt is an immutable ATTESTATION accepted at the review wall, stamped
attestedAt, and the act writes TWO records). RECV adds ONE intent value `compose_receiving` to
the existing forced tool's menu (precedent: enum grew twice this year; the one-tool lock is
about the tool, not a frozen enum), whose envelope compiles via a new `receiving` draft adapter
declared in `config/drafting/adapters.yaml` (data, `humanReviewedCreate: true`), staged through
the staging store and accepted through AttestationAcceptService. Emission carries
`artifactKind: attestation-chain` explicitly (Q2: declared, never inferred; the minimum
emission-side declaration ATTEST deliberately left unbuilt — built here ONLY for this one kind,
not a general artifactKind framework). The alternative (fold receiving into the event_shorthand
scientist-intent emission) is REJECTED: the scientist-intent VERB UNION stays 32 — no
`receive` verb exists today (verified absent in schema/scientist-intent/scientist-intent-vocabulary.yaml)
and campaign header OUT-OF-SCOPE forbids new custody verbs for reservation-adjacent acts; a
custody-creating act smuggled into the shorthand compiler would also violate P6 (deterministic
compiler over accepted stable references).

**NEVER offered as a mint option inside the clarification panel** (hard boundary, AC-5): the
mint affordance is the `mint:<q>` floor row emitted ONLY inside `resolveMaterial`
(`app/src/shared/taptab/slashMenu/resolvers.ts:69`, consumed at
`app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:268` — `canMint` keys on
resolveMaterial + material layer; the picker's own comment :253-256 states a mint "creates a
concept — which is never a valid answer to 'which aliquot?'"). Receiving is a custody ACTION,
not a concept answer: it gets NO row in any resolver, NO affordance in ClarificationPicker /
QuestionsPanel / ProtocolLocalizationThread held cards, NO mint-on-select variant. Enforcement:
a PIN TEST (below) that the material resolver's floor emits only the term-mint row; no product
code change should be needed to keep it true — the diff must NOT touch resolvers.ts.

## 3. Files IN scope / OUT of scope

IN:
- schema/lab/material-receiving.schema.yaml / .lint.yaml / .ui.yaml (NEW triplet)
- server/src/config/types.ts — DEFAULT_CONFIG.appendOnlyKinds += 'material-receiving' (one entry + comment)
- server/src/receiving/** (NEW: draft compile module + accept wiring, per §2b)
- server/src/ai/submitSuggestionTool.ts (+ AgentOrchestrator.ts dispatch branch, + emission type
  in ai/types.ts / app types) — ONLY the `compose_receiving` intent addition, pending OQ-2
- config/drafting/adapters.yaml — one `receiving` adapter block (data)
- schema/lab/attestation.schema.yaml — ONLY an additive `$defs` extraction if §1 requires it
- tests per §5; app: TEST-ONLY pin files (§5.5), no product app code
- report at deliverable path §8

OUT (hard — reviewer rejects any diff touching these):
- app product code — resolvers.ts, ClarificationPicker.tsx, QuestionsPanel, AiTabPanel render
  paths, ProtocolLocalizationThread (beyond emission-type consumption that already exists);
  NO new panel, NO new pixel surface (§7 argument)
- plate events / event-graph / compiler / resolution spine (`server/src/compiler/resolution/*`,
  `ResolveSpine.ts` tiers untouched — the receiving flow MAY call the existing spine vendor
  tier for catalog identity, read-only; it adds NO tier, NO policy, NO clamp change — ELIG owns policy)
- schema/lab/material-instance.schema.yaml, material-lot.schema.yaml, aliquot.schema.yaml,
  vendor-product.schema.yaml, material-derivation.schema.yaml (all ride unchanged)
- schema/services/sample-receipt* (prose precedent only), FormDraftService internals,
  AttestationAcceptService/CurrentAssertionView internals (reuse via composition; an OQ-1
  `$defs` extraction is the ONE sanctioned attestation-schema edit)
- scientist-intent-vocabulary.yaml (verb union stays 32), clarification fact shape, mint floor
- FULFIL's requirementId/add-material fields; CHAIN's review-wall labels; hold/reservation/
  decrement machinery (campaign OUT-OF-SCOPE); protocol promotion (parked); main;
  /mnt/vast/home/brad/git/computable-lab

## 4. No new resolution intelligence (P8) — negative commitments

- RECV computes NOTHING about identity/eligibility/fulfilment: no isCompatible, no lot
  matching heuristics, no vendor inference from strings, no claimStatus derivation (ATTEST
  OQ-4 ruling inherited). The vendor lookup is the EXISTING spine tier-4 provider invoked for
  the declared purpose (catalog identity); ranking/tier policy untouched (ELIG's job).
- "Already received?" at accept time is a REF EXISTENCE + supersedes check, not a fuzzy
  same-bottle detector: entity identity is the instance ref the draft itself names; the server
  never merges two entities because lots look alike.
- Business rules live in `material-receiving.lint.yaml`; the only server data entries are the
  appendOnlyKinds list item and the adapters.yaml block. No `if (kind === 'material-receiving')`
  branches in TS.

## 5. RED-first vitest plan (write FIRST, watch fail, then implement)

Harness conventions: schema tests mirror `server/src/schema/ServiceDomainSchemas.test.ts`
(registry loads triplet, Ajv); accept tests mirror FormDraftService.test.ts +
AgentOrchestrator.recordDraftProposal.test.ts (spied store, zero-mutation assertions);
supersession fixtures reuse the ATTEST case-5 fixture shapes.

5.1 `server/src/schema/MaterialReceivingSchemas.test.ts` (FIRST TARGETED CHECK, §9)
- valid receipt (vendorProductRef + lot + receivedBy known + occurredAtStatus known) -> PASS
- **AC-1 verbatim: lot WITHOUT vendorProductRef -> REJECTED, the error names the offending
  path** (lint ERROR `material-receiving-lot-requires-product`)
- occurredAtStatus `unknown`: no occurredAt, schema-valid AND lint-clean (Q5 terminal-honest);
  receivedByStatus `unknown` + receivedBy ABSENT -> valid; neither field is ever absent-GAMES
  (`! ('occurredAt' in claim)` runtime assertion, exactOptionalPropertyTypes site)
- lot present + vendorProductRef present, different products SAME lot_number -> both VALID
  (**global lot uniqueness never implied**: no lint/schema/code site may reject the second**)
- evidenceRefs: file-ref-shaped entry valid; inline blob shape (bytes/base64 key) REJECTED by
  additionalProperties:false; assertion names path
- correction receipt (supersedes + correction) valid; supersedes WITHOUT correction (and vice
  versa) rejected (envelope pairing rules inherited — RECV adds zero duplicate defs, proven by
  a no-duplicate-vocabulary grep on the diff itself)
- unevaluated property anywhere -> rejected naming path
- ui.yaml loads for the kind (UI_SPEC_MISSING must not fire at draft compile)

5.2 `server/src/receiving/ReceiveAccept.test.ts`
- happy accept: ONE material-receiving + ONE material-instance created, atomically, attestedAt
  server-stamped (injected clock), occurredAt byte-verbatim from draft
- **AC-2 verbatim: "double receipt for same bottle is idempotent-or-supersession (never 2
  arrivals)"** — three separate `it()`s: (i) repeat-accept same revision -> exactly one receipt
  (record COUNT, not response equality) + one instance; (ii) re-draft identical content ->
  SAME deterministic id, one record; (iii) changed fact about the already-received entity ref
  WITHOUT supersedes -> refused, store spy proves ZERO writes, error names the entity + says
  correction-or-distinct-arrival; the same WITH supersedes -> second record, first record's
  stored contentHash byte-unchanged
- distinct second bottle (new instance entity ref, same product+lot) -> two legal arrivals
  (guards against an over-tight uniqueness implementation failing AC-2's other side)
- post-accept payload mutation rejected: mutate envelope after compile, accept with original
  reviewHash -> 409, zero store.create calls
- AppendOnly wall: update/delete a stored material-receiving -> `APPEND_ONLY: immutable records
  cannot be updated` (same generic-wall test shape as ATTEST §5.4; control kind still updates)

5.3 `server/src/receiving/ReceiveCorrectionCase5.test.ts`
- **AC-3 verbatim: "corrected receipt keeps descendant instance/aliquot identity discoverable
  (case 5)"** — fixture: receipt(RECV lot 09231) -> instance -> 2 aliquot refs; correction
  (same-entity-reattribute, lot 09213, evidenceRefs=[photo file-ref]) -> (a) instance+aliquot
  ids byte-unchanged; (b) CurrentAssertionView for the entity says 09213, historical view says
  09231 (both queryable); (c) NO second arrival (arrival count of the entity == 1);
  (d) correction double-submission -> same id; (e) entity-substitution over a consumed ref ->
  cannot reach accepted state without the OQ-3 deviation fact, error names the consumed ref
- correction kind audit: the diff contains no `material-receiving-correction` string anywhere
  (OQ-2 ruling, grep-asserted)

5.4 `server/src/receiving/ReceiveElicitation.test.ts` (emission-side)
- **AC-4 verbatim: "retrospective elicitation draft carries attestedAt != occurredAt"** —
  compile the case-4 utterance-shape envelope (occurredAtStatus approximate, approximation
  "last week", occurredAt last-week date or absent-if-unknown variant): draft/accepted record
  has attestedAt stamped at accept time AND a occurredAt (or ABSENT with status unknown) that
  differs; assert both fields' presence-shape, not just inequality
- the emission declares `artifactKind: attestation-chain` explicitly; a draft with a `proposed`
  receipt claim cannot reach accept (ATTEST lint 3 fires — a not-yet-resolved vendor keeps
  canAccept false WITHOUT dropping the lot inscription: assert the inscription survives in the
  stored draft payload — r2's discard boundary)
- parse/menu tests mirror submitSuggestionTool.test.ts: menu carries the new intent; unknown
  intents still fall to `unknown`; ALL existing intents regression-pinned unchanged
- vendor-lookup purpose: spy shows the catalog provider is consulted for product identity and
  the result rides ONLY as vendorProductRef — no custody/evidence field is populated from it (P4)

5.5 app PIN test (test-only file, no product code): material resolver emits only the existing
`mint:<q>` concept floor — **AC-5 verbatim: "receiving absent from panel mint affordances"** —
assert no `receiving`/`receive` row appears for any query in resolveMaterial/resolveLabware/
resolveEquipment and ClarificationPicker's canMint logic is byte-unchanged (mirrors
ClarificationPicker.test.tsx conventions). `npm run test:unit -w app` for this file only.

## 6. Acceptance criteria (task block, verbatim)

> RED-first tests: lot-without-vendor-product rejected; double receipt for same
> bottle is idempotent-or-supersession (never 2 arrivals); corrected receipt
> keeps descendant instance/aliquot identity discoverable (case 5); retrospective
> elicitation draft carries attestedAt!=occurredAt; receiving absent from panel
> mint affordances. Server tests + typecheck green.

Mapped: AC-1 -> 5.1; AC-2 -> 5.2; AC-3 -> 5.3; AC-4 -> 5.4; AC-5 -> 5.5. The four
verified-by clauses (rejected-lot, idempotent-or-supersession, case-5-discoverable,
attestedAt!=occurredAt) are each their OWN `it()` with isolated assertions — a combined
"receiving works" test is a defect. Plus the description's binding shape: immutable
attestation; vendor-scoped lot (global uniqueness never implied); occurredAt/attestedAt via
MATRES-ATTEST; receivedBy; evidence refs as data-references; corrections = supersession, never
a second arrival; material-instance created BY a receipt; ELICITED from execute/retrospective
chat per case 4 with vendor lookup for catalog identity per P4; NEVER a mint option in the
panel; unknown arrival date terminal-honest (Q5).

## 7. App surface scope + browser-gate placement (argued, not hedged)

**Decision: NO app product code is in scope for MATRES-RECV, and NO browser gate is required
for this item.** Argument:
1. The task block's own `files:` field is schema + server receive path + server tests — no app
   surface named. The only app-side artifact here is the §5.5 pin test, which asserts the
   ABSENCE of new affordances on existing components (mechanically checkable at unit level).
2. RECV renders NOTHING new: the review card rides the EXISTING draft-card render rails (the
   record-draft proposal consumption path already exists in useAiChat.ts:597); the pixels that
   make receiving legible to a scientist — the review-wall claim labels
   proposed|completed|unknown|reported-by-other — are MATRES-CHAIN's explicitly-declared
   browser gate (task block CHAIN: "browser gate on :5193 for the review-wall claim labels").
   Gating RECV's card pixels now would double-gate one surface and pre-empt CHAIN's copy work.
3. The negative criterion (receiving never appears as a mint option) is precisely a
   NO-new-pixel claim: a browser receipt could only prove the absence the unit pin proves more
   sharply. Precedent: MATRES-SHELF and ATTEST both merged with recorded NO-BROWSER-GATE
   rulings (task-list DONE notes); the positive chat-flow pixels gate at CHAIN.
Record the ruling in the DONE note; if the orchestrator instead widens OQ-2's emission into an
app-side affordance, the browser gate returns and this paragraph is amended, not honored loosely.

## 8. Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/matres-recv-lane2` off lane trunk `cl/integration-2`
  at POST-ATTEST-MERGE tip (NOT ae0c6cbf — that is pre-ATTEST), branch
  `cl/lane2-matres-recv-<tickid>`. Profile: cl-coder (fleet lock) — cl-senior is retired
  (l2t1930 PITFALL); acquire the fleet lock; RECV never dispatches before ATTEST merges.
- Deliverable (unique path): `.hermes/plans/MATRES-RECV-report.<tickid>.md` on-branch; must
  contain: RED evidence (first failing run of 5.1), per-§5 suites, the five AC clauses mapped
  to named `it()`s, the §1 post-merge surface verification checklist (file:line each), baseline
  proof (§9), the lot-discard-vs-block distinction (r2), the vendor-scoped-lot statement, and
  a `[DEFAULT-PENDING-RATIFICATION]` impact note (tags: Q2 §2c, Q4 §2a-corrections, Q5 §2a/§2c,
  Q8 §2c — envelope-inherited tags live in the ATTEST report; RECV tags only its own sites).
- Stack: backend :3093, frontend :5193; YAML edits need stack restart before any curl proof
  (`cl-lane-stack.sh 2 restart` is BLOCKING — background it; `2 status` is safe); data repo
  /home/brad/.computable-lab/worktrees/main. No lane-stack touches required inside the run
  (in-worktree proofs only, per the ATTEST coder contract extraction in handoff l2t2135).

## 9. Verification commands (expected outputs)

First targeted check (earliest proof the contract is expressible as DATA before any TS):
    cd server && npx vitest run src/schema/MaterialReceivingSchemas.test.ts
  RED at start (schema absent); FIRST GREEN with schema+lint+ui only, zero server code.

Full verification:
    npm run test:run -w server -- src/schema/MaterialReceivingSchemas.test.ts src/receiving
      -> all listed files pass, 0 failed
    npm run test:unit -w app -- pin test file
      -> passes; no other app file changed (git diff --stat proves it)
    npm run test:run -w server
      -> failing-FILE set identical to the baseline recorded by orch at dispatch (zero NEW
         failing files); zero failing tests in owned files
    npm run typecheck -w server
      -> EXIT 0 (baseline 0 since the MATRES-SHELF era; any new error is a stop-condition)
    YAML-reload/live proof (orch post-merge, after stack restart):
      POST a receiving draft compile via /api/drafts/compile with a lot-no-product payload
      -> blocked card naming the lint rule path; corrected payload -> compile OK -> accept ->
      GET material-receiving record -> PUT on it -> carries 'APPEND_ONLY' (curl output in report)
    git diff --stat <base>...HEAD (three-dot) -> only §3 IN-scope paths; app/** diff contains
      ONLY the §5.5 pin-test files; grep the diff: zero 'material-receiving-correction', zero
      kind-string equality branches in TS outside the appendOnlyKinds list, zero
      Date.now()/randomUUID in any id or occurredAt path.

## 10. Reviewer bait (name the edge errors BEFORE the reviewer)

1. exactOptionalPropertyTypes (server/tsconfig.json:13): receivedBy / occurredAt / receivedByRef
-adjacent optionals are absent-OR-value, never `field: undefined`; unknown-status construction
   uses conditional spread (the FormDraftService house idiom); runtime tests assert `! in`.
2. YAML-reload trap: tsx --watch does NOT reload schema/lint YAML — any live proof before a
   stack restart validates against the OLD corpus; RED->GREEN claims without restart are fake.
3. Ontology/vocabulary terms (exactness, no synonyms): occurredAtStatus `known|approximate|unknown`;
   claimStatus `proposed|completed|unknown|reported-by-other` (hyphenated, lowercase);
   claimTarget.mode `same-entity-reattribute|entity-substitution`; referent levels
   `concept|formulation|vendor-product|instance|aliquot` are the five canonical names and are
   NOT re-declared; artifactKind value here is `attestation-chain`; the scientist-intent verb
   union STAYS 32 — no receive/receipt verb anywhere. Any duplicate declaration of envelope
   vocabulary (occurredAtStatus, supersedes, correction) in a RECV file instead of a `$ref`
   = the canonical OQ-2 violation; grep the diff.
4. Hardcode boundary: immutability = appendOnlyKinds DATA entry + existing generic wall;
   lot rule + pairing rules = lint YAML; adapter/landing = adapters.yaml DATA. A TS
   `kind === 'material-receiving'` guard, a second wall, or a TS lot check is the canonical
   failure this campaign was born to prevent.
5. Deterministic-id trap: receipt/correction/instance-staging ids are content-hash or the
   existing max+1 canonical scan (recordDraftCompile.ts header law) — any Date.now()/randomUUID
   silently breaks double-submission idempotence AND re-accept reviewHash reproduction.
6. Global-lot-uniqueness sneaks in via convenience: a Map keyed on `lot_number` alone, a
   dedupe on lot string, an id derived from lot — every one of these violates AC-2's second
   half. Lot identity is (vendorProductRef, lot_number); arrival identity is the ENTITY ref.
7. The r2 discard trap: making the lot lint ERROR reject the DRAFT so hard the lot inscription
   vanishes from the stored draft. The rule gates ACCEPTANCE (canAccept=false, blocked card,
   inscription byte-survives in the draft); test 5.4 asserts survival explicitly.
8. attestedAt == occurredAt by accident: stamping occurredAt from the injected clock when the
   account is retrospective (that is manufactured history, r2 §1); or asserting AC-4 as a
   string-inequality without checking occurredAtStatus shape — unknown-status receipts are
   VALID with occurredAt ABSENT, so `attestedAt != occurredAt` must be stated as
   presence-shape + value-inequality-when-present.
9. Supersession-as-second-arrival: an implementation that appends a corrected receipt AND
   re-runs the planned writes would create a second instance — test 5.3 asserts instance/aliquot
   id lists byte-equal before/after the correction, and 5.2 asserts arrival COUNT, not response
   bodies.
10. Mint-floor drift: the temptation to make receiving selectable in the panel ("better UX") —
    resolvers.ts / ClarificationPicker.tsx must be byte-untouched; the pin test fails loudly if
    a later task drifts, which is WHY it ships here.
11. Panel-vs-elicitation confusion: the ELICITED action lives on the CHAT rail (agent_intent),
    not in the clarification panel; a reviewer should reject any diff that registers a
    receiving option in the clarification fact shape or foldCards path
    (ProtocolLocalizationThread.tsx held-card machinery stays byte-untouched).

## 11. OPEN QUESTIONS (memo silent / code contradicts; NOT resolved locally; no policy invented)

OQ-1 — envelope composition shape. The merged ATTEST envelope may ship as a flat record schema
with no `$defs` a `material-receiving` kind can `$ref` (the ATTEST spec as written describes
one flat schema/lab/attestation.schema.yaml). My stance (§2a): material-receiving is a
specializing kind composing envelope defs; if the merged file cannot be `$ref`'d that way, the
sanctioned fix is an additive behavior-preserving `$defs` extraction in attestation.schema.yaml.
The alternative — material-receiving as a bare payload record + a separate generic `attestation`
record carrying the claims, linked by refs — is architecturally legal but splits review + two
record ids per act. Checked: ATTEST spec §2a text, FormDraftService single-adapter shape. The
orchestrator should rule AFTER the ATTEST merge lands (re-read the merged schema), coder must
not choose.

OQ-2 — emission surface for the elicited action. No "elicited action" affordance exists in the
code (grep 'elicit' clean in server/src, app/src, schema/); memo Q2 says artifactKind "rides the
existing scientist-intent emission envelope… no new intent" but that sentence governs
artifactKind's mechanism, and the scientist-intent vocabulary has no receiving verb (verb union
frozen at 32, campaign header OUT-OF-SCOPE). My stance (§2c): one new intent value on the ONE
existing forced tool + a data-declared receiving adapter, artifactKind declared on its own
emission only. Rejected alternatives checked: compose_record_draft (single governed DRAFT
create — wrong for immutable attestation + two writes); event_shorthand verb (verb-union
violation + P6 breach). This widens the intent enum, which prior campaign decisions treated as
near-locked (campaign-1 "one intent" language) — needs the orchestrator's explicit ratification
at promotion; if vetoed, the receiving act ships server-side only (§2a/§2b) with the chat
elicitation leg split to a follow-up item.

OQ-3 — free-standing material-instance via compose_record_draft. `compose_record_draft`
resolves ANY kind the schema corpus declares (recordDraftCompile.ts:164-169 — corpus-driven,
deliberately no kind list), so a model can already propose a free-standing material-instance
today; "instance never free-standing from a chat noun" has no enforcement carrier that doesn't
contradict the repo's no-kind-literals law (a denylist is exactly the forbidden branch).
Checked: recordDraftCompile.ts header + schemaForKind, adapters.yaml, the create_record branch
(AgentOrchestrator.ts:2651 — that path is kind-restricted to equipment|material|labware, so
create_record is NOT the leak; compose_record_draft is). Stance: RECV ships NO ad-hoc gate; the
honest interim is the lint-warning option on material-instance records lacking any receipt or
derivation attestation (collection-scope rule, data) IF the orchestrator rules it in — otherwise
it is recorded here and routed to FULFIL/CHAIN as a governance item. Not silently patched.

Minor (resolved in-spec, listed for visibility): evidence refs ride the file-ref datatype (no
upload-record kind exists or is invented); `receivedByStatus` is memo-Q5's own naming, kept;
the plate-event occurredAt story belongs wholly to ATTEST §2e — RECV touches nothing event-side.

## 12. Scout recon

None dispatched: every claim above was verified first-hand this session with read_file/
search_files against trunk 558d7bae (sample-receipt.schema.yaml:8/:30/:64-71;
material-instance.schema.yaml:35-36/:70-77/:164-169; vendor-product.schema.yaml:5-7/:14/:27-35/
:77-78; material-lot.schema.yaml:27-40; ref/file-ref datatypes; RecordStoreImpl.ts:273-278/:957;
config/types.ts:528; FormDraftService.ts:168-197; draftRoutes.ts:6-16; adapters.yaml
record-drafting block; submitSuggestionTool.ts:438-455; AgentOrchestrator.ts:3183-3243;
useAiChat.ts:597; resolvers.ts:69/:299; ClarificationPicker.tsx:253-268; lint-v1 predicate ops;
scientist-intent-vocabulary verb absence). The scout lane (131K-slot screening) was not needed;
per procedure, nothing here is scout-grade.
