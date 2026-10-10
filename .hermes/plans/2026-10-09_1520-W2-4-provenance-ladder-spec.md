# W2-4-PROVENANCE-LADDER — spec DRAFT (cl-spec-composer, 2026-10-09T15:20 EDT, token l2t1451)

DRAFT — not promoted, not committed. Item: W2-4-PROVENANCE-LADDER (lane 2, WAVE-2
semantic-protocol-family; deps: W2-1-NAMING-CROSSWALK (merged cdfdc56c) +
W2-3-PROTOCOL-SEMANTIC-UPGRADE (draft adopted, NOT yet merged — its coder dispatches after
W2-2 merges)).
Base examined by composer: lane trunk /mnt/vast/home/brad/git/cl-integration-2 at code tip
2c841760 / docs tip e647a78d — AFTER W2-1 + SPINE-8 merges, BEFORE W2-2 (coder live at l2t1451,
worktree wt/W2-2-lane2-l2t1405) and before W2-3 (draft pending promotion). Trunk WILL have moved
by claim time; every baseline below is RE-MEASURE-ON-YOUR-BASE, SET-identity discipline is the
gate (assumption AS-LANE2-W24-SPEC-COMPOSED-PRE-W23: the orchestrator re-checks this spec against
the MERGED W2-2 shapes and the MERGED W2-3 StepProvenanceRef/protocol triplet before promotion;
merged trunk WINS over every shape assumed here). Where this spec binds to W2-3's near-final
draft shapes, the binding text is "confirm against merged trunk at promotion".
git ALWAYS `-c core.fileMode=false`. Lane stack :3093/:5193 — NEVER :3001/:5174 (main
checkout's stack), and NEVER touch Brad's live tree /mnt/vast/home/brad/git/computable-lab.
Headless item: NO browser gate, NO :3093/:5193/:3001/:5174/:5193 interaction at all.

## Goal (one sentence)

Mint the four-rung provenance ladder VENDOR / DERIVED / INFERRED_INVARIANT /
LOCAL_REALIZATION — the admissions W2-3 deliberately did not spend — as pure data (one rung
vocabulary registry doc + one shared rung datatype + firing lint rules on every layer that
carries a rung: candidate facts = VENDOR, extraction conclusions = DERIVED, family invariants =
INFERRED_INVARIANT with evidence anchors, local choices = LOCAL_REALIZATION), make "DERIVED can
never be promoted to VENDOR by any path" structurally true (schema closure + lint), and express
"locally-validated" as a DERIVED query over local-protocol realizations + completed runs +
supporting evidence (R2-a binding: a derivation, NEVER an attestation field) — with ZERO
production TypeScript and ZERO new record kinds.

## 0. Orientation + grounding (every line opened first-hand by the composer at 2c841760; scout
output used only as SCREENING for the run-surface inventory and re-verified line-by-line — noted)

1. THE BINDINGS. Task block `.hermes/cl/lanes/2/task-list.md` W2-4-PROVENANCE-LADDER :4400-4423;
   WAVE-2 header D3 :4161-4165 verbatim: "'locally-validated' is DERIVED (query over
   runs/evidence), never an attestation field; QMS e-sign applies only to promotion-to-ACTIVE of
   regulated docs". Task `why:` :4414-4417: "Verified absent today (grep: no ladder anywhere;
   candidate/PDT have per-field anchors, not rungs)... QMS sign lives on promotion-to-ACTIVE
   (W2-5), not on the ladder." Composer re-verified absence TODAY: the strings VENDOR/DERIVED/
   INFERRED_INVARIANT/LOCAL_REALIZATION appear ONLY in the crosswalk entries and the admission
   test's CLEAN fixtures (grep over schema/, server/src, docs — hits confined to
   wave2-naming-crosswalk.yaml:144-160, Wave2NamingCrosswalk.test.ts:254-257,
   docs/wave2-naming-crosswalk.md §3 :47-55). No ladder machinery exists anywhere.

2. W2-1 MERGED DATA (authority, read in full at trunk).
   `schema/registry/wave2-naming-crosswalk.yaml`: entry keys are
   `{term, status, binds_to{kind|schema|field|...}, curie_plan, source_decision, note}` (:15-165);
   the four rungs are ALREADY listed `new-vocab-pending-admission` with curie plans
   `cf:provenance-vendor` (:144-148), `cf:provenance-derived` (:149-152),
   `cf:provenance-inferred-invariant` (:153-156), `cf:provenance-local-realization` (:157-160);
   `forbidden_kinds:` (:168-179) includes `provenance-ladder` (:174) and `provenance-rung`
   (:179) — W2-4 mints NO kind; rungs are VOCAB DATA + lint, never a record kind.
   `admission:` (:238-261): applies to "every proposed wave-2 term (noun, datatype, constraint
   class, provenance rung, capability term)"; rules resolves-through-crosswalk / no-collision
   (normalized lowercase, '-'=='_', against record-kind, operation-id, scientist-intent-verb,
   verb-definition-canonical, verb-action-map-verb namespaces) / curie-plan
   `^cf:[a-z0-9][a-z0-9-]*$`. The data docs' own `kind:` fields (naming-crosswalk :10,
   verb-adjudication :14) are SAFE because the admission test enumerates kind consts only from
   `*.schema.yaml` files (Wave2NamingCrosswalk.test.ts:54-62 walkSchemaYaml + :66-71).
   `server/src/schema/Wave2NamingCrosswalk.test.ts` — UNTOUCHED, green, PINNED. Its CLEAN
   fixture (:252-264) ALREADY lists all four rungs as admitted-clean with the cf: plans; the
   forbidden-kinds leg (:183-190) asserts no forbidden string is a kind const. W2-4 must not
   edit this test; adding crosswalk entries cannot break its fixtures (verified self-contained).

3. THE RUNG MEMO (W2-1's own projection of W2-4, `docs/wave2-naming-crosswalk.md` §3 :47-55):
   "VENDOR -> vendor-protocol-candidate facts (vendor-protocol-candidate.schema.yaml:15);
   LOCAL_REALIZATION -> local-protocol.branch_resolution choices
   (local-protocol.schema.yaml:88-106); DERIVED / INFERRED_INVARIANT -> conclusions with
   evidence anchors on the protocol family (kind `protocol`). 'locally-validated' stays DERIVED
   (query over runs/evidence), never an attestation field" — W2-4's design follows this binding.

4. THE SAID SURFACE. `schema/workflow/vendor-protocol-candidate.schema.yaml` (read in full):
   `$id` INCLUDES the `workflow/` segment:
   `https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml`
   (:2) — while protocol's `$id` does NOT (`.../computable-lab/protocol.schema.yaml`,
   protocol.schema.yaml:2). Copy each $id EXACTLY when binding lint specs (reviewer bait §8.3).
   SAID immutability note (:5-6): "document truth plus provenance, not a final executable
   protocol" — immutability ENFORCEMENT is W2-5's server work; today it is a description.
   `$defs/Provenance` (:176-194): `additionalProperties: false` (:178), required
   `[documentId, pageStart]` (:179), optional pageEnd/sectionId/spanStart/spanEnd — VENDOR
   lineage = document anchors, ALREADY schema-mandated per fact. Per-field anchors:
   sections[].provenance (:50-51), steps[].provenance (:122-123), tables[].provenance
   (:149-150), ExtractedItem.provenance (:217-218, items of materials/equipment/labware/notes/
   outputs :53-66,152-160), Action.provenance (:250-251). Fact objects are CLOSED
   (steps items :72-73, ExtractedItem :210-211, tables :134-135, sections :41-42 all
   additionalProperties:false) — a rung key, `locally_validated` flag, or `validatedBy` field
   CANNOT be authored on any candidate fact (schema REJECT, zero lint needed).
   sections[].kind enum INCLUDES `specifications` (:48) — the manufacturer-validated-labware
   carrier (vendor facts on specifications sections; NOT step parameters). NO
   `vendor-protocol-candidate.lint.yaml` and NO `.ui.yaml` exist today (composer `ls`-verified) —
   W2-4 creates both (lint) and the ui hints file.

5. THE W2-3 SLOT (draft `.hermes/plans/2026-10-09_1305-W2-3-protocol-semantic-upgrade-spec-DRAFT-l2t1251.md`,
   orch pre-reviewed, C1-C10 confirmed at 2c841760 — near-final but NOT merged).
   §0.7: W2-3 ships a MINIMAL rung-agnostic `StepProvenanceRef` (§2.1(v)):
   `allOf [ $ref ./datatypes/ref.schema.yaml constrained { kind const record, type const
   vendor-protocol-candidate }, optional anchor fields pageStart/pageEnd/sectionId/spanStart/
   spanEnd ]` — i.e. the intent-step provenance slot is a REF TO THE CANDIDATE with anchors, and
   §8.11 forbids rung strings in W2-3 files; §0.7 verbatim: "the rung names... are W2-4's
   admission to make". W2-3 mount points on intent steps: `intent.provenance` array of
   StepProvenanceRef (§2.1(ii)); W2-3's R-6 makes missing provenance a WARNING
   (§2.2 R-6, :314-318). CRITICAL CONSEQUENCE W2-4 BUILDS ON: the slot's type-const means an
   intent-step provenance ref can ONLY point at a vendor-protocol-candidate record — schema-
   enforced, structurally (draft §0.1: every payload def additionalProperties:false, so unknown
   keys on steps/refs reject). CONFIRM THE MERGED SHAPE AT PROMOTION (§7 AS-W24-W23-*).
   W2-4 must NOT edit protocol.schema.yaml itself; if the design needs a schema edit on
   protocol.*, it is declared as the hand-off seam (§9 OQ1/OQ3) and the promotion note
   reconciles. W2-4 DOES edit (additively, after W2-3 merge) `protocol.lint.yaml` +
   `protocol.ui.yaml` — merged trunk files are fair game post-merge (§9 OQ3 owns the
   reservation question).

