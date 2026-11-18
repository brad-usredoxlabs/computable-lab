# RULING — a run follows the LOCAL protocol; the global one supplies the numbers

Lane 2 · architect · 2026-11-13 · Brad's answer to the prompt-7 question (corpus-manifest open Q4)
Status: BINDING for lane 2 and for the corpus gates. Do not re-litigate in code.

## Brad's words (2026-11-13, verbatim)

"This goes back to our protocol hierarchy. By definition, a protocol coming from a PDF is a GLOBAL
protocol — something that we would get from Thermo or Bio-Rad. We need to localize it — here's what
we do in OUR lab, we make our own buffers to save money, we use New England Biolabs qPCR Master Mix
but we run it on our Thermo QuantStudio 5. Runs always follow the localized protocol. In this prompt
this is the angle I'm getting at. Take the amounts from the global protocol to use in the local
protocol."

## The rule

1. **Two layers, one direction.** A protocol that arrives from a document — a vendor PDF, a paper, a
   kit insert — is GLOBAL/universal. It describes the assay as its author ran it, with that author's
   reagents and that author's instrument. A run NEVER follows a global protocol.
2. **A LOCAL protocol is the thing a run follows.** It names the global protocol it realizes, and it
   records the lab's decisions: which reagents this lab actually uses (its own buffers, a cheaper
   equivalent), which instrument it runs on, and any parameter refinement. The amounts come from the
   global protocol; the substitutions are the lab's.
3. **A substitution is recorded as a substitution**, never as a silent rewrite: role → the material
   this lab uses in that role → the reference to what the global protocol asked for. A reader must be
   able to see both the source and the deviation.
4. **Provenance runs upward.** Because the local protocol names its source, a number in a run can be
   traced to the document and passage it came from. A local protocol with no source is refused; a
   global protocol attached to a run is refused with a reason that tells the person to localize it.
5. **Localization is a human decision, drafted by the AI.** The AI may propose the local protocol —
   mapping roles, proposing substitutions from the lab's inventory — but a person accepts it. The lab
   knows why it uses a different master mix; the model does not.
6. **The corpus percentages are the local protocol's numbers.** In scenario 7 the expectation (0.1
   percent Nile Red and 0.1 percent Hoechst in 99.8 percent Live Cell Imaging Solution) describes the
   LOCAL protocol, which has substituted Live Cell Imaging Solution for the global protocol's "Assay
   Buffer". A mismatch between the two is not a defect; an UNRECORDED mismatch is.

## What already exists (measured on trunk f4987dc7) — the hierarchy is BUILT; two links are missing

Brad's correction stands: this is not a greenfield concept. The universal→local machinery has shipped
across schema, lint, services, a compiler pipeline and a route.

- **Schema.** `schema/workflow/local-protocol.schema.yaml` requires
  `[kind, recordId, title, inherits_from, status]`; `inherits_from` is "the inherited universal
  protocol this local protocol realizes" (:72-80); `branch_axes`/:85-90 declare which branch of each
  universal axis this realization takes; `labwares`, `equipment`, `materials` are plate-setting setup
  rows binding a role to a concrete record; `overrides.substitutions` is
  `{role, material_ref, rationale}` (:148-160); `supersedes` (:174) makes replacement append-only.
  `schema/workflow/protocol.schema.yaml:21` pins the universal protocol's own kind, so the two layers
  are separately identified in data.
- **Lint.** `schema/workflow/local-protocol.lint.yaml` carries three rules: a MATCHED
  `branch_resolution` must record its localization `choices` (:38 `prov-local-choices-recorded`), the
  axis ids must carry the declared shape (:67), and **a material substitution without a rationale is a
  visible review issue** (:93 `prov-local-substitution-rationale`). LOCAL_REALIZATION is a declared
  rung in `schema/registry/provenance-ladder/rung-vocabulary.yaml`.
- **Localization service.** `server/src/protocol/BranchResolver.ts` is explicitly "Phase-0 of
  localization": it resolves each branch axis against a localization `choices` map into the active
  starting step set, reusing the lint predicate language, and fails loud (ok:false + gap) on an
  unmatched axis instead of guessing.
- **Producers of a local protocol (four).** `server/src/compiler/protocol/LocalProtocolBuilder.ts`
  (pure transform to a local-protocol payload, including the substitution type);
  `server/src/compiler/pipeline/passes/ProtocolRealizePass.ts` (protocol_extract +
  lab_context_resolve → promote a canonical protocol → build the local protocol bound to the resolved
  lab context, pausing for a variant pick when several candidates exist);
  `server/src/protocol/ProtocolContextService.ts` (creates `LPR-` records, :377, :468); and
  `server/src/api/handlers/IntentAcceptHandlers.ts:58-70`.
