# MATRES-ATTEST — Attestation foundation — implementation spec (DRAFT, l2t2030, 2026-10-19 20:48 EDT)

Status: PROMOTED BY ORCHESTRATOR 2026-10-19T21:45 EDT (l2t2135) — canonical spec for the coder
dispatch. Orch critical review: §1 ground-truth rows independently re-verified first-hand on trunk
(appendOnlyWallError RecordStoreImpl.ts:273-278 generic list; DEFAULT_CONFIG.appendOnlyKinds
config/types.ts:528 exactly ['audit-event','signature','vendor-protocol-candidate'] — sample-receipt
absent, the §7.6 trap is real; FormDraftService accept reviewHash 409 + :169 accepted early-return;
plate-event.schema.yaml at:/t_offset only; attestedAt grep 0 hits; REV- pattern). OQ rulings at §10.

## 0'. ORCHESTRATOR RULINGS ON THE OPEN QUESTIONS (binding for this dispatch)

- OQ-1 (attest authority): ADOPT spec stance. The envelope stores the attestor ref supplied with
  the accept request; NO bespoke auth branch, no new authorization table. Enforcement of WHO may
  attest is explicitly OUT of this item — record it in the report as an honest open governance
  gap (candidate: governance/signature machinery) for a future item. Do not block on it.
