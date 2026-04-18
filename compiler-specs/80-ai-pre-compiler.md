# 80 — AI Pre-Compiler

Status: Authoritative
Date: 2026-04-18
Depends on: 10-charter, 20-event-graph-ir, 30-context, 60-compiler

---

## 1. Purpose

The deterministic compiler (60) consumes declarative records. The world produces PDFs, prose SOPs, emails, lab-notebook photos, and biologist free-text. The AI pre-compiler bridges the two: it turns unstructured artifacts into **candidate declarative records** that humans review and the deterministic compiler then validates and promotes.

This spec names the AI pre-compiler's architectural commitments: model-agnostic backend, `extraction-draft` as the formal output, extended mention resolution, chatbox-primary ambiguity UX, compiler-native output shapes only (never freeform prose as canonical output), and human-in-the-loop gating of every write. AI is an assistant that proposes; humans and the compiler dispose.

Like 50 and 60, the AI surface is partially implemented. Preserved components are named. Genuine gaps are new design.

## 2. Non-negotiable principles

The load-bearing AI commitments the rest of this spec serves:

1. **AI proposes; humans and the compiler dispose.** Every canonical record the system writes is either authored by a human or reviewed by a human and validated by the deterministic compiler. The AI never writes a canonical record directly.
2. **Compiler-native output shapes, always.** AI output is structured (YAML fragments, `extraction-draft` records, edit intents, mention-resolution candidates). Freeform natural-language prose exists only inside chatbox turns that are *discussing* a structured artifact, never *as* the canonical artifact.
3. **Model-agnostic architecture.** The current deployment is Qwen3.5-9B local; the architecture admits Claude, OpenAI, any OpenAI-compatible endpoint, or a bench-local model as configuration. No AI-model-specific logic leaks into the compiler (60) or the record kinds (20/30/40/50).
4. **Fail loud, not silently.** An extraction that cannot resolve a mention, produce valid YAML, or meet confidence thresholds does not silently fall back — it produces explicit `ambiguity_spans[]` and a `status: pending_review` draft.
5. **Confidence is a spectrum, not a gate.** High-confidence candidates still enter as drafts for review; low-confidence candidates still appear, tagged. The system does not discard AI output below a threshold; it ranks and surfaces.
6. **Git is where AI output becomes real.** The transition from "AI candidate" to "system truth" is a commit authored by a human through the promotion path (§7).

None of these are softenable per deployment. Every choice in this spec follows from them.

## 3. The `extraction-draft` record kind

Authoritative schema: `schema/workflow/extraction-draft.schema.yaml`. Already introduced by 00 §4.4 and partially implemented; this spec names its semantic role.

### 3.1 Shape (authoritative)

Summarized — full schema in `extraction-draft.schema.yaml`:

```
XDR-<id>
  kind: extraction-draft
  source_artifact:
    kind: file | publication | freetext
    id: <doc-ref>
    locator?: <page, section, line-range, etc.>
  candidates: [
    {
      target_kind: <canonical record kind>   # e.g., protocol, material-spec, event
      draft: <YAML body of the candidate record>
      confidence: <0..1>
      ambiguity_spans?: [ { path: "<json-path>", reason: "..." } ]
    }, ...
  ]
  status: pending_review | partially_promoted | rejected | promoted
  notes?: <string>
```

### 3.2 The shape is load-bearing

- **`source_artifact`** locks provenance. Every candidate traces back to a specific chunk of a specific document.
- **`candidates[]`** is plural. One extraction run typically proposes multiple records (a protocol + the material-specs it references + the equipment roles it assumes).
- **`target_kind`** per candidate declares the canonical kind the candidate aspires to become. The promotion step (§7) routes by this field.
- **`draft`** holds the candidate body (JSON / YAML). See §3.3 for the two-layer validation contract that governs it.
- **`confidence`** is a surfacing signal, not a gate. See §2.5.
- **`ambiguity_spans`** points JSON-path at specific sub-fields the extractor could not resolve; each span carries a `reason` the UI surfaces to the reviewer.
- **`status`** drives the workflow: `pending_review` → reviewer accepts some candidates (`partially_promoted`) or all (`promoted`) or none (`rejected`).

