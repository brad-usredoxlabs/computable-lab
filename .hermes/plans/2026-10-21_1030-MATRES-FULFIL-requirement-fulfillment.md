# MATRES-FULFIL — Fulfillment binding (requirement fulfillment spec) — DRAFT l2t0355 (2026-10-20 04:30 EDT)

Status: DRAFT for orchestrator review. NOT canonical, NOT dispatchable until promoted.
Composer: cl-spec-composer (l2t0355). Item: MATRES-FULFIL, lane-2 task list :10858-10891.
Trunk verified against: `cl/integration-2 @ b59225b90ae0973be28026e520215934cb93e4c6` (docs tip; CODE tip 46c3e4e9 = MATRES-ATTEST merge, verified ancestor via `merge-base --is-ancestor`). NFS repo: every git command with `-c core.fileMode=false`; trunk is read-only for this composer.
Contracts memo r1: sha256 VERIFIED this session = `e8d8165882fd17af697c662539738b30f86bbca793dfffbc1c6d499fe7099393` (exact match to the contract). Q1–Q8 are PROPOSED DEFAULTS, silent-ratify 2026-10-21 18:00 EDT. Every memo-dependent decision here carries `[DEFAULT-PENDING-RATIFICATION: Qn]`. Composed under defaults per AS-RECV-DISPATCH-UNDER-DEFAULTS precedent (silence must not deadlock the lane; a veto = targeted patch at the tagged section).

## §1 Goal (one sentence)

Close the plan/execute handshake: give every `material_source_requirement` occurrence a stable deterministic `requirementId` and a Shape-A `requestedSource` binding written by ordinary plan-editing (Q7), and let fulfillment land as an ATTACHMENT — an append-only attestation-kind record binding the quadruple (requirementId, plan recordId, pinned revision, evidenceRef) — so a requirement moves unresolved -> requested-source -> fulfilled-by-{receipt|derivation|instance} WITHOUT ever mutating the requirement object or the referenced reusable material-spec, with receipt-vs-formulation satisfaction a separate DECLARED compatibility evaluation whose INCOMPLETE outcome is legal (P8), and lot-scoped fulfillment claims re-evaluated (appended, never rewritten) when a correction supersedes their evidence (case 5).

## §2 Description (verbatim from task list :10864-10878 — BINDING)

> The requirement occurrence is a stable identity (schema-fit AUDIT FIRST, per
> r2: per-component requirements, stable ids, proposed physical-instance binding
> (case 3 Shape-A requested-source), fulfillment evidence refs, execution-scoped
> fulfillment history — these are NOT proven shipped; small schema extensions
> are in-scope, silent assumption is not). Transition data: unresolved ->
> requested-source(Shape A) -> fulfilled-by-{receipt|derivation|instance} with
> evidence ref, scoped to the PINNED plan/run revision (Q3) — a reusable
> material-spec is NEVER globally mutated to 'fulfilled'. A receipt proves
> CUSTODY; whether it satisfies a FORMULATION requirement is a separate declared
> compatibility evaluation (r2), with INCOMPLETE as a legal outcome (P8).
> Intended-alongside-used consistency: actualized event keeps material_spec_ref
> (intent) beside instance/aliquot refs (used); deviations recorded explicitly,
> lot-specific fulfillment claims re-evaluated on correction (case 5) without
> rewriting the intended requirement.

## §3 Why (verbatim from task list :10879-10883)

> The field's schema text promises exactly this ("records unresolved source/
> provenance needs without minting a concrete tube") but WHO writes the
> transition is undemonstrated today — case 3' and case 4 both dead-end without
> it. This is the seam that closes the plan/execute handshake.

## §4 Verified-by (verbatim from task list :10884-10890 — BINDING acceptance)

> RED-first tests: schema-fit audit answers committed first; case-3' chain
> fixture (plan with unspecified sources -> derivation accepted -> requirements
> fulfilled-by-derivation, plan revision unaffected); Shape-A case 3 (requested
> source on future add_material, no decrement anywhere); case-5 correction
> re-evaluates lot-scoped fulfillment, intended requirement bytes unchanged;
> fulfillment never mutates the shared material-spec.

Task-block `files:` line (:10891, BINDING scope anchor): `schema/workflow/events/plate-event.add-material.schema.yaml (+lint); server accept/derivation paths; tests`.

## §5 Dependency posture

- **MATRES-ATTEST — MERGED** (46c3e4e9, ancestor of trunk tip verified). The attestation substrate this spec rides is the MERGED code: `schema/lab/attestation.schema.yaml` (trunk state: claims/assertion/against/supersedes/correction INLINE — the $defs extraction is NOT yet on trunk), `schema/lab/attestation.lint.yaml` (9 rules incl. `attestation-correction-triggers-reevaluation-review` :193 — an info finding explicitly named "FULFIL hook"), `server/src/attestation/AttestationAcceptService.ts` (compile :141 / accept :172; correction identity :95, recordIdOf :113), `server/src/attestation/CurrentAssertionView.ts` (fold + `ReevaluationObligation` :39-61 with cite-based liveness via `assertion.cites` :105). Where this spec describes ATTEST surfaces, they are cited against trunk as-written; **where merged code deviates, merged code is authority** and a deviation at a cited surface is a spec patch, not coder improvisation.
- **MATRES-RECV — IN CODER FLIGHT** (worktree `/mnt/vast/home/brad/git/wt/matres-recv-lane2`, branch `cl/lane2-matres-recv-l2t0115`, commits bf599311 (material-receiving triplet, 12/12 schema suite) + 25a9522d (OQ-1 sanctioned additive $defs extraction Claim/Correction/AttestedAt/Against in attestation.schema.yaml) + branch-head 2f638fd2 lint-rule renames; server/src/receiving/ module phase still in progress). FULFIL consumes RECV shapes **as SPECIFIED in `.hermes/plans/2026-10-20_0010-MATRES-RECV-material-receiving.md`** and as pinned by those commits read read-only at draft time: record kind `material-receiving`, id pattern `^RECV-…`, `createdInstanceRef` required, corrections ride envelope `supersedes`+`correction`, receipt corrections carry the info-severity re-evaluation obligation (their rule `supersession-triggers-reevaluation-review`). **RECV is the fulfillment-by-receipt evidence source.** Because RECV is not merged and still moving: (a) FULFIL references receipts ONLY as generic ref-shaped evidence (`ref.schema.yaml`, `type: material-receiving | attestation`) plus the `assertion.cites` contract — FULFIL must NOT read any field inside RECV's claim payloads; (b) FULFIL dispatch is only legal AFTER the RECV merge (dependency posture per task block `deps: [MATRES-ATTEST, MATRES-RECV]`); (c) where RECV's merged claim/instance shapes deviate from bf599311, **merged code is authority** and §7.3's evidence-side examples are illustrative, not contracts.
- **MATRES-ELIG** (promoted spec `.hermes/plans/2026-10-20_0230-MATRES-ELIG-acceptability-policy.md`, coder NOT dispatched): FULFIL's compatibility evaluation is a DIFFERENT predicate domain (evidence-satisfies-requirement, not candidate-resolution). FULFIL does not import, extend, or file-conflict with `server/src/compiler/resolution/eligibility/` or `schema/scientist-intent/material-eligibility/` (see OQ-3).
- **Assumptions in force** (`~/.hermes/cl/lanes/2/assumptions.md`): **AS-ATTEST-EVIDENCE-ONLY-COLLISION — ruled by §7.6 of this spec** (the mandated routing). OQ-1 governance gap: WHO may attest stays open — FULFIL bolts on NO auth; fulfillment rides the ATTEST OQ-1 ruling (attestor ref stored from the accept request, no bespoke auth branch).

