# MATRES-CHAIN — Attested execute-chain drafting — SPEC DRAFT l2t1110 (2026-10-21 11:30 EDT)

Status: PROMOTED canonical (orch l2t1210, 2026-10-21). §16 carries the binding OQ rulings.
Composer: cl-spec-composer (l2t1110). Item: MATRES-CHAIN, lane-2 task list (MATRES-CHAIN block).
Trunk verified against: `cl/integration-2 @ 0da3a85d` (docs tip; code tip unchanged from ATTEST
merge lineage). Every git command in this session used `-c core.fileMode=false` (NFS mode noise);
the composer was READ-ONLY on every repo.
Contracts memo r1: sha256 VERIFIED this session =
`94532da0010b558040f24c48ae9f34340198beae1d90a29d3a6f8f0c507a7169` — the RATIFIED content
(Brad ruled "ratify" 2026-10-20; Q1–Q8 are BINDING policy, no [DEFAULT-PENDING-RATIFICATION]
tags needed anywhere in this spec).
Rail ruling: `~/.hermes/cl/lanes/2/decisions/MATRESRECV-accept-rail-decision-l2t1015.md`
(cl-architect, 2026-10-21 ~11:10) — RULING (a) governs ALL attestation-kind accepts, CHAIN
included. Read in full; §7.6 below is written against its exact hook shape.

## §1 Goal (one sentence)

From the run-workspace chat, the sentence "make 1 mL, 10x100uL aliquots, 1 today, 9 at -20"
drafts ONE reviewed attestation-chain payload — derivation → instance → 10 aliquots →
consumption → FULFIL requirement transitions — whose acceptance, through the ONE
FormDraftService.accept rail via the chain adapter's `onAccept` hook, atomically and
idempotently commits the whole provenance graph, labels every claim
completed|unknown|reported-by-other on a chain (proposed is plan-side only), reconciles its
own arithmetic as declared DATA, and never asserts a physical fact the scientist did not
declare (P2/P3, r2 honesty ceiling).

## §2 Description (verbatim from task list :10945-10958 — BINDING)

> Run-workspace chat drafts the full attestation chain (case 3'): material-
> derivation (type preparation; protocol_ref optional, one-off preps legal) ->
> material-instance (material_spec_ref -> the plan formulation, prepared_on) ->
> N aliquots (parent_material_instance_ref, storage.location) -> consumption
> event(s) -> MATRES-FULFIL transitions on the plan's requirements. ONE reviewed
> payload; acceptance semantics per P2/P3: the payload labels each claim
> completed vs instructed-not-yet-done ("decides to make" acceptance must not
> assert 10 aliquots exist); commit orchestration idempotent (retry/partial
> failure never duplicates physical history — r2). Lintable arithmetic: aliquot
> volumes sum <= prepared volume; counts reconcile (10 = 1 used + 9 stored); no
> aliquot without parent; note the ceiling honestly (r2): arithmetic proves the
> draft internally consistent, not that the wet work happened — that is what the
> attestation label carries.

## §3 Why (verbatim from task list :10959-10964)

> All five record types exist; what's missing is the reviewed CHAIN and the
> accept==attestation wall. This is the founder's north-star moment (prompt-to-
> workstate, truth-for-the-day ledger): spoken sentence -> reviewed payload ->
> provenance chain the nine cryobox aliquots can be walked back through a month
> later.

## §4 Verified-by (verbatim from task list :10965-10969 — BINDING acceptance)

> RED-first server+app tests incl. end-to-end fixture of the case-3' sentence;
> double-accept produces one chain; partial-failure replay produces one chain;
> arithmetic lint rejects sum>prepared and orphan aliquots; browser gate on :5193
> for the review-wall claim labels (proposed|completed|unknown|reported-by-other).

Task-block `files:` line (:10970, BINDING scope anchor):
`server chain-draft/accept paths; schema as MATRES-ATTEST defines; app review-wall surface; tests`

## §5 AUDIT-FIRST findings (the r2 lesson: shipped vs assumed, every claim cited)

