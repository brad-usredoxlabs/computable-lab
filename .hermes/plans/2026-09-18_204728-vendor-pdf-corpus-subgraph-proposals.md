# Vendor PDF corpus → decision tree → subgraph event-graph proposals

Date: 2026-09-18. Owner: architect-q38. Execute as delegate_task waves (concurrency 8, disjoint file ownership per wave).

## Goal

Let the server, unattended on idle hours, pull vendor/kit protocol PDFs via Exa, extract each into a decision tree of logical questions (DNA source, labware, kit version) plus the execution-scale axis (tubes → plates+multichannel → robot), deterministically enumerate the Cartesian set of branch resolutions, draft one candidate event-graph proposal per branch (saved as reviewable records), and present each PDF's tree + proposals in the Protocol IDE so Brad can open any proposal in the event graph editor, attach a prompt, and redraft.

## Current context (verified in repo, 2026-09-18)

Key existing pieces — reuse, do not rebuild:

| Piece | Path | Role |
|---|---|---|
| Exa client | `server/src/integrations/exa.ts` | `resolveExaConfig(appConfig)` (config or `EXA_API_KEY` env), `exaSearch(config, request, fetchFn?)` — POSTs `https://api.exa.ai/search`, supports `category: 'research paper'`, `includeDomains`, `numResults`. |
| Exa MCP tools | `server/src/mcp/tools/exaTools.ts` | `web_search_exa`, `web_get_contents_exa` via `dualRegister`. |
| PDF download | `server/src/vendor-documents/pdfAcquisition.ts` | `downloadVendorPdf({url, workspaceRoot, title, ...})` → writes under `artifacts/foundry/pdfs/` + `.procurement.json` sidecar, sha256, HTML-instead-of-PDF guard. |
| PDF dedupe collector | `server/src/foundry/FoundryPdfCollector.ts` | `collectFoundryPdfs({artifactRoot, candidates, targetCount})` — skips existing files, writes `pdfs/` + `.procurement.yaml` + report. Driven by CLI `server/src/tools/protocolFoundryCollect.ts` (`npm run foundry:collect -w server`). |
| Deterministic candidate extraction | `server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts` + `VendorProtocolPdf.ts` | `extractVendorProtocolCandidateFromInput({workspaceRoot, artifactPath, documentId, vendor, persist})`. Steps carry `branches: string[]` (lettered a./b./c. conditionals) via `extractBranches` (VendorProtocolPdf.ts:510). |
| Branch-axis derivation | `server/src/ingestion/vendor-protocol/deriveBranchAxes.ts` | `deriveBranchAxes(steps) -> BranchAxisLike[]`; one axis per branchy step; predicate `{op:'equals', path:'$.branchSelection', value: slugify(branchText)}`; `slugify` exported. |
| Branch resolution | `server/src/protocol/BranchResolver.ts` | `resolveBranchAxes({branchAxes, choices}) -> {ok, activeStepIds, resolvedResourceRefs, insertedSteps} | {ok:false, gap}`. Predicate language shared with lint (`server/src/lint/PredicateEvaluator`). |
| Branch-axis data shape | `schema/core/datatypes/condition.schema.yaml` | `BranchAxis` / `BranchCondition` (`id`, `label`, `predicate`, `then_stepIds`, `else_stepIds`, `then_resourceRefs`, `insert_steps`). `protocol.schema.yaml` has `branch_axes` + `variants`. |
| Execution scale registry | `server/src/registry/ExecutionScaleProfileRegistry.ts` + `schema/registry/execution-scale-profiles/*.yaml` + `schema/workflow/execution-scale-profile.schema.yaml` | Levels: `manual_tubes`, `bench_plate_multichannel`, `robot_deck`. Platforms: `manual`, `integra_assist`, `opentrons_ot2`, `opentrons_flex`. Deck config lives in profile YAML — the compiler (`ExecutionScalePlanPass`) already reads it. |
| Event-graph drafting | `server/src/ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.ts` | `draftVendorProtocolEventGraph({workspaceRoot, candidate, compile, compileRunner, deterministicOnly, persist})` → draft artifact w/ `compilePrompt`, events, labwares. `compileRunner` is injectable `(args {prompt, candidate, deterministicOnly}) => RunChatbotCompileResult`. |
| Event-graph promotion | `server/src/ingestion/vendor-protocol/VendorProtocolEventGraphPromotionService.ts` | `promoteVendorProtocolEventGraph({...})` validates+lints against `event-graph.schema.yaml`, writes YAML to `records/event-graph/<name>` + `.promotion.json` sidecar; blockers pattern for refusals. |
| Foundry acquisition jobs | `server/src/foundry/FoundryAcquisitionJobManager.ts`, `FoundryAcquisitionRunner.ts`, `FoundryRegistryTools.ts` | Queued job records (`foundry-acquisition-job`), tool-agent runs with allowlists; API routes `/foundry/jobs*` (`server/src/api/routes.ts:758-782`) and `/protocol-ide/foundry/*` review routes (routes.ts:873-882). |
| Review UI | `app/src/protocol-ide/` (`ProtocolIdePage`, `FoundryReviewDetail.tsx`, `FoundryAcquisitionJobsPanel.tsx`, `FoundryReviewChatPane.tsx`) + deck route `/deck/:eventGraphId` (`app/src/App.tsx:172`) + `app/src/extraction/ExtractionReviewPage.tsx` | The chat/redraft loop already exists per protocol variant (`POST /protocol-ide/foundry/:protocolId/:variant/chat`, `/inner-loop`, `/promote-draft`). |
| MCP PDF tool chain | `server/src/mcp/tools/vendorPdfTools.ts`, `vendorProtocolCandidateTools.ts`, `vendorProtocolEventGraphDraftTools.ts`, `vendorProtocolEventGraphPromotionTools.ts`, registered in `mcp/tools/index.ts` | Agent-callable `vendor_pdf_download`, `vendor_protocol_extract_candidate`, draft, promote. |

