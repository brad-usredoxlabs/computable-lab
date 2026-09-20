# Plan — Lower the friction: a snappy draft path that accepts what biologists say

Date: 2026-09-20 11:32 EDT
Repo: `/mnt/vast/home/brad/git/computable-lab`
Status: PLAN (not executed). Not a kanban spec — do NOT drop this in `~/.hermes/specs/inbox/`.
Audience: an implementer with zero context for this codebase.

## Brad's rulings (2026-09-20, folded in)

- **R1 — Term confirmation lives in the REVIEW dialogue, not up front.** Accepting
  an ungrounded material is friction-free, but the *naming* is confirmed in the
  proposal dialogue ("accept / reject / clarify-then-accept"), because the failure
  to avoid is a lab with four terms for one organism: `f prausnitzii`, `FPRAUS`,
  `F praus`, `f pruas`. Nothing may silently mint a duplicate near-match.
- **R2 — The prompt budget is "the smallest amount that gets it right".** 12,000
  chars is a STARTER, not a law: reduce until the Phase 4 sentence stops producing
  one acceptable draft for the target model, then back off one step.


---

## Goal

Cut the per-draft instruction load by ~80% and remove blocking questions, so a
biologist's sentence ("add 200uL of DMEM in a checkerboard pattern across wells
A2-D8") produces one acceptable draft in seconds — without losing the one thing
that must stay rigorous: two additions of "methanol" never create two local
terms.

---

## Current context / assumptions

Measured 2026-09-20 in this repo (all figures from `.run/backend.log` and the
files named):

| thing | size | where |
|---|---|---|
| `event-graph-agent.md` | 19,554 chars | `server/prompts/event-graph-agent.md` |
| `material-system-rules.md` | 3,873 chars | `server/prompts/material-system-rules.md` |
| `SUBMIT_SUGGESTION_INSTRUCTION` | **26,358 chars** in ONE string | `server/src/ai/submitSuggestionTool.ts:46` |
| `submit_suggestion` tool schema | 17,083 chars, 37 inline descriptions | `server/src/ai/submitSuggestionTool.ts:96` |
| `agent_intent` tool schema | 1,960 chars | `server/src/ai/submitSuggestionTool.ts:416` |
| prefill per draft turn | **9,351–11,572 tokens** | log: `prefill: 9351 new + 0 cached tokens` |
| user's sentence | ~10 tokens | — |

The system message is assembled in `server/src/ai/AgentOrchestrator.ts:919-925`:
`buildSurfaceAwarePrompt(...)` + `residentContext` + `SUBMIT_SUGGESTION_INSTRUCTION`
+ `FORCED_DRAFT_TOOL_INSTRUCTION`.

After the model answers, the draft passes **13 stages** that may rewrite or
reject it (in order, `AgentOrchestrator.ts` draft branch ≈1836–2100):
`recoverInventedMaterialFields` → `enrichMaterialDomains` → empty-draft guard →
`repairMintedLabelsAgainstUserWords` → `expandEventWells` → `enrichAddMaterialRefs`
→ `normalizeDraftMaterialRefs` → `bindMaterialAnswersToEvents` →
`forceMaterialClarifications` → `filterForbiddenAmountQuestions` →
`followUpForLayer` → `detectClarificationLoop` → `runChatbotCompile`.

Assumptions this plan makes (verify before starting; if one is false, stop and
adjust — do not invent):

1. `Term.aliases` exists in `schema/core/term.schema.yaml:48` and **no code in
   `server/src` reads or writes it** (verified: grep for `aliases` hits only
   unrelated registries).
2. There is **no well-pattern primitive** anywhere (verified: no
   `checkerboard` / `well_pattern` / `every_other` in `schema/**` or `server/src`).
3. Materials are a provenance hierarchy and must stay one (repo rule 8).
4. `ai.inference.maxTokens` is 65536 for every profile and the agent path reads
   it (`resolveAgentMaxTokens`); without it the model is cut off mid-thought.