- **Pipelines.** `localProtocolPipelineRun.ts`, `extractionPipelineRun.ts`, `ingestionPipelineRun.ts`
  all run YAML-declared pass lists through `PipelineLoader`/`PipelineRunner`; the local-protocol
  pipeline is invoked from `server/src/protocol/ProtocolIdeProjectionService.ts:216-222`.
- **Downstream.** `POST /runs/from-local-protocol` (routes.ts:1238) →
  `PlannedRunFromLocalProtocolService` builds a planned run FROM a local protocol and refuses a
  reference that is not `kind: local-protocol` (:85-101), stamping `sourceType: 'local-protocol'`.
- **Model side.** `server/src/ai/systemPrompt.ts:610-619` already tells the model that plate setup is
  "declared ABOVE the steps on this lab's local protocol… do not re-invent or contradict them".

**The two links that are actually missing (measured, not assumed):**

- **Nothing writes `overrides.substitutions`.** `grep -n substitut` over the realize pass and the
  pipeline runner returns nothing: the compiler binds lab context and equipment overrides, but no code
  path produces a MATERIAL substitution, even though the schema declares the field and the lint rule
  demands its rationale. This is exactly prompt 7's need (Live Cell Imaging Solution in place of the
  global protocol's Assay Buffer).
- **Nothing refuses a run attached to a universal protocol.** `planned-run.schema.yaml` carries both
  `protocolRef` (:37) and `localProtocolRef`/`localProtocolRefs` (:82/:86), and no lint or handler
  rule says the universal one is inadmissible for a run. "Runs always follow the localized protocol"
  is therefore a convention, not an enforced rule.

A third, softer gap: the capability catalogue declares four capabilities, all read-only, and none of
them is the localization pipeline, so the chat assistant has no declared way to invoke it.

## Consequences (binding on task authoring)

- The work is **substitution production plus enforcement**, not a new subsystem: (1) a code path that
  fills `overrides.substitutions` from the lab's inventory while preserving the source reference and
  the rationale the lint demands, human-accepted; (2) a lint/handler refusal of a run attached to a
  universal protocol, with the reason naming localization; (3) the localization pipeline declared as a
  capability so the assistant can invoke it through the catalogue instead of by bespoke routing.
- Do NOT invent a second vocabulary. `local-protocol`, `inherits_from`, `overrides.substitutions`,
  `BranchResolver`, `ProtocolRealizePass` are the names.
- Corpus scenario 5 (ingest a vendor PDF) ends, correctly, at a GLOBAL protocol candidate; scenario 7
  cannot pass until that candidate is localized with its substitutions RECORDED. They are one
  workflow, not two.
- A substitution chosen without a material reference or a rationale is a named lint failure, and a
  local protocol with no `inherits_from` is refused by schema already.

## Not in scope

No global-protocol editing (a vendor document is immutable evidence), no automatic localization
without a human accept, and no second vocabulary for "local protocol" — `local-protocol` and
`inherits_from` are the names.

## AMENDMENT after the second Astra review (2026-11-13T17:30, same day)

Four corrections adopted; the rule set above stands otherwise.

1. **Prohibit global EXECUTABLE AUTHORITY, not global lineage.** A run may hold a reference to the
   global protocol as the source of what it realizes; what it may not do is take its steps or its
   quantities from that global record. Effective steps and quantities must come from the local
   protocol. So the enforcement is about which record governs execution, not about deleting a
   reference that carries provenance.
2. **"Document-sourced means GLOBAL" is a rule for this lane, not general doctrine.** A lab's own SOP
   can arrive as a PDF and be perfectly local. The distinction is who the protocol describes (a
   vendor's assay as published vs this lab's actual practice), not where the bytes came from.
3. **A rationale is not source lineage.** `overrides.substitutions` currently carries
   `{role, material_ref, rationale}`; nothing guarantees the ORIGINAL material and the passage it came
   from stay addressable through revisions. Whether `inherits_from` plus role resolution gives that
   lineage is unmeasured. Do not claim traceability until a probe shows a number in a run resolving to
   the source passage after a substitution.
4. **The invention boundary is attributable authorization, not plausibility.** A substitution must be
   distinguishable as an AI PROPOSAL or a LAB INSTRUCTION, with the acceptance linked; the human task
   must show the substantive diff (what was inherited, what replaced what, which quantities were
   copied or overridden, what remains unresolved); the approval must gate that exact revision. All
   three, not one. Brad choosing a substitute is evidence of THIS choice, not licence for more.

Order of work adopted from the same review: enforce the local-governs-execution invariant first
(fail closed, named reason), then produce the substitutions inside the EXISTING localization
machinery (`BranchResolver` / `ProtocolRealizePass` / `LocalProtocolBuilder` — do not write a fifth
producer), then declare the pipeline as a capability so the assistant has a declared route to it.
Which of the three is the FIRST observed blocker is a measurement, not an assumption.