The stated bug in plain terms: the step-list conversion (candidate extraction + event-graph draft) never *materializes* the if/then questions. Today branchy steps are either dropped or surfaced as a passive review gap (`ZymoNormalization.ts:446` pushes gap `zymo_branch_selection_required`). Nobody — human or machine — is forced to resolve them before drafting, and no enumeration of the possible answers exists.

## Assumptions

1. Exa key is configured (`EXA_API_KEY` env or `integrations.exa` in app config). The pipeline must fail loud (no fabricated PDFs) when missing — canon rule 7/hard boundary.
2. "Save as proposal" = an `event-graph` YAML under `records/event-graph/` (opens in the existing deck/editor) **plus** a new `subgraph-proposal` record that ties it to the PDF + the exact branch path. Review UI reads proposals, deep-links the deck.
3. Scale is modeled as a **declared decision axis** (choices = the three `ExecutionScaleLevel`s from the registry, not hardcoded). v1 stamps the proposal with `scaleLevel` + deck profile id; full deck re-materialization stays with the existing `ExecutionScalePlanPass` at compile time (the editor already has deck pickers).
4. "AI answers the questions" = enumerate ALL combinations (the set is deterministic and small for kit protocols) instead of pretending to know the user's answer. An optional AI pass may *add* questions (e.g. "what is the DNA source?") before the tree is locked; it may never silently pick a branch.
5. Scheduling is a Hermes cronjob (local to this server, idle hours). It shells out to one new deterministic npm script; the script itself contains no topic list — topics are data (`config/corpus-intake/topics.yaml`).
6. `exactOptionalPropertyTypes` is ON in server — build optional fields with conditional spreads (`...(x ? {x} : {})`), like existing services do.
7. Tests: vitest (`npm run test:run -w server -- <path>`), typecheck `npm run typecheck -w server`. Frontend: `npm run test:unit -w app`, `npm run typecheck -w app`.

## Architecture

New module `server/src/protocol-intake/` owns the unattended loop as pure-ish functions + one service:

```
topics.yaml ──► runCorpusIntake (script)
                  1. exaSearch per topic            (integrations/exa)
                  2. collectFoundryPdfs             (dedupe, sidecars)
                  3. extractVendorProtocolCandidate (steps incl. branches[])
                  4. deriveDecisionTree             (NEW: BranchAxes + source-questions + SCALE axis → protocol-decision-tree record)
                  5. enumerateChoiceBindings        (NEW: Cartesian product over axis options, capped)
                  6. per binding:
                       resolveBranchAxes            (existing BranchResolver)
                       draftVendorProtocolEventGraph(existing, compileRunner)
                       promote → records/event-graph (existing promotion service)
                       write subgraph-proposal record (NEW schema)
                  7. write intake report artifact
```

Two new record types (schema triplet where sensible): `protocol-decision-tree` (PDT-) and `subgraph-proposal` (SGP-). One new read/redraft API group under `/protocol-ide/intake`. One new UI page under `app/src/protocol-ide/`. Hermes cron calls the script.

Review invariant: a proposal is never "accepted truth"; `state: proposed` until Brad promotes/rejects through the existing foundry review actions.

---

## Wave 1 — Data shapes (server, pure, TDD)

### Task 1.1 — `protocol-decision-tree` schema

Create `schema/workflow/protocol-decision-tree.schema.yaml`:

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/workflow/protocol-decision-tree.schema.yaml"
title: "ProtocolDecisionTree"
description: >
  The complete if/then question set of one source protocol document:
  logical branch axes lifted from the document (sample source, kit version,
  labware) plus the execution-scale axis. Each axis is a question with
  machine-resolvable options; enumeration of the option product is what
  makes the subgraph set deterministic. Questions are derived from document
  evidence (provenance) — never invented.