5. The material type table is data: `schema/lab/material-profile.registry.yaml`,
   read via `MaterialProfileRegistry` (`server/src/materials/`).

---

## Architecture / proposed approach

Keep the *prompt* thin and put enforcement where it can be timely: a ~3 KB core
prompt plus a machine-readable rule catalogue that is quoted back **only when a
rule is broken** (just-in-time teaching instead of pre-emptive prose). Accept
what the biologist said — an ungrounded material becomes a *proposed local term*
immediately (never a blocking card) and is reconciled against existing terms by
alias afterwards, so names converge without upfront ontology rigour. Give the
draft language the primitives biologists actually speak (well patterns, doses in
their own units) so the model composes rather than enumerates.

---

## Phase 0 — Make the friction measurable (do this first; nothing else is verifiable without it)

### Task 0.1 — A size guard for the draft system message
**Files:** new `server/src/ai/promptBudget.test.ts`
**Steps (TDD):**
1. Write the test:

```ts
import { describe, expect, it } from 'vitest';
import { SUBMIT_SUGGESTION_INSTRUCTION, SUBMIT_SUGGESTION_TOOL_DEF } from './submitSuggestionTool.js';
import { loadPromptTemplate } from './systemPrompt.js';

// R2: "the smallest amount that gets it right" — 12,000 is a STARTER.
// Method for finding the real number: lower it in 2,000-char steps while the
// Phase 4 sentence still yields one acceptable draft for the target model; when
// it stops, back off one step and set that as the budget.
const CORE_BUDGET_CHARS = 12_000;

describe('the draft prompt stays small enough for a small model', () => {
  it('core instruction + tool schema fit the budget', () => {
    const agentTemplate = loadPromptTemplate('prompts/event-graph-agent.md');
    const rules = loadPromptTemplate('prompts/material-system-rules.md');
    const total = agentTemplate.length + rules.length
      + SUBMIT_SUGGESTION_INSTRUCTION.length
      + JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF).length;
    // eslint-disable-next-line no-console
    console.log(`draft prompt budget: ${total} chars`);
    expect(total).toBeLessThan(CORE_BUDGET_CHARS);
  });
});
```
2. Run it — **expect FAIL** and read the printed number:
   `cd server && npx vitest run src/ai/promptBudget.test.ts`
   Expected: `draft prompt budget: ~67,000 chars` and a failing assertion.
3. Leave it failing. It is the acceptance gate for Phase 1.
4. Commit: `git add server/src/ai/promptBudget.test.ts && git commit -m "test(ai): a budget for the draft prompt (currently ~4x over)"`

*(If `loadPromptTemplate` is not exported from `systemPrompt.ts`, export it —
it already exists privately at `systemPrompt.ts:454`.)*

---

## Phase 1 — Cut the instruction load (biggest lever)

### Task 1.1 — Split the 26 KB instruction into a core + a rule catalogue (data)
**Files:** `server/src/ai/submitSuggestionTool.ts`, new `server/prompts/rules/*.md`, new `server/src/ai/ruleCatalogue.ts`
**Approach:** keep only the *decisions* in `SUBMIT_SUGGESTION_INSTRUCTION`
(≤ 3 KB); move every long-tail "never do X because Y" paragraph into one markdown
file per topic, loaded by a catalogue module keyed by rule id.
**Steps:**
1. Create `server/prompts/rules/materials.md` and paste the material paragraphs
   that are currently inline (the `{mint}` rules, the CURIE rules, the ref-field
   precedence, the "materials are never a clarification you author" rule).
2. Create `server/prompts/rules/labware.md`, `.../amounts.md`, `.../sequences.md`
   the same way.
