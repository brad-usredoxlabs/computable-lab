/**
 * CELLRATE-1 Plane 2 — compiler rate arm + THE WALL.
 *
 * Defect: the wire today cannot carry a rate-shaped count, and the compiler's
 * cells arm silently DROPS an object count (`typeof entry.count === 'number'`
 * only). Fix (spec §5.2): a count whose shape is the declared object with
 * basis `count_per_volume` routes to the event's EXISTING `counter_density`
 * slot; a plain number still routes to `count`; a declared object with basis
 * `count` maps its `value` to `count`. The `count_per_volume` comparison is
 * registration of the existing enum term (schema/core/datatypes/
 * concentration.schema.yaml), not policy — no unit literals, no unit-string
 * comparisons in the compiler.
 *
 * THE WALL (task notes, binding): the compiler performs NO arithmetic. A rate
 * leg produces `counter_density` and NO count key; the string "20000" appears
 * NOWHERE in the emitted event. A declared-absolute leg passes count through
 * byte-unchanged. Derivation is DISPLAY truth over declared data.
 *
 * Precedence pin (bait 11): an entry carrying BOTH `counterDensity` and a
 * rate-arm count keeps the dedicated `counterDensity` slot; the rate arm is
 * NOT coerced into `count`. Pinned here by test.
 *
 * Both consumers (bait 9): the shared helper `compositionSnapshotFromParams`
 * is consumed by seedExpander AND addMaterialExpander — every leg runs through
 * BOTH action shapes.
 */
import { describe, expect, it } from 'vitest';
import { getExpander } from './BiologyVerbExpander.js';
import './verbs/simpleVerbs.js';

const RATE_COUNT = { value: 200, unit: 'cells/uL', basis: 'count_per_volume' } as const

function canonicalComposition(cellsEntry: Record<string, unknown>): Record<string, unknown>[] {
  return [
    { material: 'DMEM', role: 'buffer_component', fraction: '100%' },
    cellsEntry,
  ]
}

/** Run the same params through BOTH consumers of the shared helper. */
function expandBoth(params: Record<string, unknown>): Record<string, unknown>[] {
  const seed = getExpander('seed')!.expand({ verb: 'seed', params })
  const addLegacy = getExpander('add_material')!.expand({
    verb: 'add_material',
    params: { ...params, wells: ['A1'] },
  })
  const addModern = getExpander('add_material')!.expand({
    verb: 'add_material',
    params: { ...params, well: 'A1' },
  })
  const details = [seed[0]!, addLegacy[0]!, addModern[0]!].map((e) => e.details as Record<string, unknown>)
  return details
}

describe('CELLRATE-1 compiler: the declared rate arm routes to counter_density', () => {
  it('canonical rate leg: counter_density declared, NO count key, no computed total anywhere (THE WALL)', () => {
    const detailsList = expandBoth({
      labware_id: 'plate',
      volume_uL: 100,
      material: 'seed mixture',
      composition: canonicalComposition({ material: 'HepG2 cells', role: 'cells', count: { ...RATE_COUNT } }),
    })
    for (const details of detailsList) {
      expect(details['counter_density']).toEqual({ value: 200, unit: 'cells/uL', basis: 'count_per_volume' })
      // key ABSENCE asserted via Object.keys (exactOptionalPropertyTypes convention)
      expect(Object.keys(details)).not.toContain('count')
      // THE WALL pin: the compiler performed NO arithmetic.
      expect(JSON.stringify(details)).not.toContain('20000')
    }
  })

  it('a declared-absolute count object maps its value to count (unit is a controlled term, no information lost at the absolute slot)', () => {
    const detailsList = expandBoth({
      labware_id: 'plate',
      volume_uL: 100,
      material: 'seed mixture',
      composition: canonicalComposition({
        material: 'HepG2 cells',
        role: 'cells',
        count: { value: 20000, unit: 'cells', basis: 'count' },
      }),
    })
    for (const details of detailsList) {
      expect(details['count']).toBe(20000)
      expect(Object.keys(details)).not.toContain('counter_density')
    }
  })

  it('characterization: a plain-number count stays byte-stable (existing arm unchanged)', () => {
    const detailsList = expandBoth({
      labware_id: 'plate',
      volume_uL: 100,
      material: 'seed mixture',
      composition: canonicalComposition({ material: 'HepG2 cells', role: 'cells', count: 10000 }),
    })
    for (const details of detailsList) {
      expect(details['count']).toBe(10000)
      expect(Object.keys(details)).not.toContain('counter_density')
    }
  })

  it('characterization: counterDensity + plain count both pass through unchanged (auditability = both DECLARED numbers)', () => {
    const detailsList = expandBoth({
      labware_id: 'plate',
      volume_uL: 100,
      material: 'seed mixture',
      composition: canonicalComposition({
        material: 'HepG2 cells',
        role: 'cells',
        count: 10000,
        counterDensity: { value: 200, unit: 'cells/uL' },
      }),
    })
    for (const details of detailsList) {
      expect(details['count']).toBe(10000)
      expect(details['counter_density']).toEqual({ value: 200, unit: 'cells/uL' })
    }
  })

  it('PRECEDENCE PIN (bait 11): counterDensity + rate-arm count — the dedicated slot wins, the rate arm is NOT coerced into count', () => {
    const detailsList = expandBoth({
      labware_id: 'plate',
      volume_uL: 100,
      material: 'seed mixture',
      composition: canonicalComposition({
        material: 'HepG2 cells',
        role: 'cells',
        count: { ...RATE_COUNT },
        counterDensity: { value: 500, unit: 'cells/uL' },
      }),
    })
    for (const details of detailsList) {
      expect(details['counter_density']).toEqual({ value: 500, unit: 'cells/uL' })
      expect(Object.keys(details)).not.toContain('count')
      expect(JSON.stringify(details)).not.toContain('20000')
    }
  })

  it('rate-arm count + NO counterDensity: the rate rides the counter_density slot verbatim (no coercion, no arithmetic)', () => {
    const detailsList = expandBoth({
      labware_id: 'plate',
      volume_uL: 100,
      material: 'seed mixture',
      composition: canonicalComposition({ material: 'HepG2 cells', role: 'cells', count: { ...RATE_COUNT } }),
    })
    for (const details of detailsList) {
      const density = details['counter_density'] as Record<string, unknown>
      expect(density['value']).toBe(200)
      expect(density['basis']).toBe('count_per_volume')
      expect(Object.keys(details)).not.toContain('count')
    }
  })
})