type: object
additionalProperties: false
required: [kind, recordId, documentId, axes, scaleAxis, generatedAt]
properties:
  kind:
    const: "protocol-decision-tree"
  recordId:
    type: string
    pattern: "^PDT-[A-Za-z0-9][A-Za-z0-9_-]*$"
  documentId:
    type: string
    description: "Vendor protocol candidate source documentId (sha/stable id from candidate extraction)."
  sourcePdf:
    type: object
    additionalProperties: false
    properties:
      artifactPath: { type: string }
      sha256: { type: string }
      url: { type: string }
      title: { type: string }
      vendor: { type: string }
  axes:
    type: array
    description: "Logical question axes derived from document branches (source type, kit version, labware, ...)."
    items:
      type: object
      additionalProperties: false
      required: [axisId, question, choiceKey, conditions, origin]
      properties:
        axisId: { $ref: "./datatypes/condition.schema.yaml#/properties/axisId" }
        question:
          type: string
          minLength: 1
          description: "Reviewer-facing if/then question (e.g. 'What is the DNA source?')."
        choiceKey:
          type: string
          description: "Key in the localization choices object (e.g. 'branchSelection' or a namespaced key)."
        origin:
          type: string
          enum: [document_branch, ai_suggested]
          description: "document_branch = lifted from lettered branches in the PDF text; ai_suggested = raised by the AI question pass (still needs document evidence spans)."
        evidence:
          type: array
          items:
            type: object
            additionalProperties: false
            required: [quote]
            properties:
              quote: { type: string }
              page: { type: integer, minimum: 1 }
              stepNumber: { type: integer, minimum: 1 }
        conditions:
          type: array
          minItems: 1
          items:
            $ref: "./datatypes/condition.schema.yaml#/$defs/BranchCondition"
  scaleAxis:
    type: object
    additionalProperties: false
    required: [question, options]
    properties:
      question:
        type: string
        description: "e.g. 'At what execution scale should this protocol run?'"
      options:
        type: array
        minItems: 1
        items:
          type: object
          additionalProperties: false
          required: [level]
          properties:
            level:
              description: "ExecutionScaleLevel values (manual_tubes | bench_plate_multichannel | robot_deck)."
              type: string
              enum: [manual_tubes, bench_plate_multichannel, robot_deck]
            profileId:
              type: string
              description: "execution-scale-profile/<id> registry id carrying the deck/bench configuration."
  status:
    type: string
    enum: [proposed, reviewed, superseded]
    default: proposed
  generatedAt:
    type: string
    format: date-time
  notes:
    type: string
```

Also create `schema/workflow/protocol-decision-tree.lint.yaml` (business rules declarative, canon rule 6):

```yaml
version: 1
rules:
  - id: decision-tree-conditions-resolve
    description: "Every logical axis condition needs a predicate over its own choiceKey path."
    severity: error
    predicate:
      op: all
      predicates:
        - op: exists
          path: "$.axes"
  - id: decision-tree-scale-options-are-registry-levels
    description: "Scale options must be one of the registry ExecutionScaleLevels (schema enum already enforces; lint echoes intent)."
    severity: info
    predicate:
      op: exists
      path: "$.scaleAxis.options"
```

Check the exact lint DSL shape against an existing file (`schema/workflow/extraction-draft.lint.yaml`) before finalizing — copy its envelope if `lint-v1.schema.yaml` requires extra top-level keys. If the lint DSL can't express a rule here, keep only rules the DSL supports and drop the rest (do not invent DSL ops).

Verify:

```bash
npx ajv-cli  # NOT used — instead:
npm run test:run -w server -- SchemaRegistry   # existing registry tests must still pass (schema loads, no $ref errors)
```

### Task 1.2 — `subgraph-proposal` schema

Create `schema/workflow/subgraph-proposal.schema.yaml`:

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/workflow/subgraph-proposal.schema.yaml"
title: "SubgraphProposal"
description: >
  One deterministic branch-realization of a source protocol: the chosen
  answers to every decision-tree question (logical branches + execution
  scale), the active step set BranchResolver produced, and a pointer to the
  draft event graph proposal Brad reviews in the deck editor. Proposals are
  reviewables, never accepted knowledge.
type: object
additionalProperties: false
required: [kind, recordId, treeRef, documentId, branchPath, scaleLevel, eventGraphRef, state, generatedAt]
properties:
  kind:
    const: "subgraph-proposal"
  recordId:
    type: string
    pattern: "^SGP-[A-Za-z0-9][A-Za-z0-9_-]*$"
  treeRef:
    type: object
    additionalProperties: false
    required: [kind, id, type]
    properties:
      kind: { const: record }
      id: { type: string, pattern: "^PDT-" }
      type: { const: protocol-decision-tree }
  documentId: { type: string }
  branchPath:
    type: array
    minItems: 0
    description: "The answered question trail: axis + chosen condition per logical axis, in tree order."
    items:
      type: object
      additionalProperties: false
      required: [axisId, conditionId]
      properties:
        axisId: { type: string }
        conditionId:
          type: string
          description: "BranchCondition id chosen for this axis ('*' = axis is non-gating / always active)."
        label: { type: string }
  scaleLevel:
    type: string
    enum: [manual_tubes, bench_plate_multichannel, robot_deck]
  deckProfileRef:
    type: object
    additionalProperties: false
    properties:
      kind: { const: record }
      id: { type: string }
      type: { const: execution-scale-profile }
  choices:
    type: object
    description: "The exact localization choices object fed to BranchResolver (reproducibility)."
    additionalProperties: true
  activeStepIds:
    type: array
    items: { type: string }
  eventGraphRef:
    type: object
    additionalProperties: false
    required: [kind, id, type]
    properties:
      kind: { const: record }
      id: { type: string }
      type: { const: event-graph }
  compileStatus:
    type: string
    enum: [not_run, complete, gap, error]
  reviewPrompt:
    type: string
    description: "Brad's redraft instruction attached to this subgraph; fed back into the next draft's compile prompt."
  state:
    type: string
    enum: [proposed, needs_prompt, redrafted, accepted, rejected]
    default: proposed
  revision:
    type: integer
    minimum: 1
    default: 1
  generatedAt:
    type: string
    format: date-time
  notes:
    type: string
```

Create `schema/workflow/subgraph-proposal.ui.yaml` (list columns so the record browser shows it usefully — copy column style from `schema/workflow/extraction-draft.ui.yaml`): columns `recordId`, `documentId`, `scaleLevel`, `state`.

