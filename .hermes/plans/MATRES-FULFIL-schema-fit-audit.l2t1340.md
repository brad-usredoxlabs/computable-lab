# MATRES-FULFIL — schema-fit AUDIT answers (committed FIRST, per task block + spec §6/AC-F1)

Audited FIRST-HAND at dispatch tip `2eafc8d313b9...` (branch cl/lane2-matres-fulfil-l2t1340,
PINNED_TIP 2eafc8d313f9b6af6e6dd6d910ed4a58cf91738c; 4646f56a and ELIG 5e9c4bb1 ancestor-proven).
Cites re-pinned per F-block F1 (anchor by content, not remembered lines). F7 grep fence at MY base:
`git -c core.fileMode=false grep -n 'id: fulfil\|id: add-material' -- schema/` -> ZERO hits (exit 1).

## (a) plate-event.add-material.schema.yaml `material_source_requirement` — PARTIAL (shape shipped, lifecycle ABSENT)

Exact shape at my tip (file `schema/workflow/events/plate-event.add-material.schema.yaml`):
- object `additionalProperties: false` :54, description :55 ("records unresolved source/provenance
  needs without minting a concrete tube..."), `required: [status]` :56.
- `status` enum EXACTLY `[unresolved, provided, linked]` :58-60 (AC-F1 byte-set pin).
- ref-shaped slots `material_ref`/`material_spec_ref`/`vendor_product_ref`/`source_ref` :61-68
  (all `$ref ../../datatypes/ref.schema.yaml`), free `reason` :69-70, `source_details` bag :71-89.
- Event-level intent/used coexistence: `material_spec_ref` :27-29 beside `aliquot_ref` :31-33 /
  `material_instance_ref` :35-37 — byte-exact. Root `anyOf` :195-201.
- CAN express: unresolved need (status + reason + spec refs). CANNOT express: stable identity
  (no id field), Shape-A requested-source slot, any fulfillment state. `provided`/`linked` have
  ZERO server writers (grep: sole writer `unresolvedSourceRequirement` AddMaterialSupport.ts:457,
  status:'unresolved' only; calls :642/:669/:704 — re-verified byte-exact at my tip).

## (b) Per-component requirement identity — ABSENT

`requirementId` grep in `schema/`: ZERO hits; in `server/src/materials/`: ZERO hits (re-run at my
tip). Only unrelated `REQ-` procurement ids exist. `composition_snapshot[]` rides
`schema/core/datatypes/composition-entry.schema.yaml` (`component_ref` :11, `required:
[component_ref, role]` :9 — UNCHANGED by MIXFRAC-1; nested `composition:` slot at :48 IS present —
see F6 stance below). RULING (D3, ratified): event-occurrence id `REQE-<slug>-<hash>` via a
termId-style helper (`server/src/materials/termId.ts` labelHash :21 / labelSlug :29 — re-verified),
anchor = (graph recordId, eventId, slot) — NOT content; per-component anchor = `componentRef`
membership, NO second id system.

## (c) Fulfillment evidence refs — ABSENT event-side; fulfillment rides the attestation envelope

`material_source_requirement.additionalProperties:false` (:54) forecloses un-declared rides.
Shape-A `requestedSource` becomes a declared optional ref-shaped property (§7.1b). Fulfillment
NEVER rides the event: it is an `attestation`-kind record (kind const :28-29; `appendOnlyKinds`
`server/src/config/types.ts:535` already lists `attestation` — FULFIL adds NO entry). Evidence refs
ride the loose assertion bag: `$defs/Claim` required `[verb, about]` + `additionalProperties: true`
at attestation.schema.yaml :141-142 (post-$defs values per F1); envelope `evidenceRefs` :72-79;
claim `evidenceRefs` :200; `against` pin fields `$defs/Against` :103-124. `ref.schema.yaml`
(`schema/core/datatypes/ref.schema.yaml` — there is NO schema/base/ dir) `type` is a free string
:52-55 (NO widening needed for material-receiving/material-derivation/material-instance/aliquot
evidence); `revisionRef` :29-37 (`^REV-[A-F0-9]+$`).

## (d) Pinned-revision mechanism — PARTIAL (exists; reference-copy style) — re-verified

1. `planned-run.schema.yaml` `checksums.protocolSha` (:153 checksums, :158 protocolSha).
2. `attestation.schema.yaml` `$defs/Against` :103-124 (`plannedRunRef`, `eventGraphRef`,
   `graphRevision`, `protocolSha`) — reference-copy, never a live pointer.
3. `ref.schema.yaml` `revisionRef` :29-37; `RecordRevisionService.ts` token() :37 / REV- mint :65.
Accept-time drift gate: `AttestationAcceptService.ts` gate 3 pinned-reads re-check (comment :165,
check :190-198) 409s when a pinned source moved — FULFIL passes the plan + evidence in `draft.reads`;
scoping is STRUCTURAL. Fulfillment writes NOTHING except its own attestation record.

## (e) Accept/derivation paths — SHIPPED, but NONE writes a fulfillment transition

- Sole writer of `material_source_requirement`: `AddMaterialSupport.ts` `unresolvedSourceRequirement`
  :457 (status:'unresolved'), called :642/:669/:704 inside `normalizeEventGraphMaterialUsage`
  (:607), reached from RecordHandlers create/update. Implicit-mint ids :156/:161/:166
  (ALQ-IMPLICIT-/MINST-IMPLICIT-/MSP-DRAFT- — named-OUT of scope, untouched).
- `MaterialLifecycleHandlers.ts` `token()` :130-132 = Date.now()+Math.random — pre-existing
  non-determinism, OUT of scope; FULFIL NEVER mints through it.
- Attestation accept rail: `AttestationAcceptService.compile` :141 / `accept` :172; correction
  identity :95-101; `recordIdOf` :113-117 — UNCHANGED (OQ-1 stance (a); do not touch).
- Lint seam: `server/src/store/RecordStoreImpl.ts:1025` lints every create/update payload against
  `payload.schemaId`; LintEngine dup-id throw :62; `getRules` schemaId filter :110-121; record-scope
  skip :141-150. Rules bound to the add-material DETAIL schemaId fire only on detail-payload
  validation (ValidationHandlers.ts:103 shape) — event-graph payloads bind the graph schemaId.

## (f) Declared compatibility evaluation surface — ABSENT

No lint rule/policy/code evaluates "evidence satisfies a FORMULATION requirement" (grep `fulfil` in
schema/ hits only procurement/budget enums). ELIG (MERGED @ 5e9c4bb1) owns candidate-resolution
(`server/src/compiler/resolution/eligibility/**`, `schema/scientist-intent/material-eligibility/**`)
— grepped ZERO mentions of material_source_requirement/requirementId/REQE there. FULFIL-owned home
stands (OQ-3); ZERO import/file-sharing with ELIG dirs; mirror its idiom in STYLE only
(policy-as-YAML-data + pure evaluator + three-state law + per-call load + malformed-data-throws).

## DSL expressibility PROOFS (tsx probes at my tip, raws saved)

Probe `server/tmp/fulfil-dsl-probe.mts` + `fulfil-dsl-probe2.mts` (scratch, deleted before commit):
1. Nested wildcard paths RESOLVE: `claims[*].assertion.evaluations[*].verdict` ->
   [["compatible"],["incomplete","compatible"]] (PathResolver.ts:131-153 recurses per item; the
   lint-v1 path pattern allows multiple `[*]`). The §7.2 event-level uniqueness path
   `events[*].details.material_source_requirement.requirementId` selects fine.
2. `nonEmpty` on a `[*]` projection = ANY-semantics (lint-v1 :234-240) — usable as a when-guard
   ("some claim carries fulfilledBy").
3. Verdict trio (everyItem + any(not equals, everyItem + in) shape) discriminates EXACTLY:
   completed+incomplete -> FAIL; completed+all-compatible -> PASS; completed+NO evaluations -> FAIL;
   unknown+incomplete -> PASS; ANY mismatch (completed OR unknown) -> FAIL; no-evaluations vacuous
   for the mismatch-block rule. (8/8 probe cases OK.)
4. `allIn` with a scalar `path` = one-item membership; absent componentRef -> vacuous PASS;
   non-member -> loud FAIL. (Membership rule shape proven.)
5. `regex` on dotted paths + `^REQE-` pattern works; `in` supports runtime `valuesPath`.
6. PAIRWISE-DISTINCTNESS is NOT expressible with shipped ops (no distinct/count op): the selection
   `["REQE-a-1","REQE-a-1"]` cannot be rejected by any single rule. Per §7.2's recorded-constraint
   escape: uniqueness is enforced (i) CONSTRUCTIVELY by the mint law (anchor includes eventId ->
   distinct occurrences mint distinct ids; idempotent re-drafts land on the SAME id) and (ii)
   fulfillment-side by `fulfil-requirement-exists-in-plan` (about.id must be a member of the pinned
   plan's requirementId projection). The pairwise-distinct lint gap is RECORDED, not silently dropped.

## F6 NESTING STANCE (named explicitly, per final-prep §6 F6)

composition-entry.schema.yaml:48 allows a nested `composition[]` (root self-`$ref: "#"`).
FULFIL's componentRef-membership check stance: **proven-nested to one level** — probe 1 shows the
resolver handles `composition_snapshot[*].composition[*].component_ref.id` (nested wildcards
resolve), so the membership rule checks BOTH the top-level projection AND the one-level-nested
projection (any(allIn, allIn)). Deeper nesting (2+ levels) is a RECORDED LIMITATION in the rule
description and this report — same discipline as §7.2's PathResolver caveat. D3 unchanged;
composition-entry.schema.yaml is READ-ONLY (zero diff there).

## Vocabulary pins (bait 3)

- requirement id family `^REQE-[a-z0-9-]+$` (never `REQ-`).
- assertion verbs `fulfills` / `re-evaluates-fulfillment` — FULFIL lint-file enum values + test-pinned
  constants; NEVER enter the scientist-intent verb union (stays 32).
- `fulfilledBy` values exactly `receipt | derivation | instance` — lint-file values + test pin.
- evaluation verdicts `compatible | mismatch | incomplete` — policy data + lint values.
- `claimStatus` stays `proposed|completed|unknown|reported-by-other` (schema enum, untouched);
  server NEVER derives/rewrites it (OQ-4 inherited).
- REQUESTED SOURCE naming (never "reserved"); no decrement/availability vocabulary anywhere.

## Worktree bootstrap note (baseline integrity)

Fresh worktree lacked the lane-exclude overlay copies (lane-verification skill: lane 2 excludes
~45 untracked-but-present server sources + 3 schema data files). Repaired by `cp -L` of the trunk
checkout's versions (plain copies for schema paths per the SchemaLoader symlink law); `git status`
stays clean (lane-excluded). Post-repair baselines at dispatch tip: server `tsc --noEmit` = 0 errors;
full server suite = 89 failing files / 6569 passing tests / 2 unhandled errors (pre-existing trunk
debt; raws saved). Pre-repair baselines (237 fail files, 30 TS2307 lines) were provisioning
artifacts, NOT trunk debt — disclosed per report-integrity rule 7.
