# OQ-1 decision — where the DECLARED capability requirement lives (INSTR-COLLAPSE-1, C2)

Item: INSTR-COLLAPSE-1 (lane 1), OQ-1 — design blessing for the capability gate (verified-by 3).
Date: 2026-10-22. Architect read the draft spec (Recon (c), C2, OQ-1, H1/H2/H3), memo §2/§4/§5,
and the trunk code first-hand: PredicateEvaluator.ts (ops :53-118, membership core :333-427 —
collectionPath resolves ONLY against the record's own data, never the store), LintEngine.ts:137
(lint ctx is payload data), EquipmentCapabilityService.ts:50/:126, capabilityAuthorization.ts:186-190
({equipmentId, verbId, methodId?}), CheckInstrumentCapabilities.ts (warn-only; hardcoded
CAPABILITY_LIMITS :63-66 — legacy shape, not the gate), MeasurementService.ts:82/:133/:174 (write
path), ProtocolCompiler.ts:317-334 (verb-definition index incl. byCanonical map — existing
re-usable machinery) and :479 (resolveEquipmentSupport call-site shape), planned-run.schema.yaml
CompiledProtocolStep verbRef :412-413 beside equipmentRef :421-422, event-graph.schema.yaml
semanticKeyComponents.verb :429-431, ContextBuilder.ts:154 (x-jsonld: schema-side annotation
consumed by a generic TS interpreter — the precedent), verb-definition.schema.yaml:83-86
(`fn: name of a registered derivation function` — the data-names-a-registered-resolver precedent),
RecordStoreImpl.ts:101/1005-1018 (writeHook exists; validate is schema-only).

DECISION: (a), refined — schema-side `x-capability-gate` annotation on the equipment ref slot,
consumed by ONE generic TS validator that resolves the verb strictly from payload data via
resolver functions registered by name, and calls EquipmentCapabilityService.resolveEquipmentSupport.
Schema stays the declaration; TS stays the policy-free interpreter. NOT a STOP under H2: the
chosen shape resolves the verb from data at every call site; no TS 'VERB-READ' literal is needed.

## The declared shape (concrete YAML sketch)

Precedents, both shipped: `x-jsonld` riding a schema property, read by a generic interpreter
(server/src/jsonld/ContextBuilder.ts:154); and `derivedFrom.fn: <registered function name>` where
data names the resolver (schema/workflow/verb-definition.schema.yaml:83-86). The annotation follows
both. C1's schema floor (`type: const equipment` pin) stays in C1 regardless; this annotation is
ADDED in C2 alongside the ref retarget.

schema/lab/measurement.schema.yaml (post-C1 name):

    equipmentRef:
      $ref: "./datatypes/ref.schema.yaml"
      description: "Which equipment performed the measurement."
      x-capability-gate:
        verbFrom:
          resolver: read-event-verb      # registered resolver name (data-names-function precedent)
          path: readEventRef             # payload path to the producing read event

schema/workflow/planned-run.schema.yaml (per compiled step — verb and equipment ride the SAME object):

    # inside $defs/CompiledProtocolStep (:401-425 today)
    equipmentRef:
      $ref: "./datatypes/ref.schema.yaml"
      x-capability-gate:
        verbFrom:
          resolver: sibling-verb-ref     # reads .id off the sibling property
          path: verbRef                  # :412-413 — a verb-definition record ref, already declared

measurement-context.schema.yaml `equipment_ref` carries the same annotation as measurement
(verb via its readout chain is NOT available today — see residual uncertainty R2; C2 gates the
measurement and planned-run write paths and annotates measurement-context only if a resolver
exists without new machinery).

## The interpreter (one file, no policy)

New `server/src/capabilities/DeclaredCapabilityGate.ts`: given (payload, schemaId), read the
payload's schema, find properties carrying `x-capability-gate`, for each: resolve the equipment id
from the slot, call the NAMED registered resolver with the payload + `path` to get a
verb-definition id, call `EquipmentCapabilityService.resolveEquipmentSupport({equipmentId, verbId})`
(capabilityAuthorization.ts:186-190 — already verb-as-data), and reject the write when
`supported === false`. Resolver registry is a small map name -> function; C2 ships exactly two:

- `sibling-verb-ref`: returns `<sibling>.id` (pure path read; planned-run compiled steps).
- `read-event-verb`: loads the event-graph named by the measurement's eventGraphRef (or resolves
  via measurementContextRef chain if absent — coder may require eventGraphRef for the gate to
  apply), finds the event whose `eventId` === payload's `readEventRef`, reads
  `semanticKeyComponents.verb` (event-graph.schema.yaml:429-431, a CANONICAL NAME string — data),
  maps canonical -> VERB-* id via the verb-definition store, reusing the exact existing index
  shape ProtocolCompiler.resolveVerbDefinitions byCanonical (ProtocolCompiler.ts:317-334).

Wiring (write-path call sites, per session budget — NOT the store writeHook, so each gate is
explicitly testable):
- measurement: `MeasurementService.ingest` — after refs are parsed (server/src/measurement/
  MeasurementService.ts:133, equipment id = equipmentRef.id post-rename) and BEFORE
  `store.create` (:174); reject with MeasurementServiceError code `capability_gate_unsupported`
  (400).