Verify both schemas load + validate: write `server/src/schema/DecisionTreeSchemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// Use the same registry bootstrap the existing schema tests use
// (see server/src/schema/SchemaRegistry.test.ts for the loader construction).
import { loadRegistry } from './testUtils.js'; // NOTE: mirror whatever SchemaRegistry.test.ts actually imports; verify first.

describe('decision-tree triplet schemas', () => {
  it('loads and validates a minimal protocol-decision-tree', async () => {
    const { registry, validator } = await loadRegistry();
    const doc = {
      kind: 'protocol-decision-tree',
      recordId: 'PDT-TEST-1',
      documentId: 'doc-1',
      axes: [{
        axisId: 'branch-axis-step-001',
        question: 'What is the DNA source?',
        choiceKey: 'branchSelection',
        origin: 'document_branch',
        conditions: [{
          id: 'branch-1',
          predicate: { op: 'equals', path: '$.branchSelection', value: 'bacterial-dna' },
          then_stepIds: ['step-001'],
        }],
      }],
      scaleAxis: { question: 'Scale?', options: [{ level: 'manual_tubes' }] },
      generatedAt: new Date().toISOString(),
    };
    const res = validator!.validate(doc, 'https://computable-lab.com/schema/computable-lab/workflow/protocol-decision-tree.schema.yaml');
    expect(res.errors ?? []).toEqual([]);
  });
});
```

Before writing this test, open the nearest existing schema/validator test and copy its construction idiom exactly (do not trust `loadRegistry` — it may be named differently; the real name is the one in the sibling test).

Verify: `npm run test:run -w server -- DecisionTreeSchemas` → PASS. `npm run typecheck -w server` → clean.

Commit: `git add schema/workflow/protocol-decision-tree.* schema/workflow/subgraph-proposal.* server/src/schema && git commit -m "feat(schema): protocol-decision-tree + subgraph-proposal records"`

### Task 1.3 — Decision-tree derivation (pure)

Create `server/src/protocol-intake/deriveDecisionTree.ts`. It consumes the candidate (shape: `ProtocolCandidate` from `server/src/ingestion/vendor-protocol/types.ts`; steps have `stepNumber`, `branches?: string[]`, `provenance`) and the scale registry. Read `ExecutionScaleProfileRegistry`'s public API first (`getProfiles`/`levels` naming may differ — match reality) to get available levels + profile ids.

```ts
import { deriveBranchAxes, slugify } from '../ingestion/vendor-protocol/deriveBranchAxes.js';
import type { BranchAxisLike } from '../protocol/BranchResolver.js';

export interface QuestionEvidence { quote: string; page?: number; stepNumber?: number }

export interface DecisionTreeAxis {
  axisId: string;
  question: string;
  choiceKey: string;
  origin: 'document_branch' | 'ai_suggested';
  evidence?: QuestionEvidence[];
  conditions: BranchAxisLike['conditions'];
}

export interface DecisionTreeScaleAxis {
  question: string;
  options: Array<{ level: 'manual_tubes' | 'bench_plate_multichannel' | 'robot_deck'; profileId?: string }>;
}

export interface ProtocolDecisionTree {
  kind: 'protocol-decision-tree';
  recordId: string;
  documentId: string;
  sourcePdf?: Record<string, unknown>;
  axes: DecisionTreeAxis[];
  scaleAxis: DecisionTreeScaleAxis;
  status: 'proposed';
  generatedAt: string;
  notes?: string;
}

export interface DeriveDecisionTreeInput {
  documentId: string;
  steps: Array<{ stepNumber?: number; stepId?: string; branches?: string[]; provenance?: Record<string, unknown> }>;
  scaleOptions: DecisionTreeScaleAxis['options'];   // caller passes registry levels — never hardcoded here (canon: no hardcoded domain logic)
  aiQuestions?: Array<{ question: string; choiceKey: string; conditions: DecisionTreeAxis['conditions']; evidence: QuestionEvidence[] }>;
  sourcePdf?: Record<string, unknown>;
  now?: string;
}

/** One axis per branchy step; question text lifted from the branch labels. */
export function deriveDecisionTree(input: DeriveDecisionTreeInput): ProtocolDecisionTree {
  const axes: DecisionTreeAxis[] = deriveBranchAxes(input.steps).map((axis) => ({
    axisId: axis.axisId,
    question: buildQuestion(axis),
    choiceKey: 'branchSelection',
    origin: 'document_branch' as const,
    conditions: axis.conditions ?? [],
  }));
  for (const q of input.aiQuestions ?? []) {
    if (axes.some((a) => a.choiceKey === q.choiceKey)) continue; // one question per choiceKey
    axes.push({ axisId: slugify(`axis-${q.choiceKey}`), question: q.question, choiceKey: q.choiceKey, origin: 'ai_suggested', evidence: q.evidence, conditions: q.conditions });
  }
  return {
    kind: 'protocol-decision-tree',
    recordId: `PDT-${input.documentId}`,
    documentId: input.documentId,
    ...(input.sourcePdf ? { sourcePdf: input.sourcePdf } : {}),
    axes,
    scaleAxis: { question: 'At what execution scale should this protocol run?', options: input.scaleOptions },
    status: 'proposed',
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

function buildQuestion(axis: BranchAxisLike): string {
  const labels = (axis.conditions ?? []).map((c) => c.label).filter(Boolean);
  return labels.length > 0
    ? `Which branch applies: ${labels.join(' / ')}?`
    : (axis.label ?? `Resolve branch axis ${axis.axisId}`);
}
```

