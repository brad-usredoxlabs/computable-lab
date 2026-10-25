/**
 * CELLRATE-1 Plane 1 — wire contract for the cells-per-volume rate arm.
 *
 * Defect (Brad dogfood 2026-10-21, RUN-2026-09-19-run-vwr8): the utterance
 * said "200 HepG2 cells/uL" and the revised shorthand carries bare `count: 200`
 * — the RATE unit is lost on the wire, so 200 is ambiguous between a per-uL
 * rate and an absolute per-well count. The wire composition item today
 * declares `count: { type: number }` only (scientist-intent.schema.yaml), so
 * a rate-shaped count cannot validate.
 *
 * Fix shape (spec §5.1, OQ-2 RULED): `count` gains a oneOf — NUMBER BRANCH
 * FIRST (byte-identically accepting every currently-valid document, the
 * file's own sourceWells idiom) + a basis-tagged object arm reusing the
 * EXISTING concentration terms (basis count_per_volume, unit cells/uL —
 * schema/core/datatypes/concentration.schema.yaml declares both; no new local
 * term). Basis/unit cross-enforcement is IN-SCHEMA DATA (the
 * quantity.schema.yaml allOf if/then precedent): Ajv alone is the validator;
 * TypeScript never classifies the number.
 *
 * Harness: scientistIntentContract.test.ts pattern — fresh createValidator +
 * the REAL schema document under the REAL $id (negative/edge assertions must
 * not ride parseScientistIntent's module singleton).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml'
import { createValidator, type AjvValidator } from '../validation/AjvValidator.js'
import { SCIENTIST_INTENT_SCHEMA_ID } from '../compiler/scientistIntent/parseScientistIntent.js'

const SCHEMA_PATH = join(process.cwd(), '..', 'schema', 'workflow', 'scientist-intent.schema.yaml')

function loadSchemaDocument(): Record<string, unknown> {
  return parseYaml(readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, unknown>
}

/** A minimal valid add_material document carrying the given composition. */
function docWithComposition(composition: unknown[]): Record<string, unknown> {
  return {
    intentId: 'cellrate-1-wire',
    actions: [
      {
        action: 'add_material',
        labware: 'plate',
        volumeUl: 100,
        targetWells: ['A1'],
        composition: [
          { material: 'DMEM', role: 'buffer_component', fraction: '100%' },
          ...composition,
        ],
      },
    ],
  }
}

describe('CELLRATE-1 wire contract: the composition count carries its unit', () => {
  let validator: AjvValidator

  beforeEach(() => {
    validator = createValidator({ strict: false })
    validator.addSchema(loadSchemaDocument(), SCIENTIST_INTENT_SCHEMA_ID)
  })

  // ---- (b) BYTE-IDENTICAL CHARACTERIZATION: every currently-valid document
  // validates before AND after the oneOf change (number branch FIRST). ----
  it('characterization: a bare-number count validates (existing form, byte-stable)', () => {
    const result = validator.validate(
      docWithComposition([{ material: 'HepG2 cells', role: 'cells', count: 200 }]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('characterization: an entry with NO count validates (byte-stable)', () => {
    const result = validator.validate(
      docWithComposition([{ material: 'HepG2 cells', role: 'cells' }]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('characterization: the dedicated counterDensity slot validates unchanged', () => {
    const result = validator.validate(
      docWithComposition([
        { material: 'HepG2 cells', role: 'cells', counterDensity: { value: 200, unit: 'cells/uL' } },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  // ---- (a) RED AT BASE: the declared rate arm must validate after §5.1. ----
  it('a declared rate count (value + per-volume unit + count_per_volume basis) validates', () => {
    const result = validator.validate(
      docWithComposition([
        {
          material: 'HepG2 cells',
          role: 'cells',
          count: { value: 200, unit: 'cells/uL', basis: 'count_per_volume' },
        },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('a declared absolute count object (value + absolute unit + count basis) validates', () => {
    const result = validator.validate(
      docWithComposition([
        {
          material: 'HepG2 cells',
          role: 'cells',
          count: { value: 20000, unit: 'cells', basis: 'count' },
        },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.errors ?? []).toEqual([])
    expect(result.valid).toBe(true)
  })

  // ---- (c) basis/unit cross-enforcement is IN-SCHEMA DATA ----
  it('basis count_per_volume with an ABSOLUTE unit is rejected with the offending path named', () => {
    const result = validator.validate(
      docWithComposition([
        {
          material: 'HepG2 cells',
          role: 'cells',
          count: { value: 200, unit: 'cells', basis: 'count_per_volume' },
        },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.valid).toBe(false)
    // ValidationError exposes the offending location as `path` (AjvValidator
    // converts Ajv's instancePath) — the count arm must be named.
    expect(
      (result.errors ?? []).some((e) => e.path.includes('/count')),
      `errors: ${JSON.stringify(result.errors)}`,
    ).toBe(true)
  })

  it('basis count with a PER-VOLUME unit is rejected with the offending path named', () => {
    const result = validator.validate(
      docWithComposition([
        {
          material: 'HepG2 cells',
          role: 'cells',
          count: { value: 20000, unit: 'cells/uL', basis: 'count' },
        },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.valid).toBe(false)
    expect(
      (result.errors ?? []).some((e) => e.path.includes('/count')),
      `errors: ${JSON.stringify(result.errors)}`,
    ).toBe(true)
  })

  // ---- (d) unknown unit rejected ----
  it('an uncontrolled unit is rejected', () => {
    const result = validator.validate(
      docWithComposition([
        {
          material: 'HepG2 cells',
          role: 'cells',
          count: { value: 200, unit: 'cells/whatever', basis: 'count_per_volume' },
        },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.valid).toBe(false)
  })

  // ---- (e) entry posture unchanged: unevaluated extras still rejected ----
  it('the entry still rejects unevaluated extras (additionalProperties/unevaluatedProperties posture unchanged)', () => {
    const result = validator.validate(
      docWithComposition([
        {
          material: 'HepG2 cells',
          role: 'cells',
          count: { value: 200, unit: 'cells/uL', basis: 'count_per_volume', extra: 'nope' },
        },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.valid).toBe(false)
  })

  it('the object arm requires the full declared triple (value, unit, basis)', () => {
    const result = validator.validate(
      docWithComposition([
        {
          material: 'HepG2 cells',
          role: 'cells',
          count: { value: 200, unit: 'cells/uL' },
        },
      ]),
      SCIENTIST_INTENT_SCHEMA_ID,
    )
    expect(result.valid).toBe(false)
  })
})