- planned-run: the write path that persists a planned run carrying compiled steps (coder locates
  the single service/handler that saves `planned-run` payloads with `steps`/CompiledProtocolStep —
  named in the report); gate every step where BOTH equipmentRef and verbRef are present.
- exactOptionalPropertyTypes: resolver inputs follow the file-local spread-guard idiom
  (MeasurementActiveControlService.ts:156,:238 precedent).

## WHERE the verb id comes from (H2 answer, per host)

- measurement: the producing READ EVENT's data — payload.readEventRef
  (schema/lab/measurement.schema.yaml:34-36) -> event-graph event ->
  semanticKeyComponents.verb (schema/workflow/event-graph.schema.yaml:429-431) -> verb-definition
  record. The consumer file that has it at write time: server/src/measurement/MeasurementService.ts
  ingest (input.readEventRef :106, eventGraphRef :132). Canonical->id mapping is a store read
  (verb-definition records, records/seed/verb-definition/ — 10 seeds, e.g. verb-read.yaml
  `canonical: read`), not a literal.
- planned-run: CompiledProtocolStep.verbRef.id, sitting beside equipmentRef in the same step
  (schema/workflow/planned-run.schema.yaml:412-413 / :421-422). Pure sibling data.
- No TS verb literal anywhere; no device names; no id-prefix sniffing (H1 satisfied).
  Verb-unresolvable (e.g. measurement with no eventGraphRef/readEventRef, or verb not in the
  store) FAILS CLOSED with code `capability_gate_verb_unresolvable` — a silent pass would make
  the gate theater and is rejected by design.

## RED-first test shape C2 must write

New `server/src/capabilities/DeclaredCapabilityGate.test.ts` + write-path cases (save RED evidence
per worker contract):
1. REJECT-kind-correct-no-binding (the reviewer-bait-5 killer): EQP fixture bound via an
   equipment-capability record to a NON-read verb (e.g. VERB-MIX — verb-shake/verb-rock seeds
   exist, no new kind needed), measurement-ingested with a read event whose
   semanticKeyComponents.verb = "read" -> 400 `capability_gate_unsupported`. Proves the gate is
   capability-resolved, not kind-resolved.
2. ACCEPT: EQP-QUANTSTUDIO5 via ECP-QUANTSTUDIO5 (VERB-READ) same event -> green.
3. planned-run: compiled step {equipmentRef: plate-reader-EQP, verbRef: VERB-READ-only-missing}
   rejected; {verbRef matching binding} accepted — sibling data, no event-graph.
4. RIP-OUT proof (anti-hardcode): with the `x-capability-gate` annotation removed from the schema
   in-test, the same payload passes — the gate exists ONLY because the YAML declares it.
5. Fail-closed: readEventRef/eventGraphRef absent -> `capability_gate_verb_unresolvable`.
Existing measurement tests whose fixtures lack an event chain get re-seeded in-diff (H9), not
weakened (stop boundary 4 applies).

## Consequences / rejected options

Option (b) is rejected: with the requirement living only in write services, every future
equipment-ref consumer needs hand-wired policy at its call site, the rule is invisible on the ref
it declares, and the "gate" degenerates per-call-site — CheckInstrumentCapabilities is the caution
example (warn-only, and its CAPABILITY_LIMITS :63-66 is exactly the hardcoded-vocabulary shape the
memo §2:69 forbids). A lint-DSL op is rejected for C2: PredicateEvaluator resolves every path,
including allIn's collectionPath, against the record's own payload only (PredicateEvaluator.ts:383;
LintEngine ctx is data-only, LintEngine.ts:137) — wiring store-backed capability lookup into the
lint engine is a DSL-platform change far beyond one C2 session; it remains the right eventual
consolidation (a future `capabilityResolves` predicate op would subsume the annotation) and is
NOT precluded by this decision. This third shape stays inside ruling memo §5's requirement that
validation improve from nominal record type to declared capability + applicable context, and it
puts the declaration where C1's floor already lives — on the ref slot in the consuming schema.

## Residual uncertainty

- R1: the generic validator needs schema-by-id access (RecordStoreImpl exposes validator.hasSchema
  /validate only, :1005-1018). Smallest fix: one accessor on the schema validator returning the
  loaded schema for a schemaId. Coder may implement; it introduces no policy.
- R2: measurement-context equipment_ref gets no gate in C2 (no verb data rides its write path
  today); annotating it is deferred until a resolver exists without new machinery. Not a hole:
  the measurement write path (the one that produces evidence) is gated, and planned-run compiled
  steps are gated.
- R3: if, at claim time, no single planned-run write service persists compiled steps (steps may
  only exist on compiler output, not on saved payloads), the planned-run leg of the gate reduces
  to the compiler already calling resolveEquipmentSupport (ProtocolCompiler.ts:479) and C2 ships
  the measurement gate + annotation only; record the finding, do not invent a call site.

STATUS: decided