Constraint the implementation MUST respect: when a document has ≥2 logical axes each driven by `$.branchSelection`, a single `branchSelection` value can't answer two axes independently. For v1 keep the derived condition keys disjoint per axis: when `deriveBranchAxes` produces multiple axes, rebind each axis's predicate path to `$.branchSelection.<axisId>` (rewrite `path` and each `value` stays the slug) and have the proposal builder emit `choices` as a nested object `{ branchSelection: { [axisId]: slug } }`. Test this explicitly.

TDD test `server/src/protocol-intake/deriveDecisionTree.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveDecisionTree } from './deriveDecisionTree.js';

const steps = [
  { stepNumber: 1, branches: ['Bacterial DNA', 'Mammalian cell culture'] },
  { stepNumber: 2 },
  { stepNumber: 3, branches: ['500 ul kit version', '100 ul kit version'] },
];

describe('deriveDecisionTree', () => {
  const tree = deriveDecisionTree({
    documentId: 'zymo-d4302',
    steps,
    scaleOptions: [{ level: 'manual_tubes' }, { level: 'bench_plate_multichannel' }, { level: 'robot_deck' }],
    now: '2026-09-18T00:00:00.000Z',
  });

  it('lifts each branchy step into a question axis', () => {
    expect(tree.axes).toHaveLength(2);
    expect(tree.axes[0].question).toContain('Bacterial DNA');
    expect(tree.axes[0].origin).toBe('document_branch');
  });

  it('disambiguates predicates across axes', () => {
    expect(JSON.stringify(tree.axes[0].conditions)).toContain('$.branchSelection.branch-axis-step-001');
    expect(JSON.stringify(tree.axes[1].conditions)).toContain('$.branchSelection.branch-axis-step-003');
  });

  it('carries the scale axis from registry-provided options only', () => {
    expect(tree.scaleAxis.options.map((o) => o.level)).toEqual(['manual_tubes', 'bench_plate_multichannel', 'robot_deck']);
  });
});
```

Verify: `npm run test:run -w server -- deriveDecisionTree` (RED first with empty file → then PASS). Commit.

### Task 1.4 — Cartesian enumeration (pure)

Create `server/src/protocol-intake/enumerateChoiceBindings.ts`:

```ts
import type { DecisionTreeAxis } from './deriveDecisionTree.js';

export interface ChoiceBinding {
  /** axisId -> chosen conditionId, in axis order. */
  branchPath: Array<{ axisId: string; conditionId: string; label?: string }>;
  /** Object fed to BranchResolver; nested branchSelection per axis. */
  choices: Record<string, unknown>;
}

export interface EnumerateResult {
  bindings: ChoiceBinding[];
  /** total product size before capping. */
  productSize: number;
  truncated: boolean;
}

/**
 * Deterministic Cartesian product over axis conditions (tree order, condition
 * order stable as authored). An axis with zero conditions contributes one
 * empty binding (nothing to answer). Caps at maxBindings to keep nightly runs
 * bounded; truncation is reported, never silent.
 */
export function enumerateChoiceBindings(axes: DecisionTreeAxis[], maxBindings: number): EnumerateResult {
  let bindings: ChoiceBinding[] = [{ branchPath: [], choices: { branchSelection: {} } }];
  for (const axis of axes) {
    const conditions = axis.conditions ?? [];
    if (conditions.length === 0) continue;
    const next: ChoiceBinding[] = [];
    for (const binding of bindings) {
      for (const cond of conditions) {
        next.push({
          branchPath: [...binding.branchPath, { axisId: axis.axisId, conditionId: cond.id, ...(cond.label ? { label: cond.label } : {}) }],
          choices: { ...binding.choices, branchSelection: { ...(binding.choices.branchSelection as object), [axis.axisId]: slugFromPredicate(cond.predicate) } },
        });
      }
    }
    bindings = next;
  }
  const productSize = bindings.length;
  const truncated = productSize > maxBindings;
  return { bindings: bindings.slice(0, maxBindings), productSize, truncated };
}

function slugFromPredicate(predicate: unknown): string {
  const p = predicate as { value?: unknown };
  return typeof p?.value === 'string' ? p.value : '*';
}
```

Test `server/src/protocol-intake/enumerateChoiceBindings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { enumerateChoiceBindings } from './enumerateChoiceBindings.js';
import { deriveDecisionTree } from './deriveDecisionTree.js';

const tree = deriveDecisionTree({
  documentId: 'd', steps: [
    { stepNumber: 1, branches: ['Bacterial DNA', 'Mammalian cell culture'] },
    { stepNumber: 3, branches: ['500 ul', '100 ul'] },
  ],
  scaleOptions: [{ level: 'manual_tubes' }],
});

describe('enumerateChoiceBindings', () => {
  it('produces the deterministic product (2x2=4)', () => {
    const r = enumerateChoiceBindings(tree.axes, 24);
    expect(r.productSize).toBe(4);
    expect(r.truncated).toBe(false);
    expect(r.bindings[0].branchPath).toEqual([
      { axisId: 'branch-axis-step-001', conditionId: 'branch-1', label: 'Bacterial DNA' },
      { axisId: 'branch-axis-step-003', conditionId: 'branch-1', label: '500 ul' },
    ]);
  });
  it('caps without lying', () => {
    const r = enumerateChoiceBindings(tree.axes, 3);
    expect(r.bindings).toHaveLength(3);
    expect(r.truncated).toBe(true);
    expect(r.productSize).toBe(4);
  });
});
```

Commit.

## Wave 2 — Pipeline service + intake script

### Task 2.1 — Intake service

