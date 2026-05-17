# Protocol Foundry Live Pipeline Specification

Updated: 2026-05-11

## Purpose

Protocol Foundry is the breadth-first improvement loop for the computable-lab protocol compiler pipeline. It collects life-science vendor protocol PDFs, extracts protocol text and visual/source evidence, compiles that evidence into event graph proposals, asks an architect model for one narrow improvement spec per protocol/variant, lets a human review that spec with a local AI, and then sends the reviewed spec through a bounded coder/critic/retry loop.

The goal is not just to make more patches. The goal is to improve the semantics of protocol compilation while preserving the core computable-lab principle:

> Everything durable that can be data should be data.

When an issue can be solved with YAML, schema, registry records, fixtures, ontology mappings, or explicit knowledge-layer records, the system should prefer that over burying domain facts in compiler code.

## Guiding Principles

1. Preserve semantics first.
   The compiler is only useful if the generated event graph represents the real protocol correctly.

2. Keep evidence attached.
   A PDF, screenshot, extracted text span, compiler output, event graph node, architect claim, human comment, and patch spec should stay linked.

3. Data before code.
   Data/config/schema/registry changes are preferred when they can represent the behavior cleanly.

4. Use the knowledge layer.
   Review conclusions should produce context, claim, assertion, and evidence records.

5. Improve breadth-first.
   Collect one focused spec per PDF or protocol variant, run one implementation round, then repeat.

6. Keep specs patchable.
   Architect and human-reviewed specs must be narrow enough for a competent local model to patch in one session.

## System Roles

### Collector

The collector turns curated vendor document search results into durable PDF inputs.

Inputs:

- vendor
- title
- source URL or PDF URL
- search query
- provenance

Outputs:

- `artifacts/pdfs/<protocolId>.pdf`
- `artifacts/pdfs/<protocolId>.pdf.procurement.yaml`
- `artifacts/queues/pdf-collection-latest.yaml`

The collector contract supports live 50-PDF runs and fixture-backed smoke runs.

### PDF Intake

PDF intake converts collected PDFs into pre-compiler inputs.

Outputs:

- `artifacts/text/<protocolId>.txt`
- `artifacts/segments/<protocolId>.yaml`
- `artifacts/material-context/<protocolId>.yaml`
- `artifacts/queues/pdf-intake-latest.yaml`

The material context starts conservatively. It records provenance and leaves material/spec/vendor-product claims empty unless evidence justifies them.

### Pre-Compiler And Compiler

The pre-compiler/compiler pipeline converts extracted protocol text into structured compiler artifacts and event graph proposals.

Important artifacts:

- `artifacts/compiler/<protocolId>/<variant>.yaml`
- `artifacts/event-graphs/<protocolId>/<variant>.yaml`
- `artifacts/execution-scale/<protocolId>/<variant>.yaml`
- `artifacts/assumptions/<protocolId>/<variant>.yaml`

Variants currently include:

- `manual_tubes`
- `bench_plate_multichannel`
- `robot_deck`

### Browser / Event Graph Review

The browser review layer checks whether generated event graphs can be visualized and inspected in the Protocol IDE/labware-style side-by-side surface.

Outputs:

- `artifacts/browser-review/<protocolId>/<variant>/report.yaml`
- screenshots and visual review artifacts where available

### Architect

The architect reviews compiler outputs, event graphs, assumptions, browser review artifacts, and diagnostics. It produces narrow improvement recommendations.

Outputs:

- `artifacts/architect/<protocolId>/<variant>/verdict.yaml`
- `artifacts/patch-specs/<protocolId>/<variant>/*.yaml`

Architect specs must identify:

- fix class
- rationale
- owned files or data areas
- acceptance criteria
- expected artifact delta
- evidence citations
- graph anchors
- data-first disposition
- semantic layer affected

### Human And AI Review

The human opens the Foundry review inbox in the Protocol IDE. For each protocol/variant, the human and a local AI review a bounded context packet.

The context packet includes only the selected protocol/variant:

- PDF/procurement metadata
- extracted text
- segment YAML
- material context YAML
- compiler output
- event graph
- execution scale output
- browser/screenshot metadata
- architect verdict
- patch specs
- existing human-review state

The review AI uses the local endpoint configured for the Foundry review flow, currently intended to be `thunderbeast:8000`.

The human can:

- accept and refine a spec
- explain how the event graph mismaps the protocol
- reject redundant or bad specs
- reopen rejected specs
- submit a final reviewed spec to the queue

### Reviewed Spec Synthesis

When the human submits, the system writes a durable reviewed-spec bundle and live coder handoff.

Durable review bundle:

- `artifacts/ralph-queue/foundry-<protocolId>-<variant>/`

Executable Foundry queue:

- `artifacts/patch-specs/<protocolId>/<variant>/`
- `artifacts/adoption/<protocolId>/<variant>/adoption.yaml`

Queue policy:

- `ralph-queue` is the durable human/AI review and provenance bundle.
- `patch-specs` plus accepted adoption metadata is the executable queue consumed by the Foundry coder/critic runner.

Knowledge-layer records are also written:

- context
- claim
- assertion
- evidence

