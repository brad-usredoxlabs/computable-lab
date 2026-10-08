# Sequence analysis

Open `/sequences` (also `/lab/sequences`). This workspace uses the existing record store, immutable revision service, analysis runner, ingestion records, and `agent_intent` chat proposal/acceptance flow.

## Authoring

The editor creates DNA, RNA and protein sequences, imports FASTA collections, computes reverse complements, and annotates regions. Editing a saved sequence creates a new sequence with a parent revision reference. Original inputs remain available to earlier analyses. Authorship comes from the selected session user.

Oligo specifications attach chemical modifications to sequence revisions. Primer/probe **roles belong to an assay**, allowing the same oligo to serve different roles in different assays. A probe's reporter modification (such as FAM) and an assay's instrument readout (such as a FAM Ct channel) are distinct records linked by the assay. Create readouts in the Assay tab; select existing readouts when defining an assay. Expected product length is an assay property, not proof of target specificity.

## Declarative actions and AI

`schema/bio/sequence-action.schema.yaml` is the authoritative request contract. The existing `agent_intent` tool gains `intent: sequence_action` and a `sequenceAction` request. It returns a proposal without executing it. Sequence and new-oligo proposals pass through the shared deterministic compiler and populate the native editor. **Accept and save** commits the reviewed draft without another AI call. Direct field edits recompile; Reject restores the unsaved baseline. Follow-up chat receives the current form and diagnostics. Other operations retain their explicit structured YAML review pending their own native adapters. The canonical contract is [AI drafting and native UI projection](../../specifications/ai-drafting-and-ui-projection.md).

- `POST /api/drafts/compile`: staged authoring, compiler policy/diagnostics, native projection and reviewed hash; no scientific records or revisions are written.
- `POST /api/drafts/accept`: actor/source/policy recheck and deterministic save of the reviewed revision; retries reuse the same write plan.
- `GET /api/sequences/authoring/:id`: editable sequence/oligo values and source hash, without capturing revisions.
- `GET /api/sequences/contract`: action and oligo schemas, engine capabilities, alphabets.
- `POST /api/sequences/actions/validate`: structural validation without writes.
- `POST /api/sequences/actions`: execute a request as the session user.
- `GET /api/sequences/catalog`: accessible records for workspace selectors.

`create_oligo` accepts new sequence bases, a label, alphabet/topology, modifications (`position`, `label`, `role`), and optional vendor. Acceptance creates the sequence, pins its revision, and creates the oligo specification with server-assigned record IDs. Use `save_oligo` when referencing an already saved sequence revision.

Named probe chemistry is grounded in `config/sequence-analysis/oligo-modifications.yaml`, with manufacturer source links. These are references for requested modifications, not defaults for every oligo.

The tool schema sent to local models uses inline structural definitions; the server validates the full YAML contract with Ajv, selecting the operation before reporting errors. An invalid AI proposal gets at most two correction attempts without executing anything. If correction fails, chat reports a short error.

Requests have a caller-provided `requestId`. Successful requests retain receipts; an exact retry reuses the result, while reusing the ID with different content fails. Use a new request ID for another analysis attempt. Partial record creation can be recovered by retry; this is not a multi-record database transaction.

Example, with existing IDs substituted:

```yaml
operation: run_virtual_pcr
requestId: assay-check-001
label: Primer pair and internal probe
endpointRef: {kind: record, type: sequence-endpoint, id: SEQEP-local-pcr}
inputs:
  references: {kind: record, type: sequence-collection, id: SEQSET-reference}
  forward: {kind: record, type: oligo-spec, id: OLIGO-forward}
  reverse: {kind: record, type: oligo-spec, id: OLIGO-reverse}
  probe: {kind: record, type: oligo-spec, id: OLIGO-probe}
parameters:
  minLength: 140
  maxLength: 140
  maxMismatches: 0
  exactThreePrime: 8
  maxProducts: 1000
```

## OpenRouter compatibility

The shared inference client recognizes the OpenRouter URL and maps the thinking setting to `reasoning.enabled`, omitting local template/cache/slot parameters. Qwen thinking routes use automatic tool selection restricted to the requested named tool, because Alibaba rejects forced tool choices in thinking mode. Other routed providers receive one compatibility retry only when they explicitly reject that same combination. The thinking preference is retained.

Provider adapters that return the nested action as a JSON string are decoded before validation; no domain fields are guessed or repaired by that decoding. The caller still requires and validates an action proposal. A plain-text response cannot execute an action: sequence chat recovers a structured JSON proposal or makes bounded correction attempts, then reports failure. Provider errors delivered inside an SSE stream are surfaced rather than treated as empty success. Both streaming and non-streaming HTTP requests use the shared compatibility handling.

