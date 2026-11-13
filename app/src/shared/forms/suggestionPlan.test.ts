/**
 * suggestionPlan.test.ts — L2-ONTOLOGY-ANCHOR-SOURCES-1 (unit o3uispec-fix1)
 *
 * Pin through the PUBLIC surface (buildSuggestionPlanFromFieldHint / the
 * exported extractSources): the whitelist must let 'local-obo' survive so a
 * ui.yaml field declaring sources ["ols","local-obo"] reaches RefCombobox
 * with BOTH sources (includeLocalObo, RefCombobox.tsx:90, can be true).
 */
import { describe, it, expect } from 'vitest';
import {
  buildSuggestionPlanFromFieldHint,
  extractSources,
} from './suggestionPlan';

describe('extractSources whitelist (L2-ONTOLOGY-ANCHOR-SOURCES-1 o3uispec-fix1)', () => {
  it('keeps local-obo alongside ols (ui.yaml ["ols","local-obo"] survives the plan build)', () => {
    const plan = buildSuggestionPlanFromFieldHint('ref', {
      sources: ['ols', 'local-obo'],
      valueShape: 'ontology-ref',
      ontologyBinding: 'allow-ontology',
    }, 'ontology');
    expect(plan.sources).toContain('ols');
    expect(plan.sources).toContain('local-obo');
  });

  it('still drops unknown sources (negative pin)', () => {
    const plan = buildSuggestionPlanFromFieldHint('ref', {
      sources: ['ols', 'bogus'],
    });
    expect(plan.sources).toContain('ols');
    expect(plan.sources).not.toContain('bogus');
  });

  it('default remains local-only when no sources are declared', () => {
    expect(extractSources()).toEqual(['local']);
    expect(extractSources({})).toEqual(['local']);
  });
});
