/**
 * SPINE-1 contract freeze — scientist-intent compatibility + verb inventory +
 * characterization pins of TODAY's parsing/normalization behavior.
 *
 * - 'scientist-intent-contract.compatibility' re-validates every inline fixture
 *   body from scientistIntent.test.ts against the (extended) schema with zero
 *   errors: the extension must be backward compatible.
 * - 'verb-inventory' freezes the 31-verb union as data
 *   (fixtures/verb-inventory.yaml) and drift-checks it against all four
 *   runtime-extractable TS/schema copies + the prompt string.
 * - characterization pins lock hint precedence, the serial_dilution label->*Hint
 *   quirk, first-role-wins symbolicLabels, the candidates-dropped-at-normalize
 *   boundary, and the unknown-action double-reject. These are CHARACTERIZATIONS
 *   of current behavior (SPINE-1 is characterization-first); do not "fix" them here.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createValidator, type AjvValidator } from '../../validation/AjvValidator.js';
import {
  parseScientistIntent,
  ScientistIntentValidationError,
  SCIENTIST_INTENT_SCHEMA_ID,
} from './parseScientistIntent.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import { liftScientistIntent } from './liftScientistIntent.js';
import { INTENT_ACTIONS, INTENT_COMPILE_SYSTEM_PROMPT } from './intentCompile.js';
import { defaultScientistIntentVocabulary } from './vocabulary.js';

const SCHEMA_PATH = join(process.cwd(), '..', 'schema', 'workflow', 'scientist-intent.schema.yaml');
const FIXTURE_PATH = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'fixtures', 'verb-inventory.yaml');
const TYPES_PATH = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'types.ts');

/** Inline fixture bodies copied verbatim from scientistIntent.test.ts. */
const THREE_ACTION = `
intentId: example-001
actions:
  - action: serial_dilution
    source: standards
    target: fresh_plate
    factor: 2
    points: 8
    replicates: 2
  - action: incubate
    duration: 10 min
    temperatureC: 37
  - action: read
    mode: absorbance
    wavelength: 450 nm
`;

const NINE_VERB_DOC = `
intentId: broad
actions:
  - { action: seed, source: cells }
  - { action: incubate, duration: 30 min }
  - { action: wash, source: pbs, target: plate }
  - { action: harvest, target: destination }
  - { action: spin, rpm: 300, duration: "5 min" }
  - { action: pellet, rpm: 1000 }
  - { action: freeze, temperatureC: -80 }
  - { action: serial_dilution, factor: 2, points: 4 }
  - { action: media_swap_duplicate_columns, source: media }
`;

const TOOL_CALL_PAYLOAD = {
  intentId: 'dilution-tool',
  actions: [
    { action: 'serial_dilution', source: 'standards', target: 'fresh_plate', factor: 2, points: 4, replicates: 1 },
    { action: 'incubate', duration: '10 min', temperatureC: 37 },
    { action: 'read', mode: 'absorbance', wavelength: '450 nm' },
  ],
};

const LIFT_INPUT = {
  intentId: 'ex',
  actions: [
    { action: 'aspirate', volumeUl: '550', volume: '550', ratio: 'discard all', label: 'discard' },
    { action: 'centrifuge', rpm: '4000', timeMin: '5', ratio: '>=4000 xg' },
  ],
};

function loadSchemaDocument(): Record<string, unknown> {
  return parseYaml(readFileSync(SCHEMA_PATH, 'utf-8')) as Record<string, unknown>;
}

/** Resolve a local $ref (e.g. '#/$defs/actionVerb') against the schema document. */
function resolveLocalRef(doc: Record<string, unknown>, node: unknown): Record<string, unknown> {
  const rec = node as Record<string, unknown>;
  if (typeof rec.$ref === 'string' && rec.$ref.startsWith('#/$defs/')) {
    const defName = rec.$ref.slice('#/$defs/'.length);
    const defs = doc.$defs as Record<string, unknown> | undefined;
    if (defs && defs[defName]) return defs[defName] as Record<string, unknown>;
  }
  return rec;
}

function actionEnumFromSchema(doc: Record<string, unknown>): string[] {
  const actions = doc.properties as Record<string, unknown>;
  const items = (actions.actions as Record<string, unknown>).items as Record<string, unknown>;
  const props = items.properties as Record<string, unknown>;
  const actionNode = resolveLocalRef(doc, props.action);
  return actionNode.enum as string[];
}