Create `server/src/protocol-intake/ProtocolIntakeService.ts`. Signature (constructor takes `AppContext` like other services — see `ProtocolExtractionService`):

```ts
export interface IngestPdfResult {
  documentId: string;
  treeRecordId: string;                 // PDT-…
  proposalRecordIds: string[];          // SGP-…
  eventGraphRecordIds: string[];        // promoted draft event graphs (status: draft)
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; code: string; message: string }>;
}

class ProtocolIntakeService {
  // ingestDocument({artifactPath, vendor?, maxProposals?}): Promise<IngestPdfResult>
}
```

Flow inside `ingestDocument` (each step is a call into an existing module — this service is orchestration only, zero domain rules in TS):

1. `extractVendorProtocolCandidateFromInput({ workspaceRoot: ctx.workspaceRoot, artifactPath, vendor?, persist: true })`.
2. Scale options from the registry: `getExecutionScaleProfileRegistry()` → distinct `targetLevel`s with their profile ids (inspect `ExecutionScaleProfileRegistry.ts` public methods; add a small `levels()` helper there if none exists — that is a registry read, not hardcoded policy).
3. `deriveDecisionTree({ documentId, steps: candidate.steps, scaleOptions, sourcePdf })`.
4. Persist tree via `ctx.store` if a store path exists for workflow kinds; otherwise write YAML under `records/protocol-decision-tree/<recordId>.yaml` (mirror how `promoteVendorProtocolEventGraph` writes files; validate first with `ctx.validator.validate(tree, TREE_SCHEMA_ID)` and REFUSE on invalid — fail loud).
5. `enumerateChoiceBindings(tree.axes, maxProposals ?? 12)`.
6. For each binding × each scale option:
   - `resolveBranchAxes({ branchAxes: tree.axes, choices: binding.choices })`; on `ok:false` push diagnostic `branch_unresolved` and skip (no fabricated graphs).
   - `draftVendorProtocolEventGraph({ workspaceRoot, candidate, compile: Boolean(compileRunner), compileRunner, deterministicOnly: !compileRunner, persist: true })`, where the compile prompt is the standard one plus a rendered `## Resolved branch decisions` block (chosen labels + `scaleLevel`) and the proposal's `reviewPrompt` if redrafting. Build the extra block in a pure helper `buildDecisionBlock(tree, binding, scaleLevel)` (test it).
   - `promoteVendorProtocolEventGraph({ workspaceRoot, draft, recordId: \`EVG-${treeRecordId}-${bindingIndex}-${scaleIndex}\`, allowIncompleteCompile: true, allowEmptyEvents: true })` → record id even when compile is a gap (empty-event proposals still carry the decision path; that is the review signal).
   - Persist `subgraph-proposal` record (schema id `…/subgraph-proposal.schema.yaml`), `state: 'proposed'`, `eventGraphRef: {kind:'record', id, type:'event-graph'}`, `deckProfileRef` from the scale option, `choices`, `activeStepIds`, `compileStatus`.
   - Dedup guard: skip if a proposal with the same `(documentId, branchPath, scaleLevel)` already exists (id is deterministic: `SGP-${slug(documentId)}-b${bindingIndex}-s${scaleIndex}`).
7. Return `IngestPdfResult` + write report `artifacts/foundry/intake/<documentId>.intake.json`.

TDD (`ProtocolIntakeService.test.ts`): temp workspace fixture with one synthetic 2-axis candidate (reuse a fixture from `VendorProtocolCandidateService.test.ts` — find its fixture builder and reuse it; do not hand-write a new PDF). Inject `compileRunner` stub that returns a fixed `RunChatbotCompileResult` (copy the shape from `VendorProtocolEventGraphDraftService.test.ts`). Assert: 2 axes × 2 scale levels = proposals written; every `SGP` file validates against schema; second run dedupes (0 new proposals).

Verify: `npm run test:run -w server -- ProtocolIntakeService`. Commit.

### Task 2.2 — Intake script (Exa → download → ingest)

Create `server/src/tools/corpusIntake.ts` + npm script in `server/package.json`:

```json
"corpus:intake": "npx tsx src/tools/corpusIntake.ts"
```

Behavior (mirror `protocolFoundryCollect.ts` CLI idioms — `readArg`, usage text):

- `--topics <yaml>` (required), `--workspace-root <dir>` (default `process.env.APP_BASE_PATH ?? resolve(cwd, '../..')`), `--per-topic <n>` (default 5), `--max-proposals <n>` (default 12), `--dry-run`.
- Read `config/corpus-intake/topics.yaml`:

```yaml
# Data file: what the nightly literature/kit-protocol crawl searches for.
# Business logic is data — the script reads this and never hardcodes topics.
version: 1
search:
  category: research paper
  includeDomains: []          # optional; empty = open web
  numResults: 5
  pdfSignals:                 # contentSignals hint for preferring PDFs
    - protocol
    - buffer
topics:
  - id: adipocyte-differentiation
    query: "adipocyte differentiation assay protocol kit manufacturer manual PDF"
  - id: oxidative-stress-ros
    query: "intracellular ROS detection assay protocol kit manual PDF"
  - id: dna-purification-microbiome
    query: "microbial DNA purification kit protocol manual PDF"
```