### 3.3 Two-layer validation contract

Candidates are validated at two distinct moments, to two different standards. Both standards are required — neither alone is sufficient.

**Layer 1 — lenient structural validation at extraction time (required for persistence).**

Before an `extraction-draft` record is persisted, every candidate body must satisfy:

- Well-formed JSON / YAML (parseable, no structural corruption).
- `target_kind` is a known canonical record kind in the registry (unknown kinds → draft is rejected, not persisted).
- Every JSON-path in `ambiguity_spans[].path` resolves to a real location within `draft` (no dangling span pointers).
- No field in `draft` references a `kind:` that is reserved for compiler-internal use.

This is deliberately narrow: it does **not** check the body against the target kind's JSON Schema. A candidate can have the wrong field names, missing required fields, or unit mismatches and still pass layer 1 — those are mentioned on the draft as pre-surfaced `ambiguity_spans[]` for the reviewer, not as extraction-time errors.

Layer 1 is what "Candidate schema validation (lenient — ambiguity_spans on failure)" in §4 refers to. The name is structural, not schema-validating.

**Layer 2 — authoritative schema validation at promotion time (required for canonical emission).**

When the reviewer promotes a candidate through `promotion-compile` (60 §5.4 extraction-promotion branch), the deterministic compiler runs full schema + lint validation against the target kind. A candidate that fails layer 2 cannot become canonical. The reviewer either edits the candidate in-place to fix it and re-promotes, or leaves it as a rejected candidate in the draft.

### 3.4 Extraction is not promotion

An extraction-draft is never authoritative on its own. It is a *candidate envelope*. Candidates become canonical records only when the promotion-compile entrypoint (60 §5.4) runs the extraction-promotion branch — layer-2 schema validation against the target kind — and emits canonical `MSP-*`, `PRT-*`, `MI-*`, etc. records alongside an `extraction-promotion` audit record (§7).

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Source artifact                                                     │
│  file (PDF, docx, txt)  /  publication (DOI)  /  freetext          │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Ingestion preprocessing  (server/src/ingestion/)                    │
│  PDF → text+layout; HTML → structured; file blob storage            │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Extractor adapter  (configurable backend)                           │
│  Qwen3.5-9B local  |  Claude  |  OpenAI  |  any compatible          │
│  Input: preprocessed source  |  Output: candidate records           │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Mention resolution                                                  │
│  materials (ChEBI)  equipment  labware  protocols  claims  contexts │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Candidate structural validation (layer 1; §3.3)                     │
│   well-formed YAML · known target_kind · spans resolve in draft     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ extraction-draft record  →  human review  →  promotion-compile      │
└─────────────────────────────────────────────────────────────────────┘
```

Every box above a dashed line is the AI pre-compiler; everything below passes through the deterministic compiler (60). The dashed line is the trust boundary.

## 5. Extractor adapter: model-agnostic backend

### 5.1 Contract

The extractor is invoked through an adapter interface:

```
ExtractorAdapter {
  id: string;
  extract(input: ExtractorInput, config: ExtractorConfig):
    Promise<{ candidates: ExtractionCandidate[]; ambiguity_spans: AmbiguitySpan[]; diagnostics: ExtractorDiagnostic[] }>;
}
```

The adapter abstracts the model. It is the single seam through which the AI touches the system.

### 5.2 Configurable profile

The `ExtractorProfileConfig` (managed via the shell settings UI) declares which provider and endpoint is active:

```
extractor:
  enabled: <bool>
  provider: openai | openai-compatible
  baseUrl: <url>      # e.g., http://thunderbeast:8889/v1 for local Qwen
  apiKey: <secret>
  model: <model id>   # e.g., Qwen/Qwen3.5-9B-Instruct, claude-opus-4-7
  temperature: 0.0
  max_tokens: 2048