### Coder / Critic / Retry Runner

The reviewed-spec runner executes queued human-reviewed specs through:

1. coder patch attempt
2. critic review
3. optional critic-feedback retry
4. compiler rerun when critic passes
5. review/queue status sync

Outputs:

- `artifacts/code-patches/<protocolId>/<variant>/result.yaml`
- `artifacts/patch-critic/<protocolId>/<variant>/report.yaml`
- `artifacts/rerun/<protocolId>/<variant>/rerun.yaml`
- `artifacts/queues/reviewed-spec-run-latest.yaml`

Human-review state is updated from durable artifacts:

- `queued` remains active work
- `implemented` means patch applied, critic passed, and rerun completed
- `failed` means patch failure, critic block, or terminal rerun gap

## End-To-End Flow

1. Collect vendor PDF candidates.
2. Download/copy PDFs into `artifacts/pdfs`.
3. Write PDF procurement sidecars.
4. Run PDF intake to extract text and create segment/material-context YAML.
5. Run compiler variants.
6. Produce event graph proposals.
7. Run browser/event graph review.
8. Run architect review and write narrow specs.
9. Surface specs in the Protocol IDE Foundry inbox.
10. Human reviews one protocol/variant at a time with AI.
11. Human rejects or submits a reviewed spec.
12. Submitted spec is written to the durable review bundle and executable patch queue.
13. Reviewed-spec runner runs coder, critic, retry, and rerun.
14. Queue/review status sync updates inbox and manifests.
15. Repeat breadth-first for the next round.

## Main Commands

Run a dry 3-PDF acceptance pass:

```bash
npm run foundry:small-batch -w server -- \
  --artifact-root artifacts \
  --repo-root /home/brad/git/computable-foundry \
  --candidates path/to/candidates.yaml
```

Run one reviewed spec through the bounded coder/critic runner:

```bash
npm run foundry:reviewed-spec-run -w server -- \
  --artifact-root artifacts \
  --repo-root /home/brad/git/computable-foundry \
  --max-specs 1 \
  --max-attempts 2
```

Smoke-check reviewed-spec runner without calling coder endpoints:

```bash
npm run foundry:reviewed-spec-run -w server -- \
  --artifact-root artifacts \
  --repo-root /home/brad/git/computable-foundry \
  --dry-run
```

Start or restart the Foundry loop:

```bash
npm run foundry:loop-control -w server -- restart \
  --artifact-root artifacts \
  --repo-root /home/brad/git/computable-foundry \
  --profile full
```

Check status:

```bash
npm run foundry:ledger -w server -- status --artifact-root artifacts
```

## Live Model Layout

Current intended local model layout:

- review / architect / speedy coder: `http://thunderbeast:8000/v1`
- current verified model on port 8000: `RedHatAI/Qwen3.6-35B-A3B-NVFP4`
- loop operator: `http://thunderbeast:8888/v1`

Before a live run, verify:

```bash
curl --fail --silent --show-error http://thunderbeast:8000/v1/models
```

## Acceptance Stages

### Dry Small Batch

The dry small-batch harness must prove:

- 3 PDFs collected
- 3 protocol inputs created
- all variants compile to durable artifacts
- architect verdicts/specs are produced
- reviewable inbox items exist
- acceptance report is written

Report:

- `artifacts/queues/small-batch-acceptance-latest.yaml`

### Live Reviewed-Spec Batch

The live reviewed-spec runner must prove:

- at least one queued reviewed spec is selected
- coder produces a patch result
- critic writes a report
- retry runs when critic requests revision
- compiler rerun happens after critic pass
- review status updates to implemented or failed
- consolidated run report is inspectable

Report:

- `artifacts/queues/reviewed-spec-run-latest.yaml`

### 50-PDF Scale-Up

Scale to 50 PDFs only after:

- dry 3-PDF acceptance passes
- one live reviewed-spec run is inspected
- endpoint/model routing is verified
- queue/review status sync behaves correctly

The 50-PDF run should still be breadth-first:

- collect many PDFs
- produce one focused spec per PDF/variant
- review/reject/submit
- implement one round
- repeat

## Failure Handling

Common failure modes:

- model endpoint unavailable
- model returns empty or malformed output
- PDF extraction fails
- compiler emits no events
- event graph cannot render
- architect spec is too broad
- human rejects spec as redundant
- coder touches no meaningful files
- coder patch fails typecheck or focused tests
- critic blocks or requests revision
- rerun remains a compiler gap

Failures should become data:

- collection reports
- intake reports
- compiler diagnostics
- browser-review reports
- architect verdicts
- human-review records
- patch failure records
- critic reports
- rerun reports
- manifest/status rollups

## Remaining Launch Checklist

Before the exciting live launch:

1. Confirm `thunderbeast:8000` model and response quality.
2. Confirm at least one reviewed spec is queued.
3. Run `foundry:reviewed-spec-run --dry-run` to confirm selection/reporting.
4. Run one live reviewed-spec batch.
5. Inspect `artifacts/queues/reviewed-spec-run-latest.yaml`.
6. If the report is sane, scale toward the 50-PDF collection run.
