import type { FixItSkill } from './types.js';

export const resolutionDebug: FixItSkill = {
  name: 'resolution-debug',
  triggersWhen:
    'a noun/term is TAGGED correctly but resolves to the wrong recordId or no recordId — wrong '
    + 'labwareHint, missing material/ontology match, alias-map vs canonical-registry divergence.',
  tools: ['inspect_registry', 'resolve_term', 'probe', 'verify'],
  promptText: [
    'SKILL: resolution-debug',
    '  1. inspect_registry("<table>") — see what records EXIST. The expected id may not be there at',
    '     all (catalog-data bug, fix in registry YAML), or it exists but the matcher prefers a',
    '     different entry (matcher-logic bug, fix in lookup code).',
    '  2. resolve_term("<table>", "<hint>") — run the actual matcher for the hint. The returned',
    '     recordId(s) plus `inRegistry: false` flags name a test↔prod divergence directly.',
    '     Currently supported: labware. For other tables, use `probe` with a synthesised prompt.',
    '  3. Diagnose:',
    '       - matcher returns no match → either hint normalisation is wrong, or no record exists',
    '       - matcher returns wrong id but expected id IS in registry → matcher\'s fallback is wrong',
    '       - matcher returns id with inRegistry: false → alias map points at a stale/non-canonical id',
    '  4. If neither matcher nor catalog explains it, probe the failing prompt to confirm the',
    '     compiler emits the wrong id end-to-end, then read the resolver code.',
    '  5. After every edit: re-verify.',
  ].join('\n'),
};