## §6 Mandatory schema-fit AUDIT (task block: "schema-fit AUDIT FIRST … these are NOT proven shipped")

All cites verified FIRST-HAND on trunk b59225b9 during this session. (AC-F1 in §10 commits these answers as executable first.)

**(a) `plate-event.add-material.schema.yaml` :52-89 `material_source_requirement` — PARTIAL.**
Exact current shape: an object (`additionalProperties: false` :54, description :55 literally: "records unresolved source/provenance needs without minting a concrete tube…"), `required: [status]` :56, `status` enum **`[unresolved, provided, linked]`** :58-60, optional ref-shaped slots `material_ref` / `material_spec_ref` / `vendor_product_ref` / `source_ref` (:61-68, all `$ref ../../datatypes/ref.schema.yaml`), free `reason` string :69-70, and a `source_details` bag :71-89 (manufacturer/vendor/catalog_number/lot_number/expiration_date/solvent_ref/concentration/taxon refs). Event-level `material_spec_ref` :27-29 (intent) coexists with `aliquot_ref` :31-33 / `material_instance_ref` :35-37 (used) — the intended-alongside-used slots already exist. The root `anyOf` :195-201 forces at least one source-ish ref. **What it can express today:** an unresolved source need (status `unresolved` + reason + spec refs). **What it CANNOT express:** any stable identity (no id field), any Shape-A requested-source binding (no proposed-instance slot), and any fulfillment state — `provided`/`linked` exist in the enum but **NO code anywhere writes or reads them** (first-hand grep: the only server writer emits `status:'unresolved'` — `server/src/materials/AddMaterialSupport.ts:457-461` `unresolvedSourceRequirement()`, called at :642/:669/:704 during event-graph normalization on create/update via `server/src/api/handlers/RecordHandlers.ts:594` (create) and :1133 (update); app mirror type `app/src/types/events.ts:126-…` with status the same three values; grep for `provided`/`linked` status writers: ZERO hits). Verdict: shape shipped; transition lifecycle ABSENT.

**(b) Per-component requirement identity — ABSENT.**
No `requirementId` exists on or beside `material_source_requirement` (schema grep clean). The only `requirementId` tokens in server/src belong to unrelated domains (`server/src/readiness/AuthorizationReadinessService.ts` training gaps; `server/src/procurement/*` manifest line ids `REQ-0001`). A stable id MUST be declared — §7.2. Component level: the component-level carrier that exists today is `composition_snapshot[]` (`composition-entry.schema.yaml`, `component_ref` + role enum) which the normalizer already grounds (`AddMaterialSupport.ts` `normalizeCompositionMaterialRefs`); §7.2 states explicitly whether per-component ids ride the event-level occurrence id + component anchor.