3. Write `server/src/ai/ruleCatalogue.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type RuleId = 'materials' | 'labware' | 'amounts' | 'sequences';

/** Rules live as data; code only loads and quotes them. */
export function loadRule(ruleId: RuleId, basePath = process.cwd()): string {
  return readFileSync(resolve(basePath, 'prompts', 'rules', `${ruleId}.md`), 'utf8').trim();
}

export function quoteRule(ruleId: RuleId, basePath?: string): string {
  return `\n[rule: ${ruleId}]\n${loadRule(ruleId, basePath)}\n`;
}
```
4. Reduce `SUBMIT_SUGGESTION_INSTRUCTION` to the core (verb choice, the ref-field
   table, "mint what you cannot ground", "never author a material clarification"),
   keeping it under 3,000 chars.
5. Verify: `cd server && npx vitest run src/ai/promptBudget.test.ts`
   Expected: budget number drops by ~24,000 chars; the test still fails (Phase 1.3
   closes it).
6. Commit.

### Task 1.2 — Quote a rule only when it is broken (just-in-time teaching)
**Files:** `server/src/ai/ruleCatalogue.ts`, `server/src/ai/AgentOrchestrator.ts`
**Steps (TDD):**
1. New test `server/src/ai/ruleCatalogue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { quoteRule } from './ruleCatalogue.js';

describe('rules are quoted on demand', () => {
  it('quotes exactly one rule, with its id', () => {
    const text = quoteRule('materials', process.cwd() + '/server');
    expect(text).toContain('[rule: materials]');
    expect(text.length).toBeGreaterThan(100);
  });
});
```
2. Run: `cd server && npx vitest run src/ai/ruleCatalogue.test.ts` — expect PASS
   once the file from 1.1 exists.
3. Wire it: in the unknown-draft-field diagnostic path
   (`AgentOrchestrator.ts`, where `draftArgDiagnostics(submitArgs)` is called),
   append `quoteRule('materials')` to the tool message the model receives.
4. Verify with the existing diagnostic test:
   `cd server && npx vitest run src/ai/clarificationLoop.test.ts`
   Expected: PASS (the diagnostic tests do not assert the rule text).
5. Commit.

### Task 1.3 — Close the budget
**Steps:** repeat the cuts for `event-graph-agent.md`: keep the verb list and the
JSON shapes; move the "why" paragraphs into `server/prompts/rules/*.md`.
**Verify:** `cd server && npx vitest run src/ai/promptBudget.test.ts`
Expected: `draft prompt budget: < 12000 chars` and PASS.
**Commit.**

---

## Phase 2 — Accept what the biologist says (remove blocking friction)

### Task 2.1 — An ungrounded material is accepted, never a blocking card
**Files:** `server/src/ai/forceMaterialClarifications.ts` (options + the mint branch)
**Behaviour:** a minted ref (or one named only in the note) is **kept** in the
draft and recorded as a *proposed local term*; no clarification request is
raised. The harness asks only when the material is absent entirely.
**Steps (TDD):**
1. Add to `server/src/ai/forceMaterialClarifications.test.ts`:

```ts
describe('a named-but-ungrounded material is ACCEPTED, not blocked', () => {
  it('keeps a minted material in the draft and raises no question', () => {
    const events = [{
      event_type: 'add_material',
      details: { labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'draft', id: 'mint:DMEM', label: 'DMEM' } },
    }];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, { acceptUngrounded: true });
    expect(clarificationRequests).toHaveLength(0);
    expect(kept).toHaveLength(1);
  });

  it('STILL asks when nothing names the material', () => {
    const events = [{ event_type: 'add_material', details: { labwareId: 'lw-1', wells: ['A2'] } }];
    const { clarificationRequests } = forceMaterialClarifications(events, { acceptUngrounded: true });
    expect(clarificationRequests).toHaveLength(1);
  });
});
```
2. Run — **expect FAIL** (`acceptUngrounded` is not an option yet):
   `cd server && npx vitest run src/ai/forceMaterialClarifications.test.ts`
3. Implement: add `acceptUngrounded?: boolean` to `ForceClarificationsOptions`;
   in `classifyEvent`, when `acceptUngrounded` is true and the ref carries a
   label (any layer), return `null` (trusted) unless `reason === 'no-ref'` with an
   empty label.