```

Switching between local Qwen and cloud Claude is a config change in the settings UI; no code, no rebuild. The settings surface lives at `app/src/shell/settings/ExtractorSettingsSection.tsx`.

### 5.3 Prompts are in-repo, versioned

Extraction prompts live at `server/src/extract/prompts/*.md` (or a single file grouped by target kind). They are reviewed in PR like any other code. No in-flight prompt edits from the UI in Phase 1.

### 5.4 Token budget and chunking

Long source artifacts (multi-page PDFs) are chunked by the ingestion preprocessor before extraction. Chunks are extracted independently; candidates are merged by the extractor adapter using provenance (source_artifact.locator) as the join key. No summarization: chunks go to the model verbatim, with surrounding context windows as prompt-level grounding.

### 5.5 Determinism

The adapter runs with `temperature: 0.0` by default. Model outputs are not *byte-deterministic* the way the deterministic compiler is, but they are *reproducible in practice*: the same source, same model, same prompt version produces substantially the same draft. Where two extraction runs differ, the deterministic compiler still judges both drafts by the same schemas and rules — so the system-level correctness is not a function of AI determinism.

### 5.6 Relationship to existing services

- **`server/src/ai/AgentOrchestrator.ts`** — existing runtime for AI-assisted work (conversational planning, existing extractor invocations). Preserved; the extractor adapter may call into orchestrator infrastructure for prompt assembly and token accounting.
- **`server/src/ai/InferenceClient.ts`** — existing OpenAI-compatible HTTP client. Preserved as the transport under the extractor adapter.
- **`server/src/protocol/ProtocolExtractionService.ts`** — existing service that extracts protocol structure from vendor docs. In Phase 1, this service's output is wrapped into the `extraction-draft` shape rather than written directly to canonical `protocol` records.
- **`server/src/ingestion/`** — existing preprocessing, file-blob storage, and pipeline machinery. Preserved.
- **`server/src/mcp/tools/aiPlanningTools.ts`** — existing AI-proposed planning (run-plan ranking, etc.). Preserved; quality ranking remains advisory per 50 §7.4.

## 6. Mention resolution

Mentions in unstructured text ("DCFDA," "HepG2," "the Eppendorf," "the big fuge," "spin at 15 kg") resolve to canonical records. Resolution is a distinct pipeline stage after initial candidate extraction.

### 6.1 Mention kinds (Phase 1)

Extended beyond the existing materials/equipment/people focus to cover the full compiler vocabulary:

| Mention kind | Resolution target | Existing infrastructure |
|---|---|---|
| material (compound / formulation / product / instance) | `material-spec` / `material-instance` / `aliquot` | ChEBI-backed three-source search (local / ontology / vendor); `specifications/material-identity-and-resolution.md` |
| equipment | `equipment` record | Local catalog |
| labware | `labware-definition` / `labware-instance` | Local catalog |
| protocols | `protocol` / `local-protocol` | Local catalog |
| claims | `claim` record | Local catalog + ontology predicates |
| contexts | `context` / `context-snapshot` | Local catalog |
| operators / personnel | `operator` record | Local catalog |
| facilities / zones | `facility-zone` (lab-state subject) | `lab-state` records (50 §10) |

### 6.2 Resolver contract

```
MentionResolver {
  resolve(mention: ExtractedMention, kind: MentionKind):
    Promise<{ candidates: ResolutionCandidate[]; ambiguity: boolean }>;
}
```

A resolver returns zero or more candidates. Zero → "no match." One with high confidence → bind. More than one, or one with low confidence → emit `ambiguity_span` on the extraction-draft pointing at the mention's JSON-path in the candidate draft.

### 6.3 Three-source search (materials)

For materials specifically, the existing three-source search is preserved:

1. **Local** — the repo's `records/material-spec/` and `records/material-instance/` records.
2. **Ontology** — ChEBI-backed canonical identity.
3. **Vendor** — catalog lookup (commercial identity).

The resolver prefers local matches, falls back to ontology, surfaces vendor matches as last-resort proposals. See `specifications/material-identity-and-resolution.md` (deprecated file, content preserved per 00 §3.3) for the precedence rationale.

### 6.4 Resolution never invents records

When a mention has no canonical match, the resolver does **not** create a new canonical record. It proposes a candidate (`target_kind: material-spec`, for example) inside the same extraction-draft, joined to the original mention via an ambiguity_span. The human decides whether the new canonical record should exist, and the promotion path then writes it.

## 7. Promotion: candidates → canonical

Promotion is the gated transition from extraction-draft candidate to canonical record. The entrypoint is 60 `promotion-compile`; the extraction-compile path takes its **extraction-promotion** branch (60 §5.4) — distinct from the context-promotion branch which handles computed-context selections (30 §7).

### 7.1 Why extraction-promotion is a distinct audit kind

A PDF-extracted `protocol` candidate and a context-selected `aliquot` are not the same workflow even though both end in a canonical record:

| | Context promotion (30 §7) | Extraction promotion (this spec) |
|---|---|---|
| Input source | A computed context selection | A candidate inside an `extraction-draft` |
| Source hash locks | Canonicalized context body | Canonicalized candidate `draft` body |
| Source artifact ref | — (a context is not a document) | `source_artifact` ref back to the PDF/publication/freetext |
| Pre-emission checks | Homogeneity / single-subject / completeness on the source context | Layer-2 schema + lint validation on the candidate (§3.3) |
| Audit record kind | `context-promotion` | `extraction-promotion` |

The two branches share: the `promotion-compile` entrypoint, the output projector, the canonical record emission, and the hash-and-lock step. Everything else is branch-specific.

### 7.2 The `extraction-promotion` record

Authoritative shape (summarized — full schema in `schema/workflow/extraction-promotion.schema.yaml`, new in Phase 1):

```
XPR-<id>
  kind: extraction-promotion
  source_draft_ref:      <ref to extraction-draft XDR-*>
  candidate_path:        <JSON-path into XDR.candidates[]>
  source_artifact_ref:   <ref copied from XDR.source_artifact>
  source_content_hash:   <SHA-256 over canonicalized candidate draft body>
  output_kind:           <target canonical kind>
  output_ref:            <ref to the emitted canonical record>
  promoted_by:           <operator-ref>
  promoted_at:           <iso-datetime>
  version: 1
  status: active | retracted
```

The record is append-only. Correcting a bad extraction is a new canonical record (superseding the prior via the normal supersedes edge) plus a new `extraction-promotion` pointing at it.

### 7.3 Steps

1. Reviewer opens an extraction-draft in the UI.
2. Per candidate, reviewer either: accepts (→ promote), edits then accepts (→ modify-and-promote), resolves an ambiguity_span by picking a mention resolution, or rejects.
3. Accepted/modified candidates flow through `promotion-compile` (extraction-promotion branch) — the deterministic compiler runs layer-2 schema validation against the target kind (§3.3), runs all relevant lint rules, and emits the canonical record.
4. The extraction-draft's `status` transitions: `pending_review` → `partially_promoted` (some accepted) → `promoted` (all accepted) or `rejected`.
5. An `extraction-promotion` record is emitted for each promoted candidate, locking the source content hash over the candidate's draft body and carrying the source_artifact_ref.

### 7.4 Promotion is never automatic

Even `confidence: 1.0` candidates require human click-through. The compiler refuses to auto-promote. This is the human-in-the-loop contract.

### 7.5 Partial promotion

A single extraction-draft commonly yields a mix of accept, modify, and reject. `partially_promoted` status and per-candidate review marks carry this state.

### 7.6 Promotion reversibility

Promoted canonical records are append-only. A later correction is a new version with `supersedes` (the same retraction mechanism as 40 §7, 50 §5, 70 §6). There is no "unpromote" operation; there is only "supersede with correction" on the canonical side. The old `extraction-promotion` remains; a new one is emitted for the corrected canonical.

## 8. Ambiguity resolution UX

The primary mode is chatbox; clickable quick-fixes are the fallback for simple cases. This follows 50 §12 and 10 §2.5.

### 8.1 Chatbox: open-ended, biology-judgment-bearing

Chatbox dialogue is the primary UX for:

- Which of three plausible material matches is the one the SOP meant?
- Is this step actually a wash or a replenish?
- Does "spin at 5k" mean 5,000 rpm or 5,000 × g, and on which rotor?
- Does "expected cell count" mean cells/mL or total cells on the plate?

The biologist converses with the AI. Each turn refines the draft. A turn may present the biologist with specific clickable candidates (quick-fix inside chat) or ask for a free-text clarification. The conversation ends when the biologist accepts the structure — at which point the chatbox commits the relevant `extraction-draft` candidate update.

### 8.2 Quick-fix: enumerable single-select

For cases with a small, concrete candidate list (two materials, three equipment instances), the UI surfaces a click-select without opening a chat:

- "This draft references a SpectraMax. We have three: SpectraMax-7, SpectraMax-M5, SpectraMax-Paradigm. Pick one."
- "This step's duration is written '30min'. Interpret as 30 minutes? [yes/no]"

Quick-fixes are resolved in one click and written back to the `ambiguity_spans[]` / candidate draft.

### 8.3 Both UX modes write the same data shape

Whether the reviewer resolved via chat or quick-fix, the committed result is the same `extraction-draft` diff: an ambiguity_span removed, a draft field filled, confidence bumped. The promotion path does not care which path resolved the ambiguity.

### 8.4 Chatbox is a UX carrier, not a compiler entrypoint

The chatbox does not compile anything. It edits an `extraction-draft` via structured turn outputs. The compiler runs when the reviewer promotes.

## 9. What the AI does *not* do

A deliberate list, because the boundaries are load-bearing:

- **Does not write canonical records.** Always through `extraction-draft` → promotion.
- **Does not invent event graphs without a source.** Every candidate event traces to a `source_artifact`.
- **Does not decide ambiguity.** Low-confidence or multi-candidate resolutions become `ambiguity_spans[]`, not silent picks.
- **Does not edit committed records.** Corrections land as superseding records through the normal authoring path.
- **Does not run derivation models.** Derivation is deterministic (70). The AI may *propose* a new `derivation-model` as a candidate; the model only runs after a human promotes it.
- **Does not modify policy profiles.** Policy is authored and reviewed humans-only.
- **Does not bypass the compiler.** Every AI-proposed record that becomes real passes through 60 `promotion-compile`.
- **Does not act on its own findings across sessions.** No agentic "please take the next 10 steps autonomously" loop in Phase 1. Each extraction is a discrete, reviewable unit.

## 10. The ROS workflow through the AI pre-compiler

The canonical ROS positive-control workflow begins with AI extraction:

1. **Source artifact** — `DOC-thermo-dcfda-kit` (the Thermo DCFDA kit PDF). The ingestion pipeline preprocesses it into text + layout.
2. **Extractor adapter** (current: local Qwen3.5) runs with the protocol-extraction prompt, producing candidates:
   - `target_kind: protocol` → candidate `PRT-ros-positive-control-cccp-v1` with ordered steps (create → seed → incubate → add-inhibitor → add-vehicle → incubate → add-dye → incubate → read).
   - `target_kind: material-spec` → candidates for DCFDA, CCCP, DMSO, cell line reference — each with citations back to the PDF's locator.
   - `target_kind: claim` → candidates for predicates like `DCFDA (mention) is_substrate_of esterases (mention)` with literature citations.
3. **Mention resolution** — `HepG2` resolves to existing `MSP-hepg2-v1`; `DCFDA` resolves to ChEBI:41890 (ontology) with a local vendor candidate `MSP-DCFDA-ThermoA123` high-confidence; `CCCP` resolves ambiguously to two similar vendor catalog entries → `ambiguity_span`.
4. **Extraction-draft** `XDR-thermo-dcfda-v1` lands in `status: pending_review` with 7 candidates and 2 ambiguity_spans.
5. **Human review** — biologist opens the draft, resolves the CCCP ambiguity via chatbox ("it's the Sigma C2759 one"), quick-fix-accepts all other candidates.
6. **Promotion-compile (extraction-promotion branch)** — each candidate runs through 60 `promotion-compile` §5.4. Layer-2 schema + lint validation pass. Canonical records emitted: `PRT-ros-positive-control-cccp-v1`, `MSP-DCFDA-ThermoA123`, `MSP-CCCP-Sigma-C2759`, etc., each with a parallel `extraction-promotion` record (XPR-*) locking the candidate draft hash and carrying the source_artifact_ref back to `DOC-thermo-dcfda-kit`.
7. **Downstream compilation** — the biologist then authors `LPR-ros-hepg2-spectramax-v1` (local-protocol, 50 §5) referencing these promoted records. The remaining ROS workflow (planned-run, execution) proceeds per 50 §13.

Every principle in §2 is exercised: AI proposed, human reviewed, compiler validated, Git committed.

## 11. Phase 1 scope and deltas

### 11.1 Existing and preserved

1. **`extraction-draft` schema / lint / ui** in `schema/workflow/` — existing, authoritative.
2. **Ingestion machinery** (`server/src/ingestion/`) — preserved.
3. **`ProtocolExtractionService`**, **`ProtocolImportService`** in `server/src/protocol/` — preserved; outputs wrapped into `extraction-draft`.
4. **`AgentOrchestrator`**, **`InferenceClient`** in `server/src/ai/` — preserved as adapter infrastructure.
5. **Three-source material search** — preserved per 00 §3.3.

### 11.2 New in Phase 1

1. **`schema/workflow/extraction-promotion.{schema,lint,ui}.yaml`** — new record kind (§7.2) for the AI-candidate → canonical audit trail, distinct from `context-promotion`.
2. **`server/src/extract/ExtractorAdapter.ts`** — model-agnostic adapter interface + registry.
3. **`server/src/extract/ExtractorProfileConfig.ts`** (or equivalent) — config schema for provider/baseUrl/apiKey/model.
4. **`app/src/shell/settings/ExtractorSettingsSection.tsx`** — UI for editing the extractor config.
5. **`server/src/extract/MentionResolver.ts`** — mention-resolver contract + per-kind implementations (labware / protocols / claims / contexts / operators / facilities are new kinds extended beyond the existing material/equipment focus).
6. **`server/src/extract/ExtractionDraftBuilder.ts`** — assembles candidates + ambiguity_spans into an `extraction-draft` record, enforcing layer-1 structural validation (§3.3).
7. **`server/src/extract/CandidatePromoter.ts`** — per-candidate promotion path into `promotion-compile` extraction-promotion branch (60 §5.4); emits `extraction-promotion` audit record.
8. **Wiring of `extraction-compile` pipeline dispatcher** — the existing `extraction-compile.yaml` is dispatched via the 60 dispatcher using the adapters above.
9. **Chatbox UX shell** (Phase 1: data carrier; Phase 2: full UI) — the extraction-draft supports chatbox turns as structured edit intents.

### 11.3 Out of scope in Phase 1

- **Multi-turn agentic autonomy** — each extraction is a single discrete unit. No multi-step autonomous research loops.
- **AI-authored derivation models** — Phase 2; 70 §8 keeps authoring human-only in Phase 1.
- **AI-modified canonical records** — ever. Not a phase question; a load-bearing principle (§2).
- **Automated re-extraction on source update** — manual re-extraction only in Phase 1.
- **Fine-tuned models** — adapter is provider-agnostic; no bundled weights.
- **Confidence-threshold auto-promotion** — every candidate requires human click (§7.2).
- **Prompt editing in the UI** — prompts are in-repo / PR-reviewed.

### 11.4 Migration

No committed `extraction-draft` records depend on this spec's adapter today. The existing `ProtocolExtractionService` output that currently writes more directly will be re-routed to produce `extraction-draft` records instead, in the Phase 1 ProtocolCompiler refactor (50 §5.6) and extraction pipeline wiring.

## 12. Summary of deltas

| Action | Target | What |
|---|---|---|
| Preserve | `schema/workflow/extraction-draft.{schema,lint,ui}.yaml` | Existing shape authoritative |
| Preserve | `server/src/ingestion/` | Preprocessing + blob storage |
| Preserve | `server/src/ai/AgentOrchestrator.ts`, `InferenceClient.ts` | Runtime + transport |
| Preserve | `server/src/protocol/ProtocolExtractionService.ts` | Output reshaped into extraction-draft |
| Preserve | Three-source material search | `specifications/material-identity-and-resolution.md` content |
| Preserve | `schema/registry/compile-pipelines/extraction-compile.yaml` | Pipeline definition |
| **Add** | `schema/workflow/extraction-promotion.{schema,lint,ui}.yaml` | New audit record kind (§7.2) distinct from `context-promotion` |
| **Add** | `server/src/extract/ExtractorAdapter.ts` | Model-agnostic adapter interface + registry |
| **Add** | `server/src/extract/MentionResolver.ts` | Extended mention resolution (labware / protocols / claims / contexts / operators / facilities) |
| **Add** | `server/src/extract/ExtractionDraftBuilder.ts` | Assembles candidates + ambiguity_spans; enforces layer-1 structural validation (§3.3) |
| **Add** | `server/src/extract/CandidatePromoter.ts` | Per-candidate promotion bridge into `promotion-compile` extraction-promotion branch; emits `extraction-promotion` record |
| **Add** | `app/src/shell/settings/ExtractorSettingsSection.tsx` | Settings UI for provider / baseUrl / model / temperature |
| **Add** | `ExtractorProfileConfig` schema (config subtree `ai.extractor`) | Configurable backend |
| **Wire** | 60 pipeline dispatcher + `extraction-compile.yaml` | End-to-end extract → mention-resolve → structural-validate → draft |

New `extraction-promotion` kind, model-agnostic adapter, extended mention resolution, draft builder, promoter bridge, settings UI, extraction-pipeline wiring. Prompts + prompt storage are code-like artifacts in-repo.

---

## Appendix A. What this spec does *not* decide

- **The deterministic compiler's pipeline / entrypoint details** — 60.
- **Derivation-model engine internals** — 70.
- **The records the AI produces candidates for** — owned by 20 / 30 / 40 / 50.
- **Which specific provider / prompt is optimal for a given extraction** — operational, not architectural. Configured per deployment.
- **How to *train* a local extractor** — out of scope; Phase 1 deployment uses Qwen3.5 as-shipped.

## Appendix B. Terminology

- **Extractor / extractor adapter** — the model-agnostic interface the AI pre-compiler calls.
- **Candidate** — a single proposed record inside an extraction-draft.
- **Mention** — a textual reference in a source artifact to a canonical entity.
- **Mention resolution** — the stage that binds mentions to canonical records (or emits ambiguity_spans).
- **Ambiguity span** — a JSON-path into a candidate draft, tagged with a reason, marking a field the AI or resolver could not nail down.
- **Promotion** — the gated transition from extraction-draft candidate to canonical record via `promotion-compile`.
- **Source artifact** — the PDF / publication / freetext input an extraction reads.
- **Confidence** — a 0..1 score; a surfacing signal, not a gate.