describe('scientist-intent-contract.compatibility', () => {
  let validator: AjvValidator;

  beforeEach(() => {
    // Fresh-validator harness (ProtocolProseFieldsSchema.test.ts pattern):
    // negative/edge assertions must NOT ride parseScientistIntent's module
    // singleton (bait §8.2). The compatibility test ALSO runs the real
    // parseScientistIntent below — that is production's cached-singleton path.
    validator = createValidator({ strict: false });
    validator.addSchema(loadSchemaDocument(), SCIENTIST_INTENT_SCHEMA_ID);
  });

  it('re-validates every inline fixture body from scientistIntent.test.ts with zero errors', () => {
    const bodies = [THREE_ACTION, NINE_VERB_DOC];
    for (const yamlText of bodies) {
      const parsed = parseYaml(yamlText);
      const result = validator.validate(parsed, SCIENTIST_INTENT_SCHEMA_ID);
      expect(result.errors ?? []).toEqual([]);
      expect(result.valid).toBe(true);
    }
    // Lift outputs and tool-call payloads validate as objects too.
    const lifted = liftScientistIntent(LIFT_INPUT);
    const liftResult = validator.validate(lifted, SCIENTIST_INTENT_SCHEMA_ID);
    expect(liftResult.errors ?? []).toEqual([]);
    const toolResult = validator.validate(TOOL_CALL_PAYLOAD, SCIENTIST_INTENT_SCHEMA_ID);
    expect(toolResult.errors ?? []).toEqual([]);
  });

  it('the real parseScientistIntent (production singleton) still accepts every YAML fixture unchanged', () => {
    const doc1 = parseScientistIntent(THREE_ACTION);
    expect(doc1.actions).toHaveLength(3);
    expect(doc1.actions[0]?.action).toBe('serial_dilution');
    const doc2 = parseScientistIntent(NINE_VERB_DOC);
    expect(doc2.actions).toHaveLength(9);
  });
});

describe('verb-inventory', () => {
  const fixtureVerbs = (parseYaml(readFileSync(FIXTURE_PATH, 'utf-8')) as { verbs: string[] }).verbs;

  const unionSrc = readFileSync(TYPES_PATH, 'utf-8');
  const unionMatch = unionSrc.match(/export type ScientistIntentActionKind =\s*([\s\S]*?);\n/);
  const unionVerbs = unionMatch ? [...unionMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];

  // SPINE-2 fix1 (orchestrator-adjudicated pin edit): copy C (the parse-side
  // verb-set literal, now deleted from parseScientistIntent.ts) is replaced in
  // this leg by the SHIPPED VOCABULARY itself, read through the vocabulary
  // loader API (order-preserving verbs()).
  const vocabularyVerbs = [...defaultScientistIntentVocabulary().verbs()];

  const schemaDoc = loadSchemaDocument();
  const schemaEnum = actionEnumFromSchema(schemaDoc);

  it('fixture == types.ts union == schema enum == shipped vocabulary == INTENT_ACTIONS, length 32, declaration order', () => {
    // Set equality AND declaration-order equality (bait §8.7: sorted-alphabetical
    // would silently pass a set test yet lose the migration-baseline order).
    expect(fixtureVerbs).toHaveLength(32);
    expect(unionVerbs).toHaveLength(32);
    expect(vocabularyVerbs).toHaveLength(32);
    expect(schemaEnum).toHaveLength(32);
    expect([...INTENT_ACTIONS]).toHaveLength(32);

    expect(fixtureVerbs).toEqual(unionVerbs);
    expect(vocabularyVerbs).toEqual(unionVerbs);
    expect(schemaEnum).toEqual(unionVerbs);
    expect([...INTENT_ACTIONS]).toEqual(unionVerbs);

    // Set identity as an explicit second assertion so a reviewer sees the diff
    // trip on divergence in EITHER direction (add or remove), not just length.
    expect(new Set(fixtureVerbs)).toEqual(new Set(unionVerbs));
    expect(new Set(vocabularyVerbs)).toEqual(new Set(unionVerbs));
    expect(new Set(schemaEnum)).toEqual(new Set(unionVerbs));
    expect(new Set([...INTENT_ACTIONS])).toEqual(new Set(unionVerbs));
  });

  it('the prompt verb block contains every verb (fifth copy; SPINE-2 deletes it as authority)', () => {
    for (const verb of fixtureVerbs) {
      expect(INTENT_COMPILE_SYSTEM_PROMPT).toContain(verb);
    }
  });
});