4. Run — **expect PASS**. Commit.
5. Wire: in `AgentOrchestrator.ts`, pass `acceptUngrounded: true` on the
   `event-editor` draft surface only (leave ingestion/protocol surfaces strict).

### Task 2.2 — A term reconciler that SUGGESTS, never silently merges
**Files:** new `server/src/materials/termReconciliation.ts`
**Why this shape (R1):** the failure to avoid is one organism under four terms —
`f prausnitzii`, `FPRAUS`, `F praus`, `f pruas`. Note that the last two differ by a
*typo* (`praus` vs `pruas`), not by formatting, so an exact normalizer cannot fold
them. Therefore: **exact or alias match links automatically; anything merely
similar is presented to the biologist as a suggestion in the review dialogue and
never auto-merged.**
**Steps (TDD):**
1. New test `server/src/materials/termReconciliation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  normalizeTermName,
  pickExistingTerm,
  suggestExistingTerms,
} from './termReconciliation.js';

const terms = [
  { id: 'TERM-ethanol-1a2b', preferredLabel: 'ethanol', aliases: ['EtOH', 'ethyl alcohol'] },
  { id: 'TERM-fpraus-9z8y', preferredLabel: 'F prausnitzii', aliases: ['FPRAUS', 'F praus'] },
];

describe('term reconciliation: link on a match, SUGGEST on a near miss', () => {
  it('normalizes spelling variants', () => {
    expect(normalizeTermName('  Ethanol ')).toBe('ethanol');
    expect(normalizeTermName('ETHYL  ALCOHOL')).toBe('ethyl alcohol');
  });

  it('links an exact label or alias match', () => {
    expect(pickExistingTerm('EtOH', terms)?.id).toBe('TERM-ethanol-1a2b');
    expect(pickExistingTerm('fpraus', terms)?.id).toBe('TERM-fpraus-9z8y');
    expect(pickExistingTerm('unobtainium', terms)).toBeNull();
  });

  it('SUGGESTS the existing term for a typo the normalizer cannot fold', () => {
    // the whole point of R1: "f pruas" is one edit away from an alias of an
    // existing term — offer it, and let the biologist decide.
    const suggestions = suggestExistingTerms('f pruas', terms);
    expect(suggestions.map((s) => s.term.id)).toContain('TERM-fpraus-9z8y');
    expect(suggestions[0]!.distance).toBeLessThanOrEqual(2);
  });

  it('suggests nothing for an unrelated name', () => {
    expect(suggestExistingTerms('DMEM', terms)).toEqual([]);
  });
});
```
2. Run — **expect FAIL** (module missing). Implement:

```ts
export interface TermLike { id: string; preferredLabel: string; aliases?: string[] }

export function normalizeTermName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Bounded Levenshtein: we only care about "one or two characters off". */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

export function pickExistingTerm(query: string, terms: readonly TermLike[]): TermLike | null {
  const wanted = normalizeTermName(query);
  for (const term of terms) {
    if (normalizeTermName(term.preferredLabel) === wanted) return term;
    if ((term.aliases ?? []).some((alias) => normalizeTermName(alias) === wanted)) return term;
  }
  return null;
}

/** Near matches for the REVIEW dialogue — never applied automatically. */
export function suggestExistingTerms(
  query: string,
  terms: readonly TermLike[],
  tolerance = 2,
): Array<{ term: TermLike; distance: number; matchedOn: string }> {
  const wanted = normalizeTermName(query);
  const out: Array<{ term: TermLike; distance: number; matchedOn: string }> = [];
  for (const term of terms) {
    const candidates = [term.preferredLabel, ...(term.aliases ?? [])];
    let best: { distance: number; matchedOn: string } | null = null;
    for (const candidate of candidates) {
      const normalized = normalizeTermName(candidate);
      if (!normalized || normalized === wanted) continue;
      const distance = editDistance(wanted, normalized, tolerance);
      if (distance <= tolerance && (best === null || distance < best.distance)) {
        best = { distance, matchedOn: candidate };
      }
    }
    if (best) out.push({ term, ...best });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
```
3. Run — **expect PASS**. Commit.
4. Do NOT wire auto-creation here. The linking decision is Task 2.3's dialogue.