6. THE LOCAL SURFACE (LOCAL_REALIZATION carriers; W2-7 WRITES them, W2-4 declares
   vocabulary+lint ONLY). `schema/workflow/local-protocol.schema.yaml` (read in full): `$id
   .../computable-lab/local-protocol.schema.yaml` (:2), kind const local-protocol (:27-28),
   recordId `^LPR-` (:30-33), `inherits_from` -> ref.schema.yaml REQUIRED (:19, :72-74 "the
   global protocol this realizes"), `variantRef` (:76-82), `branch_resolution` (:88-110): items
   required `[axisId, matched]`, `branchIds[]` = "Chosen branch ids
   (branch_axes[].conditions[].id / variants[].variantId)" (:103-106), `choices` object
   additionalProperties:true described "The localization choices that produced this resolution
   (provenance)" (:107-110). `overrides.substitutions[]` carry `material_ref` + `rationale`
   (:148-170) — the second LOCAL_REALIZATION carrier (a lab substitution with rationale).
   `status` enum [draft, active, superseded, retracted] (:176-178) — note: NOT the QMS
   ACTIVE-gate surface (that is controlled-document/lifecycle, §0.10).
   `schema/workflow/local-protocol.lint.yaml` EXISTS with ZERO rules + a comment header — W2-4
   activates it with `prov-local-*` rules (server.ts:411 `if (spec.rules.length === 0) continue;`
   means today it is silently skipped; adding rules turns it on at boot — every rule must be
   `when`-guarded so no existing LPR record starts erroring; composer verified
   `records/seed/` holds NO local-protocol records (ls: no such dir), so boot risk is nil, but
   re-measure at claim).

7. THE RUN/EVIDENCE SURFACES (the locally-validated query's REAL inputs; run-inventory composed
   first-hand by the composer, corroborated by cl-scout screening
   /tmp/l2t1451-scout1.log — all lines re-opened):
   - `schema/studies/run.schema.yaml` — kind const "run" (:20-21), `status` enum [planned,
     in_progress, **completed**, aborted, failed, superseded] (:56-58), `localProtocolRef`
     {kind const record, id, type} REQUIRED-structure field "Local protocol selected as the
     reusable method for this run" (:126-137), `plannedRunRef` (:113-124),
     `executedEventGraphId` (:95-97), `protocolVersion` (:99-101), `isControlled` (:103-106),
     `endedAt` (:64-66).
   - `schema/workflow/planned-run.schema.yaml` — kind const "planned-run" (:27-28-ish),
     `protocolRef` ref (:37), `localProtocolRef` (:82), `state` enum [..., **completed**,
     failed] (:99-101), `protocolSha` (:158-160).
   - `schema/workflow/execution-run.schema.yaml` — kind const "execution-run" (:20-21), `status`
     enum [running, **completed**, failed, canceled] (:44-46), `plannedRunRef` (:31-33).
   - `schema/knowledge/evidence.schema.yaml` — kind const "evidence" (:15-16), required
     [kind, id, supports, sources] (:12), `supports[]` refs to assertions/claims (:22-28),
     `sources[]` EvidenceSource required [type, ref] (:66-75) with type enum [result, context,
     measurement_context, event, publication, file, event_graph] (:73) — NOTE: no `protocol`, no
     `run` source type (§9 OQ1); `status` [active, retracted] with retracted-excluded-from-
     active-queries semantics (:41-45).
   - `schema/knowledge/assertion.schema.yaml` — kind const "assertion" (:16), `evidence_refs[]`
     -> ref.schema.yaml (:87-91) — the TODAY carrier for an evidence-anchored conclusion
     (INFERRED_INVARIANT instantiation surface; see OQ1).
   - `schema/core/datatypes/ref.schema.yaml` — kind enum [record, ontology] (:12-14), record
     refs required [id, type] (:59-67); NOT closed (no additionalProperties — composer grep-
     verified) — extra keys on a ref are schema-legal at the datatype level (bait §8.5).
   - THE QUERY MACHINERY (read-only, exists today): `schema/query/graph-query.schema.yaml` —
     canonical GraphQuery with ops resolve/get/find/traverse/path/neighborhood/lineage/aggregate/
     **exists** (:17-26); FindQuery type "Either a record kind (material, instrument, run,
     plate-snapshot, claim, evidence, ...)" (:197-200); read-oriented by design, "No query in
     this schema mutates laboratory state" (:11-14). Engine:
     `server/src/graph-query/GraphQueryEngine.ts` — "read-oriented... implements every §5
     primitive" (:1-22), deps `{index, store, resolveSpine?}` (:38-42);
     `server/src/graph-query/GraphEdgeIndex.ts` — `GraphEdgeIndex.inMemory()` (:66),
     `build(input)` (:248); test harness precedent
     `server/src/graph-query/GraphQueryEngine.test.ts:23-70` (inMemory + build + engine — the
     exact harness W2-4's query-leg test copies).

8. THE LINT DSL (verified before declaring rules — W2-2/W2-3 the did, W2-4 does):
   `server/src/lint/types.ts` PredicateOp (:21-38): exists/nonEmpty/regex/equals/in
   (values | valuesPath, :86-92)/all/any/not + allIn (:214-222)/everyItem (:240-248)/noneIn
   (:265-273) + the knowledge-domain ops. `everyItem` evaluates `assert` with EACH ITEM as root
   (:227-238) — per-item checks with any op are expressible; cross-ITEM-TO-ROOT comparisons are
   NOT (no op reads the parent record inside an everyItem arm). NO arithmetic, NO value
   comparison (pageStart <= pageCount INEXPRESSIBLE — §8.6), NO cross-record resolution:
   `LintEngine.ts:126-135` — non-record scope is SKIPPED (`scope !== 'record'` -> passed+
   skipped). Rule ids GLOBALLY unique — `addSpec` throws `Duplicate rule ID` (LintEngine.ts:59-61
   — composer read the throw site). Rules filter by schemaId: `rule.schemaId === undefined ||
   rule.schemaId === schemaId` (LintEngine.ts:103-105) — an UNRESTRICTED rule fires on EVERY
   record at lint-on-write: every rule this item ships MUST carry the spec-level schemaId
   (§8.4). Lint on WRITE refuses on error findings (RecordStoreImpl.ts:492-501, W2-3 §0.2
   confirmed at trunk). LintSpecLoader discovers `*.lint.yaml` recursively
   (`LintSpecLoader.ts:13`, server.ts:397-411; zero-rule specs silently skipped :411).
   Registry-doc lint precedent: `schema/scientist-intent/scientist-intent-vocabulary.lint.yaml`
   binds by `schemaId:` to a NON-RECORD vocabulary doc (header :1-8, bound schemaId :9) — W2-4's
   rung-vocabulary lint mirrors this shape (with the schemaId-target caveat §9 OQ3).

9. THE REGISTRY-DATA-PRECEDENT for the vocabulary placement: `schema/registry/derivations/`
   holds derivation.schema.yaml (a REGISTERED schema, kind const "derivation" (:22-23), DRV-
   pattern (:26-28), inputType enum [formulation, labware-instance, program, substance, string]
   (:40-48), returnType enum [string, string-multiset] (:50-55) — a pure-function identity
   registry; its lint (:1-15 header) records the "cannot be expressed in the current scalar DSL
   (no cross-record uniqueness)" precedent of declaring-the-gap rather than extending the DSL);
   derivation.ui.yaml (:1-4 `uiVersion: 1` + `schemaId:` + display/form); plus wave2-naming-
   crosswalk.yaml / wave2-verb-adjudication.yaml / operations.yaml as NON-registered registry
   DATA docs (no `.schema.yaml` suffix -> SchemaLoader `*.schema.yaml` discovery skips them,
   SchemaLoader.ts:33 DEFAULT_PATTERNS per W2-2 §0.4). ALSO: `schema/core/datatypes/` has NO
   provenance datatype today (composer ls of the 13-file dir — ref/revision-ref/ingestion-source-
   ref exist; no rung/ladder).

10. THE QMS SIGN-OFF SURFACE (read-only confirmation ONLY — do NOT design W2-5):
    `schema/governance/signature.schema.yaml` — kind const "signature" (:24-25), required
    [signedBy, action, meaning, subject, signedAt, authentication] (:15-22), actions enum
    [executed, reviewed, approved, verified, released, witnessed, acknowledged] (:34-36);
    `schema/core/lifecycle.meta.schema.yaml` — `requires_signature` (:73) + `signatureAction`
    (:85-87); `schema/governance/record-revision.schema.yaml` — purpose enum
    [signature, research-use, derivation] (:17); `schema/lab/controlled-document.schema.yaml`
    (:57 gitCommit-binding note). CONCLUSION (recorded as a design statement, zero design work):
    the ladder carries NO signature fields; QMS sign attaches to controlled-document ACTIVE
    promotion via lifecycle `requires_signature` — W2-5's surface. W2-4's rung vocabulary +
    datatype descriptions state this explicitly.

11. W2-2 (MERGED-IMMINENT, coder live at l2t1451 — NOT merged: composer verified
    `schema/core/datatypes/quantity.schema.yaml` and `schema/registry/constraint-vocabulary/`
    DO NOT EXIST at 2c841760). W2-4 has NO direct W2-2 dependency (task deps are W2-1 + W2-3);
    the only coupling is CROSSWALK-HYGIENE: W2-2 may have flipped `constraint-classes` (:161-165)
    and added entries by the time W2-4 claims. W2-4's crosswalk edit touches ONLY the four rung
    entries (:144-160) + appends the `locally-validated` entry — never W2-2's lines (mirror
    shapes: term/status/binds_to/note/source_decision per the merged file, verified §0.2).
    Dependency assumption AS-W24-W22-CROSSWALK: if W2-2 merged with different status strings or
    extra sections, merged trunk wins; re-read the file at claim, never edit W2-2's artifacts.

## 1. Scope / non-scope (D3/R2-a: derived-not-attested; vocabulary-first; zero TS policy; no kinds)

IN SCOPE — the only files the diff may touch (plus `.hermes/plans/`):
A. `schema/registry/provenance-ladder/rung-vocabulary.yaml` (NEW registry DATA doc — mirrors
   W2-2's constraint-vocabulary placement precedent and the crosswalk's non-registered style):
   the four rungs with lineage requirements, the locally-validated derived-query declaration, and
   the declared transition policy. §2.1.
B. `schema/registry/provenance-ladder/rung-vocabulary.lint.yaml` (NEW, ids prefixed
   `prov-vocab-*`, bound by schemaId to the vocabulary's declared document id, scientist-intent-
   vocabulary.lint.yaml shape, §2.2). MUST ship firing rules (server.ts:411).
C. `schema/registry/provenance-ladder/rung-vocabulary.ui.yaml` (NEW, derivation.ui.yaml
   precedent — display hints for the ladder review surface; no app code, no UI gate).
D. `schema/core/datatypes/provenance-rung-ref.schema.yaml` (NEW SHARED DATATYPE — the task's
   "shared datatype": ref.schema.yaml composition + rung enum of exactly the four names +
   per-rung anchor requirements; shipped UNMOUNTED exactly like W2-2's constraint.datatype
   ("Do NOT reference it from any shipped record schema yet — nothing consumes it until W2-3"):
   nothing consumes this until W2-5/W2-7/W2-8 mount it. §2.3.
E. `schema/workflow/vendor-protocol-candidate.lint.yaml` (NEW — none exists today; ids prefixed
   `prov-vendor-*`, bound by schemaId to the candidate's EXACT $id incl. the `workflow/`
   segment): VENDOR lineage on every fact array. §2.4.
F. `schema/workflow/protocol.lint.yaml` (EDIT, additive-only, ids prefixed `prov-derived-*` /
   `prov-family-*`; W2-3's R1-R3 + its own W2-3-introduced rules byte-unchanged — re-check the
   merged file first): DERIVED lineage rules on intent-step provenance. §2.5.
G. `schema/workflow/local-protocol.lint.yaml` (EDIT: the file exists with ZERO rules — activate
   with `prov-local-*`, when-guarded; W2-7 WRITES the fields, W2-4 only constrains their
   lineage). §2.6.
H. UI hints where a rung renders: `schema/workflow/vendor-protocol-candidate.ui.yaml` (NEW —
   VENDOR badge hints, specifications-section rendering for vendor-validated-labware, explicit
   absence of any step-parameter affordance), `schema/workflow/protocol.ui.yaml` (EDIT additive —
   DERIVED/INFERRED_INVARIANT badge hints on `$.steps[*].intent.provenance`),
   `schema/workflow/local-protocol.ui.yaml` (EDIT additive — LOCAL_REALIZATION badge on
   `$.branch_resolution[*].choices` + `$.overrides.substitutions[*].rationale`). Zero app code
   (UISpecLoader requires only uiVersion+schemaId, UISpecLoader.ts:33-36 composer-verified).
   §2.7.
I. `schema/registry/wave2-naming-crosswalk.yaml` (EDIT — the four rung entries' status flip +
   one `locally-validated` entry; §2.F).
J. Tests (new, under `server/src/`): `src/schema/Wave2ProvenanceLadderSchema.test.ts`,
   `src/lint/Wave2ProvenanceLadderRules.test.ts`,
   `src/graph-query/Wave2LocallyValidatedQuery.test.ts` — §3.
K. Report `.hermes/plans/W2-4-report.wip-l2t<tickid>.md`.

EXPLICITLY OUT OF SCOPE (any hit = reviewer reject):
- ANY production TypeScript: `server/src/lint/**` (NO DSL extension — if a rule is DSL-
  inexpressible that is STOP-and-report, never a PredicateEvaluator edit), `server/src/schema/**`
  loader/engine, `server/src/graph-query/**` (W2-4 CONSUMES the engine in a test; engine edits =
  reject — the derived-query SERVICE is W2-5/W2-7 territory, §9 OQ2), `server/src/store/**`,
  `server/src/api/**`, `server/src/compiler/**`, `server/src/ai/**`, ALL of `app/`. This item is
  DATA + TESTS.
- `schema/workflow/protocol.schema.yaml` and any protocol.* schema file — W2-3's surface (its
  merged StepProvenanceRef stays as merged; the rung binding rides vocabulary + lint, and any
  needed schema widening is the declared hand-off seam, §9 OQ1/OQ3 — NOT this item's diff).
- `schema/workflow/local-protocol.schema.yaml`, `vendor-protocol-candidate.schema.yaml`,
  `schema/knowledge/**`, `schema/studies/**`, `schema/query/**` — reference, never extend.
- New record kinds: `provenance-ladder` / `provenance-rung` / every string in forbidden_kinds
  (:168-179) must NEVER appear as a `properties.kind.const` in any `*.schema.yaml` (the pinned
  admission test enforces). The rung vocabulary doc is a non-schema DATA doc whose `kind:` field
  is `provenance-vocabulary` (safe: not forbidden, invisible to kind enumeration — precedent
  `naming-crosswalk`/`verb-adjudication`).
- No new verbs or verb vocabularies; no new CURIE prefixes (cf: only; `CL:` double-namespace
  caveat stands — W2-2 §6.11). No edits to `Wave2NamingCrosswalk.test.ts` or any W2-1 artifact
  beyond the sanctioned crosswalk entries; no edits to W2-2's files (quantity/constraint/
  constraint-vocabulary — mirror, never touch); no `schema/scientist-intent/**` or goldens
  MANIFEST.yaml (SPINE-7/8 territory; MANIFEST vocab sha `014ca71f...` at MANIFEST.yaml:9,
  composer re-verified — byte-untouched is a hard pin); `records/**` zero edits; no `git add -A`.
- NO attestation vocabulary: no `locally-validated` / `locally_validated` / `validated` /
  `attested` / `attestation` FIELD, property, enum value, or status anywhere in the diff except
  as DATA under the rung vocabulary's `derived_queries:` key and descriptive prose (§8.1 grep
  gate; R2-a binding).
