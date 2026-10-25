/**
 * SPINE-1 clarification contract — argument-location identity on unresolved
 * facts, the confidence scale, and the frozen candidate shape.
 *
 * The clarification IS the unresolved fact (ScientistIntentUnresolvedFact);
 * no second clarification object. The extension adds an OPTIONAL
 * actionLocation?: {actionIndex?, action?, argument?} on unresolved items,
 * schema-validated against the same 31-verb enum — the verb enum is the
 * fabrication gate at the contract layer (a fabricated action value like
 * 'evaporate' in an unresolved.argument-location IS REJECTED).
 *
 * Harness: fresh validator per test (ProtocolProseFieldsSchema.test.ts
 * pattern) for negative/edge cases; the real parseScientistIntent for the
 * round-trip (production's cached-singleton behavior).
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

const SCHEMA_PATH = join(process.cwd(), '..', 'schema', 'workflow', 'scientist-intent.schema.yaml');

function loadSchemaDocument(): Record<string, unknown> {
  return parseYaml(readFileSync(SCHEMA_PATH, 'utf-8')) as Record<string, unknown>;
}

interface StructuredError {
  path: string;
  message: string;
  keyword: string;
}

function errorsOf(error: unknown): StructuredError[] {
  return (error as ScientistIntentValidationError).errors as StructuredError[];
}

describe('clarification-contract.argument-location', () => {
  let validator: AjvValidator;

  beforeEach(() => {
    validator = createValidator({ strict: false });
    validator.addSchema(loadSchemaDocument(), SCIENTIST_INTENT_SCHEMA_ID);
  });

  it('accepts an optional actionLocation {actionIndex, action, argument} on an unresolved item', () => {
    const result = validator.validate({
      intentId: 'clar-1',
      actions: [{ action: 'transfer', source: 'cells', target: 'plate' }],
      unresolved: [
        {
          label: 'which plate?',
          reason: 'scientist said "the plate" without naming it',
          actionLocation: { actionIndex: 0, action: 'transfer', argument: 'target' },
        },
      ],
    }, SCIENTIST_INTENT_SCHEMA_ID);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts actionLocation with any subset of its (all-optional) members', () => {
    for (const actionLocation of [
      { action: 'wash' },
      { actionIndex: 2 },
      { argument: 'labware' },
      { actionIndex: 0, action: 'serial_dilution' },
    ]) {
      const result = validator.validate({
        intentId: 'clar-subset',
        actions: [{ action: 'wash', source: 'a', target: 'b' }],
        unresolved: [{ label: 'x', reason: 'y', actionLocation }],
      }, SCIENTIST_INTENT_SCHEMA_ID);
      expect(result.errors ?? []).toEqual([]);
    }
  });

  it('parse round-trip preserves actionLocation exactly (absent !== undefined)', () => {
    const doc = parseScientistIntent(`
intentId: clar-rt
actions:
  - { action: transfer, source: cells, target: plate }
unresolved:
  - label: which plate?
    reason: not named
    actionLocation: { actionIndex: 0, action: transfer, argument: target }
`);
    const fact = doc.unresolved[0] as Record<string, unknown>;
    expect(fact.actionLocation).toEqual({ actionIndex: 0, action: 'transfer', argument: 'target' });

    // Key absence for documents WITHOUT actionLocation (exactOptionalPropertyTypes:
    // assert Object.keys / not.toHaveProperty, never toEqual-with-undefined).
    const plain = parseScientistIntent(`
intentId: clar-plain
actions:
  - { action: transfer, source: cells, target: plate }
unresolved:
  - { label: mystery, reason: unclear }
`);
    const plainFact = plain.unresolved[0] as Record<string, unknown>;
    expect(Object.keys(plainFact).sort()).toEqual(['label', 'reason']);
    expect(plainFact).not.toHaveProperty('actionLocation');
  });

  it('normalize-level boundary stays candidates+actionLocation-dropped (Q1 ruling: widening unresolvedRefs is SPINE-3)', () => {
    const doc = parseScientistIntent(`
intentId: clar-split
actions:
  - { action: transfer, source: cells, target: plate }
unresolved:
  - label: which plate?
    reason: not named
    candidates:
      - { label: 96-well plate, confidence: 0.8 }
    actionLocation: { actionIndex: 0, action: transfer, argument: target }
`);
    // Parse level: both preserved.
    expect(doc.unresolved[0]?.candidates).toEqual([{ label: '96-well plate', confidence: 0.8 }]);
    expect(doc.unresolved[0]?.actionLocation).toEqual({ actionIndex: 0, action: 'transfer', argument: 'target' });
    // Normalize level: unresolvedRefs stays {kind,label,reason} — key absence asserted.
    const out = normalizeScientistIntent(doc);
    const ref = out.unresolvedRefs[0] as Record<string, unknown>;
    expect(Object.keys(ref).sort()).toEqual(['kind', 'label', 'reason']);
    expect(ref).not.toHaveProperty('candidates');
    expect(ref).not.toHaveProperty('actionLocation');
  });

  it('rejects a non-integer actionIndex, naming the offending instancePath', () => {
    let thrown: unknown;
    try {
      parseScientistIntent(`
intentId: clar-bad-index
actions:
  - { action: transfer, source: cells, target: plate }
unresolved:
  - label: x
    reason: y
    actionLocation: { actionIndex: 1.5, action: transfer, argument: target }
`);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ScientistIntentValidationError);
    const errors = errorsOf(thrown);
    expect(errors.some((e) => e.path === '/unresolved/0/actionLocation/actionIndex' && e.keyword === 'type')).toBe(true);
  });

  it('rejects a fabricated action value in actionLocation (the 31-verb enum is the fabrication gate)', () => {
    let thrown: unknown;
    try {
      parseScientistIntent(`
intentId: clar-fabricated
actions:
  - { action: transfer, source: cells, target: plate }
unresolved:
  - label: x
    reason: y
    actionLocation: { actionIndex: 0, action: evaporate, argument: target }
`);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ScientistIntentValidationError);
    const errors = errorsOf(thrown);
    expect(errors.some((e) => e.path === '/unresolved/0/actionLocation/action' && e.keyword === 'enum')).toBe(true);
  });

  it('rejects a blank argument, naming the offending instancePath', () => {
    let thrown: unknown;
    try {
      parseScientistIntent(`
intentId: clar-blank-arg
actions:
  - { action: transfer, source: cells, target: plate }
unresolved:
  - label: x
    reason: y
    actionLocation: { actionIndex: 0, action: transfer, argument: "" }
`);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ScientistIntentValidationError);
    const errors = errorsOf(thrown);
    expect(errors.some((e) => e.path === '/unresolved/0/actionLocation/argument' && e.keyword === 'minLength')).toBe(true);
  });
});

describe('clarification-contract.confidence scale (DECLARED, not calibrated)', () => {
  let validator: AjvValidator;

  beforeEach(() => {
    validator = createValidator({ strict: false });
    validator.addSchema(loadSchemaDocument(), SCIENTIST_INTENT_SCHEMA_ID);
  });

  // The 0..1 scale is DECLARED in schema/workflow/scientist-intent.schema.yaml
  // (candidates[].confidence minimum 0 maximum 1). It is NOT claimed calibrated —
  // no calibration machinery exists; SPINE-1 states the scale, nothing consumes it.
  it.each([0, 0.5, 1])('accepts confidence %p', (confidence) => {
    const result = validator.validate({
      intentId: 'conf-ok',
      actions: [{ action: 'wash', source: 'a', target: 'b' }],
      unresolved: [{ label: 'x', reason: 'y', candidates: [{ label: 'c', confidence }] }],
    }, SCIENTIST_INTENT_SCHEMA_ID);
    expect(result.errors ?? []).toEqual([]);
  });

  it.each([1.5, -0.1])('rejects confidence %p (outside the declared 0..1 scale)', (confidence) => {
    const result = validator.validate({
      intentId: 'conf-bad',
      actions: [{ action: 'wash', source: 'a', target: 'b' }],
      unresolved: [{ label: 'x', reason: 'y', candidates: [{ label: 'c', confidence }] }],
    }, SCIENTIST_INTENT_SCHEMA_ID);
    expect(result.valid).toBe(false);
  });

  it('accepts an ABSENT confidence (key absence, not undefined)', () => {
    const result = validator.validate({
      intentId: 'conf-absent',
      actions: [{ action: 'wash', source: 'a', target: 'b' }],
      unresolved: [{ label: 'x', reason: 'y', candidates: [{ label: 'c' }] }],
    }, SCIENTIST_INTENT_SCHEMA_ID);
    expect(result.errors ?? []).toEqual([]);
    const doc = parseScientistIntent(`
intentId: conf-absent
actions:
  - { action: wash, source: a, target: b }
unresolved:
  - label: x
    reason: y
    candidates:
      - { label: c }
`);
    const candidate = doc.unresolved[0]?.candidates?.[0] as Record<string, unknown>;
    expect(Object.keys(candidate)).toEqual(['label']);
  });
});

describe('clarification-contract.candidate shape freeze (SPINE-3 cannot silently widen it)', () => {
  it('the schema candidates item is exactly {label required, confidence optional 0..1, ref optional string, additionalProperties false, unevaluatedProperties false}', () => {
    const doc = loadSchemaDocument();
    const unresolvedItem = ((doc.properties as Record<string, unknown>).unresolved as Record<string, unknown>).items as Record<string, unknown>;
    const candidates = (unresolvedItem.properties as Record<string, unknown>).candidates as Record<string, unknown>;
    const item = candidates.items as Record<string, unknown>;

    expect(item.additionalProperties).toBe(false);
    expect(item.unevaluatedProperties).toBe(false);
    expect(item.required).toEqual(['label']);

    // W28-OPTIONBIND-1 DELIBERATE PIN UPDATE (the sanctioned pin+row pattern,
    // W28-A5n Q1): the ONLY delta is the additive optional `ref` — the engine's
    // store-backed record handle (resolutionEngine.ts candidateRecordRef;
    // tier <= 1 record candidates only, mint/tier>1 carry none). The freeze
    // itself is unchanged: required stays ['label'], the
    // additionalProperties/unevaluatedProperties posture stays false/false, and
    // the next test proves an UNDECLARED key is still rejected.
    const props = item.properties as Record<string, Record<string, unknown>>;
    expect(Object.keys(props).sort()).toEqual(['confidence', 'label', 'ref']);
    expect(props.label?.type).toBe('string');
    expect(props.confidence?.type).toBe('number');
    expect(props.confidence?.minimum).toBe(0);
    expect(props.confidence?.maximum).toBe(1);
    expect(props.ref?.type).toBe('string');
    expect(props.ref?.minLength).toBe(1);
  });

  it('rejects an extra property on a candidate item (the freeze is enforced, not just declared)', () => {
    const validator = createValidator({ strict: false });
    validator.addSchema(loadSchemaDocument(), SCIENTIST_INTENT_SCHEMA_ID);
    const result = validator.validate({
      intentId: 'cand-frozen',
      actions: [{ action: 'wash', source: 'a', target: 'b' }],
      unresolved: [{ label: 'x', reason: 'y', candidates: [{ label: 'c', recordId: 'LBW-1' }] }],
    }, SCIENTIST_INTENT_SCHEMA_ID);
    expect(result.valid).toBe(false);
  });
});