### Task 2.3 — The draft's TERM MANIFEST (server, pure)
**Files:** new `server/src/ai/draftTermManifest.ts`
**Why:** the panel needs to say, per term the draft used, *what it matched* —
a local term, an ontology term, or a vendor product — and where in the draft it
appeared. Nothing computes that today: the refs are spread across five fields and
four kinds.
**Steps (TDD):**
1. New test `server/src/ai/draftTermManifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { draftTermManifest } from './draftTermManifest.js';

const draft = [
  {
    event_type: 'add_material',
    details: {
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: ['A2'],
      material_ref: { kind: 'draft', id: 'mint:F praus', label: 'F praus' },
    },
  },
  {
    event_type: 'add_material',
    details: {
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: ['B2'],
      material_spec_ref: { kind: 'record', id: 'MSP-1', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
      material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
    },
  },
];

describe('draftTermManifest — what each term matched, and where', () => {
  it('classifies a minted term as unmatched', () => {
    const manifest = draftTermManifest(draft);
    const row = manifest.find((t) => t.label === 'F praus')!;
    expect(row.source).toBe('minted');
    expect(row.id).toBe('mint:F praus');
    expect(row.eventIndex).toBe(0);
    expect(row.field).toBe('material_ref');
  });

  it('classifies a record ref, an ontology CURIE and a vendor ref', () => {
    const manifest = draftTermManifest(draft);
    expect(manifest.find((t) => t.label === '1 mM Clofibrate in DMSO')!.source).toBe('local-record');
    expect(manifest.find((t) => t.label === 'fenofibrate')!.source).toBe('ontology');
    const vendor = draftTermManifest([
      { event_type: 'add_material', details: { wells: ['A1'], vendor_product_ref: { kind: 'record', id: 'VND-9', label: 'Sigma 100% methanol', vendor: 'Sigma', catalogNumber: '322415' } } },
    ]);
    expect(vendor[0]!.source).toBe('vendor-product');
    expect(vendor[0]!.catalogNumber).toBe('322415');
  });

  it('lists each term once even when several wells use it', () => {
    const manifest = draftTermManifest([draft[0]!, { ...draft[0]!, details: { ...draft[0]!.details, wells: ['C2'] } }]);
    expect(manifest.filter((t) => t.label === 'F praus')).toHaveLength(1);
  });
});
```
2. Run — **expect FAIL**. Implement `draftTermManifest(events)` mapping each ref to
   `{ label, source, id, eventIndex, field, vendor?, catalogNumber?, aliases? }`
   where `source` is `'minted'` for `kind: 'draft'` / `mint:` ids, `'ontology'` for
   `kind: 'ontology'` or a CURIE-shaped id, `'vendor-product'` for a
   `vendor_product_ref` (or a ref carrying `vendor`), else `'local-record'`.
   Dedupe by `label|source|id`.
3. Run — **expect PASS**. Commit.
4. Expose it on the draft result (`AgentResult.termManifest`) so the client can
   render it without re-deriving anything:
   `cd server && npx vitest run src/ai/draftTermManifest.test.ts && npx tsc --noEmit`
   Expected: PASS, no type errors.

### Task 2.4 — A collapsible Term panel under the proposal (app)
**Files:** new `app/src/event-editor/right-pane/ai/TermPanel.tsx`,
`app/src/event-editor/right-pane/ai/ChangesPanel.tsx`,
`app/src/event-editor/right-pane/ai/ai.css`
**Behaviour (Brad, 2026-09-20):** under the proposal, a collapsible panel with one
row per term the draft used, showing **what it matched**, and letting the biologist
search, edit and accept — or clarify:

    ▸ Terms (3)                                        [collapse]
      F praus            unmatched · minted         [search] [edit] [accept]
        ↳ suggested: F prausnitzii (aliases: FPRAUS, F praus)   [use this term]
      1 mM Clofibrate in DMSO   local term MSP-1     [search] [edit] [accept]
      fenofibrate        ontology · CHEBI:5001       [search] [edit] [accept]
      Sigma 100% methanol   vendor · Sigma 322415    [change source] [accept]