- No signature/lifecycle fields (QMS sign = W2-5's promotion surface, §0.10 — a rung or datatype
  carrying `requires_signature`/`signedBy` = reject).
- No :3093/:5193/:3001/:5174 interaction (headless; YAML-reload trap §8.8). No browser gate.

## 2. File-by-file plan

### 2.1 A — `schema/registry/provenance-ladder/rung-vocabulary.yaml` (the ladder, as data)

Registry-style pure data (NOT `.schema.yaml` -> never enters SchemaRegistry or kind enumeration;
mirrors wave2-naming-crosswalk.yaml's header style):
```
kind: provenance-vocabulary
version: 0.1.0
campaign: semantic-protocol-family
authority: "D3/R2-a task-list WAVE-2 header + docs/wave2-naming-crosswalk.md §3"
doc_id: "https://computable-lab.com/schema/computable-lab/registry/provenance-rung-vocabulary"
rungs:
  - id: VENDOR                      # spelled EXACTLY
    curie: cf:provenance-vendor     # mirrored from crosswalk :147 — never re-minted
    carrier: vendor-protocol-candidate facts (sections/steps/tables/materials/equipment/labware/
             notes/outputs items; provenance per-field, vendor-protocol-candidate.schema.yaml:50,122,149,217,250)
    lineage_required: document anchor — provenance.documentId + pageStart (schema-required :179)
    mints_on: extraction (the ONLY writer of VENDOR facts; the candidate is immutable, :5-6,
              enforced server-side by W2-5)
  - id: DERIVED                     # spelled EXACTLY
    curie: cf:provenance-derived
    carrier: extraction conclusions on the protocol family — steps[].intent.provenance
             (W2-3 $defs/StepProvenanceRef; confirm merged shape at promotion)
    lineage_required: a candidate record ref WITH document anchors (pageStart nonEmpty) —
              a DERIVED conclusion without a visible derivation is a lint ERROR (prov-derived-*)
  - id: INFERRED_INVARIANT          # spelled EXACTLY
    curie: cf:provenance-inferred-invariant
    carrier: family invariants — conclusions with EVIDENCE anchors; today's schema surface is
             knowledge-layer assertion.evidence_refs (assertion.schema.yaml:87-91) +
             evidence.supports/sources (evidence.schema.yaml:12,22-34); the family-side slot
             does NOT exist in protocol.schema.yaml today (root closed :8; StepProvenanceRef
             type-const is candidate-only) -> HAND-OFF SEAM, §9 OQ1
    lineage_required: evidence anchor — a record ref to kind `evidence` whose sources resolve
  - id: LOCAL_REALIZATION           # spelled EXACTLY
    curie: cf:provenance-local-realization
    carrier: local-protocol.branch_resolution[].choices (schema :107-110) +
             overrides.substitutions[].rationale (:159-170); W2-7 WRITES, W2-4 constrains
    lineage_required: a recorded choice + inherits_from the family (:72-74); branch ids come
             from the FAMILY's branch_axes/variants vocabulary, NEVER minted from candidate step
             ids ("never masquerading as vendor branch ids" — W2-7 wording; cross-record
             expressibility noted §9 OQ2-adjacent, declared here, tests prove the in-record arms)
derived_queries:
  - id: locally-validated
    curie: cf:locally-validated
    rung_effect: DERIVED           # never its own rung, never an attestation field (R2-a)
    statement: >-
      A protocol-family conclusion is locally-validated IFF a local-protocol realization of the
      family EXISTS (local-protocol.inherits_from -> the protocol), at least one run of that
      realization has status completed (run.schema.yaml:56-58 via run.localProtocolRef :126-137,
      or planned-run state completed :99-101 / execution-run status completed :44-46 on the
      compiler leg), AND at least one evidence record whose sources resolve into that run's
      executed surface (evidence.schema.yaml sources[].type enum :73 — event/event_graph/
      measurement_context; run.executedEventGraphId :95-97) is active (status :41-45).
    query_shape: >-
      Three GraphQuery `find`/`exists` clauses composed read-side (graph-query.schema.yaml
      :17-26, engine read-only :11-14): the exact clause DATA lives HERE, the engine executes.
      Computed by test harness in-process (GraphEdgeIndex.inMemory + build, §3 T3); the reusable
      SERVICE composition is W2-5/W2-7 (OQ2).
transition_policy:
  mints: { VENDOR: [extraction], DERIVED: [extraction, review-edit], INFERRED_INVARIANT:
           [inference-pass], LOCAL_REALIZATION: [localization] }
  forbidden_edges:
    - { from: DERIVED, to: VENDOR }            # THE acceptance clause, as declared data
    - { from: INFERRED_INVARIANT, to: VENDOR }
    - { from: LOCAL_REALIZATION, to: VENDOR }
  note: >-
    VENDOR is POSITIONAL, not labelable: a fact is VENDOR iff it sits on an immutable, document-
    anchored vendor-protocol-candidate. There is no rung FIELD on a candidate fact (schema
    closure, :178 etc.), therefore no path — edit, PATCH, or promotion — can relabel a derived
    conclusion as vendor truth. Enforcement walls: §2.4 (candidate), §2.5 (family), §3 arms.
qms_note: >-
  The ladder carries NO attestation and NO signature. QMS e-sign applies at promotion-to-ACTIVE
  of controlled documents (lifecycle.meta requires_signature :73, signature.schema.yaml kind
  const :25) — W2-5's surface, deliberately NOT the ladder (task why: :4416-4417).
```
The rung NAMES are the four, spelled exactly, uppercase with underscores; descriptions cite the
canonical example's provenance discipline (`docs/knowledge-layer-canonical-example.md`
`layer_provenance:` :182 — provenance as data attached to records, never collapsed layers;
CLAUDE.md rule 8) and principles §4 (provenance hierarchy) / §5 (controlled vocab) / §6
(declarative).