describe('expected-domain slots (declaration only, Q2 ruling: three fixed tags)', () => {
  it('accepts expectedSourceDomain/expectedTargetDomain/expectedLabwareDomain as free-text tags and parse preserves them', () => {
    const doc = parseScientistIntent(`
intentId: domain-1
actions:
  - action: transfer
    source: cells
    target: plate
    labware: tiprack
    expectedSourceDomain: cell_suspension
    expectedTargetDomain: microplate
    expectedLabwareDomain: pipette_tip_rack
`);
    expect(doc.actions[0]).toMatchObject({
      expectedSourceDomain: 'cell_suspension',
      expectedTargetDomain: 'microplate',
      expectedLabwareDomain: 'pipette_tip_rack',
    });
    // Declaration ONLY: normalizeScientistIntent does not consume them — the
    // candidate event is unchanged by their presence (zero behavioral diff).
    const out = normalizeScientistIntent(doc);
    expect(out.candidateEvents[0]).toMatchObject({ verb: 'transfer', source_labware: 'cells' });
    expect(out.candidateEvents[0]).not.toHaveProperty('expectedSourceDomain');
  });

  it('rejects a blank expected*Domain (minLength 1) and an unknown domain-key spelling (additionalProperties false)', () => {
    expect(() => parseScientistIntent(`
intentId: domain-bad
actions:
  - { action: transfer, source: a, target: b, expectedSourceDomain: "" }
`)).toThrow(ScientistIntentValidationError);
    // No ad-hoc per-argument domain map (Q2: a free map re-introduces the
    // policy-in-ad-hoc-keys pattern the campaign kills).
    expect(() => parseScientistIntent(`
intentId: domain-map
actions:
  - action: transfer
    source: a
    target: b
    expectedDomains: { source: cell_suspension }
`)).toThrow(ScientistIntentValidationError);
  });
});

describe('characterization: hint precedence (firstString priority)', () => {
  it('source beats a non-blank sourceHint', () => {
    const doc = parseScientistIntent(`
intentId: prec-1
actions:
  - { action: transfer, source: cells, sourceHint: flask }
`);
    expect(doc.actions[0]).toMatchObject({ source: 'cells', sourceHint: 'flask' });
    const out = normalizeScientistIntent(doc);
    expect(out.candidateEvents[0]).toMatchObject({ source_labware: 'cells' });
  });

  it('a whitespace-only source passes the schema (minLength counts chars) but is dropped by normalizeDocument, so sourceHint SURVIVES', () => {
    // Pin exactly: parseScientistIntent.normalizeDocument keeps string fields only
    // when non-blank (parseScientistIntent.ts:74). The schema's minLength:1 does
    // NOT catch whitespace, so the hint is what reaches normalizeScientistIntent.
    const doc = parseScientistIntent(`
intentId: prec-2
actions:
  - { action: transfer, source: "   ", sourceHint: flask }
`);
    expect(doc.actions[0]).not.toHaveProperty('source');
    expect(doc.actions[0]).toHaveProperty('sourceHint', 'flask');
    const out = normalizeScientistIntent(doc);
    expect(out.candidateEvents[0]).toMatchObject({ source_labware: 'flask' });
  });

  it('a truly empty source is rejected by the schema (minLength 1) before normalize ever runs', () => {
    expect(() => parseScientistIntent(`
intentId: prec-3
actions:
  - { action: transfer, source: "", sourceHint: flask }
`)).toThrow(ScientistIntentValidationError);
  });
});

describe('characterization: serial_dilution label->*Hint params quirk', () => {
  it('raw symbolic source/target labels become params.sourceHint/params.targetHint on the pattern', () => {
    // normalizeScientistIntent.serialDilutionPattern maps action.target->params.targetHint
    // and action.source->params.sourceHint (:90-91). A real behavior quirk — pinned,
    // NOT fixed (a fix belongs to SPINE-3/4 and would break the parity test SPINE-3 must pass).
    const doc = parseScientistIntent(`
intentId: quirk-sd
actions:
  - action: serial_dilution
    source: standards
    target: fresh_plate
    factor: 2
    points: 4
`);
    const out = normalizeScientistIntent(doc);
    const pattern = out.protocolIntent?.patterns[0];
    expect(pattern?.kind).toBe('serial_dilution');
    expect(pattern?.sourceLabware).toBe('standards');
    expect(pattern?.targetLabware).toBe('fresh_plate');
    expect(pattern?.params).toMatchObject({ sourceHint: 'standards', targetHint: 'fresh_plate' });
  });
});