**Steps (TDD):**
1. New test `app/src/event-editor/right-pane/ai/TermPanel.test.tsx`:
   render with the manifest from Task 2.3; assert (a) it is collapsed by default and
   the header says `Terms (3)`, (b) expanding lists three rows, (c) each row shows
   its provenance text (`local term` / `ontology` / `vendor` / `unmatched`),
   (d) clicking a row's search box fires the layer-scoped resolver (mock
   `resolveMaterial`), and (e) choosing a search hit calls
   `onConfirm({ label, existingTermId })`.
2. Run: `cd app && npx vitest run src/event-editor/right-pane/ai/TermPanel.test.tsx`
   — **expect FAIL**.
3. Implement `TermPanel` reusing what exists — do NOT build new search:
   - the search box uses the same `SlashSuggestionList` +
     `app/src/shared/taptab/slashMenu/resolvers.ts` path the pickers already use
     (layer-scoped via `materialLayer`, added 2026-09-20);
   - provenance chips come from the manifest (Task 2.3);
   - CSS: add `.term-panel` rules next to `.questions-panel` in `ai.css`
     (collapsed header + a scrolling row list — copy the section/scroll idiom
     already there, including `min-height: 0`).
4. Run — **expect PASS**. Commit.
5. Wire: `ChangesPanel` renders `<TermPanel>` between the change rows and the
   Accept/Discard actions. Add one test to `ChangesPanel.test.tsx` asserting the
   panel appears when the draft carries a manifest.
6. Verify in the browser (SOP rule 12): draft "add F praus to A2" → the panel shows
   one `unmatched · minted` row with the suggestion, and the rest of the dialogue
   still works.

### Task 2.5 — Clarify a term, redraft with it, and re-manifest
**Files:** `app/src/event-editor/right-pane/ai/TermPanel.tsx`,
`app/src/event-editor/right-pane/ai/assistStream.ts` (types only),
`server/src/ai/AgentOrchestrator.ts` (reuse the existing answers channel)
**Behaviour:** a row can be clarified instead of picked — "F praus means
F. prausnitzii, the anaerobic gut commensal" — and the **redraft is sent with the
clarified term**, so the model re-issues the draft with the better grounding rather
than the biologist hand-fixing it.
**Steps:**
1. The mechanism already exists end to end; use it rather than inventing a second:
   `AiClarificationAnswer` (`app/src/types/ai.ts:169`) → request body
   `clarificationAnswers` (`server/src/api/handlers/AIHandlers.ts:178`) →
   `appendClarificationAnswersToPrompt` + `resolvedMentionsFromAnswers`
   (`AgentOrchestrator.ts:202,226`). Add a `Clarify…` text area to the row whose
   submit button calls the existing redraft with one answer:
   `{ requestId: 'term:' + termId, label, value: <the biologist's sentence> }`.
2. Test in `TermPanel.test.tsx`: the clarify box requires text, and submitting
   calls `onClarify({ label, value })` (mock), leaving the row marked
   `clarified — redrafting`.
3. Run — **expect FAIL**, implement, **expect PASS**. Commit.
4. Server test `server/src/ai/termClarifyRedraft.test.ts`: a request carrying
   `clarificationAnswers: [{ requestId: 'term:1', label: 'F praus', value: 'means F. prausnitzii' }]`
   produces a prompt containing that sentence (assert via
   `appendClarificationAnswersToPrompt`) — i.e. the clarification rides the redraft.
5. Verify: `cd server && npx vitest run src/ai/termClarifyRedraft.test.ts`
   Expected: PASS.




---

## Phase 3 — Give the draft language the primitives biologists speak