### 2.2 B — `rung-vocabulary.lint.yaml` (the vocabulary's own well-formedness; DSL-only)

`lintVersion: 1`, `schemaId:` the vocabulary's `doc_id` string (scientist-intent-vocabulary.lint
precedent; this schemaId never matches any record -> boot-harmless, and the vocab test lints the
payload inline with that schemaId — coder VERIFIES boot harmlessness via the boot/loader test,
§9 OQ3 fallback). Rule ids `prov-vocab-*`:
- R1 `prov-vocab-four-rungs-exact` (ERROR): `everyItem(rungs) -> in(id,
  values [VENDOR, DERIVED, INFERRED_INVARIANT, LOCAL_REALIZATION])` AND
  `allIn(rungs[*].curie -> regex '^cf:provenance-')` — the four rungs exist, spelled exactly,
  cf:-CURIED (mutation arm: rename a rung, add a fifth rung -> fires).
- R2 `prov-vocab-lineage-declared` (ERROR): every rung declares nonEmpty carrier +
  nonEmpty lineage_required (`everyItem(rungs) -> all[nonEmpty carrier, nonEmpty
  lineage_required]` — string fields; fires if a rung's lineage is stripped).
- R3 `prov-vocab-no-vendor-promotion-edge` (ERROR):
  `everyItem(transition_policy.forbidden_edges...)` cannot assert absence of an ALLOWED edge
  directly, so the rule reads the OTHER way (DSL-honest formulation):
  `everyItem(transitions) -> any[ equals(source, VENDOR), not(equals(target, VENDOR)) ]` —
  `transitions:` declares the permitted edges (VENDOR->DERIVED extraction, ...); declaring an
  edge whose target is VENDOR from a non-VENDOR source FIRES (mutation arm: add
  `{from: DERIVED, to: VENDOR}` -> error names the item index). The forbidden_edges block is
  documentation-as-data mirrored by this rule.
- R4 `prov-vocab-locally-validated-is-derived` (ERROR):
  `everyItem(derived_queries) -> equals(rung_effect, DERIVED)` and
  `not(exists(derived_queries[*].attestation_field))` — guards its OWN shape against future
  attestation creep (fires on mutation adding `attestation_field`).

### 2.3 D — `schema/core/datatypes/provenance-rung-ref.schema.yaml` (the shared datatype)

`$id: https://computable-lab.com/schema/computable-lab/datatypes/provenance-rung-ref.schema.yaml`
(mirror amount/ref $id convention exactly — SchemaLoader keys on $id; a typo reds
integration.test.ts, §4 first check). Composition (JSON-Schema 2020-12, $ref + allOf, no
duplication of ref.schema.yaml):
```
type: object
allOf:
  - $ref: "./ref.schema.yaml"
  - type: object
    required: [rung]
    properties:
      rung: { enum: [VENDOR, DERIVED, INFERRED_INVARIANT, LOCAL_REALIZATION] }   # exact four
      pageStart: { type: integer, minimum: 1 }
      pageEnd:   { type: integer, minimum: 1 }
      sectionId: { type: string }
      spanStart: { type: integer, minimum: 0 }
      spanEnd:   { type: integer, minimum: 0 }
      evidence: { type: array, items: { $ref: "./ref.schema.yaml" } }   # INFERRED_INVARIANT anchors
then per-rung conditional arms (if rung const X then required [...]):
  VENDOR            -> requires pageStart (+ kind: record / type: vendor-protocol-candidate via
                        constrained ref, mirroring W2-3 §2.1(v) style)
  DERIVED           -> requires pageStart (document anchor visible)
  INFERRED_INVARIANT-> requires evidence (non-empty anchor array)
  LOCAL_REALIZATION -> requires id present (the LPR record ref) + no pageStart?? -> do NOT
                        forbid; keep arms ADDITIVE-only requirements (no nots beyond rung-
                        specific presence), documented
```
`additionalProperties: false` at the outer level is INTENTIONALLY NOT set (ref.schema.yaml is
open, §0.7 of W2-3's finding; closing here while allOf-composing would reject ref's own fields
under some Ajv stances — coder mirrors the equipment-capability allOf+$ref style W2-2 §2.3 used
and states the closure decision + probe result in the report; §8.5). The datatype ships UNMOUNTED
(no shipped record schema $refs it in this diff — W2-5/W2-7/W2-8 mount; grep gate §6).
Description: rung semantics, positional-VENDOR doctrine, the QMS note (§0.10), the
locally-validated-is-query note, and that the candidate's own facts stay anchor-only with NO
rung field (VENDOR is carrier-positional, this datatype is for the layers that DO label).

### 2.4 E — `vendor-protocol-candidate.lint.yaml` (VENDOR rung lineage; the candidate has no lint today)

`lintVersion: 1`, `schemaId:` the candidate's EXACT $id (workflow/ segment, §0.4 — bait §8.3).
Rule ids `prov-vendor-*`, ALL when-guarded, everyItem per fact array:
- R1 `prov-vendor-facts-document-anchored` (ERROR): for each fact array
  (sections/steps/tables/materials/equipment/labware/notes/outputs):
  `everyItem(steps) -> all[nonEmpty provenance, nonEmpty provenance.documentId, nonEmpty
  provenance.pageStart]` (schema already requires the ref shape :179 — this fires the ACTIONABLE
  per-item error at lint-on-write and proves the rung's lineage requirement is enforced, not
  just typed). One rule per array with a path parameterization comment, or a single rule with
  `any[...]` per-array arms — coder picks the DSL-legible form; all nine arrays covered (§8.7
  enumerates them).
- R2 `prov-vendor-no-rung-attestation` (ERROR): every fact item's provenance must NOT carry
  rung/locally_validated/validatedBy keys: `everyItem(steps) -> not(exists provenance.rung)` per
  array (schema additionalProperties:false :178 is the PRIMARY wall — T1 proves schema-level
  REJECT; this rule is the belt for the closed-shape guarantee and names the offender
  actionably; firing arm = a payload with `rung:` on a provenance object linted via a schemaId-
  bypassed engine call, honest about which layer rejects what, §8.5).
- R3 `prov-vendor-specifications-not-step-params` (ERROR, the acceptance clause's lint leg):
  vendor-validated-labware facts ride `sections[kind==specifications]` + labware ExtractedItems;
  assert steps carry NO validated-by/validated-labware-shaped key:
  `everyItem(steps) -> not(exists validatedBy)` + `not(exists rung)` + `not(exists
  manufacturer_validated)` (the step object is closed :72-73 so these reject at schema; the rule
  documents + catches nested-string smuggling into `notes`? NO — free-text notes stay free text;
  the rule is presence-of-field based ONLY, say so in the file header).
The two-step fact: a "manufacturer-validated-labware" VENDOR fact = a `labware` ExtractedItem +
a `specifications` section, each document-anchored — it renders from candidate specifications
(§2.7 UI), never as a step parameter (closed schema + R3).

### 2.5 F — `protocol.lint.yaml` additions (DERIVED rung on extraction conclusions)

Additive-only (merged file first — W2-3's rules byte-unchanged; ids prefixed `prov-derived-*` /
`prov-family-*`; ALL when-guarded on `nonEmpty steps[*].intent` so legacy protocols emit
nothing):
- R-8 `prov-derived-conclusions-anchored` (ERROR):
  `everyItem(steps) -> any[ not(nonEmpty intent), everyItem(intent.provenance) -> all[
  nonEmpty id, nonEmpty pageStart ] ]` — a DERIVED conclusion whose provenance lacks the
  candidate document anchor is refused (UPGRADES W2-3's R-6 visibility WARNING posture for the
  ANCHORED case: absent provenance stays W2-3's warning; PRESENT-but-unanchored is an error —
  state this split in the rule description and in the report). `intent.provenance` empty array
  passes vacuously here and is covered by W2-3 R-6 — no double-fire (assert the exact finding
  SETS in tests, §8.2).
- R-9 `prov-derived-never-vendor-carrier` (ERROR):
  `everyItem(steps) -> any[ not(nonEmpty intent), everyItem(intent.provenance) -> regex(id,
  '^CAN-') ]` — the referenced id must look like a candidate id (prefix `CAN-`; CONFIRM the real
  candidate id prefix from a candidate fixture/seed at claim — composer grep found no CAN-
  fixture under records/; the Zymo chain's candidate ids exist in ingestion tests — coder
  CONFIRMS the prefix from the MERGED trunk fixtures and records the source, never invents).
  Mutation arm: `id: RUN-000041` in an intent provenance -> fires naming the step
  (`steps[*].stepId` projection in the message). The PRIMARY wall is schema-level: W2-3's
  StepProvenanceRef type const `vendor-protocol-candidate` makes `type: run` a schema REJECT
  (T1 arm); this rule catches right-type-wrong-id half-masquerades. This is the lint leg of
  "DERIVED conclusions CANNOT be promoted to VENDOR by any path".
- R-10 `prov-family-invariant-lineage` (WARNING, the INFERRED_INVARIANT leg): when a protocol
  carries the family-invariant surface ONCE IT EXISTS — today no slot exists (§9 OQ1); ship the
  rule targeting the vocabulary's declared path `$.invariants` as a NO-MATCH-by-construction
  guard? NO — ship nothing against a nonexistent path (dead rules are bait for a reviewer
  calling vacuity). Instead: the INFERRED_INVARIANT lineage for THIS item is proven on the
  knowledge layer (assertion+evidence fixtures, §3 T1-h) and the family-side slot is the declared
  seam. protocol.lint.yaml gets ONLY a comment block stating the seam + pointing at
  rung-vocabulary.yaml (a comment, not a rule — honest, §8.9).

### 2.6 G — `local-protocol.lint.yaml` (LOCAL_REALIZATION lineage; activates the empty file)

`prov-local-*`, when-guarded so no existing/legacy LPR record regresses (no seed LPRs exist —
§0.6; re-measure any data-repo LPRs the orchestrator points at):
- R1 `prov-local-choices-recorded` (ERROR):
  `when: nonEmpty branch_resolution`; `assert: everyItem(branch_resolution) -> any[ equals(
  matched, false), nonEmpty choices ]` — a matched axis with NO recorded choices is a realization
  with no LOCAL_REALIZATION lineage. (Coder verifies `nonEmpty` semantics on an object value —
  `{}` vs absent — against PredicateEvaluator at claim and records the probe; if empty-object
  counts as nonEmpty, tighten with `regex` on a required choice key? NO free inventing: record
  the probe, keep absent-vs-empty honest, and if the DSL cannot distinguish, state it + file the
  empty-object case as a vocabulary-declared gap, never a DSL extension.)
- R2 `prov-local-axis-declared-shape` (ERROR): `everyItem(branch_resolution) -> regex(axisId,
  '^[a-z][a-z0-9-]*$')` — mirrors schema pattern (:96-98) with an actionable per-item error; the
  cross-record half (axisId exists on the family's branch_axes; branchIds are family ids "never
  masquerading as vendor branch ids") is NOT DSL-expressible (record scope only,
  LintEngine.ts:126-135) — declared as a vocabulary lineage requirement + named for W2-7's
  compiler gate (it resolves inherits_from at compile time anyway); §8.6 states this honestly.
- R3 `prov-local-substitution-rationale` (WARNING): `everyItem(overrides.substitutions) ->
  nonEmpty rationale` — a LOCAL_REALIZATION substitution without its WHY is a visible review
  issue (PROTO-AI-4 R2 warning discipline precedent).
The file's existing comment header stays; add the rules beneath it (byte-unchanged comment lines).

### 2.7 H — UI hints where a rung renders (data hints only; zero app code, zero UI gate)

- `vendor-protocol-candidate.ui.yaml` (NEW; `uiVersion: 1` + the candidate's exact $id):
  display hints marking the whole record "VENDOR — immutable document truth (ladder position)"
  (a hint string, not a field), per-array provenance columns (documentId/pageStart),
  a `specifications`-section display group labeled "manufacturer facts (vendor-validated labware
  renders HERE)" and — explicitly — NO step-parameter affordance anywhere in the form layout
  (the layout lists only closed-schema fields; comment header: "vendor-validated-labware renders
  from sections[kind=specifications]; there is no validated flag on steps by design").
- `protocol.ui.yaml` (EDIT additive): hints for `$.steps[*].intent.provenance` — display label
  "provenance (DERIVED — candidate-anchored)"; comment: rung badges are RENDERED from
  rung-vocabulary data by the W2-8 surface; W2-4 ships hints only.
- `local-protocol.ui.yaml` (EDIT additive): hints for `$.branch_resolution[*].choices`
  ("LOCAL_REALIZATION — lab's answer") and `$.overrides.substitutions[*].rationale`
  ("LOCAL_REALIZATION — why").
- `rung-vocabulary.ui.yaml` (C): titleField/icon/display for the vocabulary doc (derivation.ui.yaml
  shape, :1-12).
UISpecLoader requires only uiVersion+schemaId (UISpecLoader.ts:33-36); prove boot via the
existing ui/boot tests (§4.6), and `app` diff stays EMPTY (§6).

### 2.F I — crosswalk integration (admission bookkeeping)

READ the MERGED `wave2-naming-crosswalk.yaml` first (W2-2 may have appended; merged keys as
found — §0.11). Edits: (1) flip the four rung entries' status
`new-vocab-pending-admission` -> `existing`-style admitted with `binds_to` pointing at
`schema/registry/provenance-ladder/rung-vocabulary.yaml` + carrier lines (mirror the merged
entry key set exactly — term/status/binds_to/curie_plan/source_decision/note as merged; do NOT
invent keys; if W2-2's flip used a different admitted status string, use THAT string);
(2) APPEND one entry: `term: "locally-validated"`, status pending-admission-then-admitted like
the rungs, `curie_plan: cf:locally-validated`, `source_decision: D3/W2-4`, note "DERIVED query
over local-protocol + completed run + active evidence; NEVER an attestation field; see
rung-vocabulary.yaml derived_queries". Collision check: `locally-validated` normalized vs the
five namespaces — no collision (verb/kind/operation grep negative; re-verify with the test green
untouched). `Wave2NamingCrosswalk.test.ts` stays UNTOUCHED (pinned; its CLEAN fixtures are
self-contained — §0.2).

## 3. Test plan (RED-first, exact harnesses — COPY, don't invent)

T1 `server/src/schema/Wave2ProvenanceLadderSchema.test.ts` — harness: whole-tree
`loadAllSchemas({ basePath: join(process.cwd(), 'schema') })` + registry topological order +
`createValidator({ strict: false })` — the exact pattern of
`server/src/schema/BranchAxisSchemaContracts.test.ts:28-40` (vitest ONLY from `<wt>/server`).
Arms:
  a. datatype registers: `registry.has(RUNG_REF_ID)` with `result.errors == []` (the whole-tree
     loader is the first gate, §4.2).
  b. rung enum EXACT: the datatype's rung enum set-equals {VENDOR, DERIVED, INFERRED_INVARIANT,
     LOCAL_REALIZATION} — read from the parsed schema, not hardcoded twice (§8.1 reads IT).
  c. per-rung lineage arms: a rung-ref `{kind: record, id, type, rung: DERIVED, pageStart: 1}`
     VALID; same WITHOUT pageStart INVALID (conditional arm); `rung: INFERRED_INVARIANT` without
     `evidence` INVALID, with `evidence: [{kind: record, id: EVD-1, type: evidence}]` VALID;
     `rung: VENDOR` with `type: vendor-protocol-candidate` + pageStart VALID; `rung:
     NOT_A_RUNG` INVALID; five-rung mutation INVALID.
  d. candidate closure arms (the schema leg of no-promotion): a candidate payload fixture
     (built from the schema's required skeleton) + `rung: VENDOR` key on steps[0].provenance ->
     INVALID (additionalProperties:false :178); + `locally_validated: true` on a step ->
     INVALID (:73 closure); + `validatedBy` on a step -> INVALID. Acceptance clause "vendor-
     validated-labware ... without appearing as a step parameter" is PROVEN here (schema) + §2.7
     (render) — name it in the report clause-map.
  e. ladder-absence-untouched regression: `vendor-protocol-candidate.schema.yaml` +
     `local-protocol.schema.yaml` + `ref.schema.yaml` validate a pre-W2-4 clean fixture
     byte-identically (the files are untouched; this guards §1 non-scope from inside the suite).
  f. vocabulary-as-data parse: rung-vocabulary.yaml parses; rung ids read back EXACTLY the four
     strings (uppercase+underscore; normalize-compare against the datatype enum from arm b — the
     two sources agree as SETS, Wave2NamingCrosswalk.test.ts's own set-agreement style :302);
     every rung curie matches `^cf:provenance-[a-z-]+$` and the four crosswalk entries (:144-160
     as merged) carry the SAME curie strings (no re-mint, no drift).
  g. forbidden-kind hygiene (mirrors the pinned test's leg without touching it): generic walk
     over `schema/**/*.schema.yaml` — no `properties.kind.const` equals any forbidden_kinds
     string AND none equals `provenance-vocabulary`... (that is our DATA doc's kind — data docs
     are not *.schema.yaml so never enumerated; the arm asserts exactly what the pinned test
     asserts plus `provenance-rung` explicitly).
  h. INFERRED_INVARIANT instantiation on TODAY's surfaces (the honest OQ1 leg): build an
     assertion payload (assertion.schema.yaml) with evidence_refs + an evidence payload
     (evidence.schema.yaml: required kind/id/supports/sources; sources[].type event) -> both
     VALID; the same evidence payload with `supports` dropped -> INVALID (lineage is required
     by the evidence schema itself — that IS the rung's lineage requirement expressed on the
     only surface that exists). This fixture is what "each rung instantiates with required
     lineage" means for INFERRED_INVARIANT until the seam closes — say exactly this in the
     report.
  i. locally-validated is NOT a field: enumerate every enum/property-name across the touched
     schemas — the strings `locally-validated`/`locally_validated` appear in NO enum, NO
     property, NO status (they appear only in rung-vocabulary DATA + descriptions; the arm
     scans parsed schemas, not grep).
T2 `server/src/lint/Wave2ProvenanceLadderRules.test.ts` — harness: parse the REAL YAML specs
  from disk into a `LintEngine` + lint inline payloads, the exact pattern of
  `server/src/lint/ProtocolLintRules.test.ts:22-55` (fileURLToPath `../../../schema/...`;
  `engine.addSpec(name, spec)`). Arms (each firing fixture proves non-vacuity):
  a. vocabulary: clean vocab payload via doc_id schemaId -> ZERO findings; mutated copies ->
     R1 (fifth rung / renamed rung), R2 (stripped lineage), R3 (`{from: DERIVED, to: VENDOR}`
     edge -> ERROR naming item index), R4 (attestation_field) each fire. THE
     "DERIVED cannot be promoted to VENDOR" DATA-leg proof.
  b. candidate (schemaId = exact candidate $id): clean candidate -> zero prov-vendor findings;
     fact with provenance missing pageStart -> prov-vendor-facts-document-anchored ERROR naming
     the array+index; provenance carrying rung key -> prov-vendor-no-rung-attestation ERROR
     (engine-linted payload; the schema-leg REJECT is T1 d — report states both layers);
     step carrying validatedBy -> prov-vendor-no-rung-attestation/R3 fires.
  c. protocol: legacy protocol payload (no intent) -> ZERO prov-* findings (when-guard proves
     legacy silence); intent step with provenance `{kind: record, id: CAN-<fixture-prefix>,
     type: vendor-protocol-candidate}` WITHOUT pageStart -> prov-derived-conclusions-anchored
     ERROR naming stepId; same with `id: RUN-000041` -> prov-derived-never-vendor-carrier ERROR;
     intent step with NO provenance at all -> exactly W2-3's R-6 WARNING, zero prov-derived
     findings (the SET assertion pins the split, §8.2); the six prt-seed-* payloads -> zero
     prov-* findings (read from disk).
  d. local-protocol: LPR payload (inherits_from ref + branch_resolution with choices) -> zero
     ERRORs; branch_resolution `{axisId: axis-x, matched: true}` with NO choices ->
     prov-local-choices-recorded ERROR naming index; `matched: false` without choices -> zero
     findings (unmatched axis is honest); substitution without rationale -> prov-local-
     substitution-rationale WARNING; legacy LPR payload (no branch_resolution) -> ZERO findings.
  e. existing suites green untouched: `ProtocolLintRules.test.ts`, and (if merged before you)
     W2-3's `Wave2ProtocolIntentRules.test.ts` + `Wave2QuantitySchema`/`Wave2Constraint-
     VocabularyRules` suites — SET-scope run §4.7 is the real gate.
  f. rule-id global-uniqueness boot proof: addSpec ALL shipped specs into ONE engine (ours +
     protocol + candidate + local-protocol + vocabulary) without the Duplicate throw
     (LintEngine.ts:59-61).
T3 `server/src/graph-query/Wave2LocallyValidatedQuery.test.ts` — harness COPY of
  `GraphQueryEngine.test.ts:23-70`: `GraphEdgeIndex.inMemory()` (:66) + `index.build({...})`
  (:248) + `new GraphQueryEngine({index, store})`; fixtures = minimal record graphs.
  Arms (THE acceptance clause, computed, not attested):
  a. full chain -> computed TRUE: protocol P + LPR (inherits_from P) + run (status completed,
     localProtocolRef -> LPR) + evidence (supports an assertion, sources ref the run's
     executedEventGraphId / event) -> the three declared clauses (read from
     rung-vocabulary.yaml AS DATA by the test — the test parses the YAML, builds GraphQuery
     find/exists ops, intersects ids) all non-empty -> locally-validated(P) === true.
  b. remove-realization arms -> FALSE: (i) drop the LPR -> false; (ii) run status ->
     `in_progress` -> false; (iii) drop the evidence / set evidence `status: retracted` ->
     false. "false when ANY link is removed" — three separate mutations, each recomputed
     (non-vacuity is the shape of this acceptance clause).
  c. zero production TS: the engine/index classes are IMPORTED untouched; the composition lives
     in this test file only (the SERVICE home is OQ2's call); assert the clause shapes came from
     the YAML (snapshot-compare the parsed clauses array).
Meta T4: `npx vitest run src/schema/Wave2NamingCrosswalk.test.ts` green UNTOUCHED (with §2.F
entries in place); `npx vitest run src/graph-query/schema.test.ts` + engine suite green
(engine untouched); boot/UI spec load (§4.6).

## 4. RED-first build order + exact commands (vitest ONLY from `<wt>/server`; worktree bootstrap
= standard lane 6 symlinks + lane-exclude copies; git ALWAYS -c core.fileMode=false)

1. RED: write T1+T2+T3 fixtures/arms first; they FAIL (vocabulary, datatype, lint specs, and
   candidate lint file absent). Capture RED output in the report.
2. FIRST TARGETED CHECK — the single command that proves the approach early and that a broken
   new schema can never pass silently:
   `cd <wt>/server && npx vitest run src/schema/integration.test.ts` => green (whole-tree loader:
   the new datatype `$id` registers, every $ref incl. ref.schema.yaml composition resolves,
   `errors: []`). Run immediately after writing D (§2.3) and after every $ref change.
3. Vocabulary: A+B+C (§2.1-2.2) -> `npx vitest run src/lint/Wave2ProvenanceLadderRules.test.ts`
   vocabulary arm green (R1-R4 fire on mutations, clean payload silent).
4. Datatype green-schema: D (§2.3) -> `npx vitest run
   src/schema/Wave2ProvenanceLadderSchema.test.ts` green (arms a-c, f-g).
5. Layer lints: E+F+G (§2.4-2.6) (+ confirm merged W2-3 rule ids first — §7) -> T2 arms b-d
   green; `npx vitest run src/lint/ProtocolLintRules.test.ts` green (+ W2-3's suite if merged).
6. UI specs: H (§2.7) -> `npx vitest run src/ui` (or the UISpec/boot loader test on your trunk —
   name the one you ran) green; crosswalk: §2.F -> `npx vitest run
   src/schema/Wave2NamingCrosswalk.test.ts` green UNTOUCHED.
7. Query leg: T3 -> `npx vitest run src/graph-query/Wave2LocallyValidatedQuery.test.ts` green +
   `npx vitest run src/graph-query` SET vs claim-base (graph-query baseline re-measured —
   §6 third pin).
8. Whole-scope: `npx vitest run src/schema src/lint` vs §6 SET pin; tsc + ownership greps (§6);
   report + commit (owned files only). Final line `W2-4 DONE <sha>`.

## 5. Acceptance criteria (VERBATIM from the task block, `verified by:`)

> Headless fixtures: each rung instantiates with required lineage; DERIVED conclusions
> CANNOT be promoted to VENDOR by any path (lint rejects); a locally-validated conclusion
> computes true only when a realization+run+evidence chain exists, false when any link is
> removed; vendor-validated-labware fact renders from candidate specifications without
> appearing as a step parameter.

Clause -> proof map: "each rung instantiates with required lineage" -> T1 c/f (VENDOR, DERIVED,
LOCAL_REALIZATION via datatype + carrier payloads; INFERRED_INVARIANT via T1 h knowledge-layer
instantiation + the declared seam §9 OQ1) + T2 a-d; "DERIVED CANNOT be promoted to VENDOR by
any path (lint rejects)" -> T1 d (schema walls) + T2 a R3 (declared-edge wall) + T2 b/c
(prov-vendor-* + prov-derived-* lint rejections) + T3 (no query path mints VENDOR — derived
queries only READ); "locally-validated computes true only when ... false when any link is
removed" -> T3 a (true) + T3 b(i-iii) (three removal arms, recomputed); "vendor-validated-labware
renders from candidate specifications without appearing as a step parameter" -> T1 d (closed
step schema) + §2.4 R3 + §2.7 specifications-section UI hints (render-leg = hints data; NO app
code, NO browser gate — state the honest boundary in the report: hints are the wave-2 UI
contract, W2-8 renders). Description clauses that bind: "shared datatype + lint rules across the
layers that carry it" (D + E/F/G); "'locally-validated' ... explicitly NOT an attestation field"
(§1 no-attestation vocabulary + §8.1 grep + T1 i + T2 a R4); "Manufacturer-validated-labware =
VENDOR facts on the candidate ... optionally later assertions-with-vendor-evidence" (§2.4 + the
"later" = knowledge-layer optional leg stays unexercised beyond T1 h).

## 6. Baselines and pins (RE-MEASURE every one on your claim base; SET identity is the gate)

- PRIMARY SCOPE SET: `cd <wt>/server && npx vitest run src/schema src/lint 2>&1 | grep -E "FAIL"
  | sed 's/.*FAIL *//' | sed 's/ >.*//' | sort -u > /tmp/l2t<id>-ff.txt; comm -3
  /tmp/l2t1251-failfiles-schema-lint.txt /tmp/l2t<id>-ff.txt` => EMPTY vs YOUR claim-base
  re-measure. Composer's re-verified pin (read this tick): the pin file names EXACTLY the
  2-file failing set {src/schema/EventGraphEquipmentSchema.test.ts,
  src/schema/LabwarePhysicalGeometryData.test.ts} ("Test Files 2 failed | 39 passed | 5
  skipped"). BASELINE CAPTURE IS THE CLAIM-TIME GATE: W2-2/W2-3 merges may move the set — re-
  measure on your base, store /tmp/l2t<tickid>-ff.txt, gate against YOUR capture; your tests may
  only REDUCE failures, never add.
- server tsc: `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' |
  sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/l2t<id>-tsc-server.txt && comm -3
  /tmp/l2t2230-tsc-server.txt /tmp/l2t<id>-tsc-server.txt` => EMPTY vs claim-time re-measure
  (pin /tmp/l2t2230-tsc-server.txt = 26 error-lines / 6 files — composer re-counted 26 lines
  this tick). Non-zero tsc exit is BY DESIGN — never demand green. A data+tests item adds zero
  TS errors; a non-empty comm means something leaked.
- third pin (NEW for this item, because of T3): `cd <wt>/server && npx vitest run src/graph-
  query 2>&1 | grep -E "FAIL" | ...` capture at claim; post-change SET must be EQUAL (engine
  untouched — `git -c core.fileMode=false diff --name-only <base>..HEAD -- server/src/graph-
  query | grep -v '\.test\.ts$'` => EMPTY).
- app: `git -c core.fileMode=false diff --name-only <base>..HEAD -- app/` => EMPTY (UI-leg is
  hints-data only).
- Zero-production-TS + ownership: `git -c core.fileMode=false diff --name-only <base>..HEAD |
  grep -v -E '^schema/registry/provenance-ladder/|^schema/core/datatypes/provenance-rung-ref\.
  schema\.yaml$|^schema/workflow/(vendor-protocol-candidate\.(lint|ui)\.yaml|protocol\.lint\.
  yaml|protocol\.ui\.yaml|local-protocol\.(lint|ui)\.yaml)$|^schema/registry/wave2-naming-
  crosswalk\.yaml$|^server/src/(schema/Wave2ProvenanceLadderSchema|lint/Wave2ProvenanceLadder
  Rules|graph-query/Wave2LocallyValidatedQuery)\.test\.ts$|^\.hermes/plans/'` => EMPTY; AND
  `git -c core.fileMode=false diff --name-only <base>..HEAD -- server/src app | grep -v
  '\.test\.ts$'` => EMPTY.
- Attestation grep (R2-a gate): `git -c core.fileMode=false diff <base>..HEAD | grep -inE
  'locally[-_]valid' | grep -v '^.*#.*' | grep -vE 'rung-vocabulary\.(yaml|lint\.yaml)|
  Wave2ProvenanceLadder|Wave2LocallyValidatedQuery|derived_queries'` => EMPTY (the string lives
  ONLY in the vocabulary data, its lint guard, descriptions, and the two test files; any
  schema/lint PROPERTY, ENUM VALUE, or STATUS named locally-validated = reject — T1 i is the
  semantic version of this grep).
- Rung-spelling grep: `git -c core.fileMode=false diff <base>..HEAD -- schema/ | grep -cE
  '\b(VENDOR|DERIVED|INFERRED_INVARIANT|LOCAL_REALIZATION)\b'` values recorded per-file; NO hit
  in any `*.schema.yaml` except inside provenance-rung-ref.schema.yaml's rung enum + $id-free
  descriptions (rung names are VOCAB: registry data + the one datatype enum + lint rule bodies +
  test fixtures — nowhere else; §8.1).
- MANIFEST discipline: `git -c core.fileMode=false diff <base>..HEAD -- server/src/compiler/
  scientistIntent/goldens/MANIFEST.yaml schema/scientist-intent/` => EMPTY (vocab sha
  014ca71fbbb3...d12c at MANIFEST.yaml:9 — composer re-verified this tick; NO scientist-intent
  golden touched, ever).
- Untouched neighbors: `git -c core.fileMode=false diff --name-only <base>..HEAD -- schema/
  registry/wave2-naming-crosswalk.yaml` => additions + rung-entry status lines ONLY (show the
  diff hunk in the report); `... -- server/src/schema/Wave2NamingCrosswalk.test.ts` => EMPTY
  (UNTOUCHED green is a merge gate); `... -- records/ schema/knowledge/ schema/studies/
  schema/query/ schema/workflow/protocol.schema.yaml schema/workflow/local-protocol.schema.yaml
  vendor...schema.yaml schema/core/datatypes/ref.schema.yaml` => EMPTY.
- Hardcode grep: `git -c core.fileMode=false diff <base>..HEAD -- server/src | grep -inE
  'VENDOR|INFERRED_INVARIANT|LOCAL_REALIZATION|CAN-|LPR-|RUN-0'` => hits confined to
  `*.test.ts` fixtures (name them in the report); ZERO in any shipped vocabulary/lint TS
  (there is no shipped TS beyond tests at all — the grep's real purpose).

## 7. Worker contract

- Branch `w2-4-lane2-l2t<tickid>` off `cl/integration-2` TRUNK TIP AT CLAIM; the tip MUST be a
  descendant of the W2-1 merge (cdfdc56c) AND the W2-3 merge (hard dep —
  `git -c core.fileMode=false merge-base --is-ancestor` both, record output in the report
  header). IF W2-3 HAS NOT MERGED: DO NOT START — report deps-unmet and exit (this item binds
  directly on W2-3's merged StepProvenanceRef + R-6 + rule-id space; queue-dispatch is NOT a dep
  gate, lane standing rule).
- Worktree `/mnt/vast/home/brad/git/wt/W2-4-lane2-l2t<tickid>` + standard lane bootstrap (6
  symlinks + lane-exclude copies; `/tmp/lane2-sync-wt.sh` precedent; lane-excluded symlinked
  tests resolve to MAIN's sources — never gates).
- Unique deliverables: report `<wt>/.hermes/plans/W2-4-report.wip-l2t<tickid>.md`, log
  `~/.hermes/cl/lanes/2/logs/coder-W2-4-l2t<tickid>.log`, captures `/tmp/l2t<tickid>-*`.
- Headless — NO browser gate, NO :3093/:5193/:3001/:5174; one worker; NEVER `git add -A`;
  final line `W2-4 DONE <sha>`.
- CONFIRM-AGAINST-MERGED-TRUNK AT CLAIM (merged trunk WINS; record an assumed->found delta
  table; never edit the neighbor artifacts to match this draft):
  AS-W24-W23-STEPREF: `protocol.schema.yaml $defs/StepProvenanceRef` = ref constrained
  {kind const record, type const vendor-protocol-candidate} + optional
  pageStart/pageEnd/sectionId/spanStart/spanEnd (draft §2.1(v)). R-9's id-prefix reads the
  ACTUAL candidate id shape from merged fixtures/seed — confirm prefix, never invent.
  AS-W24-W23-RULEIDS: W2-3's merged rule ids (R-4..R-7 lineage: legacy-literal-bounded etc. per
  draft §2.2) — prov-* prefixes must not collide (LintEngine.ts:59-61 global throw); read
  merged protocol.lint.yaml before authoring F.
  AS-W24-W23-R6: W2-3's `intent-step-provenance-visible` ships as WARNING — the R-6/W2-4-R-8
  split (missing=warning, present-unanchored=error) assumes it merged as drafted; adapt F to
  what actually merged (SET assertions in T2 c encode the truth you find, not this draft).
  AS-W24-W22-CROSSWALK: merged crosswalk keys/status strings incl. W2-2's flips (§0.11).
  AS-W24-CANDIDATE-SEED: no candidate records exist under records/seed (composer-verified ls) —
  if W2-6-era fixtures landed meanwhile, the T2 candidate payload still builds from the schema
  skeleton; prefer a merged fixture if one exists.
- Report must carry: RED capture, §4.2 first-check output, every §6 command's verbatim tail, the
  three-leg no-promotion wall walk (§2.1 transition_policy -> T1 d / T2 a-c), the §5 clause->
  proof walkthrough incl. the INFERRED_INVARIANT-seam honesty statement, the W2-3/W2-2 merged-
  shape delta table, §8 dispositions, `diff --name-only` list, the nonEmpty-object probe (§2.6
  R1) and Ajv closure decision (§2.3) as named probes.
- Stop-and-report over faking: any acceptance arm unreachable at your base -> probe evidence +
  clause named, never a weakened fixture; a DSL-inexpressible rule -> STOP-and-report (no
  PredicateEvaluator edits, no graph-query engine edits).

## 8. Reviewer bait (the likely edge errors for THIS item — pre-empt each in the report)

8.1 VOCAB vs KIND: rungs are enum VALUES + registry data, NEVER a `kind:` const. The two
    forbidden strings (`provenance-ladder`, `provenance-rung`, crosswalk :174/:179) must not
    appear as `properties.kind.const` anywhere; the vocabulary data doc's kind is
    `provenance-vocabulary` on a NON-`.schema.yaml` file (enumeration only walks
    *.schema.yaml — Wave2NamingCrosswalk.test.ts:54-62). A reviewer WILL check that
    rung strings appear ONLY in: rung-vocabulary files, the datatype rung enum, prov-* lint rule
    bodies, crosswalk entries, tests. Keep it that way.
8.2 Double-fire / guard silence: every protocol.lint prov-* rule is when-guarded on
    `nonEmpty steps[*].intent` (legacy records emit ZERO — T2 c asserts the SET, not "no
    crash"); the R-6(warning, missing) vs R-8(error, present-unanchored) split must produce
    exactly one finding per case — pin the SETs.
8.3 The $id trap: candidate $id has the `workflow/` segment (:2), protocol/local-protocol $ids
    do NOT — binding candidate.lint.yaml's schemaId by copy-pasting protocol's shape yields a
    spec that NEVER fires (silent zero-rule-lookalike). T2 b uses the exact merged $id string.
8.4 Unrestricted rules poison every write: a lint rule with NO schemaId applies to EVERY
    record (LintEngine.ts:103-105, :126-135 record-scope) — e.g. an unscoped
    `everyItem(branch_resolution)` would FAIL every non-LPR record (unresolvable collectionPath
    -> FAIL names the path). Spec-level schemaId on every shipped spec; the vocabulary spec's
    doc_id schemaId never matches any record (verify boot: server boot test + LintSpecLoader
    load count; OQ3 fallback if the loader validates schemaId against registered ids — CHECK
    LintSpecLoader at claim).
8.5 Which layer rejects what — the favorite reviewer question, answer it per arm in the report:
    rung key on candidate fact = SCHEMA reject (:178 additionalProperties:false);
    `type: run` intent ref = SCHEMA reject (W2-3 type const — confirm merged);
    right-type wrong-id / unanchored provenance = LINT reject (prov-derived-*);
    rung key on the shared datatype = ACCEPTED BY DESIGN iff rung enum matches — the datatype
    closes rung VALUES (enum), not extra keys (ref.schema.yaml is open; the allOf-composed arm
    states its closure decision explicitly). exactOptionalPropertyTypes ON: test fixtures build
    optional fields (`pageStart`, `evidence`, `choices`, `rationale`) — ABSENT means ABSENT,
    conditional spreads only, never `undefined`.
8.6 INEXPRESSIBLES — declare, never fake: pageStart <= pageCount (no arithmetic op);
    axisId-exists-on-family / branchIds-not-vendor-step-ids (no cross-record resolution;
    LintEngine.ts:126-135); everyItem-assert cannot read the parent root. These live as
    vocabulary lineage_requirements + the W2-7 compiler gate + (for locally-validated) the
    declared query clauses — never a DSL extension, never a TS rule.
8.7 Candidate fact-array coverage: nine provenance-carrying surfaces (sections/steps/tables/
    materials/equipment/labware/notes/outputs — enumerated §0.4 with lines). Covering only
    steps is the classic partial-coverage reject.
8.8 YAML-reload trap: lane stack does NOT hot-reload YAML (`tsx --watch` caveat); headless
    anyway — all evidence is in-process vitest; orchestrator restart after merge is
    `cl-lane-stack.sh 2 restart` BLOCKING -> background=true. NEVER :3001/:5174; NEVER Brad's
    live tree /mnt/vast/home/brad/git/computable-lab.
8.9 Dead-rule temptation: do NOT ship a lint rule against a path that exists nowhere
    (`$.invariants`) — vacuous-green rules are rejects; the INFERRED_INVARIANT family-side slot
    is a COMMENTED seam in protocol.lint.yaml + OQ1 until W2-5/W2-3-reconciliation widens
    StepProvenanceRef (type const -> enum incl. evidence) — that one-line schema edit is the
    declared hand-off seam, NOT this diff.
8.10 The attestation gravity well: the single hardest reviewer grep — no
    `locally_validated`/`validated`/`attested` PROPERTY, enum value, status member, or UI field
    hint ANYWHERE (§6 grep + T1 i). `derived_queries[].rung_effect: DERIVED` is the sanctioned
    expression; anything field-shaped is R2-a violated.
8.11 Query-leg honesty: T3 composes the engine IN A TEST. Writing a production
    LocallyValidatedService here = scope creep into W2-5/W2-7 (reject). Copying GraphQueryEngine
    logic into the test instead of importing it = fake (reject). Import + compose, clauses read
    from the YAML.
8.12 Duplicate rule ID: prefix everything prov-* (LintEngine.ts:59-61 GLOBAL throw reds the
    whole src/lint scope); W2-2 (constraint-vocab-*), W2-3 (step-intent-/legacy-), SPINE specs
    already hold the space — read all merged *.lint.yaml rule ids at claim (T2 f).
8.13 Empty-spec activation: local-protocol.lint.yaml goes from 0 rules (silently skipped,
    server.ts:411) to live at boot — every rule when-guarded; boot test green is the gate.
8.14 Pre-deps drift: W2-3 may merge with adjudicated relaxations (its OQ1), W2-2 with different
    crosswalk status strings, W2-6-era fixtures may shift candidate id prefixes — §7 assumptions
    list is the reconciliation contract; merged trunk wins; the §4.2 integration.test first
    check is also the designated relative-$ref probe for D's `./ref.schema.yaml` composition
    (same-dir datatypes precedent: ref.schema.yaml is already $ref'd this way across the tree).

## 9. Open questions for orchestrator (composer could not resolve locally)

OQ1 — Rung-vs-candidate-anchor coexistence: where INFERRED_INVARIANT lands on the FAMILY.
W2-3's merged-intent StepProvenanceRef is type-const candidate-only (draft §2.1(v)),
protocol.schema.yaml root is closed (:8), and evidence cannot reference a protocol either
(EvidenceSource.type enum evidence.schema.yaml:73 lacks `protocol`/`run`) — so a family-level
invariant with EVIDENCE anchors has NO carrier slot today. W2-4 as drafted: declares the lineage
in vocabulary, instantiates INFERRED_INVARIANT on the knowledge layer (assertion.evidence_refs
:87-91 + evidence required supports/sources — T1 h), and leaves a COMMENTED seam in
protocol.lint.yaml. Smallest alternatives (orchestrator picks): (a) promotion note widens
W2-3's StepProvenanceRef type const to enum [vendor-protocol-candidate, evidence] (one schema
line + W2-3's fixture leg re-run) — composer's recommendation, lands with W2-5 dispatch; (b)
EvidenceSource.type enum gains `protocol` (touches lane-1 QMS-adjacent knowledge schema —
bigger); (c) hold until W2-6's extraction pass names the real shape. Checked: W2-3 draft
§2.1(ii)/(v)/§8.11, protocol.schema.yaml:8, evidence.schema.yaml:66-75,
assertion.schema.yaml:87-91, docs/wave2-naming-crosswalk.md:53-54.
OQ2 — locally-validated expressibility finding (declared, not solved): NOT lint-DSL expressible
(cross-record join; LintEngine.ts:126-135 record-scope-only; no arithmetic/comparison ops —
types.ts:21-38). The derivations/ registry precedent (derivation.schema.yaml inputType :40-48,
returnType :50-55) CANNOT host a boolean-over-(protocol,run,evidence) without enum widening +
a TS computation. W2-4's honest delivery: clause DATA in rung-vocabulary.yaml + computation
proven in-process via the EXISTING read-only GraphQueryEngine (find/exists clauses;
GraphEdgeIndex.inMemory/build — engine UNMODIFIED). Smallest alternative named for the
reusable SERVICE: a thin composition in W2-7's realization leg (it already resolves
localProtocolRef chains at compile time) or W2-5's lifecycle queries — orchestrator picks the
host; do NOT let it become a new DSL op (that would be a fourth DSL extension wave for one
derived boolean). Checked: full read of graph-query.schema.yaml + engine header + test
harness (:23-70), derivation registry trio, run/planned-run/execution-run status enums (§0.7).
OQ3 — W2-3 seam ownership + vocabulary-lint binding mechanics: (1) who owns the additive
protocol.lint.yaml/protocol.ui.yaml edits if the promotion note folds W2-4's seam (OQ1a) into
W2-3's promotion — composer drafted them INTO W2-4 (F/H) on the assumption W2-3 merges FIRST,
unchanged; confirm. (2) The rung-vocabulary lint binds by schemaId to a NON-registered doc_id
(scientist-intent precedent binds to a REGISTERED vocabulary schema —
scientist-intent-vocabulary.lint.yaml:9); composer verified the engine FILTERS by schemaId
(LintEngine.ts:103-105) and never validates specs' schemaId against registered ids at addSpec,
but did NOT finish checking LintSpecLoader/server.ts boot-time validation (log-buffered scout
pending; hand-confirmed: boot only checks `spec.rules.length`, server.ts:411). Coder probe:
boot with the spec present; if any loader leg rejects unknown schemaIds, fallback = register a
5-line rung-vocabulary.schema.yaml (kind const `provenance-vocabulary` — SAFE per §8.1) and
bind to its $id, dropping the data-doc-only purity. Checked: LintEngine.ts:103-135,
server.ts:411, scientist-intent lint header, LintSpecLoader.ts:13.

COMPOSED 2026-10-09 ~15:20 EDT by cl-spec-composer (l2t1451). All §0 cites first-hand at trunk
2c841760/e647a78d; run-surface inventory composed first-hand and corroborated by cl-scout
screening (/tmp/l2t1451-scout1.log — corroborates, not cited as authority); W2-3 draft shapes
explicitly marked confirm-at-promotion. UNVERIFIED-by-necessity items confined to §7
assumptions + OQ1-OQ3.

---

## PROMOTION RECORD (orch l2t2030, 2026-10-09T21:12 EDT)

Promoted to canonical after W2-3 merged (trunk 2e672c1b, c5b69a57 descendant; W2-1 cdfdc56c
descendant — both §7 claim-gate ancestor checks PASSED first-hand). CONFIRM-AGAINST-MERGED-
TRUNK items all verified by the orchestrator against the merged tree:
- AS-W24-W23-STEPREF: $defs/StepProvenanceRef merged exactly as the draft's §2.1(v) reads
  ({kind const record, type const vendor-protocol-candidate} + pageStart/pageEnd/sectionId/
  spanStart/spanEnd, rung-agnostic, additionalProperties:false). Delta: NONE.
- AS-W24-W23-RULEIDS: merged protocol.lint.yaml rule ids = step-role-closure,
  labware-role-identity-bearing, role-id-category-unique, legacy-literal-bounded,
  legacy-inventory-no-intent-drift, intent-step-provenance-visible, intent-verb-ref-declared.
  prov-* prefix: no collision.
- AS-W24-W23-R6: intent-step-provenance-visible merged as WARNING (severity: warning) — the
  R-6/R-8 split holds as drafted.
- Rung names VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION are UNMINTED at trunk
  (orch grep of the merged W2-3 schema/lint diff: zero hits) — W2-4's first-spend stands.
- OQ1/OQ2/OQ3 dispositions already ruled (task-list W2-4 block): OQ1 ACCEPT (evidence-anchor
  via existing EvidenceSource-shaped refs; protocol/run kind gap = declared hand-off seam to
  W2-5, NOT W2-4 scope); OQ2 ACCEPT (no new DSL op; W2-3 R-6 warning covers missing, W2-4
  errors cover present-unanchored); OQ3 ACCEPT (boot probe + pre-approved 5-line fallback if
  record-scope rules fail to load at boot).
Coder dispatch: worktree /mnt/vast/home/brad/git/wt/W2-4-lane2-l2t2030, branch
W2-4-lane2-l2t2030 off 2e672c1b, report .hermes/plans/W2-4-report.wip-l2t2030.md, log
~/.hermes/cl/lanes/2/logs/coder-W2-4-l2t2030.log. Final stdout line: W2-4 DONE <sha>.
