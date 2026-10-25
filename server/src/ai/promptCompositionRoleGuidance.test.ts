/**
 * MIXROLE-1 (a) guidance plane — RED-first (CLAUDE.md rule 5).
 *
 * The defect: the emission prompt that teaches composition roles
 * (server/prompts/material-system-rules.md, loaded onto every drafting-surface
 * prompt at server/src/ai/systemPrompt.ts:485 `loadPromptTemplate('prompts/
 * material-system-rules.md')` and prepended at :491) teaches
 * `role: solvent` on Trypsin-EDTA — the enzyme that detaches the cells. The
 * model copies the example: trypsin-as-solvent is a wrong fact in the ledger
 * and a base-volume read waiting to happen (formulationMath.ts:336-343 derives
 * a solvent's concentration from volume ratios).
 *
 * BRAD's ruling (decisions/MIXROLE1-role-axes-brad-ruling-20261022.md):
 * "materials have identities and properties; their roles are contextual, and
 * their purposes are experimental." NO new enum member anywhere; the honest
 * answer is the CLOSEST declared role, else `other` + the component's own name.
 *
 * This test composes the REAL drafting-surface prompt (buildSystemPrompt — the
 * path buildSurfaceAwarePrompt delegates to for 'event-editor'/'workspace.deck',
 * systemPrompt.ts:427-429) and pins, with citation:
 *   1. the fit-guidance rule is present on the role-menu bullet (guidance as
 *      DATA riding the prompt, not a TS branch);
 *   2. the instruction's own example demonstrates the ruled outcome
 *      (`role: other` on the trypsin-EDTA entry) — guidance and exemplar agree.
 *
 * RED at the dispatch tip: the guidance sentence is absent and the example
 * literally teaches `role: solvent`.
 */
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';
import type { EditorContext } from './types.js';

/** Minimal empty-deck editor context (the shape systemPrompt.workingFocus.test.ts
 *  uses): the mixture RULES block rides the prompt regardless of deck state (it is
 *  prepended verbatim at systemPrompt.ts:491). */
const EMPTY_CONTEXT = {
  labwares: [],
  eventSummary: { totalEvents: 0, recentEvents: [] },
  vocabPackId: 'default',
  availableVerbs: [],
} as unknown as EditorContext;

const prompt = buildSystemPrompt(EMPTY_CONTEXT);

describe('MIXROLE-1: composition role guidance rides the assembled drafting prompt', () => {
  it('the role-menu bullet carries the fit rule: closest declared role, else honest `other`, never a role that contradicts the biology', () => {
    // Cite: server/prompts/material-system-rules.md, the `role` menu bullet of
    // the "Mixtures: name the components, never a blob" rules block, composed
    // into the prompt at systemPrompt.ts:485/:491.
    expect(prompt, 'the role menu itself rides the prompt').toMatch(
      /`role` is one of `solute \| solvent \| buffer_component \| additive \| activity_source \| cells \| other`/,
    );
    // The ruled fit-guidance (spec §5a), tightened to fit the prompt-budget
    // ratchet (headroom 46 chars at the dispatch tip — measured by
    // promptBudget.test.ts BEFORE writing prose, bait 3): closest declared role;
    // if none fits, `other`. The exemplar below demonstrates the ruled outcome
    // (the component keeps its OWN name at role: other), so guidance and
    // example agree — which is how the model learned trypsin=solvent before.
    expect(prompt, 'fit guidance: closest declared role').toMatch(/closest declared role/i);
    expect(prompt, 'fit guidance: honest other when none fits').toMatch(
      /closest declared role; if none fits, `other`/,
    );
  });

  it('the instruction\u2019s own example demonstrates the ruled outcome: the trypsin-EDTA entry carries role: other (guidance and exemplar agree)', () => {
    // Cite: the example composition in the same rules block. At the dispatch
    // tip this line is `- { material: "Thermo trypsin-EDTA", role: solvent,
    // fraction: "50%" }` — the defect taught verbatim (orch re-verified at
    // tip 126cbfea). The ruling re-pins it to `other`.
    expect(prompt, 'the exemplar must not teach trypsin as a solvent').toContain(
      '{ material: "Thermo trypsin-EDTA", role: other, fraction: "50%" }',
    );
    expect(prompt, 'the taught solvent-on-trypsin example is the defect').not.toContain(
      '{ material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }',
    );
  });

  it('the guidance rides the drafting surface through buildSurfaceAwarePrompt too (workspace.deck delegates to buildSystemPrompt, systemPrompt.ts:427-429)', async () => {
    const { buildSurfaceAwarePrompt } = await import('./systemPrompt.js');
    const deckPrompt = buildSurfaceAwarePrompt('workspace.deck', EMPTY_CONTEXT);
    expect(deckPrompt).toContain('{ material: "Thermo trypsin-EDTA", role: other, fraction: "50%" }');
    expect(deckPrompt).toMatch(/closest declared role/i);
  });
});