**(c) Where fulfillment evidence refs could ride — ABSENT event-side; PROPOSED (c) = Shape A "requested-source" slot on the requirement + attestation-side evidence.**
`material_source_requirement.additionalProperties:false` (:54) forecloses any un-declared ride. Schema-extension decision D1/D4 (§13): Shape A `requestedSource` (ref-shaped, optional — memo Q7's `proposedInstanceRef` consequence, named per P7) becomes a declared property (§7.1); fulfillment itself NEVER rides the event — it is an attestation-side record (§7.3), because the event lives inside a MUTABLE editor artifact (event-graph record; `plate-event.lint.yaml` header :14-19 states the immutability lives on the `attestation` RECORD). Evidence refs ride the fulfillment claim (`assertion.evidence` refs + envelope-level `evidenceRefs`, attestation.schema.yaml :135-139, :175-182 — shipped).

**(d) Plan/run revision pin mechanism (Q3) — PARTIAL (exists; reference-copy style).**
Three mechanisms exist, all deterministic, none global-mutating:
1. `planned-run.schema.yaml:150-161` `checksums.protocolSha` (+`geometryShas`) — stored pin of the source protocol content.
2. `attestation.schema.yaml` `against` block :152-173 (`plannedRunRef`, `eventGraphRef`, `graphRevision`, `protocolSha`) — Q3c reference-copy pinning, SHIPPED on trunk, "copied as-of-acceptance… NEVER a live pointer".
3. `ref.schema.yaml` :29-37 `revisionRef` `{kind:record, type:record-revision, id: ^REV-[A-F0-9]+$}` — a ref that "resolves instead of the mutable record head"; minted by `server/src/revisions/RecordRevisionService.ts:65` (deterministic `REV-` content hash; `token()` :37 = `meta.contentSha ?? meta.commitSha`, the optimistic-lock token).
**What fulfillment must scope to:** the event-graph (the plan artifact carrying add_material requirements) pinned as `against.eventGraphRef` + `against.graphRevision` = the graph's `contentSha` at accept time (the same token expectedSha compares — D4 precedent, no new versioning engine, Q3c), plus `plannedRunRef`/`protocolSha` when the fulfillment arises at run level. Accept-time drift: `AttestationAcceptService.ts` gate 3 (draft.reads pinned-source re-check, :186-193 region) already 409s when a pinned source moved — FULFIL passes the plan record in `draft.reads` and the scoping is STRUCTURAL, not advisory. Fulfillment NEVER writes to the plan record or the referenced material-spec (§12 bait 6 pins the byte-equality tests).

**(e) Accept/derivation paths that would write the transition — SHIPPED paths, but NONE writes a fulfillment transition today.**
- Event-graph create/accept: `RecordHandlers.ts:594` (POST record) and :1133 (PUT record) call `normalizeEventGraphMaterialUsage` (AddMaterialSupport.ts) — this is the ONLY writer of `material_source_requirement` (always `unresolved` synthesizer at :642/:669/:704; it never transitions an existing block). Deterministic implicit ids in that file (`ALQ-IMPLICIT-` :154, `MINST-IMPLICIT-` :159, `MSP-DRAFT-` :164) are seed-hashed (eventGraphId+eventId) — the house law holds there.
- Derivation accept: `server/src/api/handlers/MaterialLifecycleHandlers.ts:440-470` (creates `material-derivation` + links output instance) — **PITFALL FOUND**: its id helper `token()` at :130-132 is `Date.now()+Math.random()` (the pre-existing non-deterministic mint, used at :442-443/:681/:722). The campaign rule "deterministic ids only" applies to EVERY id/occurredAt path FULFIL adds: FULFIL must NEVER mint through `token()` and must NOT retrofit lifecycle handlers (out of scope; §12 bait 5 pins it).
- Attestation accept (the seam FULFIL rides): `AttestationAcceptService.compile/accept` (reviewHash re-check -> early-return -> pinned-reads re-check -> schema+lint revalidate -> attestedAt stamp -> create; deterministic content-hash ids, `attestedAt` injectable clock).
- Lint enforcement seam: `RecordStoreImpl.ts:1025` lints every create/update payload against `payload.schemaId` via LintEngine; rule selection filters by rule.schemaId (LintEngine.ts :110-119); rules bound to `schemaId` = `…/events/plate-event.schema.yaml` (plate-event.lint.yaml) fire on event-graph payloads ONLY, not on standalone detail payloads (§7.4's consequence).

**(f) Declared compatibility evaluation surface — ABSENT.**
No lint rule, policy file, or code site evaluates "receipt/evidence satisfies a FORMULATION requirement" (grep `fulfil` in schema/ hits only procurement/budget status enums, unrelated). INCOMPLETE-as-legal exists as a MEMO principle (P8, memo Q5 "any downstream task needing the fact treats unknown as INCOMPLETE, never as a mismatch or a pass") and as ELIG's own verdict set — but NOTHING surfaces it for fulfillment. §7.5 ships it as data. The lint DSL today: exists/nonEmpty/regex/equals/in/compare + PROTO-AI-3's generic `allIn` (lint-v1.schema.yaml :236-274), `noneIn` :276-316, `everyItem` :318+, plus all/any/not — **NO three-valued (pass/FAIL/INCOMPLETE) verdict is expressible by any single op**; §7.5 justifies the one extension needed and expresses the rest with everyItem+in patterns ALREADY shipped in attestation.lint.yaml (:27-95).

## §7 Design (no hedges)

### 7.1 Shape A + the transition, as DATA (D1, D2)

Transition membership table (the single normative table; every rule below reads from it):

```
requirement status:   unresolved   provided   linked        (existing enum, plate-event.add-material:58-60)
transition state:     unresolved -> requested-source -> fulfilled-by-{receipt|derivation|instance}
  written WHERE:      requested-source = event-side slot §7.1b
                      fulfilled-by-*   = attestation-side fulfillment RECORD §7.3 (NEVER a status value)
  legal when status:  requested-source: status unresolved|provided (D2)
                      fulfilled-by-*:   any status (a direct instance/aliquot add skips requested-source)
```

(a) **M1 ruling — DO NOT extend the `status` enum** (`add-material.schema.yaml:58-60 stays [unresolved, provided, linked]` — D2). The enum's two unloved members `provided`/`linked` already live on the requirement side; making them mean FULFILMENT would (i) conflate custody-attested fulfillment (P1/P2: only an attestation says what happened) with an editor content value anyone with PUT access can set, (ii) require the event side to name a record type for every evidence shape, and (iii) leave no home for the quadruple. Instead: `unresolved` -> `provided` remains the requirement's own drafting business (unchanged today's behavior); the FULFILMENT states are expressed by the existence of a current, un-superseded fulfillment attestation about `(requirementId, pinned revision)` — queryable through `CurrentAssertionView`, never stored back onto the event. A query helper MAY fold "is requirement R fulfilled at revision X" = exists current fulfillment claim with `about` = R's ref and matching pin (§7.3 quadruple); that fold is a pure read, the same style as the ATTEST fold.
(b) **Shape A `requestedSource`** — additive slot on `material_source_requirement` (D1): ref-shaped optional property, `type` restricted to physical referents (`aliquot | material-instance`), description names the P7 label REQUESTED SOURCE. Written by the ordinary plan-editing path (Q7 default: event edit / draft carry, NOT the resolve/panel selection, NOT a new verb — verb union stays 32, no new agent intent, no new forced tool). The clarification panel may PROPOSE it; the accepted draft carries it (memo Q7 verbatim). Schema change is purely additive; every existing fixture stays byte-valid.

### 7.2 Stable requirement identity (D3) `[DEFAULT-PENDING-RATIFICATION: Q3]`

Declared property on `material_source_requirement`: `requirementId: { type: string, pattern: '^REQE-[a-z0-9-]+$' }` (pattern excludes the procurement `REQ-` family — no two systems, one name; §12 bait 3). Minted by a small new helper `server/src/materials/requirementId.ts` mirroring the termId law (`server/src/materials/termId.ts` labelHash/labelSlug; NEVER Date.now()/randomUUID): `requirementId = 'REQE-' + labelSlug(anchor) + '-' + labelHash(anchor)` where the anchor is the occurrence's stable draft-time coordinate (event ordinal/eventId + graph recordId + slot name), NOT the mutable content. **Stability law:** editing `reason`, `source_details`, or swapping the bound spec NEVER changes the id; a re-draft of identical content at the same coordinate yields the SAME id (idempotent, Q3a "mint convention like termId's label-hash"). The helper is the single mint authority; `AddMaterialSupport.unresolvedSourceRequirement` (:457) gains the id on synthesized blocks (deterministic — same inputs as today's implicit ids), and any drafting/edit path that creates a requirement carries it.
**Per-component requirements (explicit ruling):** component occurrences are anchored by the entry's `component_ref` inside `composition_snapshot[]` (the shipped component carrier, §6b); `requirementId` remains the EVENT-OCCURRENCE identity; a fulfillment claim may name a `componentRef` alongside the `requirementId` (assertion field, §7.3) and lint pins that a claimed `componentRef` (when present) appears in the pinned plan's composition entries at that event — a `noneIn`-style membership check on plan reads [DEFAULT-PENDING-RATIFICATION: Q3]. Full per-component id minting is NOT declared — nothing consumes ids finer than (occurrence, component) yet; adding a second id system unasked-for is the silent-assumption the task block forbids. This ruling is flagged D3 for orchestrator ratification.
**Uniqueness (lint):** `add-material-requirement-id-unique`-style rule: across `events[*].details.material_source_requirement.requirementId`, the `allIn`-family must not repeat — expressibility caveat: the current PathResolver takes ONE wildcard segment (`server/src/lint/PathResolver.ts:131-137`), so `events[*].details.material_source_requirement.requirementId` (second wildcard would be needed for the composition case; the event-level path has none) IS expressible; the per-component uniqueness case is only declarable if the coder proves the resolver handles the composed path — if not, uniqueness moves into the fulfillment-side check (lint rule `...-requirement-exists-in-plan` already forces a plan read, which can name duplicates via a second rule) and the §5.11 constraint is recorded, not silently dropped.

### 7.3 The fulfillment record — attestation kind, zero new kinds (D4) `[DEFAULT-PENDING-RATIFICATION: Q3, Q4]`

Fulfillment IS an `attestation`-kind record (kind stays `const 'attestation'`, attestation.schema.yaml :28-29; `appendOnlyKinds` already lists `attestation` — config/types.ts:533; wall RecordStoreImpl.ts:273-278 generic) with `artifactKind: attestation-chain` (physical fact declared, Q2/RECV precedent), carrying a claim whose loose assertion (§2a-shipped looseness: `additionalProperties: true` with `verb`+`about`, attestation.schema.yaml :74-88) uses FULFIL's own vocabulary, declared ONCE as a schema-level enum extension point:

- `assertion.verb`: `'fulfills'` (first fulfillment) / `'re-evaluates-fulfillment'` (§7.6) — FULFIL's assertion verbs, NOT scientist-intent verbs (verb union 32 untouched).
- `assertion.about`: ref to the requirement occurrence — `{kind: 'record', type: 'event-requirement', id: <requirementId>}` — the requirement occurrence as a first-class referent (Q3b's target; minted-by-reference, no new record created). A reviewer must be able to trace about.id back to the event's `requirementId` byte-identically.
- `assertion.fulfilledBy`: enum `[ receipt | derivation | instance ]` — the three evidence families (RECV receipt `RECV-…`, derivation `MDER-…` output/instance, direct instance/aliquot).
- `assertion.evidence`: ref-shaped (generic `ref.schema.yaml`, `type` ∈ `material-receiving | material-derivation | material-instance | aliquot`), OPTIONAL `revisionRef` (`^REV-…`) when the evidence was pinned — never a bare string.
- `assertion.componentRef`: optional, §7.2.
- The quadruple (Q3b): `(requirementId [about.id], plan recordId [against.eventGraphRef/plannedRunRef], planRevision [against.graphRevision], evidenceRef [assertion.evidence])` — never mutating the requirement object, never touching the material-spec.
- `assertion.evaluations[]`: §7.5.
- Re-fulfillment on correction appends a NEW attestation carrying `supersedes` (the prior fulfillment record) + envelope `correction` (§7.6), leaving the superseded fulfillment queryable (Q3b verbatim).

**Why attestation-kind instead of a new `material-fulfillment` kind (D4, argued not hedged):** the review-wall semantics P2, the append-only wall, the deterministic id mint, the `supersedes`/`correction` pairing lint, and the `CurrentAssertionView` fold (its `ReevaluationObligation` machinery already reads `assertion.cites` — CurrentAssertionView.ts :105, :175-194) are all ALREADY implemented generically over kind `attestation`; a new kind would fork every one of them (the OQ-2 "one generic mechanism, no second envelope" ruling's direct analogue). Cost: `fulfilledBy` lives in the loose assertion bag, so its ENUM lives in the FULFIL lint file + a contract-test-pinned constant list (§12 bait 3), not in a schema property — accepted, and stated so the reviewer does not "discover" it.

### 7.4 Pinned-revision scoping (Q3) — accept-side structural enforcement

FULFIL compile requires the plan (event-graph and/or planned-run) in `draft.reads`; accept gate 3 (AttestationAcceptService pinned-source re-check) makes post-review plan drift a 409 BEFORE any write. The written record's `against{}` carries the reference-copies (§6d mechanisms, no new versioning engine). Lint (attestation-side, scope record — expressible because these are envelope fields, no wildcard): every `fulfills` claim requires `against.eventGraphRef` OR `against.plannedRunRef`, and BOTH `graphRevision`/`protocolSha` pairing rules follow the existing attestation pairing pattern. "Scoped to the PINNED revision" means: a fulfillment is always about `(requirementId, revision)`; a plan edit after the pin cannot ride the old accept (409) and re-accept re-pins (new record id — the content hash changes) leaving the prior fulfillment queryable. NEVER mutate a reusable material-spec globally: fulfillment writes NOTHING except its own attestation record (test: material-spec + plan record contentSha byte-equal before/after accept — AC-5).

### 7.5 Declared compatibility evaluation — receipt proves CUSTODY, not SATISFACTION (P8) `[DEFAULT-PENDING-RATIFICATION: Q4]`

`assertion.evaluations[] = [{ componentRef?|requirementSlot, verdict: compatible|mismatch|incomplete, basis: [declared-fact names] }]`, with the EVALUATION RULES as data: new policy file `server/src/fulfillment/fulfillment-compatibility.yaml` (data: per requirement-slot checks over adapter-exposed declared facts — e.g. `receipt.vendor_product_ref.material_ref == requirement.material_ref`, `lot ∈ requirement.acceptedLots` (when declared), `derivation.derivation_type == requirement.expectedDerivation`). Verdict derivation is a PURE read module `server/src/fulfillment/evaluateCompatibility.ts` run at draft-compile (draft path; NEVER the compiler — P6: compilation runs against accepted stable references; the evaluation is the REVIEW interaction). Three-valued semantics: a required declared fact missing -> `incomplete` (P8: "not known to mismatch" never evaluates as "known to match").
INCOMPLETE as a LEGAL outcome, enforced by lint (attestation.lint.yaml additions): (i) a `fulfills` claim with `claimStatus: completed` requires EVERY evaluation verdict `compatible` (everyItem+in pattern, shipped idiom attestation.lint.yaml:27-95) — evidence with an `incomplete` verdict is legally attested with `claimStatus: unknown`, which is ACCEPTABLE (Q5/terminal-honest analogue); (ii) ANY `mismatch` -> lint ERROR, cannot accept (honest mismatch blocks, honest incompleteness doesn't). The server NEVER derives claimStatus (ATTEST OQ-4 ruling inherited — lint gates at accept, exactly like the chain-no-proposed wall).

### 7.6 Case-5 re-evaluation + the evidence-only collision ruling (AS-ATTEST-EVIDENCE-ONLY-COLLISION — mandated decision)

Mechanism (mostly shipped, reused not rebuilt): a receipt/attestation correction carries `supersedes`+`correction`; the standing info finding `attestation-correction-triggers-reevaluation-review` (:193) plus RECV's renamed `supersession-triggers-reevaluation-review` on material-receiving mark corrections; a fulfillment claim sets `assertion.cites` = the evidence attestation's recordId, which makes the obligation LIVE through `CurrentAssertionView.reevaluationObligations` (citation-dependent by construction — a correction nobody cites yields nothing to re-evaluate, the shipped law). **FULFIL's re-evaluation semantics (case-5):** a live obligation naming a `fulfills` claim triggers (1) the claim becomes *flagged-stale* through the fold (query: current view of the requirement's fulfillments — a cited-and-superseded evidence makes the fulfillment's current chain head a correction, so the fold surfaces the obligation with `citingRecordIds` — the CURRENT assertion about the requirement becomes: "fulfillment under review"), (2) a human re-evaluation is an APPEND: a new attestation `verb: re-evaluates-fulfillment` carrying `supersedes` (prior fulfillment) + `correction{claimTarget.mode: same-entity-reattribute, changedFacts}` + fresh `evaluations[]` re-run against the CURRENT evidence view; (3) **the intended requirement bytes are NEVER rewritten** (P1: "the requirement says what we WANTED; it stays true") — the plan record contentSha is asserted byte-identical in the case-5 test (AC-4), and the superseded fulfillment stays queryable via `historicalClaims`.

**Collision ruling:** the merged correction id is `ATT-hash(supersedes + changedFacts + claimTarget.mode)` (AttestationAcceptService.ts:95-118, ratified formula; AS-ATTEST-EVIDENCE-ONLY-COLLISION records that content identity EXCLUDES claims/evidenceRefs, so an evidence-only correction variant collides/early-returns on its predecessor). **Ruling for FULFIL's facts: a `re-evaluates-fulfillment` record MUST vary `changedFacts`** — lint rule `fulfil-reevaluation-changed-facts-must-vary` (new rule id; unique per LintEngine duplicate-id throw :66-68): changedFacts must name at least one key the superseded record's changedFacts lack (enforced expressibly as: the re-evaluation's changedFacts must include `priorEvidenceRef` + `newEvidenceRef` — vocabulary fixed by this spec), so a re-fulfillment citing NEW evidence (the normal case-5 shape: photo -> new lot -> new compatibility read) can NEVER land on the collided id, and a byte-identical resubmission landing on the SAME id is exactly the Q4e idempotence wanted. The general amendment (widening the shared correction-identity formula to include claims so evidence-only RECEIPT corrections stop colliding) is routed as **OQ-1** — it edits a merged, ratified formula and is the orchestrator's decision, not this coder's.

### 7.7 Intended-alongside-used consistency

The actualized add_material event keeps `material_spec_ref` (intent) beside `aliquot_ref`/`material_instance_ref` (used) — slots shipped (§6a). Deviations recorded explicitly: when a fulfillment claim's `assertion.evidence` names a physical entity whose current-assertion-view facts mismatch the event's intent (e.g. different vendor-product than the plan's requirement), the deviation is NOT a mutation and NOT a silent pass — the draft either carries a correction/re-evaluation (§7.6) or the claim's `claimStatus: unknown` + `evaluations` verdict carries the honest state; lint rule requires that a `fulfills` claim about an event whose `used` refs differ from the pinned requirement's spec refs carries a non-empty `reason` (deviation explicitness, existing `reason`-style field on the assertion). No decrement, no availability machinery ANYWHERE (P7 / campaign OUT-OF-SCOPE; §12 bait 12 pins greps).

### 7.8 Server accept path — ride, don't fork (D9)

FULFIL ships a small writer module `server/src/fulfillment/` (draft compile of the fulfillment envelope + the compatibility evaluator + policy data) that hands `AttestationDraft`s to the merged `AttestationAcceptService` — which is a WRITER, not a policy engine (its own header), so FULFIL's business rules ALL ride `schema/lab/attestation.lint.yaml` additions (rules carry `schemaId` = the attestation envelope; LintEngine.getRules filters by schemaId :110-119 — shipped mechanism). NO new record kind, NO new route, NO new draft adapter registration needed beyond the accept service the RECV module already demonstrates. **Draft EMISSION / elicitation ("fulfill this requirement" from chat) is CHAIN's surface** (task CHAIN owns the review-wall drafting); FULFIL delivers the server seam only, mirroring the ATTEST-then-RECV/CHAIN precedent. No new intent, no new forced tool (design constraint; campaign lock).

## §8 Files IN / OUT

IN (task-block files line + extensions EACH justified by its audit finding; §6 cite per line):
- `schema/workflow/events/plate-event.add-material.schema.yaml` — additive `requirementId` + `requestedSource` on `material_source_requirement` (§6a/b/c prove both ABSENT). [task-block file]
- `schema/workflow/events/plate-event.add-material.lint.yaml` — **NEW**. Justification (§6e/f): NO lint file binds the add-material detail schemaId today (plate-event.lint.yaml binds `…/datatypes/plate-event.schema.yaml` :23; event-graph.lint.yaml binds the graph schemaId :3); detail-payload rules (`fulfilledBy-allowed-under-unresolved`, `requirement-id-uniqueness` if §7.2 path-check resolves) have no other home. [task-block "(+lint)"]
- `server/src/materials/requirementId.ts` (+ test) — deterministic mint helper. Justification (§6b): identity minting must exist before anything can reference it; termId.ts is the cited law. [server path the "server accept paths" line covers; small]
- `server/src/materials/AddMaterialSupport.ts` — synthesized `unresolved` blocks gain `requirementId` (byte-additive; §6a proves it the sole writer). [server accept path]
- `server/src/fulfillment/` — NEW: `fulfillment-compatibility.yaml` (policy data), `evaluateCompatibility.ts` (pure evaluator), `FulfillmentDraft.ts` (envelope compile; hands AttestationAcceptService). Justification (§6e/f): the acceptance text demands a declared evaluation surface with INCOMPLETE legal — audit shows ABSENT; draft path per P6. [server accept/derivation paths]
- `schema/lab/attestation.lint.yaml` — ADDITIVE FULFIL rules (§7.3/7.5/7.6). Justification (§6c/f): the fulfillment record IS the attestation kind (D4); record-scoped rules bind by schemaId, and LintEngine skips non-record scopes (:142-147) — the envelope is the only scope where quadruple/pairing/verdict rules are expressible.
- `server/src/attestation/*` — READ-ONLY reuse (AttestationAcceptService, CurrentAssertionView); touched ONLY if OQ-1 is ruled in (then it is its own commit with ATTEST suite still green).
- Tests per §10; report at §11 deliverable path.

OUT (reviewer rejects any diff touching these):
- `planned-run.schema.yaml`, `execution-run.schema.yaml`, `protocol.schema.yaml`, `material-spec`/`material.schema.yaml` — the pinned plan/spec ride untouched (byte-equality is the ACCEPTANCE, AC-5).
- `schema/lab/material-receiving.*` + `server/src/receiving/**` (RECV's, in flight; merged is authority); `server/src/api/handlers/MaterialLifecycleHandlers.ts` (derivation rides unchanged; its `token()` non-determinism is pre-existing, not FULFIL's cleanup — §6e).
- `server/src/compiler/**` incl. `resolution/*` and ELIG's files; `schema/scientist-intent/**` (verb union 32, vocabularies, ELIG's material-eligibility triplet).
- `app/**` product code — ZERO (no UI here; CHAIN's browser gate covers the review wall; precedent ATTEST/RECV NO-BROWSER-GATE rulings).
- `schema/core/datatypes/ref.schema.yaml`, `RecordRevisionService.ts`, `FormDraftService` internals, `AddMaterialSupport.ts` implicit-mint functions (`implicitAliquotId` etc.), `app/src/types/events.ts`.
- Any new agent intent, forced tool, clarification affordance, mint row, record kind, decrement/availability/hold machinery (campaign OUT-OF-SCOPE), protocol promotion, main, /mnt/vast/home/brad/git/computable-lab, the task list.

## §9 Verification

**FIRST TARGETED CHECK** (earliest proof the transition is expressible as DATA, before any TS writer):
```
cd server && npx vitest run src/schema/RequirementFulfillmentSchemas.test.ts
```
RED at start (schema slots + lint rules absent); FIRST GREEN with YAML ONLY (schema extension + both lint files) + zero server code — proving requirementId/requestedSource validate, the transition-membership rule fires on attestation payloads (lintEngine.lint against the attestation schemaId, ValidationHandlers.ts:103 shape), INCOMPLETE is legal and mismatch blocks.

Full verification:
```
npm run test:run -w server -- src/schema/RequirementFulfillmentSchemas.test.ts src/materials/RequirementId.test.ts src/fulfillment
  -> all listed files pass, 0 failed
npm run test:run -w server
  -> failing-FILE set identical to the trunk baseline recorded by orch at dispatch (zero NEW failing files); zero failing tests in owned files
npm run typecheck -w server
  -> EXIT 0 (trunk baseline 0 per AS-LANE2-OPTIONBIND-TSC-BASELINE-0; any new error is a stop-condition)
git diff --stat <base>...HEAD (three-dot) -> only §8 IN paths; grep the diff: zero Date.now()/randomUUID in any id/occurredAt path, zero
  new `kind ===`/status string branches in TS outside §8, zero 'reserved'/'available' strings, zero app/** files
YAML-reload/live proof (orch post-merge, after background stack restart — restart is BLOCKING, never foreground it):
  POST /api/drafts/... fulfillment draft with a mismatch evaluation -> blocked card naming the lint rule; incomplete-variant -> canAccept
  with claimStatus unknown; accepted fulfillment record -> PUT -> carries 'APPEND_ONLY'
```

## §10 RED-first vitest plan (mapped to the verbatim ACs; each AC its own `it()`s)

Harness: schema/lint tests mirror `server/src/schema/AttestationSchemas.test.ts` (registry + LintEngine, the ATTEST/RECV triplet-test precedent — note `MaterialReceivingSchemas.test.ts` exists only on the RECV branch; use the trunk harness); accept tests mirror `AttestationAcceptService.test.ts` + `AttestationCase5.test.ts` (world-fixtures, store spies, cited-obligation idiom at AttestationCase5.test.ts:369-390).

- **5.10 AC-F1 (audit committed first):** the §6 (a)-(f) answers as executable pins — status enum STILL the byte-set `[unresolved, provided, linked]`-unchanged (guard against enum drift), `requirementId`/`requestedSource` present-and-optional, every existing add-material fixture byte-valid.
- **5.11 requirementId law:** same anchor -> same id (idempotent); reason/source_details edits -> id UNCHANGED; id never contains Date/random artifacts; mint via helper only.
- **AC-2 case-3' chain (fixture: plan with unspecified sources -> derivation accepted -> requirements fulfilled-by-derivation, plan revision unaffected):** plan (event-graph) contentSha byte-equal before/after fulfillment accept; synthesized requirement blocks carry ids; fulfillment attestation accepted via AttestationAcceptService with `against{}` pins; repeat-accept -> ONE record (count, not response); `against.graphRevision` = pin-at-accept and a post-accept plan edit + re-accept produces a DIFFERENT pinned revision + different id (prior fulfillment queryable).
- **AC-3 Shape-A case 3 (requested source on future add_material, no decrement anywhere):** `requestedSource` accepted on an `unresolved` future add_material via the ordinary graph-update path; grep-pins: zero decrement/availability/`reserved` vocabulary in the diff; panel/resolver files byte-untouched.
- **AC-4 case-5:** receipt -> fulfilled-by-receipt (claimStatus completed, evaluations all compatible, `assertion.cites` = RECV id) -> correction supersedes receipt (lot changed, same-entity-reattribute) -> `reevaluationObligations` LIVE naming the fulfillment record (strip-cites control proves citation-dependence, mirroring AttestationCase5 :385-390) -> re-evaluation append (changedFacts vary per §7.6; prior fulfillment bytes UNCHANGED; requirement plan bytes byte-unchanged; both "believed" and "correct" queryable through current/historical views).
- **AC-5 fulfillment never mutates the shared material-spec:** referenced material-spec record contentSha byte-equal across the whole AC-2/AC-4 sequence; store spy proves the accept writes exactly one record (the attestation).
- **5.12 P8 trio:** incomplete evaluation (missing declared fact) -> canAccept with claimStatus `unknown`, accepted record valid; completed + any incomplete verdict -> canAccept=false naming the rule; any `mismatch` -> blocked; unknown claimStatus is never server-rewritten (OQ-4 pin: stored claimStatus byte-equal to draft).

## §11 Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/matres-fulfil-lane2` off lane trunk `cl/integration-2` at POST-RECV-MERGE tip (NOT 46c3e4e9 — that is pre-RECV), branch `cl/lane2-matres-fulfil-<tickid>`. Profile: cl-coder (fleet lock; acquire it; ONE coder fleet-wide; RECV exit+merge+adversarial-gate BEFORE dispatch). NFS: every git command `-c core.fileMode=false`; lane-exclude sync per AS-PROTO-AI-5-W1/AS-PROTO-AI-9-DRAFTCHANGES notes.
- Deliverable (unique path): `.hermes/plans/MATRES-FULFIL-report.<tickid>.md` on-branch; must contain: RED evidence (first failing run of §9's first check), §10 suites, verbatim ACs mapped to named `it()`s, the §6 audit answers re-verified against the THEN-merged code with file:line (ATTEST merged surfaces + RECV merged shapes — where RECV merged code deviates from bf599311, merged code is authority; note each deviation), baseline proof (§9), the changedFacts-vary collision statement (§7.6), and a `[DEFAULT-PENDING-RATIFICATION]` impact note (tags: Q3 §7.2/7.3/7.4, Q4 §7.3/7.5/7.6, Q7 §7.1b).
- Stack: backend :3093 / frontend :5193; YAML edits need a stack restart before any curl proof (`cl-lane-stack.sh 2 restart` is BLOCKING — background it; `2 status` is safe); in-worktree proofs only, live proofs are the orchestrator's post-merge obligation (AS-RECV-LIVE-PROOFS-DEFERRED pattern).
- No browser gate for this item (zero app surface, §8 OUT; the pixels gate at CHAIN — record the ruling in the DONE note).

## §12 Reviewer bait (the likely edge errors for THIS item, pre-empted)

1. **exactOptionalPropertyTypes (server/tsconfig.json:13):** `requirementId`/`requestedSource`/`componentRef`/`evidence` optionals are absent-OR-value, NEVER `field: undefined`; construction uses the conditional-spread house idiom (FormDraftService.ts:73-77, cited in AttestationAcceptService header); runtime tests assert `!('requestedSource' in req)`.
2. **YAML-reload trap:** tsx --watch does NOT reload schema/lint YAML — any live proof before a stack restart validates the OLD corpus; §9's first-green claim is an in-process vitest claim, the :3093 claim waits for restart.
3. **Ontology/vocabulary exactness:** `claimStatus` values `proposed|completed|unknown|reported-by-other` (hyphenated lowercase); `occurredAtStatus` `known|approximate|unknown`; referent levels `concept|formulation|vendor-product|instance|aliquot` are the five canonical names, NOT re-declared; `fulfilledBy` values are exactly `receipt|derivation|instance`; verbs `fulfills`/`re-evaluates-fulfillment` live in FULFIL's assertion vocabulary (enum list in the lint file + pinned constant) and NEVER enter the scientist-intent verb union (stays 32); requirement id family `REQE-` never `REQ-` (procurement owns that); P7 naming: REQUESTED SOURCE, never "reserved"; RECORDED, never "available". No new ontology CURIE mints — these are record-vocabulary enum values, ontology terms ride existing material refs (D8).
4. **Hardcode boundary:** no TS `if (status === 'unresolved')` transition branch, no `'fulfilled'` string in server TS (the word exists ONLY in procurement/budget enums, untouched, and in YAML); transition membership + verdict pairing + citation rules = lint YAML; compatibility rules = `fulfillment-compatibility.yaml` data; append-only = existing `appendOnlyKinds` data (attestation already listed — FULFIL adds NO list entry, NO wall).
5. **Deterministic-id trap:** requirement ids via the termId-style helper ONLY; fulfillment ids via AttestationAcceptService's content hash ONLY; **NEVER `token()`** (MaterialLifecycleHandlers.ts:130-132 = Date.now()+Math.random — pre-existing non-determinism, out of FULFIL scope, and using it would silently break idempotence AND reviewHash reproduction).
6. **Global-mutation trap (the AC-5 failure class):** any implementation that PATCHes the material-spec, the event-graph, or the planned-run to record fulfillment — plan/spec contentSha byte-equality tests (AC-2/AC-4/AC-5) reject it; "is fulfilled" is a FOLD query, never a stored bit.
7. **RequirementId stability trap:** ids content-hashed from the requirement body die on the first reason edit and duplicate on re-draft; the law tests (§10 5.11) exist precisely because the natural-looking implementation is the wrong one.
8. **Case-5 traps:** rewriting the superseded fulfillment (bytes must be byte-unchanged); a decorative `cites` (obligation must be CITATION-dependent — the strip-cites control test mirrors AttestationCase5.test.ts:385-390); re-evaluation landing on the SAME id as the prior fulfillment (that's the collision — lint must force changedFacts to vary); claiming case-5 "passes" by checking string inequality without checking presence-shape (a `claimStatus: unknown` re-evaluation is legal with occurredAt ABSENT).
9. **Second-envelope / second-kind trap:** any `material-fulfillment` kind, `fulfillment` record type, or duplicated claims/supersedes/correction declaration instead of riding the envelope = the canonical OQ-2 violation; grep the diff (RECV's zero-`material-receiving-correction`-substring precedent).
10. **INCOMPLETE-as-pass trap:** defaulting a missing declared fact to `compatible` (P8's exact prohibition); the trio test (§10 5.12) pins incomplete≠match, mismatch≠accept, unknown≠server-rewritten.
11. **Enum-drift trap:** extending the requirement `status` enum with fulfillment values (M1/D2 forbids; §10 5.10 pins the enum byte-set); note RECV renamed its lint rule ids to keep ids globally unique (LintEngine duplicate-id throw :66-68) — FULFIL's rule ids all start `fulfil-`/`add-material-` and must not collide with the nine `attestation-*` rules.
12. **Decrement/availability trap (P7 / campaign OUT-OF-SCOPE):** no stock checks, no "available" verdicts, no double-booking lint — the AC names it: "no decrement anywhere"; grep-pinned in §9.
13. **Scope-creep trap:** touching `server/src/receiving/**`, RECV's triplet, or `MaterialLifecycleHandlers.ts` "to wire the receipt event" — the fulfillment seam is the attestor-driven draft, not an auto-trigger; auto-triggering fulfillment from receipt acceptance would convert custody into satisfaction without review (P1 violation) and collide with the in-flight RECV diff.

## §13 D-decisions (recorded rulings, each auditable to §6)

- **D1** Shape A materializes as an additive ref-shaped `requestedSource` slot on `material_source_requirement` (memo Q7's `proposedInstanceRef` consequence, P7 naming), written by ordinary plan-editing/draft carry — no new verb, intent, or inventory action.
- **D2** The `status` enum `[unresolved, provided, linked]` is NOT extended; fulfilled-by-* is attestation-side existence-through-fold, never an event status value (§7.1a argument).
- **D3** `requirementId` = `REQE-<slug>-<hash>` via a termId-style helper with a coordinate anchor + stability law; per-component fulfillment anchors on `componentRef` membership, NO second id system (§7.2 ruling, orchestrator ratifies).
- **D4** A fulfillment is an `attestation`-kind record (artifactKind `attestation-chain`) with FULFIL's loose-assertion vocabulary — zero new kinds, zero new envelopes (OQ-2 analogue); cost = enum lives in lint+tests, stated up front.
- **D5** Revision scoping = existing reference-copy machinery only (`against{}` + `ref.revisionRef` REV- + pinned-reads accept gate); no new versioning engine.
- **D6** Compatibility evaluation is a declared-facts policy file + pure evaluator on the DRAFT/review path (never the compiler, P6), verdicts `compatible|mismatch|incomplete`, INCOMPLETE legal via claimStatus `unknown` (declared, never server-derived).
- **D7** Case-5 re-evaluation = citation-live obligations + append-only `re-evaluates-fulfillment` records; **changedFacts MUST vary** on re-evaluation — this is the ruling that closes AS-ATTEST-EVIDENCE-ONLY-COLLISION for fulfillment facts (§7.6).
- **D8** No new ontology terms; FULFIL's vocabulary is schema/lint enum values riding existing ref datatypes.
- **D9** Zero UI, zero new intents, zero new routes; FULFIL ships the server seam; CHAIN owns drafting surfaces and the browser gate.

## §14 OPEN QUESTIONS for the orchestrator (not resolvable locally; no policy invented)

**OQ-1 — Correction-identity formula amendment (closes AS-ATTEST-EVIDENCE-ONLY-COLLISION generally?).** FULFIL self-protects via changedFacts-must-vary (§7.6/D7), but the general wart remains for RECEIPT-side evidence-only corrections: merged `recordIdOf` hashes only (supersedes + changedFacts + mode) (AttestationAcceptService.ts:95-118 — verified first-hand), so a correction that changes ONLY evidenceRefs byte-collides with its predecessor and early-returns. Checked: the service header's stated rationale, AttestationCase5 test pins, RECV merged-soon lint renames (2f638fd2). Options: (a) accept + rule as this spec does (FULFIL-side protection only); (b) amend the merged formula to include a claims digest (behavior-preserving for byte-identical resubmits, its own test-pinned commit like RECV's $defs extraction). My stance: (a) now, (b) as a separate orchestrator-ruled amendment — it edits ratified merged behavior. NOT coder-discretionary.

**OQ-2 — RECV merged shape drift (fulfillment-by-receipt consumption).** §7.3/§5 pin RECV's contract at bf599311+25a9522d+2f638fd2 (read read-only this session: kind, RECV- pattern, createdInstanceRef, re-evaluation lint rule); the coder is mid-module (`server/src/receiving/` untracked at l2t0255 checkpoint) and the report is unwritten, so the merged claim/`about`/`cites` shapes may move. Checked: both commits' stats/content, the RECV spec §2b/§2c, handoff l2t0255 §1. The orchestrator must re-run FULFIL §5's RECV posture against the MERGED tree at dispatch; where merged deviates, merged code is authority and the spec patch is targeted at §5/§7.3.

**OQ-3 — Compatibility-evaluation home vs ELIG.** FULFIL's `fulfillment-compatibility.yaml` (evidence-satisfies-requirement) deliberately does NOT reuse ELIG's `material-eligibility` triplet (candidate-resolution eligibility) — different domain, different consumers, ELIG coder not yet dispatched. Checked: ELIG promoted spec §6/§7 (files IN list, no fulfillment surface), §6f audit (no shared surface exists). Risk: if the orchestrator or ELIG grows a shared declared-facts envelope later, FULFIL's evaluator is the obvious fold-in point — cheap, data-only. Ruling needed only if the orchestrator wants the homes unified NOW; default is FULFIL-owned.

---
Composer's note: all §6 cites are first-hand reads on trunk b59225b9 (no scout was dispatched; contract allowed first-hand — bounded questions were faster direct). RECV worktree reads were read-only (git show/sed), no branch touched.

---

## §15 ORCHESTRATOR PROMOTION RULINGS (l2t1015, 2026-10-21T10:35 EDT)

Draft reviewed first-hand; ALL §6 load-bearing cites re-verified in trunk @ 05e799cf by the
orchestrator before promotion: status enum exactly [unresolved, provided, linked]
(plate-event.add-material.schema.yaml:58-60); sole writer unresolvedSourceRequirement
AddMaterialSupport.ts:457 (:459 status:'unresolved'; calls :642/:669/:704); ZERO provided/linked
status writers server-wide (grep); requirementId ABSENT from the event schema family (grep);
token() Date.now()+Math.random pitfall real (MaterialLifecycleHandlers.ts:131); correction
identity = (supersedes, changedFacts, mode) confirmed (AttestationAcceptService.ts:95-100);
CurrentAssertionView citation-live obligations real (:45-57, :185-194); PathResolver single-
wildcard law (:131-137); allIn/noneIn/everyItem shipped (lint-v1 :254/:295/:334); loose
assertion additionalProperties:true with required [verb, about]; termId labelHash/labelSlug law
(termId.ts:21/:29); NO plate-event.add-material.lint.yaml today (ls); pinned-reads 409 gate
(AttestationAcceptService.ts:165-175). Composer audit STANDS.

RATIFICATION NOTE: this draft's [DEFAULT-PENDING-RATIFICATION: Q3/Q4/Q7] tags PREDATE the memo
change — Brad ruled "ratify" 2026-10-20 morning (MATRES-0 DONE note; memo now carries the
RATIFIED section, sha 94532da0…; the composer's e8d81658… pin is the pre-ratification content).
The Q3/Q4/Q7 defaults the draft builds on ARE the ratified rulings — tags are HISTORICAL, no
rework implied. Q4's ratified model ("adding the correction is the correct way" — append-the-
correction, never rewrite) matches §7.6 exactly.

- OQ-1 RULED: (a) — FULFIL-side changedFacts-must-vary protection only; the merged correction-
  identity formula is RATIFIED BEHAVIOR, FULFIL does not amend it. The general amendment
  (claims digest into recordIdOf, closing evidence-only collisions for RECEIPT corrections too)
  is recorded as a QUEUED-FOR-BRAD observation (edits ratified merged behavior + Brad's Q4
  ruling territory), not coder discretion, not a new campaign task this tick.
- OQ-2 RULED: dispatch-time obligation on the orchestrator — at FULFIL dispatch, §5/§7.3's RECV
  posture is re-verified against the MERGED tree (RECV advc-accepted + merged tip); where merged
  RECV code deviates from bf599311/25a9522d/2f638fd2 pins, merged code is authority and the
  deviation note goes in the dispatch prompt.
- OQ-3 RULED: FULFIL-owned home; NO unification with ELIG's material-eligibility triplet now
  (different domains, different consumers; fold-in is cheap and data-only if ever wanted).
- D1–D9 all ADOPTED AS WRITTEN, incl. D3 (REQE- coordinate-anchor id, stability law, no
  second id system) and D4 (attestation kind, zero new kinds).

DISPATCH GATE: post-RECV-merge tip (RECV coder EXITED 2026-10-20 ~04:33 with full GREEN report;
adversarial gate c1 live l2t1015; merge on ACCEPT+orch-verify). Worker contract §11 stands;
deliverable .hermes/plans/MATRES-FULFIL-report.<tickid>.md. NO browser gate (zero app surface).