Provider references: [Alibaba function calling](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-function-calling), [OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

## Engines and setup

Setup offers discovery, configuration, verification, and explicit deployment of digest-pinned Docker images. The AI can propose each of these operations. It cannot invent executable paths or checksums. Engine configuration is a persisted record; execution freezes its revision with the inputs and method.

- Virtual PCR runs in-process. Configure the built-in endpoint in Setup. It checks both orientations, circular origins, mismatch limits and exact 3′ bases. Ambiguous reference positions match only if the primer covers every possibility. Probe matches are exact and internal to primer boundaries. Results include coordinates, mismatches, reference product and primer-incorporated product. This is sequence matching, not a thermodynamic simulation.
- MAFFT accepts one alphabet family per alignment, fixes thread settings, and emits aligned sequences with mappings to original coordinates.
- BLASTn builds a local nucleotide database from the selected immutable reference sequences. Results preserve query/reference identities and revisions. No sequence is sent to NCBI BLAST.

Local executables require absolute paths, checksums and expected software versions. BLAST also requires a matching `makeblastdb`. A wrapper checksum cannot attest to all dependent binaries: use a digest-pinned container for a fully pinned engine environment. Container deployment pulls only the explicitly requested digest; execution uses `--pull never`, no network, and a temporary mounted working directory. Container images must provide `mafft` or `blastn`/`makeblastdb` on PATH. Docker itself must already be available.

These runtimes execute on the computable-lab server, which may be on a lab LAN. A separate remote-worker protocol is not implemented. Package-manager installation is not automated. Workload limits are declared in `config/sequence-analysis/capabilities.yaml`; this implementation targets bounded reference collections rather than the full NCBI nt database. Analyses run synchronously in the request; there is no new durable worker queue/cancellation service.

## Claims, evidence and context

Interpretation uses the canonical graph: a reusable claim, an assertion about that claim in a biological context, and evidence supporting/refuting/assessing that assertion. A sequence interpretation rule references an assay and declares required controls plus pass/detected/not-detected predicates in the existing lint predicate language. Numeric comparisons use `compare` without string coercion.

- Missing or failing controls produce `invalid` and inconclusive evidence.
- Both or neither outcome predicates matching produces `indeterminate`.
- A valid detected/not-detected result supports or refutes according to the rule's explicit `supportsOutcome`.
- Computational sequence output is `model_derived`; it cannot be relabeled `observed`.
- Observed results require a measurement context identifying the same assay, and a completed analysis output. Gel image or QuantStudio data must first enter the existing data-analysis pipeline and produce a small result artifact.

Rules are authorable through YAML/AI actions. Biological context assignment is explicitly user-declared; a gel band of the expected length or a FAM signal is not automatically species-specific proof. The rule and control design determine what claim that observation can support. This module does not add a QuantStudio-specific file decoder or gel image quantification algorithm.

## Imports

Literature search cards for NCBI Gene, UniProt and PDB now offer sequence import. NCBI Gene resolves candidate RefSeq transcript accessions for explicit selection; PDB imports polymer entity sequences. Sources retain accession, retrieval time, source text and checksum. Public-source retrieval uses the existing server tools; it is distinct from analysis execution.

Ingestion → Oligo orders, or the workspace Import tab, accepts PDF/text order confirmations. Original bytes, extracted text, page anchors and candidate rows are persisted in the existing ingestion infrastructure. Review names, bases, reporter and quencher before promotion. Reopen review by job ID. Local OCR is attempted for PDFs with no extractable text, using configured `pdftoppm`/`tesseract` and page limits. Unknown modifications are flagged rather than converted into guessed bases.

The parser supports labelled name/sequence blocks and simple name/sequence tables. Layouts vary by vendor: arbitrary Thermo confirmations are not guaranteed, and a real confirmation should be checked against the source before importing. No real customer order PDF was available for this implementation's tests.

## Integration with parallel work

The chat extension is additive to `agent_intent`; retain `sequence_action` when merging the parallel protocol-edit/deck-layout work. Review `AgentOrchestrator.ts`, `submitSuggestionTool.ts`, AI result types, and chat metadata handling during that merge. It does not introduce an alternative chat dispatcher.

Sequence analysis consumes the shared immutable revision service. It does not change protocol release/signoff requirements or bypass QMS lifecycle services. Sequence snapshots are research-use records; regulated release qualification remains the QMS workflow's responsibility.

## Verification

Tests live in `server/src/sequences`. Optional real-engine tests use `CL_TEST_MAFFT`, `CL_TEST_BLASTN`, and `CL_TEST_MAKEBLASTDB`; fixtures expect MAFFT 7.526 and BLAST 2.17.0. They exercise actual subprocesses, output parsing, immutable storage and source mappings. Ordinary tests cover PCR orientation/circularity/mismatches, schema rejection, replay, source-edit isolation, review/promotion, contextual interpretation and chat proposals without writes. Existing analysis, schema, revision and knowledge tests cover integration boundaries.

Draft/compiler regression tests are in `server/src/drafts` and `app/src/sequences/nativeDraft.test.ts`. From `server/`, run `node ../node_modules/vite-node/vite-node.mjs scripts/check-sequence-drafting.mts` for the browser check; set `CL_BROWSER_URL` and, if needed, `CL_CHROMIUM_PATH`. It uses the running frontend with real compile/accept routes backed by a disposable store, fixtures only the AI response, and blocks live-lab writes. It checks projection, direct edits, AI revision context, rejection, keyboard acceptance, saved records, and both themes.

The first adapter supports `save_sequence` and `create_oligo`. Acceptance is a retryable multi-record save, not a filesystem transaction. A partial save stays incomplete and locks editing while it is retried. Policies requiring additional authority remain blocked in this adapter; editor acceptance is not a QMS signoff.

The latest prompt is retained with AI proposals, including chat-history review, and
passed to the form compiler. `config/sequence-analysis/request-fidelity.yaml` declares
a conservative literal check: one distinct, contiguous DNA/RNA string of at least
10 bases, with no requested transformation, must match the proposed bases after
case/whitespace normalization. Mismatches trigger bounded AI repair and block draft
acceptance. This is not a general natural-language or biological correctness check:
ambiguous literals, transformations, assay roles, and reference coordinates still
need review. Direct form edits supersede the original request. New oligos do not
inherit the selected sequence's lineage; explicit revisions use a grounded parent
reference. Tests include the saved FAM/QSY probe → new unmodified primer transition.