### Task 3.1 — Well patterns (this is why "checkerboard" felt magical)
**Files:** new `server/src/ai/wellPatterns.ts`, `server/src/ai/AgentOrchestrator.ts` (next to `expandEventWells`)
**Steps (TDD):**
1. New test `server/src/ai/wellPatterns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expandWellPattern } from './wellPatterns.js';

describe('well patterns are composed, not enumerated', () => {
  it('checkerboard across A2:D8 keeps alternate wells', () => {
    const wells = expandWellPattern({ pattern: 'checkerboard', from: 'A2', to: 'D8' });
    expect(wells).toContain('A2');
    expect(wells).not.toContain('B2');   // odd/even alternation
    expect(wells).toContain('C2');
    expect(wells.length).toBe(14);       // 4 rows x 7 cols = 28 wells, half of them
  });

  it('every_other_row and a plain range', () => {
    expect(expandWellPattern({ pattern: 'every_other_row', from: 'A1', to: 'D1' })).toEqual(['A1', 'C1']);
    expect(expandWellPattern({ pattern: 'row', from: 'A1', to: 'A3' })).toEqual(['A1', 'A2', 'A3']);
  });
});
```
2. Run — **expect FAIL**. Implement `expandWellPattern` (row letters A–H, columns
   1–12; `checkerboard` = keep wells whose (rowIndex + colIndex) is even;
   `every_other_row` = every second row; `row`/`column` = plain ranges) and export
   `WELL_PATTERN_NAMES`.
3. Run — **expect PASS**. Commit.
4. Wire: in `AgentOrchestrator.ts`, treat `details.wells_pattern` (an object
   `{pattern, from, to}`) the same way `expandEventWells` treats a range string —
   expand it into literal wells before anything downstream reads `wells`.
   Add ONE line to `server/prompts/rules/..`/the core prompt: "a patterned
   addition may use `wells_pattern: {pattern: checkerboard|every_other_row|row|
   column, from: 'A2', to: 'D8'}`".
5. Add the field to the tool schema (`submitSuggestionTool.ts`, the `details`
   properties for well-targeted verbs) as `wells_pattern` with its four values.
6. Verify: `cd server && npx vitest run src/ai/wellPatterns.test.ts && npx tsc --noEmit`
   Expected: PASS, no type errors.

### Task 3.2 — Accept doses in the biologist's units
**Files:** `server/src/ai/submitSuggestionTool.ts` (`parseConcentrationValue`, `parseMaterials`)
**Steps (TDD):** add cases to the existing parse tests asserting that
`"200uL"`, `"1 mM"`, `"10000 cells"`, `"10,000 HepG2 cells"` all parse into
`{value, unit}` / `{count}` without a clarification. Run
`cd server && npx vitest run src/ai/submitSuggestionTool` — expect RED, implement,
expect GREEN, commit.

---

## Phase 4 — Prove it is snappy (the acceptance test for this plan)

### Task 4.1 — One sentence, one draft, zero questions, bounded time
**Files:** new `server/src/ai/draftFriction.test.ts`
**Steps:** write a test that drives `createAgentOrchestrator` with a **stubbed
inference client** that returns a fixed draft for the sentence "add 200uL of DMEM
in a checkerboard pattern across wells A2-D8", and asserts:
1. exactly one `events[]` entry,
2. `clarificationRequests` is empty,
3. the event's wells equal `expandWellPattern({pattern:'checkerboard', from:'A2', to:'D8'})`,
4. the material is a `draft` ref (minted), and
5. the assembled system message is under the Task 0.1 budget,
6. `result.termManifest` has exactly one row, `source: 'minted'`.

And a second acceptance case for the term panel, driven in the browser (SOP 12):

    draft  "add F praus to A2"  →  panel: Terms (1) — "F praus  unmatched · minted"
                                    ↳ suggested: F prausnitzii (aliases: FPRAUS, F praus)
    action "use this term"      →  accept → ONE term in the lab, both spellings in aliases
    action "Clarify…" instead   →  the sentence rides the redraft; the new draft's
                                    manifest shows F prausnitzii as `local-record`