All reads first-hand this session (no scout dispatched — bounded questions were faster direct;
FULFIL composer precedent, `.hermes/plans/2026-10-21_1030-MATRES-FULFIL…` composer's note).
Any surviving assumption is tagged ASSUMED-PENDING-AUDIT with what was checked.

| # | Surface | Verdict | Evidence (file:line, trunk 0da3a85d unless noted) |
|---|---------|---------|--------------------------------------------------|
| A1 | material-derivation schema (type `preparation`, `protocol_ref` OPTIONAL, inputs/outputs) | SHIPPED | `schema/lab/material-derivation.schema.yaml` :26-41 enum incl. `preparation`, :42-49 inputs/outputs ref arrays, :50-51 `protocol_ref` optional, :52 `source_event_graph_ref` |
| A2 | Server derivation WRITE path exists but is idempotence-poisoned | SHIPPED / TRAP | `server/src/api/handlers/MaterialLifecycleHandlers.ts` :440-470 creates derivation+instance; ids via `token()` :130-132 = `Date.now()+Math.random()` — CHAIN must NEVER mint through it |
| A3 | material-instance: `material_spec_ref`, `parent_material_instance_ref`, `prepared_on`, `storage.location`, `volume`, `derivation_ref`, status incl. `consumed` | SHIPPED | `schema/lab/material-instance.schema.yaml` :32-33, :38-39, :53-55, :79-84, :62-68, :95-96, :86-88 |
| A4 | aliquot: `parent_material_instance_ref`, `storage.location`/`temperature_C`, `volume`, status `consumed` | SHIPPED | `schema/lab/aliquot.schema.yaml` :33-34, :79-84, :67-73, :95-97; root `anyOf` :105-108 already FORBIDS an aliquot with no spec/parent ref at schema level |
| A5 | Consumption event/record type | **ABSENT** | No consumption event or record type anywhere: `schema/workflow/events/` has no `plate-event.consume*` (ls); grep `consumption` in schema/ hits only protocol context-gate prose (protocol.schema.yaml :230,:542,:562) and the sample lifecycle (`core/lifecycles/lab-sample.lifecycle.yaml` :32). The ONLY shipped consumption facts are the `status: consumed` enum members (A3/A4). → OQ-1 |
| A6 | MATRES-FULFIL requirement-transition surface | **NOT BUILT** | Task list :10906 `status: todo`; spec PROMOTED at `.hermes/plans/2026-10-21_1030-MATRES-FULFIL-requirement-fulfillment.md`. CHAIN depends on the FULFIL **SPEC contract** (§7.1-7.4: `REQE-` requirementId, `requestedSource`, attestation-kind fulfillment claim `verb: fulfills`, `fulfilledBy: receipt|derivation|instance`, quadruple via `against{}`), NOT on code. Dispatch gate: FULFIL merged. |
| A7 | CurrentAssertionView capabilities | SHIPPED | `server/src/attestation/CurrentAssertionView.ts`: `currentAssertion` :116, `historicalClaims` :138, `arrivalsForEntity` :162 (verb is consumer-supplied, no fold-side constants), `reevaluationObligations` :185 (citation-live via `assertion.cites` :103-106). No `lot`-style fact names hardcoded (:17-21). |
| A8 | Attestation envelope + claim labels + chain wall | SHIPPED | `schema/lab/attestation.schema.yaml`: claimStatus enum `proposed|completed|unknown|reported-by-other` :65-67; artifactKind enum incl. `attestation-chain` :41-48; `against{}` pin block :152-173; `supersedes`/`correction` :184-232; `attestedAt` doc "ABSENT before accept" :141-150. `schema/lab/attestation.lint.yaml`: 8 rules incl. `attestation-chain-no-proposed-claims` :133 (everyItem+in, the P2 wall as data). |
| A9 | The ONE accept rail + `onAccept` hook | ASSUMED-PENDING-AUDIT (decision ratified; CODE LANDING NOW) | Trunk `server/src/drafts/adapters.ts` :12-16 `DraftAdapter` = checkRequest?/stage/project — NO `onAccept` yet; RECV worktree tip ddd730c0 identical (fix-run not yet pushed the hook). The hook SHAPE is fixed by the ruling verbatim: `onAccept?(writes: RecordEnvelope[], acceptNow: string, store: RecordStore): Promise<AcceptOutcome>`, `AcceptOutcome = { writes; volatileFields?: Record<string,string[]> }`; invoke point after reviewHash re-check (:180 region), before prior-scan (:181); volatile-fields-stripped content compare at :183/:191; injectable clock. CHAIN codes against THAT shape; if the merged landed shape deviates, **merged code is authority** and the deviation is a targeted spec patch. |
| A10 | AttestationAcceptService (ATTEST seam) | MERGED, DEAD-WIRED — lane debt | Zero production instantiation (advc1 D1, orch-corroborated). Rail ruling: NOT deleted, NOT wired by RECV's fix-run, gets closed for each attestation-kind writer by the SAME hook mechanism. CHAIN therefore rides FormDraftService+hook, NEVER instantiates AttestationAcceptService. |
| A11 | Lint DSL expressivity for the arithmetic ACs | SHIPPED, WITH NAMED GAPS | `schema/lint/lint-v1.schema.yaml`: compare :142-149 (single path vs NUMBER LITERAL), exists/nonEmpty/regex/equals/in, allIn :254, noneIn :295, everyItem :334, all/any/not. `server/src/lint/LintEngine.ts` :136-143: **scope record ONLY — collection/repo rules are silently skipped (`skipped: true`)**. `server/src/lint/PathResolver.ts` :~120-150: exactly ONE wildcard segment per path. See §7.4 for exactly which predicates are missing. |
| A12 | App review-wall claim-label rendering | **ABSENT** | grep `claimStatus` in `app/src` = 0 files. The chain card does not exist yet; closest rails: `app/src/shared/ai/useWorkstateProposalFlow.ts` (relay to POST /api/drafts/compile) and `app/src/event-editor/right-pane/ai/WorkstateProposalCard.tsx` (canAccept-gated review card). ATTEST spec declared the review-wall pixels CHAIN's gate (task-list :10753-10754 DONE note). |
| A13 | append-only wall | SHIPPED, DATA | `server/src/config/types.ts` :533 `appendOnlyKinds: [... 'attestation']` — the accepted chain attestation is immutable with zero new code. |
| A14 | MATRES-SHELF merged | SHIPPED | `server/src/resolve/shelfLookup.ts` (+test) on trunk; `InventoryShelfHandlers.ts` wired. Chain's 9 stored aliquots must be discoverable there (§8 app/verify note). |
| A15 | Forced-tool intent enum + emission relay | SHIPPED trunk / RECV-pending | Trunk `server/src/ai/submitSuggestionTool.ts` :722 enum (12 members + unknown). `compose_receiving` + `receiving_proposal` relay arm exist ONLY on RECV branch 5ef7d4f0 — CHAIN's emission follows that ratified precedent post-merge. → OQ-3 |
| A16 | run-workspace chat mount | SHIPPED | `app/src/graph/run-workspace/RunClaimsTab.tsx` renders `chat: UseAiChatReturn` + `AssertionDraftPanel` — the chain draft card mounts here (§7.5). |

## §6 Dependency posture

- **MATRES-ATTEST — merged** (46c3e4e9 lineage). Envelope/lint/CurrentAssertionView as cited A7/A8. Where merged code deviates from the ATTEST spec text, merged code is authority.
- **MATRES-RECV — fix-run in flight** on `wt/matres-recv-lane2` / `cl/lane2-matres-recv-l2t0115`; rail ruling (a) is the fix contract. **CHAIN dispatch gate: RECV merged + FULFIL merged** (task `deps: [MATRES-ATTEST, MATRES-FULFIL, MATRES-SHELF]` + the rail the fix-run lands). At dispatch, §7.6's hook shape is re-verified against the MERGED tree (same obligation pattern as FULFIL OQ-2 ruling); where merged deviates, merged code is authority.
- **MATRES-FULFIL — spec-promoted, not built.** CHAIN consumes its SPEC contract: `REQE-<slug>-<hash>` requirement identity (D3), `verb: fulfills`, `fulfilledBy: receipt|derivation|instance`, `assertion.evidence`, `assertion.cites`, `against{}` quadruple pins, INCOMPLETE-legal claimStatus semantics (§7.5/§7.3 of the FULFIL spec). CHAIN must NOT re-declare any of these names or its own fulfillment vocabulary; it EMITS payloads FULFIL's rules will check.
- **MATRES-SHELF — merged** (A14): read-side discoverability only; CHAIN does not touch shelfLookup.
- **OQ-1 governance gap (who may attest):** inherited — CHAIN bolts on NO auth, attestor ref rides the accept request (ATTEST OQ-1 ruling).
- **Memo deviations:** §10 ledger.

## §7 Design

### 7.1 The chain record-graph — every edge a DECLARED field (all shipped, A1/A3/A4)

```
material-spec (plan formulation, existing record — READ, never written)
   ^ material_spec_ref            material-instance.schema.yaml :32-33
material-derivation (kind MDER-, derivation_type: preparation,
   inputs = source instances/specs, outputs = the prepared instance,
   protocol_ref ABSENT for a one-off prep — legal per :50 optional,
   source_event_graph_ref = the plan graph when drafting from a plan)
   |  derivation_ref (instance :95-96) / derivation outputs (:46-49)
   v
material-instance (kind MINST-, prepared_on :53-55, volume 1 mL :62-68,
   storage optional, status available)
   |  parent_material_instance_ref (aliquot.schema.yaml :33-34)
   v
N x aliquot (kind ALQ-, volume 100 uL each, 9x storage{temperature_C: -20,
   location: e.g. 'cryobox-1/box-A'}, status available; 1x consumed)
   |  assertion.about ref (attestation claim) — consumption edge
   v
attestation (kind ATT-, artifactKind: attestation-chain) — ONE record, the
   reviewable unit; claims per §7.2; against{} pins per FULFIL §7.4; the
   fulfillment claims (verb fulfills, fulfilledBy: derivation|instance,
   about: REQE-… requirementId) ride as ADDITIONAL claims in the SAME
   envelope when the plan carries requirements — NOT a second record
   UNLESS FULFIL's merged accept path demands its own record id (dispatch-
   time check vs merged FULFIL code; default: same envelope, claims are
   an array).
   |  assertion.cites = the chain ATT- id (FULFIL §7.6 citation law)
   v
CurrentAssertionView folds (read-side): arrivalsForEntity / reevaluationObligations
```

No edge is inferred by proximity, naming, or time order. Every physical fact that is NOT a
declared edge/claim does not exist in the ledger.

### 7.2 completed-vs-instructed labeling (P2/P3 — acceptance asserts nothing unobserved)

The utterance "make 1 mL, 10x100uL aliquots, 1 today, 9 at -20" is genuinely ambiguous
between INSTRUCTING and ATTESTING, exactly like the MIXFRAC-1 attachment ambiguity — it is
resolved by DECLARATION + ELICITATION, never by silent conversion (P1/P2):

- **Instructed / "decides to make"** → `artifactKind: plan-slot-reference` (or
  `planned-run-binding` when pinned to a run), claims `claimStatus: proposed`, staged writes
  = plan-side only (requested-source edits via FULFIL's Q7 plan-edit carry), **ZERO physical
  records**. The Q2 default (plan-slot-reference when the model emits none, shown in the
  header) applies. Acceptance of this payload attests NOTHING physical.
- **Attested / done-work retrospective** → `artifactKind: attestation-chain`, every claim
  `completed | unknown | reported-by-other` (`proposed` is structurally rejected by the
  shipped lint wall `attestation-chain-no-proposed-claims`, attestation.lint.yaml :133 —
  CHAIN adds NOTHING to that wall, it rides it), occurredAt triples per Q5 ("I don't know
  when I froze them" = `occurredAtStatus: unknown`, valid, terminal).
- **Mixed truth-for-the-day** ("1 used today, 9 went to -20, haven't labeled the boxes yet"):
  the chain carries `completed` claims for what happened, `unknown` for uncertain facts; a
  genuinely not-yet-done step is NOT a proposed claim on the chain — it is absent from the
  chain and lives on the plan side. One acceptance can pair a chain envelope + a plan-side
  draft only as SEPARATE drafts; one payload never mixes artifactKinds (envelope schema is
  single-valued :41-43).
- The drafting side ELICITS the distinction with the minimum completing question once
  ("did this happen, or are you planning it?") — never defaults the scientist into an
  attestation. The server NEVER derives or rewrites claimStatus (ATTEST OQ-4 law inherited).

### 7.3 ONE reviewed payload through the ONE rail (ruling (a), no forks)

CHAIN registers a new `chain` draft adapter (config/drafting/adapters.yaml block: domain
`materials`, operations `[compose-execute-chain]`, `humanReviewedCreate: true` — the
receiving/record-drafting precedent) implementing `DraftAdapter`:

- `stage()`: compiles the elicited intent into the staged writes of §7.1 — derivation +
  instance + N aliquots + ONE chain attestation (+ fulfillment claims inside it) — through
  the staging store (real schema validate + lint at compile, StagingStore precedent; zero
  durable writes before accept). Deterministic seed-hashed ids ONLY: id = f(draft content +
  plan coordinate), mirroring the AddMaterialSupport implicit-id law (`ALQ-IMPLICIT-` seed-
  hashed, AddMaterialSupport.ts :154-164) and termId — NEVER `token()` (A2 trap), NEVER
  Date.now()/randomUUID. The attestation envelope carries **NO attestedAt** (A8 doc law).
- `onAccept(writes, acceptNow, store)` (the ruling's hook, verbatim shape): stamps
  `attestedAt: acceptNow` into the attestation-kind staged write(s) and returns
  `volatileFields: { <ATT-id>: ['attestedAt'] }` — NOTHING else; the generic loop keeps zero
  `kind ===`/`adapter ===` branches (ruling behavior contract 5). occurredAt is
  byte-untouched end-to-end.
- **Idempotence = deterministic ids + volatileFields + the shipped loop.** Double-accept of
  the same revision early-returns (:169 status check, live today). Re-draft of identical
  content under a fresh draftId → same seeded record ids → prior-scan (:183/:191) with
  attestedAt stripped both sides → "already accepted, skip create" → ONE chain.
  Partial-failure: the loop's :200 `Save incomplete; retry Accept` 503 path is the shipped
  replay mechanism — replay re-enters, existing equal-modulo-volatile records skip, the
  missing tail creates → ONE chain. This is why CHAIN's staged writes must ALL be
  creates with deterministic ids: no update-inside-accept (updates have no idempotent
  semantics in this loop) — including consumption, see OQ-1.
- Acceptance does NOT go through AttestationAcceptService (A10 — dead lane debt, don't
  compound); the hook closes the lane-wide seam for CHAIN exactly as it does for FULFIL.

### 7.4 Arithmetic rules as DATA — and the named DSL gaps (no hardcoding)

The three AC rules, stated where each lives:

1. **No aliquot without parent** — SHIPPED-EXPRESSIBLE today: schema-level (aliquot anyOf
   :105-108 forbids a parentless aliquot) PLUS intra-chain-draft lint over the staged
   payload: `everyItem` over the chain draft's `aliquots` asserting `exists`
   `parent_material_instance_ref` — expressible in lint-v1 as-written once the chain-draft
   compile runs lint over a declared envelope the rules bind to (schemaId = the chain
   request/composite shape, attestation.lint.yaml pattern). Cross-record referential truth
   (parent resolves to an EXISTING instance) is checked at compile against staged+store
   reads, same as FULFIL's plan-membership check style.
2. **Aliquot volumes sum ≤ prepared volume** — **NOT expressible today; the missing
   predicate, named exactly:** the DSL has NO aggregate arithmetic. `compare`
   (lint-v1 :142-149) compares ONE path to a NUMBER LITERAL — it cannot compare two paths,
   cannot sum a `[*]`-projected array, and cannot unit-convert (1 mL vs 100 µL). The minimal
   generic addition: ONE predicate, e.g.
   `{ op: sumCompare, path, collectionPath, scale?, itemField?, operator: lte, againstPath, againstScale? }`
   — sum of numeric values selected by path, each multiplied by a DECLARED unit-scale factor
   (unit table = data in the rule, e.g. `{mL: 1000, uL: 1}`), compared to the numeric value
   at `againstPath` (optionally scaled). Domain-free (no volume/mass knowledge in the
   interpreter, same doctrine as PROTO-AI-3's allIn and CurrentAssertionView's no-fact-names
   rule), documented in the meta-schema. Scope stays `record` (the chain draft payload IS
   one record — no cross-record lint needed; note LintEngine.ts :136-143 SILENTLY SKIPS
   non-record scopes, so a collection-scope design would be a trap, not a fallback).
3. **Counts reconcile: 10 = 1 used + 9 stored** — expressible as two data rules ONCE the
   predicate above (or a trivial `countEquals` sibling) exists: the chain draft declares
   `aliquots[]` each with `disposition: stored | consumed`; reconcile =
   `count(disposition=consumed) == #consumed-status claims` AND total == declared
   `aliquot_count`. With only today's ops, `noneIn` (disjointness) + `allIn` (coverage) get
   PART way — membership and disjointness of the used/stored ref sets ARE expressible;
   CARDINALITY EQUALITY is not (no count/sum op). The gap is therefore named: **aggregate
   numeric predicate (sum/count compare)** — one generic op covering rules 2 and 3.
   If the orchestrator declines a meta-schema extension (it edits a ratified-adjacent
   corpus and, per the standing two-decisions rule, any LINT-BUNDLE change is Brad-visible:
   new rule AND a ruling on the past — grandfathering existing corpus), the fallback home
   is the FULFIL-precedent: a declared policy data file `config/drafting/execute-chain-
   arithmetic.yaml` + a pure compile-time evaluator run at draft stage (diagnostic →
   canAccept:false), rules stay DATA, zero TS literals. **This is OQ-2.**

The r2 honesty ceiling is recorded in the draft card copy and the schema/lint descriptions
(§7.5): arithmetic proves the DRAFT internally consistent; it is no evidence the wet work
happened — the attestation label (claimStatus + attestor ref + attestedAt stamp) carries
that, and the ceiling note states exactly that.

### 7.5 App — the review wall (the declared browser gate)

- Emission: ONE new intent `compose_execute_chain` on the existing forced agent_intent tool
  + a `chain_proposal` relay arm, following RECV's ratified `compose_receiving`/
  `receiving_proposal` precedent (5ef7d4f0, post-merge). Verb union 32 untouched, no second
  forced tool, no free-prose path, relay stays thin (verbatim envelope, trust boundary
  remains POST /api/drafts/compile). → OQ-3 (the intent enum addition is Brad-visible by
  golden-pin precedent — RECV did it with a deliberate golden diff; CHAIN mirrors).
- Review card (`ChainProposalCard`, mounted in RunClaimsTab, pattern:
  WorkstateProposalCard/useWorkstateProposalFlow): renders the plan — derivation → instance
  → N aliquots — and the **claim table where EVERY claim shows its label**
  `proposed | completed | unknown | reported-by-other` VERBATIM as stored, plus artifactKind
  in the header (Q2: a silent default is visible, never invisible), plus the arithmetic
  reconciliation readout (sum vs prepared, used/stored counts), plus the honesty-ceiling
  note, plus the attestation identity triple (performer/accountSupplier/attestor, P3 —
  absence renders as "unknown", never pre-filled with the acceptor).
- Accept → POST /api/drafts/accept; blocked card when canAccept:false (lint wall or
  arithmetic diagnostic) names the offending rule id; D4-style stale-source 409 surfaces the
  rail's message verbatim. The card NEVER shows an actionable Apply when blocked
  (PROTO-AI-9 R-Defect-2 class — the canAccept gate is structural).

### 7.6 FULFIL ride

CHAIN emits fulfillment claims per FULFIL's SPEC (§6): `verb: fulfills`, `about` = the plan's
`REQE-…` requirementId read from the pinned plan, `fulfilledBy: derivation` (the prepared
instance) or `instance`, `evidence` ref, `cites` set only where a claim rests on a superseded-
able attestation's evidence. CHAIN NEVER writes `requirementId`s, never mutates the plan,
never touches `plate-event.add-material*` (FULFIL owns those files), never re-declares the
`fulfilledBy` enum in TS. When drafting against a plan whose requirements lack ids (FULFIL's
normalizer has not passed over it), the chain draft carries NO fulfillment claims and the
card says so honestly — no minting requirement ids from the chain side.

## §8 Files

IN (each justified by an §5 cite; task-block files line governs):
- `server/src/chain/` — NEW: `ExecuteChainDraft.ts` (intent→staged-writes compiler),
  `chainIdentity.ts` (deterministic seed-hash mints), tests. ["server chain-draft paths"]
- `server/src/drafts/adapters.ts` + `config/drafting/adapters.yaml` — ADDITIVE `chain`
  adapter registration + YAML block ONLY (the receiving precedent); the generic loop and
  FormDraftService.ts stay UNTOUCHED (§12 bait 1). ["server accept paths"]
- `schema/workflow/chain-draft.schema.yaml` (+ `.lint.yaml`) — NEW: the elicited-intent /
  draft-envelope shape the stage() validates against and the arithmetic rules bind to
  (claimStatus values ride the envelope, never re-declared). [task: "schema as
  MATRES-ATTEST defines" — CHAIN adds NO attestation-envelope fields; it adds the DRAFT
  shape only. If the orchestrator prefers the draft shape live un-schema'd like the
  receiving intent, say so at promotion — DEFAULT is declared schema+lint, per the
  "business rules in DATA" lock.]
- `schema/lint/lint-v1.schema.yaml` + `server/src/lint/LintEngine.ts` (+ PathResolver only
  if the predicate needs multi-wildcard — it must NOT) — ONLY IF OQ-2 rules the predicate
  extension; own commit, generic evaluator, zero domain names, existing lint suite green.
- `app/src/graph/run-workspace/ChainProposalCard.tsx` (+test), relay wiring in
  `app/src/types/ai.ts`, `app/src/shared/hooks/useAiChat.ts`, emission relay arm per RECV
  precedent; minimal client accept wiring. ["app review-wall surface"]
- `server/src/ai/submitSuggestionTool.ts` (+tests, golden pins updated DELIBERATELY with the
  diff in the report) + `server/src/ai/AgentOrchestrator.ts` (+chainProposal test) +
  `server/src/ai/types.ts` — intent + relay per RECV 5ef7d4f0 shape. [implied by
  "run-workspace chat drafts"; OQ-3 gate]
- Playwright spec for the :5193 gate under the lane's existing receipt conventions.
- Report at §11 deliverable path.

OUT (reviewer rejects any diff touching these):
- `server/src/drafts/FormDraftService.ts`, `StagingStore.ts`, `draftRoutes.ts` — the rail
  INCLUDING the just-landed hook is consumed, never amended (any hook-shape gap = stop and
  report, not a parallel path — the D1 failure class).
- `server/src/attestation/**` (including the dead AttestationAcceptService — lane debt,
  neither ride nor delete); `server/src/receiving/**`; `server/src/fulfillment/**`;
  `schema/workflow/events/plate-event.add-material*` (FULFIL's); `schema/lab/material-
  receiving.*`; `schema/lab/attestation.schema.yaml` + `attestation.lint.yaml` (CHAIN adds
  rules to ITS OWN lint file bound to ITS OWN schemaId — no shared-file merge collisions
  with FULFIL's additive rules); `server/src/api/handlers/MaterialLifecycleHandlers.ts`
  (incl. `token()` — do not use, do not retrofit); `server/src/config/types.ts`
  (appendOnlyKinds); `schema/core|lab datatypes`; `server/src/resolve/shelfLookup.ts`;
  `server/src/compiler/**`, `schema/scientist-intent/**` (verb union 32), ELIG files;
  `schema/knowledge/**` (§12 bait 7 — the attestation claim/assertion vocabulary must NOT
  touch or rename knowledge-layer claim/assertion records); any new record KIND, new
  forced tool, auth gate, decrement/hold/availability machinery, protocol promotion;
  main, `/mnt/vast/home/brad/git/computable-lab`, the task list.

## §9 Verification

**Pre-flight (proves the approach early — run BEFORE writing chain code, at dispatch on the
post-RECV-merge tip):**
```
cd server && npx vitest run src/receiving/ReceiveAccept.test.ts src/drafts/FormDraftService.test.ts
  -> GREEN on the merged tip: proves the rail + onAccept hook + volatileFields idempotence is
     production-real; if RED, STOP — the rail is the dependency, report and halt.
```
**First targeted check (RED at start, GREEN milestone = YAML+registration only, no chain TS):**
```
cd server && npx vitest run src/chain/ChainDraftSchemas.test.ts
```
RED first (chain schema/lint absent); first GREEN with schema/lint YAML + zero compiler TS —
proving the three arithmetic rules + parent rule fire as DATA (§7.4), the chain-no-proposed
wall is inherited, and an instructed payload validates as plan-side with zero physical writes
declared.

Full verification:
```
npm run test:run -w server -- src/chain src/drafts src/receiving src/attestation src/lint
  -> all listed files pass, 0 failed (the rail suites must stay green — CHAIN is additive)
npm run test:run -w server
  -> failing-FILE set comm-identical to the trunk baseline recorded by orch at dispatch;
     zero failing tests in owned files
npm run typecheck -w server            -> EXIT 0 (baseline 0)
npm run test:unit -w app               -> failing-file set == baseline (record both directions)
npx tsc -p app                          -> error-count == baseline (23 per :10411 note; re-measure at dispatch)
cd app && npx playwright test chain-review-wall --project=chromium   -> + :5193 receipts (orch gate)
git diff --stat <base>...HEAD (three-dot) -> only §8 IN paths; grep the diff: zero
  token(/Date.now()/randomUUID in any id path, zero claimStatus literal assignments in server TS,
  zero 'kind ==='/'adapter ===' branches in drafts code, zero material_spec record writes,
  zero files under schema/lab/attestation* or server/src/attestation/
```
YAML-reload live proofs (orch post-merge, BACKGROUND stack restart first — restart is
BLOCKING): POST /api/drafts/compile with a sum>prepared fixture → blocked card naming the
arithmetic rule id; orphan-aliquot fixture → named; accepted chain → PUT → APPEND_ONLY
rejection; GET the 9 stored aliquots through the shelf route (:5193/:3093).

## §10 §deviations ledger vs the ratified memo

| Memo | Posture | Deviation? |
|------|---------|-----------|
| Q1 levels | CHAIN binds instance/aliquot refs in physical claims; touches no vocabulary arg contract. | none |
| Q2 artifactKind | Envelope-side only (A8); header SHOWS the kind; default plan-slot-reference visible on the card. | none |
| Q3 quadruple/pinning | Rides FULFIL's declared quadruple + shipped `against{}` reference-copies; no new versioning engine. | none |
| Q4 corrections | CHAIN emits no corrections; chain claims are citable targets (`cites`) for future corrections — the fold (A7) is read-side. | none |
| Q5 unknown triples | occurredAtStatus triples on every claim; unknown terminal; card renders unknown without prompting a value. | none |
| Q6 aliases | n/a — no alias writes. | none |
| Q7 requested-source | Plan-side instructed payload writes it via ordinary plan-edit per FULFIL Q7; no new verb. | none |
| Q8 attestedAt/occurredAt | **Declared deviation-by-ruling:** Q8 names "server-stamped at acceptance"; the mechanism is now the per-adapter `onAccept` hook stamping `acceptNow = this.clock()` (rail ruling (a), sub-question "ABSENT-BEFORE-ACCEPT ratified"). Semantics byte-preserved; the ATTEST AttestationAcceptService stamp-site is superseded for CHAIN by the hook. Recorded so no reviewer reads it as drift. | MECHANISM-only, ratified 2026-10-21 |
| P2/P3/P7/P8 | Chain wall inherited; identity triple never presumed; REQUESTED SOURCE naming (never "reserved"); arithmetic-never-derives-claimStatus; honesty ceiling in card copy (§7.4). | none |
| Two-decisions rule | If OQ-2 adds a lint predicate, the grandofathering ruling on the existing corpus is Brad's, requested in the OQ itself. | guarded |

## §11 Worker contract

- Worktree `/mnt/vast/home/brad/git/wt/matres-chain-lane2` off lane trunk `cl/integration-2`
  at the POST-RECV-MERGE + POST-FULFIL-MERGE tip (dispatch gate), branch
  `cl/lane2-matres-chain-<tickid>`. Profile cl-coder (fleet lock; ONE coder fleet-wide).
  NFS: `-c core.fileMode=false` on every git command.
- Deliverable (unique): `.hermes/plans/MATRES-CHAIN-report.<tickid>.md` on-branch, containing:
  §5 audit re-verified against the THEN-merged tree with file:line (esp. the landed onAccept
  shape — quote the merged signature); pre-flight + RED evidence; verbatim ACs (§4) mapped to
  named `it()`s; the double-accept/partial-replay proofs (store COUNTS, not responses);
  baseline comm proofs both directions; the honesty-ceiling text; deviation ledger §10 updates.
- Stack :3093/:5193; YAML edits need the BACKGROUND restart before curl proofs. UI item: the
  :5193 browser gate is the done-gate for §7.5 (criteria in §12 bait 9 / §4 verbatim AC),
  cl-browser-reviewer receipts, VERDICT: accept — coder tests are NOT the gate.

## §12 Reviewer bait

1. **The rail fork (the D1 class, highest value):** any chain-local accept loop, any
   instantiation of AttestationAcceptService, any FormDraftService edit "to add a chain
   step". The chain adapter declares `onAccept` and NOTHING else touches the loop. Grep pin:
   zero FormDraftService.ts lines in the diff.
2. **volatileFields omission:** if the hook returns writes WITHOUT declaring
   `volatileFields: {ATT-id: ['attestedAt']}`, a re-draft re-accept 409s at :183 (attestedAt
   differs) — the exact RECV AC-2(ii) failure. Test must assert store COUNT == 1 after
   re-draft-accept, not merely a success response.
3. **Deterministic-id trap:** any staged id from `token()` (MaterialLifecycleHandlers.ts
   :130-132) or randomUUID silently defeats double-accept AND the :183/:191 prior-scan. Ids:
   seed-hash over (draft content, plan coordinate) — the AddMaterialSupport :154-164 law.
   Test: same sentence twice → byte-identical id sets.
4. **exactOptionalPropertyTypes (server/tsconfig.json:13):** attestedAt ABSENT before accept
   (never `attestedAt: undefined`); occurredAt absent iff occurredAtStatus unknown;
   protocol_ref absent for one-off preps; use the conditional-spread house idiom; runtime
   tests assert `!('attestedAt' in envelope)` pre-accept and `!('protocol_ref' in derivation)`.
5. **YAML-reload trap:** tsx --watch does NOT reload schema/lint YAML — any :3093 proof
   before a BACKGROUND stack restart validates the old corpus. In-vitest claims are separate.
6. **Ontology exactness:** claimStatus `proposed|completed|unknown|reported-by-other`
   (hyphenated); occurredAtStatus `known|approximate|unknown`; `fulfilledBy
   receipt|derivation|instance`; requirement ids `REQE-` never `REQ-`; derivation_type
   `preparation`; P7 words — REQUESTED SOURCE never "reserved", RECORDED never "available".
   No new ontology terms; no new record kinds (attestation/material-derivation/
   material-instance/aliquot/material-receiving only).
7. **Knowledge-layer term collision:** "claim"/"assertion" here are the ATTESTATION
   envelope's words (`attestation.schema.yaml` claims[]/assertion), NOT
   `schema/knowledge/claim|assertion` records (docs/knowledge-layer-canonical-example.md —
   claim ≠ assertion ≠ evidence, mechanism chains live elsewhere). Touching knowledge-layer
   schemas in this diff is an instant reject.
8. **Hardcode boundary:** no volume literals, unit factors, counts, or claimStatus writes in
   TS; arithmetic = lint YAML or `execute-chain-arithmetic.yaml` data per OQ-2; the lint
   predicate (if ruled in) is generic (`sumCompare`), zero paths/names of domain fields in
   LintEngine.
9. **Label-integrity (browser gate criteria):** the card renders the four labels verbatim;
   proposed claims NEVER appear on an attestation-chain card (lint wall fires first); the
   card is NON-actionable when canAccept:false; artifactKind header visible; identity triple
   never pre-fills performer=attestor; the 409 stale-source message surfaces verbatim
   (D4 precedent, no auto-retry).
10. **Unobserved-fact trap (P2):** a chain built from an INSTRUCTED utterance, consumption
    asserted by inference from `status: consumed` rather than by a declared claim, or the
    card claiming "provenance recorded — work complete". The ceiling copy (§7.4) is required
    text, not a vibe.
11. **Partial-failure trap:** testing replay only by calling accept twice on a healthy store
    is decoration — the fixture must fail a mid-loop create (store spy) and prove the retry
    lands the tail with ONE chain (the :200 503 message path).
12. **Update-inside-accept trap:** setting aliquot `status: consumed` by staging an UPDATE
    to a pre-existing aliquot in the accept loop has no idempotent semantics here (prior-
    scan 409 class); consume-at-creation (the aliquot stages already-consumed when it was
    born-and-used in the same attested session) is the shipped-shape answer; the
    used-an-already-stored-bottle case is OQ-1, not coder discretion.

## §13 D-decisions (recorded rulings)

- **D1** Ride rail ruling (a) exactly: chain adapter + `onAccept` stamp + volatileFields;
    AttestationAcceptService untouched/never ridden.
- **D2** One attestation envelope carries physical claims AND (when the plan carries
    requirement ids) the FULFIL fulfillment claims; zero new kinds, zero new envelopes.
- **D3** Instructed-vs-attested is resolved by elicitation + declared artifactKind; the
    shipped chain-no-proposed lint wall is the wall; server never derives claimStatus.
- **D4** All chain ids deterministic seed-hashes; consumption at creation where the aliquot's
    whole life is inside the attested session (OQ-1 for the cross-session case).
- **D5** Arithmetic as DATA: parent rule = lint today; sum/reconcile = the ONE generic
    `sumCompare` predicate (OQ-2 option a) or declared policy data + pure evaluator
    (option b). Named missing predicate, never a TS literal.
- **D6** CHAIN adds its lint rules ONLY in its own new lint file (schemaId = its draft
    schema) — no edits to attestation.lint.yaml / FULFIL's files (merge-collision +
    ownership hygiene).
- **D7** NO auth, NO decrement, NO shelf changes; honesty ceiling text is part of the wall.

## §14 OPEN QUESTIONS for the orchestrator

**OQ-1 — Where does the "consumption" durable fact live for a PRE-EXISTING aliquot?**
The case-3' sentence consumes an aliquot BORN in the same attested session — D4 stages it
`status: consumed` at creation, fully idempotent, no question. The general case ("use 1 of
the 9 tomorrow") would stage an UPDATE to an existing aliquot inside the accept loop, which
the shipped loop cannot make idempotent (§12 bait 12), and lint shows no consumption record
type exists (A5). Options: (a) scope CHAIN to born-in-session consumption only; the
cross-session case is a follow-up item with its own ruling; (b) consumption is attestation-
claim-ONLY (aliquot status stays `available`; current-view folds derive consumed —
elegant, but the shelf/status enum `consumed` then lies); (c) add a `consumption` kind
(forks the append-only/kind inventory; heaviest). Checked: A4/A5 absence evidence,
FormDraftService accept loop :181-201, appendOnlyKinds :533. **Recommend (a)** — it satisfies
the verbatim AC (the case-3' fixture is the born-in-session shape) with zero new machinery.

**OQ-2 — Arithmetic DSL extension vs policy-data evaluator.** Option (a): one generic
`sumCompare` predicate in lint-v1 + LintEngine (capability-first, PROTO-AI-3 precedent;
the meta-schema is a ratified-adjacent corpus, and per the two-decisions rule a new lint
rule needs a grandfathering ruling on the past — existing corpus has zero sum rules so the
ruling is likely trivial "grandfather"). Option (b): `config/drafting/execute-chain-
arithmetic.yaml` + pure compile evaluator (FULFIL's fulfillment-compatibility precedent;
zero meta-schema touch; the AC word "lintable" then means "declared-data-checkable").
Checked: lint-v1 :142-149 compare-to-literal-only, LintEngine :136-143 record-scope-only,
FULFIL spec §7.5. **Recommend (a) with (b) as the sanctioned fallback if Brad withholds
the meta-schema touch.**

**OQ-3 — The emission intent.** Following RECV's ratified precedent means ONE new value
`compose_execute_chain` on the forced agent_intent tool + relay arm — a Brad-visible golden-
pin change (RECV did exactly this, 5ef7d4f0, deliberate golden diff). Alternative: reuse
`event_graph` drafting and compile the chain from it — rejected: the event-graph path
compiles plans, not attestation envelopes, and bolting the chain onto it would silently
convert plan-structure into attestation (P1). Checked: trunk enum :722, RECV commit stat.
**Recommend: new intent per precedent, golden diff disclosed in the report.**

## §15 Assumptions register (composer)

- AS-CHAIN-HOOK-SHAPE-PENDING: §7.6 codes against the ruling's hook text; merged RECV
  fix-run code is authority at dispatch (A9).
- AS-CHAIN-FULFIL-SPEC-CONTRACT: requirementId/fulfills/fulfilledBy semantics consumed from
  the FULFIL PROMOTED spec, not code (A6); merged FULFIL code is authority at dispatch.
- AS-CHAIN-NO-SCOUT: all §5 findings first-hand (scout is screening, not authority; direct
  reads were cheaper for bounded questions).
- AS-CHAIN-DISPATCH-POST-RECV-FULFIL-MERGE: dependency gate from task deps + rail landing.

---

## EXIT SUMMARY (composer)

Audit findings table: §5 (16 rows, A1–A16 — shipped: A1,A3,A4,A7,A8,A11(partial),A13,A14,
A16(partial); absent: A5,A6(not built),A12; pending-landing: A9; dead-wired: A10; branch-only:
A15). OQ count: 3. Memo verified: sha256 94532da0010b558040f24c48ae9f34340198beae1d90a29d3a6f8f0c507a7169.


## §16 ORCHESTRATOR RULINGS (l2t1210, 2026-10-21 ~12:50 EDT) — PROMOTION GATE

Load-bearing §5 cites re-verified first-hand by the orchestrator on trunk 0da3a85d+:
A5 (no consumption record type: schema/workflow/events has none; 'consumption' appears
only in protocol prose + lab-sample lifecycle), A8 (attestation.lint.yaml:133 wall exists),
A11 (LintEngine.ts record-scope skip confirmed; lint-v1 compare is path-vs-number-LITERAL
confirmed), A2 token() trap confirmed (MaterialLifecycleHandlers.ts:130-132), A13
appendOnlyKinds DEFAULT at config/types.ts:533 (BUT SEE DEFECT NOTE below — the knob is
silently OFF wherever a config.yaml names the array; fixed lane-locally this tick), A15
intent enum confirmed (submitSuggestionTool.ts:722).

**OQ-1 RULED (a):** CHAIN is scoped to born-in-session consumption (status: consumed at
creation, D4). The cross-session 'use 1 of the 9 tomorrow' case is NOT in scope, NOT
half-built, and NOT offered by the card; a future item with its own ruling owns it.
§12 bait 12 is binding; the used-stored-bottle case must render as unsupported-by-design
in this wave, never silently converted.

**OQ-2 RULED (b):** config/drafting/execute-chain-arithmetic.yaml + a pure compile-time
evaluator (FULFIL's fulfillment-compatibility precedent). Grounds: the task-block files
line does not own schema/lint/lint-v1.schema.yaml or server/src/lint/**; the meta-schema
is ratified-adjacent and Brad-visible under the two-decisions rule. 'Lintable' means
declared-data-checkable here. The named missing predicate (aggregate sum/count compare,
unit-scaled, generic) is recorded as a PROPOSED FOLLOW-UP CAPABILITY ITEM in the
PROTO-AI-3 pattern (its own task, Brad-visible meta-schema touch, grandfathering ruling
included) — NOT smuggled in as a CHAIN side effect. The evaluator stays generic: zero
volume/unit/count literals in TS; scale table lives in the YAML; absent-file = LOUD off
(console.warn naming the path), never silent.

**OQ-3 RULED (a):** ONE new intent value compose_execute_chain on the existing forced
agent_intent tool + chain_proposal relay arm, per RECV's ratified compose_receiving
precedent; golden pins updated DELIBERATELY with the diff disclosed in the report.

**DISPATCH GATE (binding):** RECV merged AND FULFIL merged; hook shape re-verified against
the merged tree at dispatch (merged code is authority, §7.6/A9).

**LANE DEFECT FOUND AT REVIEW (fixed lane-locally, escalated to Brad, NOT a CHAIN defect):**
MATRES-ATTEST §2b's append-only wall was LIVE-OFF on every stack whose config.yaml names
server.appendOnlyKinds explicitly (deepMerge replaces arrays; the explicit list dropped
'attestation'). Orch probe on :3093 pre-fix: PUT tamper on a stored attestation returned
200; post-fix (lane2-config.yaml + entry, stack restart): 405 APPEND_ONLY, DELETE likewise
refused. Brad's live stack and lane 1 carry the same gap (their configs name the array
without 'attestation'). Product-level fix options for Brad: drop the explicit array from
the bundled config template (let the DEFAULT own it), union arrays in deepMerge, or add
the entry per-deployment. The lane backend reads CONFIG_PATH=lane2-config.yaml, NOT the
worktree copy; Brad's live tree was verified byte-clean before and after this tick.