describe('characterization: symbolicLabels first-role-wins', () => {
  it('a label first seen as source keeps role source even when a later action targets it', () => {
    // normalizeScientistIntent.updateSymbol (:242-245): existing role never overwritten.
    const doc = parseScientistIntent(`
intentId: role-1
actions:
  - { action: transfer, source: shared_plate, target: other }
  - { action: harvest, target: shared_plate }
`);
    const out = normalizeScientistIntent(doc);
    const instances = out.protocolIntent?.resources.labwareInstances ?? [];
    const shared = instances.find((l) => l.id === 'shared_plate');
    expect(shared?.role).toBe('source');
  });

  it('the harvest/passage/transfer ternary returns target on BOTH arms — a target label gets role target for ANY verb (quirk, pinned not fixed)', () => {
    // normalizeScientistIntent.ts:172 ternary: `verb === 'harvest' || 'passage' || 'transfer'
    // ? 'target' : 'target'`. Characterized as-is; :172 is a SPINE-3/4 decision.
    const doc = parseScientistIntent(`
intentId: role-2
actions:
  - { action: wash, target: beaker }
`);
    const out = normalizeScientistIntent(doc);
    const instances = out.protocolIntent?.resources.labwareInstances ?? [];
    const beaker = instances.find((l) => l.id === 'beaker');
    expect(beaker?.role).toBe('target');
  });
});

describe('characterization: unresolved candidates boundary (Q1 split)', () => {
  it('candidates survive at PARSE level but are DROPPED at normalize level (unresolvedRefs has no candidates field)', () => {
    // Today's boundary: parseScientistIntent.normalizeDocument keeps candidates
    // (:91-102); normalizeScientistIntent.unresolvedRefs (:198-204, type :29) drops
    // them. SPINE-1 preserves candidates+actionLocation ONLY on the parsed
    // ScientistIntent; widening unresolvedRefs is SPINE-3's first move.
    const doc = parseScientistIntent(`
intentId: cand-1
actions:
  - { action: transfer, source: a, target: b }
unresolved:
  - label: mystery_labware
    reason: could not commit to a plate
    candidates:
      - { label: 96-well plate, confidence: 0.9 }
      - { label: deep well plate }
`);
    // Parse level: candidates preserved exactly.
    expect(doc.unresolved[0]?.candidates).toEqual([
      { label: '96-well plate', confidence: 0.9 },
      { label: 'deep well plate' },
    ]);
    // Normalize level: candidates dropped — key ABSENCE asserted (exactOptionalPropertyTypes).
    const out = normalizeScientistIntent(doc);
    expect(out.unresolvedRefs).toHaveLength(1);
    const ref = out.unresolvedRefs[0] as Record<string, unknown>;
    expect(Object.keys(ref).sort()).toEqual(['kind', 'label', 'reason']);
    expect(ref).not.toHaveProperty('candidates');
  });
});

describe('characterization: unknown-action double-reject', () => {
  it('Ajv enum rejects an unknown action through parseScientistIntent', () => {
    expect(() => parseScientistIntent(`
intentId: bad
actions:
  - action: evaporate
`)).toThrow(ScientistIntentValidationError);
  });

  it('the vocabulary-driven defense layer is defense-in-depth behind the enum; the verb-inventory diff test above is what catches a future enum-widening without a vocabulary update', () => {
    // normalizeDocument's vocabulary.has() filter is unreachable through
    // parseScientistIntent today because the schema enum rejects first. Both
    // layers are pinned: this test pins the Ajv layer; the verb-inventory test
    // pins shipped vocabulary == enum so the defense layer cannot silently drift.
    expect(() => parseScientistIntent(`
intentId: bad2
actions:
  - { action: incubate }
  - action: evaporate
`)).toThrow(ScientistIntentValidationError);
  });
});