Run: `cd server && npx vitest run src/ai/draftFriction.test.ts`
Expected: PASS. Commit.

Then run the whole gate:
`cd server && npx tsc --noEmit && npx vitest run src/ai src/materials`
Expected: no type errors; only the pre-existing failures from another session's
in-flight work (`AgentOrchestrator.bypass|golden|goldenWithSeeds|tubeGate`,
`ChatbotCompileDeckSlot`, `submitSuggestionTool.tubeSchema`, `chatbotCompile.e2e`,
`InferenceClient.config`) — **verify the failing set is unchanged**, do not fix
their files.

---

## Tests / validation

- Every task above follows RED → GREEN → commit, with the exact command and the
  expected output written into the task.
- Browser acceptance (repo SOP rule 12) for the two UI-visible outcomes:
  1. type "add 200uL of DMEM in a checkerboard pattern across wells A2-D8" in the
     event-editor AI panel → one draft, no questions, the Changes row names the
     wells and the material;
  2. `grep -a "clarification" .run/backend.log` shows **no** clarification request
     for that turn.
- Prompt-budget regression guard: `promptBudget.test.ts` runs in CI and fails if
  the draft prompt grows past 12,000 chars.

---

## Risks, tradeoffs, and open questions

1. **Loosening ontology rigour is the point, but it must not fork names** (R1:
   `f prausnitzii` / `FPRAUS` / `F praus` / `f pruas` must be ONE term).
   Mitigation: the reconciler (2.2) lands first, and the *decision* is made by the
   biologist in the review dialogue (2.3) — exact/alias matches link, near misses
   are only suggested, and the accepted spelling is appended to `aliases` so the
   next occurrence links automatically. Never auto-create while a suggestion
   exists: that is how a fourth spelling is born.
2. **Thin prompt, more retries?** A smaller prompt may raise malformed drafts at
   first. The JIT rule quoting (Task 1.2) plus the existing diagnostics are the
   recovery path. Watch `.run/backend.log` for `no proposal` lines; if they rise,
   widen the core (never re-inline whole rule files).
3. **Well patterns change what `wells` means.** Downstream consumers
   (`expandEventWells`, deck rendering, per-well materialization) must all see
   literal wells — expand at the boundary (Task 3.1 step 4), never store patterns.
4. **`acceptUngrounded` per surface.** It is enabled on the event-editor draft
   surface only. Ingestion and protocol surfaces keep the strict gate until their
   own review UX exists; flipping them silently would strip their verification.
5. **Answered (R1):** term confirmation is NOT a later "review terms" chore and
   never a silent mint — it is part of the proposal dialogue, alongside
   accept/reject/clarify-then-accept. Task 2.3 is that dialogue.
6. **Answered (R2):** the budget is "the smallest that gets it right"; 12,000 chars
   is the starter, and Task 0.1 now states the method for finding the real number
   (step down 2,000 at a time until the Phase 4 sentence fails, then back off).
7. **The panel must not become a second source of truth.** Every row action ends in
   a store call that goes through the SAME schema + lint path as any other record
   (repo rule 3: Ajv is the only validation authority). Editing a term's label in
   the panel is a normal record edit, not a UI-local override.
8. **Term panel vs picker duplication.** The panel deliberately reuses
   `SlashSuggestionList` + the resolvers rather than a new search UI; if a future
   task wants a different search surface, extend `resolvers.ts` (one place), never
   fork it — that is how two menus start disagreeing about what exists.
9. **Manifest freshness.** The manifest is computed server-side per draft and sent
   on the result; after a redraft it must be recomputed (Task 2.5 step 4 covers the
   redraft path). Do not cache it across turns.
10. **Still open:** whether `status: proposed` should be the default for a
   newly-confirmed term (the schema allows it) so a curation sweep can find
   unlinked terms. The plan assumes yes — it costs nothing and keeps the door open
   for the ontology linking Brad described (one local term, linked in time to
   MESH/CHEBI/a vendor catalog entry).
