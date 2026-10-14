# OWN-1 fix-cycle decision — architect ruling
Decided by: cl-architect, 2026-10-11 (lane 1, OWN-1 fix cycle)
Request: .hermes/plans/2026-10-11_own-1-fixcycle-decision-request.md
Review: /home/brad/.hermes/cl/lanes/1/reviews/own1-advreview-l1t0405.md (VERDICT: fix)
All claims below verified first-hand in /mnt/vast/home/brad/git/cl-integration-1 (READ-ONLY;
no repo file touched except this decision file).

## Verification performed (first-hand, this decision)
- UISpecLoader.ts:19-29 VALID_WIDGET_TYPES — confirmed: no 'json' in the whitelist.
- schema/ui/ui-v1.schema.yaml:163-181 field.widget enum — confirmed: [text, textarea,
  number, select, multiselect, checkbox, date, datetime, ref, array, object, markdown,
  code, hidden, combobox]; no 'json'. So widget "json" fails BOTH the loader and the
  meta-schema, exactly as the review found.
- SchemaRegistry.normalizeRef (SchemaRegistry.ts:27-60) is called with `entry.id` (the $id
  URL) as baseUri (SchemaRegistry.ts:143). common.schema.yaml registers under the FLAT $id
  `https://computable-lab.com/schema/computable-lab/common.schema.yaml`
  (schema/core/common.schema.yaml:2). Resolving `../core/common.schema.yaml#/$defs/FAIRCommon`
  against `.../computable-lab/ownership-policy.schema.yaml` yields
  `.../schema/core/common.schema.yaml` — NOT a registered $id → dangling, confirmed.
  `./common.schema.yaml` against the same base yields the registered flat URL — confirmed
  by the identity-sibling convention (schema/identity/access-policy.schema.yaml:12).
- Plan §T1 pins both defects: `.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md`
  line 102 (`../core/common.schema.yaml#/$defs/FAIRCommon`) and line 294 (`widget: "json"`)
  — confirmed the coder was pinned to reproduce them byte-for-byte. Correct coder behaviour;
  this is a plan amendment, not a coder fix.

## DEFECT 1 — ui.yaml widget "json"

DECISION: 1(a) — amend plan §T1 ownership-policy.ui.yaml:52 (plan line 294) to
`widget: "array"`, NOT "object". AMENDED RECOMMENDATION (rejecting 1(b)).

Rationale: The request recommended "object" as "best fit", but first-hand evidence says the
field's own type decides. `$.kindRules` is `type: array` (plan §T1 lines 138-149 — an array
of KindRule objects), and the app-side widget implementations confirm the mismatch:
ObjectWidget (app/src/editor/taptab/widgets/ObjectWidget.tsx:59-96) treats the value as a
`Record<string, unknown>` and renders "Empty object" when it has no `properties` config —
and ui-v1's `field` meta-schema (schema/ui/ui-v1.schema.yaml:152-181) has no per-field
`properties:` sub-declaration mechanism at all, so an "object" widget here can never be
configured; it would render an object editor over an array value — a semantically-wrong
blank-ish surface, i.e. the same EDITOR-3 defect class 1(b) was meant to avoid. "array" is
legal on both gates (UISpecLoader.ts:21 whitelist, ui-v1.schema.yaml:175 enum), and
ArrayWidget (app/src/editor/taptab/widgets/ArrayWidget.tsx) exists, explicitly renders
"repeatable item groups ... structured object, not collapsed to JSON text", and IS the
established repo precedent for exactly this shape — schema/knowledge/conversation.ui.yaml:47
($.messages, array of objects) and schema/knowledge/mechanism-model.ui.yaml:33/39/45
($.nodes/$.edges/$.interventions) all use `widget: "array"`. 1(b) is rejected outright:
"json" is absent from BOTH the loader whitelist and the shipped meta-schema enum, and no
json widget implementation exists app-side — adding it would be a new platform widget
(implementation + meta-schema + whitelist + browser review), out of wave scope. The "json"
widget demand is recorded as a carried finding below.

## DEFECT 2 — ../core/common.schema.yaml $ref dangles in $id URL space

DECISION: 2(a) — amend plan §T1 ownership-policy.schema.yaml:13 (plan line 102) to
`$ref: "./common.schema.yaml#/$defs/FAIRCommon"`, matching the identity siblings.
Reject 2(b) for this wave.

Rationale: Confirmed mechanically — SchemaRegistry.normalizeRef resolves refs in $id-URL
space (baseUri = entry.id, SchemaRegistry.ts:143), so `../core/` normalizes to
`.../schema/core/common.schema.yaml`, which no registered $id occupies (common.schema.yaml's
$id is flat: `.../computable-lab/common.schema.yaml`, schema/core/common.schema.yaml:2). Ajv
compiles lazily at validate time, so the dangling ref does not hit the schema-only acceptance
gate but WILL throw MissingRefError the first time an ownership-policy record is validated —
the mixin's whole point (FAIRCommon fields) silently unenforced, then crashing. The identity
sibling access-policy.schema.yaml:12 already demonstrates the resolving form
(`./common.schema.yaml#/$defs/FAIRCommon`); reusing the sibling convention is the smallest
change, restores intent, touches no platform code, and keeps §T1's declarative shape intact.
2(b) — registering core/common.schema.yaml under a /schema/core/ URL space — is a legitimate
platform fix for the pre-existing class but changes global ref resolution semantics and must
not ride inside a schema-trio wave; route it as its own platform task (below).

## Plan amendment summary (Brad-approved campaign text; orchestrator applies to §T1 before re-dispatch)
1. §T1 ui yaml, kindRules field: `widget: "json"` → `widget: "array"`.
2. §T1 schema yaml, FAIRCommon mixin: `../core/common.schema.yaml#/$defs/FAIRCommon` →
   `./common.schema.yaml#/$defs/FAIRCommon`.
Both are scope-preserving clarifications of the approved intent (legal widget for the
field's real type; working FAIRCommon mixin via the identity convention); no domain policy,
acceptance criterion, or file ownership changes — no campaign reapproval needed. Coder re-run
verifies: Ajv-valid vs ui-v1.meta, loads clean in UISpecLoader (ui error count back to 7),
checkResolution resolves the FAIRCommon ref, schema suite fail-set unchanged.

## Carried findings (future platform task candidates — NOT enqueued here)
- CF-OWN1-A: the `../core/` dangling-ref CLASS is wider than the request states — 9 refs
  across 6 files first-hand: schema/ingestion/extraction-spec.schema.yaml:11,
  schema/bio/sequence.schema.yaml:13, schema/bio/sequence-interval.schema.yaml:13,37,65,
  schema/lab/material-derivation.schema.yaml:45,49,51,53 (including ../core/ref.schema.yaml
  and ../core/datatypes/ref.schema.yaml variants). Fix class = register the /schema/core/
  URL space (2(b)) or migrate these refs; needs its own wave + regression sweep.
- CF-OWN1-B: demand for a structured "json"/raw-JSON editor widget — needs a real app-side
  widget implementation + ui-v1 enum + loader whitelist + cl-browser-review; candidate lane-1
  platform task, not a spec-word fix.

OWN1DECISION DONE