- Per topic: `resolveExaConfig(ctx.appConfig ?? loadedAppConfig)`; if null → print `EXA_NOT_CONFIGURED` and exit 2 (never fake it). `exaSearch(config, { query, category, includeDomains, numResults, contentMode: 'text' })` → map results to `FoundryPdfCollectionCandidate` (`vendor` = result host domain, `title`, `sourceUrl` = url, `searchQuery`). Prefer results whose url ends `.pdf` or `content-type` hints pdf; otherwise pass through `collectFoundryPdfs` which validates bytes anyway.
- `collectFoundryPdfs({ artifactRoot: join(workspaceRoot, 'artifacts', 'foundry'), candidates })` — dedupe for free.
- For each `status: 'downloaded'` record: `new ProtocolIntakeService(...).ingestDocument({ artifactPath: record.pdfPath, vendor: record.vendor, maxProposals })`.
- Print a one-line-per-pdf summary + totals; exit 0 if at least one pdf ingested or all skipped-duplicate; exit 1 otherwise.

TDD `corpusIntake.test.ts`: inject `fetchImpl`/search function (structure the script as an exported `runCorpusIntake({ topicsPath, workspaceRoot, exaSearchFn, collectFn, ingestFn })` so tests stub all network/LLM edges). Assert: two topics × stubbed results → `collectFn` called with mapped candidates; missing Exa config → error message; dry-run → no `ingestFn` calls. Commit.

## Wave 3 — API + redraft loop (server)

### Task 3.1 — Read endpoints

In `server/src/api/handlers/`, create `ProtocolIntakeHandlers.ts` and wire in `server/src/api/routes.ts` (follow the `protocolIdeHandlers` wiring block, routes.ts:873-882):

```
GET  /protocol-ide/intake/trees                       → list decision trees (newest first)
GET  /protocol-ide/intake/trees/:treeId               → { tree, proposals: [...] }
POST /protocol-ide/intake/proposals/:proposalId/prompt  body { prompt } → saves reviewPrompt, state→needs_prompt, returns proposal
POST /protocol-ide/intake/proposals/:proposalId/redraft → re-runs Task 2.1 step 6 for that single binding using its reviewPrompt + existing tree; writes new event graph (recordId suffix `-r<N>`), bumps `revision`, state→redrafted
```

