// @vitest-environment node
/**
 * SCIENCE-CHAIN-1 unit 2 — mixture-share RED tests (format + derivation pins).
 *
 * Tests run before implementation; all must fail at base (ab107c05) and pass
 * after the unit's changes. Hosts BOTH format pins and derivation pins (C-1..C-6).
 */
import { describe, expect, it, vi } from 'vitest'
import { loadMixtureShareConvention, formatMixtureShare } from './mixtureShareFormat'
import { computeLabwareStates } from './eventGraph'
import { createLabware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'

// ─────────────────────────────────────────────────────────────────────
// FORMAT PINS — mixtureShareFormat.ts
// ─────────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (v === 0) return '0 \u00b5L'
  if (v < 1) return `${(v * 1000).toFixed(1)} nL`
  if (v >= 1000) return `${(v / 1000).toFixed(2)} mL`
  return `${v.toFixed(1)} \u00b5L`
}

describe('formatMixtureShare — format pins', () => {
  it('empty convention text ⇒ undefined + exactly one console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = loadMixtureShareConvention('')
    expect(result).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/mixture-share.*empty/i)
    warnSpy.mockRestore()
  })

  it('malformed convention text throws naming the path', () => {
    expect(() => loadMixtureShareConvention('not: [valid: {{yaml')).toThrow(/mixture-share convention.*config\/drafting\/composition-fraction-convention\.yaml/i)
  })

  it('displayRoundingFactor:100 ⇒ 2 decimals (decimals = log10(100))', () => {
    const conv = loadMixtureShareConvention('displayRoundingFactor: 100')
    expect(conv?.displayRoundingFactor).toBe(100)
    const share = formatMixtureShare(1, 302, 100, fmt)
    expect(share).toBe('1.0 \u00b5L / 302.0 \u00b5L (0.33 %)')
  })

  it('formatMixtureShare(1, 302, 100, fmt) ⇒ "1.0 µL / 302.0 µL (0.33 %)"', () => {
    const result = formatMixtureShare(1, 302, 100, fmt)
    expect(result).toBe('1.0 \u00b5L / 302.0 \u00b5L (0.33 %)')
  })

  it('numerator > denominator ⇒ undefined', () => {
    expect(formatMixtureShare(500, 100, 100, fmt)).toBeUndefined()
  })

  it('denominator === 0 ⇒ undefined', () => {
    expect(formatMixtureShare(1, 0, 100, fmt)).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────
// DERIVATION PINS — C-1..C-8 (syncDerivedMaterials)
// ─────────────────────────────────────────────────────────────────────

describe('syncDerivedMaterials — derivation pins (SCIENCE-CHAIN-1 C-1..C-8)', () => {
  /** Build a multi-entry snapshot event with material_spec_ref (so ledger entries get materialSpecRef). */
  function makeSnapshotEvent(labwareId: string, snapshot: unknown[], opts?: { materialSpecRef?: string }) {
    return {
      eventId: 'evt-snapshot',
      event_type: 'add_material' as const,
      details: {
        labwareId,
        wells: ['A1'],
        volume: { value: 302, unit: 'uL' },
        material_spec_ref: opts?.materialSpecRef ? { kind: 'record', id: opts.materialSpecRef, label: 'spec' } : undefined,
        composition_snapshot: snapshot,
      },
    } as PlateEvent
  }

  function makeSnapshot(labwareId: string, snapshot: unknown[], opts?: { materialSpecRef?: string }) {
    const labware = createLabware('plate_96', 'mix-share-test')
    const evt = makeSnapshotEvent(labwareId, snapshot, opts)
    const states = computeLabwareStates([evt], new Map([[labwareId, labware]]))
    return states.get(labwareId)?.get('A1')
  }

  // C-1: ONE formulation-carrier solvent row + total 302 uL derives fractionOfMixture.
  // In a carrier composition the carrierVolume_uL = event volume, so share = 302/302 = 100%.
  it('C-1: single carrier solvent row derives denominator-stated share', () => {
    const a1 = makeSnapshot('plate-mix-1', [
      { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute', source: '99.1% of the mixture' },
      { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent' },
    ], { materialSpecRef: 'rec-spec' })
    expect(a1).toBeTruthy()
    const carrier = a1!.materials.find((m) => m.role === 'solvent')
    // carrierVolume_uL = 302 (event volume), state.volume_uL = 302 → 100%
    expect(carrier?.fractionOfMixture).toMatch(/^\d+\.\d+ \u00b5L \/ \d+\.\d+ \u00b5L \(\d+\.\d{2} %\)$/)
    expect(carrier?.fractionOfMixture).toContain('302')
  })

  // C-2: TWO candidate carrier rows ⇒ no derived share
  it('C-2: two candidate carrier rows ⇒ no derived share (volume not attributable)', () => {
    const a1 = makeSnapshot('plate-mix-2', [
      { componentRef: { kind: 'record', id: 'rec-carrier1', label: 'carrier1' }, role: 'solvent' },
      { componentRef: { kind: 'record', id: 'rec-carrier2', label: 'carrier2' }, role: 'solvent' },
    ], { materialSpecRef: 'rec-spec' })
    expect(a1).toBeTruthy()
    const carriers = a1!.materials.filter((m) => m.role === 'solvent')
    carriers.forEach((c) => {
      expect(c.fractionOfMixture).toBeUndefined()
    })
  })

  // C-3: Explicit declared source fraction WINS
  it('C-3: explicit declared source fraction wins over derived', () => {
    const a1 = makeSnapshot('plate-mix-3', [
      { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute' },
      { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent', source: '10% of the mixture' },
    ], { materialSpecRef: 'rec-spec' })
    expect(a1).toBeTruthy()
    const carrier = a1!.materials.find((m) => m.role === 'solvent')
    expect(carrier?.fractionOfMixture).toBe('10%')
  })

  // C-4: Single-entry snapshot keeps today's output (no new key)
  it('C-4: single-entry snapshot keeps byte-identical output (no fractionOfMixture key)', () => {
    const labware = createLabware('plate_96', 'single-entry')
    const evt: PlateEvent = {
      eventId: 'evt-single',
      event_type: 'add_material',
      details: {
        labwareId: labware.labwareId,
        wells: ['A1'],
        volume: { value: 100, unit: 'uL' },
        concentration: { value: 1, unit: 'mM' },
        material_ref: { kind: 'record', id: 'rec-only', label: 'single material', type: 'material-spec' },
      },
    }
    const states = computeLabwareStates([evt], new Map([[labware.labwareId, labware]]))
    const a1 = states.get(labware.labwareId)?.get('A1')
    expect(a1).toBeTruthy()
    const mat = a1!.materials[0]
    expect(mat?.fractionOfMixture).toBeUndefined()
    // volume_uL should NOT be the mixture volume for a single entry
    expect(mat?.volume_uL).toBe(100)
  })

  // C-5: Each predicate condition individually suppressed ⇒ no derived share
  // The five conditions: volumeIsCarrier, materialSpecRef present, fractionOfMixture absent,
  // role === carrierSnapshotRole, concentrationUnit undefined.
  it('C-5: suppressing any predicate condition ⇒ no derived share', () => {
    // 1. Missing volumeIsCarrier: single-entry snapshot → volumeIsCarrier is never set
    {
      const a1 = makeSnapshot('plate-c5-no-volumeIsCarrier', [
        { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent' },
      ], { materialSpecRef: 'rec-spec' })
      expect(a1!.materials.find((m) => m.role === 'solvent')?.fractionOfMixture).toBeUndefined()
    }
    // 2. Missing materialSpecRef: plain-string component_refs (no record-kind id) and no
    //    event-level material_spec_ref ⇒ no spec ref on the row
    {
      const a1 = makeSnapshot('plate-c5-no-materialSpecRef', [
        { componentRef: 'solute', role: 'solute' },
        { componentRef: 'carrier', role: 'solvent' },
      ]) // no materialSpecRef, plain-string refs
      expect(a1!.materials.find((m) => m.role === 'solvent')?.fractionOfMixture).toBeUndefined()
    }
    // 3. Has fractionOfMixture (explicit source): explicit WINS — NOT a suppression, this should succeed
    {
      const a1 = makeSnapshot('plate-c5-has-fractionOfMixture', [
        { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute' },
        { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent', source: '1% of the mixture' },
      ], { materialSpecRef: 'rec-spec' })
      // Explicit source wins — the fraction should be the declared value
      expect(a1!.materials.find((m) => m.role === 'solvent')?.fractionOfMixture).toBe('1%')
    }
    // 4. Wrong role: carrier entry has 'solute' instead of 'solvent'
    {
      const a1 = makeSnapshot('plate-c5-wrong-role', [
        { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute' },
        { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solute' },
      ], { materialSpecRef: 'rec-spec' })
      expect(a1!.materials.find((m) => m.role === 'solute')?.fractionOfMixture).toBeUndefined()
    }
    // 5. Has concentration: carrier entry carries concentration
    {
      const a1 = makeSnapshot('plate-c5-has-concentration', [
        { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute' },
        { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent', concentration: { value: 1, unit: 'mM' } },
      ], { materialSpecRef: 'rec-spec' })
      expect(a1!.materials.find((m) => m.role === 'solvent')?.fractionOfMixture).toBeUndefined()
    }
  })

  // C-6: After later addition, share re-derives against NEW total
  it('C-6: share re-derives against new total after later addition', () => {
    const labware = createLabware('plate_96', 'later-add')
    const evt1 = makeSnapshotEvent(labware.labwareId, [
      { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute' },
      { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent' },
    ], { materialSpecRef: 'rec-spec' })
    const evt2: PlateEvent = {
      eventId: 'evt-later',
      event_type: 'add_material',
      details: {
        labwareId: labware.labwareId,
        wells: ['A1'],
        volume: { value: 100, unit: 'uL' },
        material_ref: { kind: 'record', id: 'rec-extra', label: 'extra material', type: 'material-spec' },
      },
    }
    const states = computeLabwareStates([evt1, evt2], new Map([[labware.labwareId, labware]]))
    const a1 = states.get(labware.labwareId)?.get('A1')
    expect(a1).toBeTruthy()
    expect(a1!.volume_uL).toBe(402)
    const carrier = a1!.materials.find((m) => m.role === 'solvent')
    expect(carrier?.fractionOfMixture).toMatch(/\d+\.\d+ \u00b5L \/ 402\.0 \u00b5L/)
  })

  // C-7: Multi-entry [solute (NO source), solvent] — derived share attaches ONLY
  // to the carrier row, never to the non-carrier solute row.
  // This is the exact adversarial probe shape: the solute must NOT see a DMSO-style
  // mixture share in its WellTooltip.
  it('C-7: derived fractionOfMixture attaches ONLY to the carrier row — solute gets undefined', () => {
    const a1 = makeSnapshot('plate-c7', [
      { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute' },
      { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent' },
    ], { materialSpecRef: 'rec-spec' })
    expect(a1).toBeTruthy()
    const solute = a1!.materials.find((m) => m.role === 'solute')
    const carrier = a1!.materials.find((m) => m.role === 'solvent')
    // Solute must NOT have fractionOfMixture — it is NOT the carrier
    expect(solute?.fractionOfMixture).toBeUndefined()
    // Carrier row must have the derived share
    expect(carrier?.fractionOfMixture).toMatch(/^\d+\.\d+ \u00b5L \/ \d+\.\d+ \u00b5L \(\d+\.\d{2} %\)$/)
  })

  // C-9: Per-row record-kind component_ref provides materialSpecRef WITHOUT event-level ref.
  // This is the exact gate3 D2 shape: two-entry snapshot, each entry carries its own
  // record-kind componentRef with id, NO event-level material_spec_ref.
  // The solvent row must derive fractionOfMixture because each row carries its own spec ref.
  it('C-9: per-row record-kind component_ref provides materialSpecRef without event-level ref', () => {
    const a1 = makeSnapshot('plate-c9-per-row-ref', [
      { componentRef: { kind: 'record', id: 'MAT-PR9-TEST-SOLUTE', label: 'solute', type: 'material-spec' }, role: 'solute', source: '99% of the mixture' },
      { componentRef: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', label: 'DMSO', type: 'material-spec' }, role: 'solvent' },
    ]) // NO event-level materialSpecRef — per-row refs carry their own ids
    expect(a1).toBeTruthy()
    const carrier = a1!.materials.find((m) => m.role === 'solvent')
    // The solvent row should have a denominator-stated share because it has its own materialSpecRef
    expect(carrier?.fractionOfMixture).toMatch(/^\d+\.\d+ \u00b5L \/ \d+\.\d+ \u00b5L \(\d+\.\d{2} %\)$/)
    // The id must be the per-row id, NOT from the event
    expect(carrier?.materialSpecRef).toBe('MAT-PR9-TEST-DMSO')
  })

  // C-10: Per-row record-kind component_ref with type: 'material' must NOT set materialSpecRef.
  // Only type: 'material-spec' is accepted. This is the defect u7fix1 targets.
  it('C-10: type:material component_ref does NOT set materialSpecRef; type:material-spec does', () => {
    // Leg 1: type: 'material' → materialSpecRef must be UNSET
    {
      const a1 = makeSnapshot('plate-c10-material', [
        { componentRef: { kind: 'record', id: 'MAT-trypsin', label: 'Trypsin', type: 'material' }, role: 'solute' },
        { componentRef: { kind: 'record', id: 'MSP-buffer', label: 'Buffer', type: 'material-spec' }, role: 'solvent' },
      ])
      expect(a1).toBeTruthy()
      const matRow = a1!.materials.find((m) => m.materialRef === 'Trypsin')
      expect(matRow?.materialSpecRef).toBeUndefined()
    }
    // Leg 2: type: 'material-spec' → materialSpecRef IS set
    {
      const a1 = makeSnapshot('plate-c10-spec', [
        { componentRef: { kind: 'record', id: 'MSP-x', label: 'X', type: 'material-spec' }, role: 'solvent' },
      ], { materialSpecRef: 'rec-spec' })
      expect(a1).toBeTruthy()
      const specRow = a1!.materials[0]
      expect(specRow?.materialSpecRef).toBe('MSP-x')
    }
  })

  // C-8: When participation convention is absent (loadParticipationConvention → undefined),
  // derivation is OFF — no hardcoded role fallback re-enables it.
  it('C-8: absent participation convention ⇒ no derived share (no hardcoded fallback)', async () => {
    const mod = await import('../../shared/lib/participationConvention')
    vi.spyOn(mod, 'loadParticipationConvention').mockReturnValue(undefined)
    try {
      const a1 = makeSnapshot('plate-c8', [
        { componentRef: { kind: 'record', id: 'rec-solute', label: 'solute' }, role: 'solute' },
        { componentRef: { kind: 'record', id: 'rec-carrier', label: 'carrier' }, role: 'solvent' },
      ], { materialSpecRef: 'rec-spec' })
      expect(a1).toBeTruthy()
      // NO row should have a derived fractionOfMixture
      a1!.materials.forEach((m) => {
        expect(m.fractionOfMixture).toBeUndefined()
      })
    } finally {
      vi.restoreAllMocks()
    }
  })
})