- OQ-2 (correction naming): RULED — one generic mechanism: kind `attestation` + `supersedes` +
  `correction` (the spec's stance). Rationale: the hard boundary rule — two local terms for one
  entity is never allowed; a RECV-side `material-receiving-correction` kind would duplicate the
  correction concept. RECV names claims/assertions with its own vocabulary, never a second
  correction kind. Memo wording is illustrative, not prescriptive on kind names.
- OQ-3 (deviation carrier): RULED — spec stance: deviation fact = an `attestation` claim with
  `claimStatus: unknown` + `about` = the consumed ref. Zero new kinds. If the coder finds a
  genuinely better existing carrier it may adopt it and document the swap in the report.
- OQ-4 (reported-by-other derivation): RULED — spec stance: drafting side declares claimStatus;
  server NEVER derives or rewrites it (derivation = resolution intelligence, forbidden by P8).
  No accept-time label validation in this item; flag as post-ratification candidate in the report.

Goal (one sentence): Ship the cross-cutting attestation layer — a reviewable attestation-envelope
whose acceptance IS the attestation (P2), with attestedAt/occurredAt time semantics (Q8/Q5),
payload-revision pinning with idempotent accept, and the Q4 supersession/correction model —
as schema + lint data plus minimal server write paths, so MATRES-RECV/FULFIL/CHAIN ride it
instead of duplicating it.

## 0. Inputs and posture

- Task block: LANE-2 list, `id: MATRES-ATTEST` (campaign 2). Acceptance criteria quoted verbatim in §6.
- Contracts memo r1 (`~/.hermes/specs/intake/2026-10-19_material-resolution-attestation/contracts-memo-r1.md`):
  Q1-Q8 answered with PROPOSED DEFAULTS, ratification = unvetoed by 2026-10-21 18:00 EDT.
  THIS SPEC DRAFTS AGAINST THE PROPOSED DEFAULTS. Every dependent decision is tagged
  `[DEFAULT-PENDING-RATIFICATION: Qn]` so a veto is a targeted patch to that tag's section,
  not a rewrite. DISPATCH RULE (orchestrator ruling l2t2135, supersedes composer's stricter
  line): the coder STARTS NOW under the proposed defaults — the memo's own ratification clause
  exists so silence does not deadlock the lane. If any Q is later vetoed, dependent work stops
  at the tagged section and reports; the marker scheme makes that a targeted patch, not a
  rewrite.
- r2 audit (`gpt6-round2-answer.md` §1, §2): acceptance-narrowing, revision pinning beyond
  protocolSha, and "supersession is an audit pattern, not a complete correction model" — the
  three holes this item exists to close.
- Trunk: `cl/integration-2` @ `ae0c6cbf` (verified this session). Lane stack :3093/:5193.

## 1. Ground truth verified this session (orch/composer first-hand, not scout-grade)

| Fact | Evidence (verified) |
|---|---|
| `attestedAt` does not exist anywhere in schema/, server/src, app/src | rg over trunk @ ae0c6cbf, zero hits |
| `occurredAt` does NOT exist on plate events | zero hits under `schema/workflow/events/`; `plate-event.schema.yaml:46-49` has only `at:` ("Actual execution timestamp, if known") + `t_offset`, with `anyOf: [at | t_offset]` at :76-78 — the memo's "grep found none" claim HOLDS |
| Sample-receipt immutability is DECLARATIVE ONLY | `schema/services/sample-receipt.schema.yaml:8` ("Immutable after creation — corrections are new receipts") is schema prose; the server wall is `appendOnlyWallError` at `server/src/store/RecordStoreImpl.ts:273-278` — a generic list `['record-revision','signature','audit-event', ...config.appendOnlyKinds]`; `sample-receipt` is NOT in `DEFAULT_CONFIG.appendOnlyKinds` (`server/src/config/types.ts:528`: `['audit-event','signature','vendor-protocol-candidate']`). Scout confirmed the same (screening; the two file:line anchors I re-read myself are load-bearing). |
| The house pattern for append-only + supersession that IS enforced | the `appendOnlyKinds` DATA knob + `RecordStoreImpl.ts:273` generic wall (no domain branches); schema-side precedent `schema/core/lab-state.schema.yaml:6,59` "Append-only via supersedes" |
| Payload-revision pinning already exists end-to-end | `server/src/drafts/FormDraftService.ts`: compile mints `reviewHash = contentHash(stable)` (:161); accept re-checks `draft.compiled.reviewHash !== body.reviewHash -> 409` (:168), early-returns the stored result when `status==='accepted'` (repeat-accept idempotence, :169), recompiles and re-checks reviewHash inside the lock (:179-180), and writes nothing until the whole plan revalidated (:185-197) |
| Deterministic idempotent-id precedent ("mint-idem") | `server/src/materials/termId.ts` — label-hash, same input -> same id; pinned by `VocabHandlers.mint.test.ts`, `termId.test.ts` |
| Revision-ref datatype exists for pinning | `schema/core/datatypes/revision-ref.schema.yaml` (`type: record-revision`, `id: ^REV-[A-F0-9]+$`); `event-graph.schema.yaml:16-26` already carries `protocolRevisionRef` + a `protocolSource.contentHash` "checked at graph acceptance" |
| planned-run carries `checksums.protocolSha` only | `schema/workflow/planned-run.schema.yaml:153-163` — r2's "protocolSha pins the protocol only" is exactly today's shape |
| `material_source_requirement` exists on add-material WITHOUT a stable requirementId | `schema/workflow/events/plate-event.add-material.schema.yaml:52-89` (status enum `unresolved|provided|linked`; no `requirementId` field) — requirementId is FULFIL's audit-first work, NOT this item's |
| planned-run accept mechanics | POST `/api/intent/accept` = `IntentAcceptHandlers.ts` mints an LPR local-protocol (verified, full read). Scout claims `ProtocolContextService.ts:100-145` covers planned-run promotion — SCREENING ONLY, coder must re-verify before citing; no claim in this spec depends on it. |
| Backend has `exactOptionalPropertyTypes: true` | `server/tsconfig.json:13` |
| Baselines | server typecheck baseline **0** (task-list A5n note 10403 + MATRES-SHELF done note "typecheck -w server EXIT 0 (baseline 0)"); app tsc baseline 23 (not touched — no app files here). Full-suite failing-file baseline must be re-recorded by orch at dispatch time (lane norm). |

## 2. Deliverables (a)-(e), per the task block, mapped to files

The task block: "(a) ATTESTATION PAYLOAD contract ... (b) PAYLOAD REVISION pinning ...
(c) SUPERSESSION-CORRECTION model per MATRES-0 Q4 ... (d) unknown-provenance terminal states
(Q5) ... (e) plate-event/event-graph occurredAt story for retrospective events". Plus:
"Reuse the sample-receipt immutability+supersession house pattern; where its semantics are
insufficient (correction propagation), extend declaratively and say so."

### 2a. Attestation envelope — `schema/lab/attestation.schema.yaml` (NEW) + `attestation.lint.yaml` (NEW)

Record kind `attestation` (id convention `ATT-...`). Triplet note: `.schema.yaml` + `.lint.yaml`
ship here; `.ui.yaml` is DEFERRED with a note (no UI surface in this item; sample-receipt ships
schema-only precedent; review-wall rendering is MATRES-CHAIN's browser gate).

Envelope shape (all `[DEFAULT-PENDING-RATIFICATION]` per Q2/Q3/Q8 where tagged):

- `kind: const "attestation"`; `recordId` pattern `^ATT-[A-Za-z0-9][A-Za-z0-9_-]*$`;
  `FAIRCommon` via `schema/core/common.schema.yaml#/$defs/FAIRCommon` (repo convention);
  `unevaluatedProperties: false` / `additionalProperties: false` throughout (PROTO-AI-2 discipline).
- `artifactKind` enum `plan-slot-reference | planned-run-binding | material-spec | attestation-chain | candidate-protocol`
  `[DEFAULT-PENDING-RATIFICATION: Q2]`. An `attestation` record asserting physical facts declares
  `artifactKind: attestation-chain`. (The Q2 default itself, the emission-side enum + drafting
  header, is NOT built here — only this envelope-side slot exists so kinds cannot drift later.)
- `claims[]`, minItems 1. Each claim (allOf FAIR-less plain object, additionalProperties:false):
  - `claimStatus` enum **exactly** `[ proposed, completed, unknown, reported-by-other ]` — the P2
    review-wall labels as DATA (schema enum; no TS branch; no resolution intelligence — see §4).
  - `assertion` — a free-shape `type: object` business assertion payload with at least `verb` +
    `about` (entity ref). Deliberately loose: assertion payload shapes belong to RECV/FULFIL/CHAIN;
    the envelope owns the WRAPPER semantics. (r2: "attests the assertions displayed in that payload".)
  - Time per Q8 `[DEFAULT-PENDING-RATIFICATION: Q8]`: `occurredAtStatus` enum
    `[ known, approximate, unknown ]` (required); `occurredAt` (date-time) legal iff
    known|approximate; `approximation` (string, e.g. "morning", "~last week") legal iff
    approximate. Lint enforces the pairing (business rule in lint YAML, never TS):
    `known => occurredAt exists`; `approximate => occurredAt + approximation present`;
    `unknown => neither present`.
  - Identity triple per P3/Q8 `[DEFAULT-PENDING-RATIFICATION: Q8]`: `performer`,
    `accountSupplier`, `attestor` — each a ref-shaped object `{kind:record, type:person, id}`
    OR absent; absence is legal and means `unknown`, NEVER presumed equal to another slot
    (P3: "may coincide but are never silently presumed identical"; "absence of performer is
    unknown status, never presumed = attestor"). Optional means absent-or-value
    (exactOptionalPropertyTypes) — see reviewer bait §7.
  - `evidenceRefs[]` optional, ref-shaped data references (photo/packing slip), never inline blobs.
- `attestedAt`: **server-stamped at acceptance, immutable, absent before accept** — schema marks it
  present-iff-record-status; the accept service stamps it; the append-only wall (§2b) makes
  post-accept edits impossible at the store layer. `[DEFAULT-PENDING-RATIFICATION: Q8]`
- `against` (pinning per Q3c) `[DEFAULT-PENDING-RATIFICATION: Q3]`: object with all-optional
  `plannedRunRef?`, `eventGraphRef?`, `graphRevision?`, `protocolSha?` — "whatever exists on the
  source, copied as-of-acceptance" (reference-copy, never a live pointer; d) "believed Monday /
  corrected now queryable" rests on this). NO new versioning engine; `graphRevision` values are
  revision/sha strings the edit path already computes (expectedSha / `revisionRef` REV- pattern).
- `supersedes` optional ref `{kind:record, type:attestation, id}` + `correction` optional object
  (see §2c). A claim-carrying attestation with `supersedes` present IS a correction record.
- Lint (`attestation.lint.yaml`, lintVersion 1, DSL ops exists/nonEmpty/regex/equals/in/all/any/not only):
  1. occurredAtStatus pairing rules above (three rules).
  2. a record with `supersedes` present must carry `correction` (see §2c); a record WITHOUT
     `supersedes` must NOT carry `correction`.
  3. `artifactKind: attestation-chain` => every claim has `claimStatus` in
     `[completed, unknown, reported-by-other]` — a CHAIN may not carry `proposed` claims
     ("acceptance of a plan or instruction attests NOTHING physical", P2/r2).
  4. `performer/accountSupplier/attestor` absent-vs-present honesty: no rule fires identity
     equality; there is deliberately NO lint inferring performer=attestor.

### 2b. Payload revision pinning + idempotent accept — server

The mechanism ALREADY EXISTS and is the reuse target: `FormDraftService.compile/accept`
(reviewHash). Do NOT build a parallel accept path. Deliverable:

- `server/src/attestation/AttestationAcceptService.ts` (NEW, small): takes a draft carrying a
  proposed `attestation` envelope (+ its planned writes if the chain creates records — RECV/CHAIN
  will feed it; this item proves the mechanism with envelope-only fixtures):
  1. `accept` requires `{draftId, revision, reviewHash}` and re-checks exactly as
     FormDraftService.ts:168/180 does — a payload mutated after review cannot ride an earlier
     accept (409, zero writes; reuse the `DraftError` 409 messages/pattern, do not invent a channel).
  2. On first accept: server-stamp `attestedAt` (injectable clock, test-pinned — the
     `lab-sync/outbound/mint.ts:38` injectable-clock precedent), mint the attestation recordId
     DETERMINISTICALLY as a content-hash over the payload revision
     (`[DEFAULT-PENDING-RATIFICATION: Q4]` e — termId.ts discipline; NEVER `Date.now()`, see
     reviewer bait), persist via `ctx.store.create`, and mark the draft `accepted`.
  3. Repeat accept of the same `(draftId, revision, reviewHash)`: early-return the stored result
     (FormDraftService.ts:169 pattern). Zero duplicate attestation/receipt/aliquot/consumption
     records — the store-level create-if-absent + deterministic id makes this structural.
- `server/src/config/types.ts` DEFAULT_CONFIG `appendOnlyKinds` gains `'attestation'` (a DATA-KNOB
  list entry; the wall at RecordStoreImpl.ts:273 is already generic). Do NOT add a `sample-receipt`
  entry here — tightening an existing unenforced kind is a scope+audit decision for its own item
  (its lint `sample-receipt-truth-recorded` stays untouched). Say so in the code comment.
- Where revision pinning differs from the draft flow: nothing. The attestation envelope's `against`
  block is payload data frozen by the same reviewHash; no new hash.

### 2c. Supersession-correction model (Q4, case 5) — schema + a resolver, NOT a rewrite engine

`[DEFAULT-PENDING-RATIFICATION: Q4]` — this whole subsection is the Q4 default; a Q4 veto stops here.

- Schema (part of 2a): `correction: { claimTarget: { mode: enum[same-entity-reattribute,
  entity-substitution] (required) }, changedFacts: object (minProps 1), resolutionNote? }`.
  The memo's literal example kind `material-receiving-correction` is RECV-shaped naming; THIS
  item ships the generic mechanism (`attestation` + `supersedes` + `correction`) and RECV names its
  own record on top. Flagged as OQ-2 — memo wording vs generic kind is a naming call, not policy.
- Lint rules (declarative, lint YAML):
  - `supersedes` target must be ref-typed `attestation` (structural);
  - `entity-substitution` mode => lint ERROR severity rule recorded against the correction
    ("substitutions touching an already-CONSUMED reference require an explicit deviation
    resolution before the correction can reach accepted state", Q4b). This item ships the
    deviation-FACT emission shape: accepting such a correction appends a clarification-grade
    deviation fact record (reuse the generic audit/`deviation` shape already decided at dispatch —
    see OQ-4; if none fits, the deviation fact is itself an `attestation` claim with
    `claimStatus: unknown` + `about: <consumption ref>`, honest and queryable, zero new kinds);
  - content-hash idempotency: id = hash(supersedes + changedFacts + claimTarget.mode)
    (Q4e) — duplicate submission lands on the SAME record id (termId precedent).
- `server/src/attestation/CurrentAssertionView.ts` (NEW, pure module): given all attestations
  about an entity, the CURRENT assertion chain = most-recent un-superseded attestation per
  subject (derivation, not storage — Q4c). Descendants keep pointing at the ENTITY; their lot /
  received-date reads go through this view, which is exactly what prevents orphaned/duplicated
  aliquots (Q4b). Surfacing via the shelf lookup (MATRES-SHELF, merged @ ae0c6cbf) is OQ-3 —
  this item ships + tests the resolver; wiring it into `InventoryShelfHandlers` is a one-line
  follow-up only if the orchestrator rules it in scope.
- What is NOT here: fulfillment re-evaluation mechanics (FULFIL's `fulfillment-review` fact —
  this item only proves the hook exists by asserting that a correction over superseded evidence
  yields the lint-declared re-evaluation OBLIGATION as a queryable fact, and that the intended
  requirement payload is byte-unchanged).

### 2d. Unknown-provenance terminal states (Q5) — lint + elicitation shape

`[DEFAULT-PENDING-RATIFICATION: Q5]`. Covered by the occurredAtStatus triple in every claim
(§2a rule 1) plus: a test-proven assertion that a claim/attestation with
`occurredAtStatus: unknown` is SCHEMA-VALID and LINT-CLEAN (terminal-honest: "I don't know" is a
complete answer), and no write path EVER fills occurredAt/attestor-side actor fields from `now()`
when status is unknown (honesty ceiling; the injectable clock is only consulted for attestedAt).
No manufacturing. Downstream consumers treat `unknown` as INCOMPLETE (P8) — this item only pins
that the data shape carries it; per-consumer behavior is RECV/FULFIL.

### 2e. Plate-event / event-graph occurredAt story (retrospective events)

`[DEFAULT-PENDING-RATIFICATION: Q8]` (final memo paragraph: "the plate/event-graph occurredAt gap
... closes here: event-side occurrence time joins the envelope per this triple").

- `schema/workflow/events/plate-event.schema.yaml`: add optional `occurredAtStatus`
  (enum `known|approximate|unknown`) and `occurredAt` (date-time) — the same triple vocabulary as
  §2a. `at:` and `t_offset` are KEPT UNTOUCHED (byte-stable; every existing compiler/well-state
  replay reads them). Lint (`schema/workflow/events/plate-event.lint.yaml` — extend the existing
  event lint file if one loads for this schema; else new): `occurredAt` present =>
  `occurredAtStatus: known|approximate`; `occurredAtStatus: known` => `occurredAt` present.
  Present-tense chains default `known=today` at draft time (memo), but the DEFAULTING happens in
  the drafting layer (CHAIN/RECV), not in validation. `event-graph.schema.yaml` gets no fields —
  its revision pinning story is the envelope's `against` block (§2a); say exactly that in the
  spec diff comment so reviewers see the decision.
- Plate events are editor content inside an event-graph, not records — the append-only wall does
  not apply to them; the immutability that matters (Q4 "never rewrite history") lives on the
  `attestation` RECORD, not on graph events. State this in the lint header so a reviewer does not
  read event-side occurredAt as a mutable-history loophole: mutating a graph event after an
  attestation pinned it means the pin (`against.graphRevision`) no longer matches — the accept-time
  re-check (§2b) surfaces that as a conflict, per Q3d reference-copy semantics.

## 3. Files IN scope / OUT of scope

IN:
- schema/lab/attestation.schema.yaml (NEW), schema/lab/attestation.lint.yaml (NEW)
- schema/workflow/events/plate-event.schema.yaml (additive fields), plate-event lint YAML (NEW/extend)
- server/src/attestation/AttestationAcceptService.ts (+ tests), server/src/attestation/CurrentAssertionView.ts (+ tests)
- server/src/config/types.ts — DEFAULT_CONFIG.appendOnlyKinds += 'attestation' (one data entry + comment)
- server/src/schema/AttestationSchemas.test.ts (NEW, triplet/load convention of
  ServiceDomainSchemas.test.ts); server/src/attestation/AttestationCase5.test.ts (NEW);
  server/src/store/AppendOnlyWall.attestation.test.ts (NEW, supertest or store-level mirroring
  existing append-only tests)
- tests per §5; report at deliverable path §8

OUT (hard — reviewer should reject any diff that touches these):
- app/** — no UI. The review-wall LABEL RENDERING (proposed|completed|unknown|reported-by-other
  as pixels) is MATRES-CHAIN's browser gate; this item ships the enum-as-data + lint only.
- schema/lab/material-receiving* (RECV), fulfillment/requirementId/plate-event.add-material
  fields (FULFIL), clarification panel/vocabulary levels (PANEL/ELIG/Q1), artifactKind
  emission-side machinery (Q2 drafting side), mint-on-select, hold/reservation, decrement,
  protocol promotion (parked), scientist-intent vocabulary verbs (verb union stays 32),
  FormDraftService internals (reuse via composition, do not fork/patch its flow),
  sample-receipt / services/** (unchanged), main, /mnt/vast/home/brad/git/computable-lab.

## 4. No new resolution intelligence (P8) — explicit negative commitments

- `claimStatus` is a DECLARED label on a claim, chosen by the drafting side and confirmed at the
  review wall; nothing in this item computes, infers, or ranks it. No "isAttested", no
  confidence score, no eligibility predicate, no spine touch.
- The occurred/attested triple is stored time, not time reasoning; `CurrentAssertionView` is a
  pure most-recent-un-superseded fold, no heuristics.
- No predicate-DSL extension (that capability already exists; consume only).
- Hardcode boundary: business rules live in lint YAML; the only server data entry is the
  appendOnlyKinds list value. No `if (kind === 'attestation')` branches anywhere in TS; the
  accept service is a writer, not a policy engine.

## 5. RED-first vitest plan (write these FIRST, watch them fail, then implement)

Harness conventions: schema tests mirror `server/src/schema/ServiceDomainSchemas.test.ts`
(registry loads triplet, Ajv validate); API/store tests mirror existing supertest patterns in
`server/src/api/**.test.ts` and the append-only tests around RecordStoreImpl; case-5 fixtures
use MemoryRecordStore (see `scripts/migrateRecordLifecycles.test.ts` style fake-store usage).

5.1 `AttestationSchemas.test.ts`
- valid envelope with one `completed` claim, occurredAtStatus known + occurredAt -> PASS
- occurredAtStatus unknown, occurredAt ABSENT -> schema-valid AND lint-clean (Q5 core, AC for (d))
- occurredAtStatus known WITHOUT occurredAt -> lint error names the claim path
- occurredAt present with occurredAtStatus unknown -> lint error
- claimStatus reported-by-other with accountSupplier != attestor (two different person refs) ->
  PASS with zero identity-coercion (assert the stored payload keeps both refs byte-identical)
- claim with performer ABSENT -> PASS, and NO field is synthesized (P3)
- artifactKind attestation-chain containing a `proposed` claim -> lint error (P2 wall)
- unevaluated property anywhere in envelope or any claim -> rejected naming the offending path
- undefined-valued optional at the TS call sites must not reach the validator
  (exactOptionalPropertyTypes is compile-time; runtime test asserts `! ('occurredAt' in claim)`)

5.2 `AttestationCase5.test.ts` — the Q4 walkthrough as executable fixtures.
Monday fixture: attestation A = receipt claim(lot 09231, bottle B) + prep + 10 aliquot claims +
1 consumption claim, all completed, attestedAt Monday. Tuesday: correction A2 = attestation with
supersedes=A, claimTarget.mode same-entity-reattribute, changedFacts {lot: "09213"}, evidenceRefs
= [photo]. SEVEN SEPARATE `it()` blocks, one per r2/Q4 outcome, each individually asserted:
1. A and A2 BOTH persist and are queryable (original never rewritten/deleted — compare A's stored
   payload bytes pre/post correction, sha equality).
2. NO second arrival: arrivals-for-entity(B) counts receipt-class claims once; a correction never
   increments any arrival count; entity-substitution fixture likewise creates no new entity id.
3. Descendant identity: the 10 aliquot record ids are byte-unchanged after the correction
   (ids list equality before/after).
4. Corrected-source discoverable downstream: CurrentAssertionView over A+A2 for entity B yields
   lot 09213; resolving an aliquot's provenance THROUGH the view surfaces 09213 (chain:
   aliquot -> entity B -> current assertion).
5. Both accounts queryable: historical view (A alone) still says 09231; current view says 09213;
   a "believed Monday" query and a "corrected now" query return different, both-live answers.
6. Lot-scoped fulfillment re-evaluation hook: a fixture fulfillment fact citing superseded A
   yields the declared re-evaluation obligation fact after the correction, and the intended
   requirement fixture bytes are UNCHANGED (assert contentHash equality).
7. Double-submission idempotent: submit the identical correction twice -> SAME record id (content
   hash), exactly one record; submitting a DIFFERENT changedFacts correction against A lands as a
   second correction (not a mutation of A2).
Plus: entity-substitution mode fixture touching an already-consumed ref -> correction cannot
reach accepted state until a deviation resolution fact exists (lint/server gate per §2c, error
names the consumed ref).

5.3 `AttestationAcceptService.test.ts`
- (b) AC: post-accept payload mutation rejected — compile draft -> mutate envelope (change a lot
  string) -> accept with the ORIGINAL reviewHash -> 409 + ZERO records created (store spy: no
  create calls) — mirrors FormDraftService.test.ts / recordDraftCompile's deterministic-
  idempotence trap tests.
- Double-submission idempotency (the task-block named test): accept the same revision twice ->
  exactly one attestation record; second response equals first (the :169 early-return shape).
- attestedAt server-stamped with injected clock; occurredAt preserved byte-verbatim from the
  draft (server never writes occurredAt); unknown-status payload comes out with occurredAt ABSENT.
- `against` pinning: fixture draft carrying `against.graphRevision` survives accept byte-stable;
  a fixture where the graph sha moved after compile is refused at the re-check (409).

5.4 `AppendOnlyWall.attestation.test.ts`
- `ctx.store.update` on a stored attestation -> `{success:false, error:'APPEND_ONLY: immutable
  records cannot be updated'}`; delete likewise; a NON-attestation control record still updates
  (proves the wall is the generic data knob, not a new mechanism).

## 6. Acceptance criteria (task block, verbatim)

> RED-first vitest incl. the case-5 walkthrough as executable fixtures
> (7 outcomes from MATRES-0 Q4 each individually asserted); double-submission
> idempotency test; post-accept payload mutation rejected; typecheck baselines.

And the description's binding shape: "(a) ATTESTATION PAYLOAD contract — the reviewable unit
whose acceptance equals attestation (P2): enumerates each assertion with label
proposed|completed|unknown|reported-by-other, performer/account-supplier/attestor identities
(P3, may coincide, never presumed), attestedAt vs occurredAt explicit (Q8); (b) PAYLOAD REVISION
pinning — an acceptance binds a payload revision; AI edits after review cannot ride an earlier
accept; repeated acceptance never duplicates receipts/aliquots/consumption (idempotency);
(c) SUPERSESSION-CORRECTION model per MATRES-0 Q4 ...; (d) unknown-provenance terminal states
(Q5) ...; (e) plate-event/event-graph occurredAt story for retrospective events (none found by
grep today). Reuse the sample-receipt immutability+supersession house pattern; where its
semantics are insufficient (correction propagation — r2: audit pattern is not a correction
model), extend declaratively and say so."

Phrased for the adversarial reviewer, the PASS test is:
- every one of the 7 case-5 outcomes is its OWN `it()` with an isolated assertion (a combined
  "correction works" test = defect);
- idempotency is proven by record COUNT and record ID, not by response equality alone;
- post-accept mutation proves ZERO WRITES (spy on store.create/update), not just a 409;
- no TS branch on a kind/kind-verb string anywhere in the diff (grep the diff for
  `'attestation'` string comparisons — data-knob list membership is the only allowed site);
- occurredAt is NEVER server-synthesized anywhere in the diff.

## 7. Reviewer bait (name the edge errors BEFORE the reviewer does)

1. exactOptionalPropertyTypes (server/tsconfig.json:13): every optional envelope field is
   absent-or-value. All payload construction uses conditional spread
   `...(x ? {occurredAt: x} : {})` — the FormDraftService.ts:73-77 house idiom. A `field: undefined`
   anywhere in the new TS is a defect, not a style nit.
2. YAML-reload trap (lane header fact): `tsx --watch` does NOT reload schema/lint YAML. After any
   schema/lint edit, restart the lane stack (`cl-lane-stack.sh 2 restart` runs BLOCKING — background
   it or expect a timeout; `2 status` is safe) before any curl/live proof, or the run will validate
   against the OLD schema and the RED->GREEN conclusion is fake.
3. Ontology/vocabulary terms: claimStatus enum values are EXACTLY `proposed|completed|unknown|
   reported-by-other` (hyphen, lowercase — P2 wording); occurredAtStatus EXACTLY
   `known|approximate|unknown` (Q5). No new level nouns; the five referent levels are
   concept|formulation|vendor-product|instance|aliquot and are NOT re-declared here.
   `reported-by-other` is not derived by code (see OQ-4).
4. Hardcode boundary: the append-only protection is the `appendOnlyKinds` DATA entry + the existing
   generic wall (RecordStoreImpl.ts:273) — adding `if (payload.kind === 'attestation')` to a new
   TS guard is the canonical failure; also do NOT copy the wall into a second place.
5. Deterministic-id trap (`server/src/drafts/analysisCompile.ts:337-338` warning, termId law):
   the correction/attestation recordId must be a pure content hash. Any `Date.now()`/`randomUUID`
   in an id path silently breaks the double-submission test and Q4e — and re-accept reviewHash
   reproduction.
6. "Reuse the sample-receipt pattern" is a trap as literally worded: sample-receipt's immutability
   is NOT enforced (§1 row 3). The enforceable house pattern is `appendOnlyKinds` + the generic
   wall + schema-side `supersedes` (lab-state precedent). The report must state this distinction;
   claiming receipt-side enforcement exists = reviewer defect.
7. `at:` vs new `occurredAt` on plate events: `at`/`t_offset` and the `anyOf` at
   plate-event.schema.yaml:76-78 must be byte-stable — the well-state replay and compiler read
   them; adding a REQUIRED event field breaks every existing graph fixture (RED suite green-then-
   red is the tell).
8. Case-5 outcome 1 is bytes, not vibes: assert the superseded attestation's stored contentHash
   is identical before and after the correction. An implementation that "re-reads and re-saves"
   A passes a naive test and fails this one.
9. Repeat-accept early return must not bypass policy: the FormDraftService shape (:169) returns
   the stored result BEFORE re-validation deliberately for an already-accepted identical
   revision — copying it is right; skipping the reviewHash check that precedes it (:168) is wrong.
   Both orders exist in the file; cite the line pair in code comments.

## 8. Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/matres-attest-lane2` off lane trunk `cl/integration-2`
  (tip at dispatch time; ae0c6cbf at draft time), branch `cl/lane2-matres-attest-<tickid>`.
- Profile: task-list owner says cl-senior — that profile is RETIRED; dispatch as `cl-worker`
  (thunderbeast; NOT the fleet coder lock — lane handoff l2t1930 PITFALL note).
- Deliverable (unique path): `.hermes/plans/MATRES-ATTEST-report.<tickid>.md` on-branch;
  report must contain: RED evidence (first failing run), per-§5 suites, the case-5 seven-`it()`
  listing with names, baseline proof (§9), the sample-receipt-pattern distinction (§7.6), and a
  `[DEFAULT-PENDING-RATIFICATION]` impact note if any tagged default changed during the run.
- Gates: this item is schema+server — NO browser gate by spec (record the ruling in the DONE
  note, MATRES-SHELF precedent). UI labels gate later at CHAIN.
- Stack: backend :3093, frontend :5193; restart after YAML edits; data repo
  /home/brad/.computable-lab/worktrees/main (lane-local).

## 9. Verification commands (expected outputs)

First targeted check (proves the approach early — run it as the very first RED):
    cd server && npx vitest run src/schema/AttestationSchemas.test.ts
  Expected RED at start: FAIL (schema/lab/attestation.schema.yaml absent). First GREEN: the same
  command passes once 2a schema+lint exist, BEFORE any server code — that early signal proves the
  contract is expressible as data before a single line of TS is justified.

Full verification:
    npm run test:run -w server -- src/schema/AttestationSchemas.test.ts src/attestation src/store/AppendOnlyWall.attestation.test.ts
      -> all listed files pass, 0 failed
    npm run test:run -w server
      -> failing-FILE set identical to the baseline set recorded by orch at dispatch (zero NEW
         failing files); zero failing tests in owned files
    npm run typecheck -w server
      -> EXIT 0 (baseline 0; any new error is a stop-condition, unlike the 33-error lane-1 era)
    YAML reload proof (after stack restart, data repo seeded or factory-boot fixture):
      curl -s -X POST localhost:3093/api/records ... an attestation fixture with
      occurredAtStatus unknown -> 2xx; follow-up PUT /records/ATT-... -> 409/4xx carrying
      'APPEND_ONLY' (curl output in the report)
    git diff --stat main...HEAD (three-dot) -> only §3 IN-scope paths; app/ untouched

## 10. OPEN QUESTIONS (memo silent or code contradicts memo — NOT resolved locally; no policy invented)

OQ-1 — "authorized named identity" at accept time. P2/Q8 require attestation by an AUTHORIZED
named identity; the code today threads an `actor` string into FormDraftService (constructor) and
drafts are actor-private, but I found no role/authorization table deciding who may attest
physical facts (checked: authorizationService covers record access, not attest authority).
Spec stance taken: the envelope stores the attestor ref supplied with the accept request;
authority enforcement is flagged as needing an explicit ruling (reuse governance/lifecycle
signature machinery? governance/signature.schema.yaml exists and is append-only). Do not let the
coder bolt on a bespoke auth branch.

OQ-2 — correction kind naming. Memo Q4a literally shows `kind: material-receiving-correction`
(RECV-shaped) while the task's cross-cutting posture argues one generic mechanism. Spec stance:
generic `attestation`+`supersedes`+`correction`; RECV names its own kind later. This is memo
wording vs architecture — needs the architect/orchestrator's nod (or Brad's, folded into Q4).

OQ-3 — deviation-fact record kind for entity-substitution (Q4b). Checked: no general
deviation/clarification-grade durable record kind surfaced in search (`schema/` has no
deviation record; clarification lives in memory per the l2t1930 handoff's F-3 gap). Spec stance:
model the deviation as an `attestation` claim with `claimStatus: unknown` + `about` = the consumed
ref (honest, queryable, zero new kinds) UNLESS the orchestrator rules a first-class kind now.
The memo prescribes the requirement ("emits a clarification-grade deviation fact") but not its
carrier.

OQ-4 — how `reported-by-other` is SET. r2's actor-split case ("Alice reports what Bob did") and
P3's identity triple jointly imply claimStatus reported-by-other iff the account comes from
someone other than the attestor, but the memo never states a derivation rule and the code has
none. Spec stance: drafting side declares it; server NEVER derives or rewrites claimStatus
(derivation would itself be resolution intelligence, P8). If Brad wants the server to VALIDATE
the label against accountSupplier!=attestor, that's a lint/accept rule to add post-ratification.

Minor (resolved in-spec, listed for visibility): `at:` stays canonical for planned-state replay
and the new triple only annotates attested occurrences (memo: default known=today); the
relationship is documented in lint header text, and the deliverable-(e) question "should
occurredAt REPLACE at:" was answered no (byte-stability of every existing graph fixture outranks
elegance).

## 11. Scout recon used (screening, per procedure)

Two `hermes -p cl-scout` dispatches (logs /tmp/l2t2030-recon/scout-*.log): receipt-immutability
question (load-bearing claims independently re-verified at RecordStoreImpl.ts:273-278 and
config/types.ts:528 before citation) and planned-run-accept question (ProtocolContextService
claim NOT load-bearing anywhere in this spec; flagged in §1). No scout output is cited as
authority without a matching first-hand read above.