Implementation notes: handlers read/write the YAML record files via the same store/loader used by `ProtocolIdeHandlers` (inspect its constructor deps and mirror them — do not create a parallel file-access path). `redraft` takes the stored `choices` + tree and calls `ProtocolIntakeService.redraftProposal(proposalId)` (add method in Task 2.1's class; factor step 6 into `draftOneProposal(binding, scaleOption, reviewPrompt?)`).

TDD: `ProtocolIntakeHandlers.routes.test.ts` — copy the fastify test harness style from `ProtocolIdeHandlers.routes.test.ts`; list/get roundtrip with a fixture PDT+SGP; prompt save; redraft with stubbed compileRunner produces revision 2 + new EVG id.

Verify: `npm run test:run -w server -- ProtocolIntakeHandlers`. Commit.

### Task 3.2 — Hermes cron registration (data, no code)

Register a Hermes cronjob (this is done by the architect session via the `cronjob_manage` tool, not by code):

- schedule: `0 3 * * *` (03:00, idle window)
- command: `cd /mnt/vast/home/brad/git/computable-lab && APP_BASE_PATH=. npm run corpus:intake -w server -- --topics config/corpus-intake/topics.yaml`
- Note for the cron description: local-only output unless `deliver` targets a messaging platform; Brad checks `/protocol-ide/intake` UI instead.

Also create `config/corpus-intake/topics.yaml` (content in Task 2.2) in this task if wave 2 didn't.

## Wave 4 — Review UI (app/)

### Task 4.1 — API client methods

In `app/src/shared/api/client.ts` (existing ~2100-line client), append four methods mirroring the style of `patchStepSubgraph`: `listIntakeTrees()`, `getIntakeTree(treeId)`, `setProposalPrompt(id, prompt)`, `redraftProposal(id)` with the exact response shapes from Task 3.1. Types inline in `app/src/types/` if that's where sibling response types live (check first).

### Task 4.2 — Intake review page

Create `app/src/protocol-ide/ProtocolIdeIntakePage.tsx` + test, lazy-route in `app/src/App.tsx`:

```tsx
<Route path="/protocol-ide/intake" element={<DeferredRoute><ProtocolIdeIntakePage /></DeferredRoute>} />
<Route path="/protocol-ide/intake/:treeId" element={<DeferredRoute><ProtocolIdeIntakePage /></DeferredRoute>} />
```

Layout (matches the existing Protocol IDE three-pane feel; reuse its CSS classes where possible):

- Left: tree list (document title, vendor, axes count, proposals count, generatedAt).
- Middle: decision tree view — for each axis a card: `question`, options as chips; the chosen path highlighted per selected proposal; scale axis rendered as its own card listing the three levels with deck profile names (names come from the tree payload; no client-side hardcoding of levels).
- Right: proposals for selected tree — table rows `scaleLevel | branchPath labels | compileStatus | state`, each row with:
  - "Open in editor" → `navigate('/deck/' + eventGraphRef.id)` (route exists, App.tsx:172; verify how DeckHostPage loads a recordId vs id and pass the right one).
  - "Prompt" textarea → `setProposalPrompt` then "Redraft" → `redraftProposal` → refetch; state badge updates (`proposed → needs_prompt → redrafted`).

TDD: `ProtocolIdeIntakePage.test.tsx` — mock the api client module (copy the mocking idiom from `ProtocolIdeCandidateReviewPanel.test.tsx`): renders tree questions from fixture, chip selection highlights proposal path, redraft click calls client and shows new revision. Verify: `npm run test:run -w app -- ProtocolIdeIntakePage` (use the app's vitest invocation — check `app/package.json` scripts; `npm run test:unit -w app -- ProtocolIdeIntakePage`), `npm run typecheck -w app`.

### Task 4.3 — Link from existing surfaces

- In `app/src/extraction/ExtractionReviewPage.tsx`, when the source artifact's document has a decision tree (probe `getIntakeTree` by documentId via a new `getIntakeTreeByDocument(documentId)` client method hitting `GET /protocol-ide/intake/trees?documentId=`), add a link "View decision tree & subgraph proposals". Keep it additive; do not restructure that page.
- In `server/src/api/handlers/ProtocolIntakeHandlers.ts`, support `?documentId=` filter on the trees list endpoint (add to Task 3.1 — implement there if not done).

Commit. End-to-end manual check: start `./start-app.sh`, hit the intake route, confirm a fixture tree from `records/` renders and the deck deep-link opens.

## Wave 5 — Close the loop on the original complaint

### Task 5.1 — Question gate before drafting

In `ProtocolIntakeService.ingestDocument`, before drafting ANY proposal assert every derived axis has ≥1 condition with at least one `then_stepIds` OR is explicitly non-gating (`conditions: []` with question kept as `notes` on the tree). If a branchy document yields zero axes but produced a candidate with `branches[]` present in ≥2 steps, that's a derivation bug → diagnostic `derivation_silent_branch_drop` and refuse to draft (fail loud, replaces today's silent `zymo_branch_selection_required` review-gap-only behavior).

For Zymo specifically: add regression test `server/src/protocol-intake/ZymoDecisionTree.test.ts` reusing the existing `ZymoGoldenE2E.test.ts` fixture PDF/candidate; assert the step-1 BashingBeads branches become a real axis and the tree contains a "DNA source"-style question with at least `bacterial-dna` and `mammalian-cell-culture`-class options derived from the PDF text (assert on counts/shape, not exact vendor wording).

### Task 5.2 — Full gate

```bash
npm run typecheck -w server && npm run typecheck -w app
npm run test:run -w server
npm run test:unit -w app
```

All green. Then a live nightly rehearsal:

```bash
EXA_API_KEY=*** npm run corpus:intake -w server -- --topics config/corpus-intake/topics.yaml --per-topic 2
```

Expected: ≥1 PDF downloaded into `artifacts/foundry/pdfs/`, report artifact under `artifacts/foundry/intake/`, one PDT + N SGP records, `ls records/event-graph | grep EVG-PDT` non-empty. Open the intake page, deep-link one proposal into `/deck/...`.

## Risks, tradeoffs, open questions

1. **Per-step vs cross-step axes.** `deriveBranchAxes` documents that cross-step grouping ("if bacterial" gating steps 1,3,5 as one axis) is future work. v1 inherits per-step axes → product size grows with branchy steps. Mitigation: `maxProposals` cap + truncation diagnostic. Follow-up: an AI/grouping pass that merges per-step axes into semantic axes (would need `BranchResolver`-compatible `then_stepIds` unions).
2. **AI question pass (optional, deferred).** The `aiQuestions` input to `deriveDecisionTree` is plumbed but Wave 2 ships `undefined` for it; wiring it to the chatbot-compile client (as `compileRunner` is injected) is a follow-up. Without it, questions not written as lettered branches (kit version, DNA source when only implied) won't appear — acceptable for v1 since enumeration still covers every *document-stated* branch. Do NOT let the AI pick answers — canon: questions are data, answers come from enumeration or Brad.
3. **Deck materialization per scale level is stamped, not expanded.** Proposals carry `scaleLevel` + `deckProfileRef`; the real bench/robot deck differences materialize via the existing compile pipeline (ExecutionScalePlanPass / robot-plan) when Brad promotes and compiles. Building three fully-differentiated decks per branch at proposal time duplicates that pass — YAGNI until Brad reviews the first drafts.
4. **Vendor CDN blocks.** `downloadVendorPdf` already spoofs a browser UA; Exa may also return non-PDFs — `collectFoundryPdfs` validates bytes and reports `failed`; the loop continues.
5. **Exa cost/volume.** Nightly default is 3 topics × 5 results with byte-level dedupe; topics are data, tune without deploys. If the key is absent the job exits 2 loudly — no synthetic corpus (hard boundary).
6. **Record-store duality.** Task 2.1 writes PDT/SGP as YAML files (like the promotion service) rather than via `ctx.store` if the store can't address those kinds; verify `RecordStoreImpl.list({kind})` support during Task 2.1 and prefer `ctx.store` when it accepts workflow-domain kinds. Keep ONE write path.
7. **Open question for Brad:** should accepted proposals auto-link to the existing foundry review loop (`/protocol-ide/foundry/:protocolId/:variant/...`) as a `variant`? Wave 4 links only the deck editor; wiring acceptance → foundry variant is a 1-task follow-up once he's seen the tree UI.

## Execution notes for the orchestrator

- Wave 1 = one child (pure schemas + 2 pure modules, all new files). Wave 2 depends on Wave 1 commit; wave 3 depends on 2.1; wave 4 children (client+page vs extraction link) run after wave 3; wave 5 last.
- Parallelizable pairs with disjoint files: 4.1+4.2 (single child, same module) — keep as one child; 3.1 and 2.2 touch disjoint files and may run in the same wave once 2.1 lands.
- Verify every child with `git status` footprint + targeted vitest runs before pinning its public API into the next wave's context.
