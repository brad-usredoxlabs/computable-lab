import { describe, expect, it } from 'vitest'
import { candidateToProtocolPayload, normalizeProtocolPayload } from './candidateToProtocolPayload'
import type { AiProtocolCandidateSummary } from '../types/ai'

function sampleCandidate(): AiProtocolCandidateSummary {
  return {
    kind: 'vendor-protocol-candidate',
    title: 'CellROX Green Flow Cytometry',
    materials: [
      { label: 'CellROX reagent', role: 'probe', normalizedId: 'CL:CellROX' },
      { label: 'DMSO' },
    ],
    labware: [{ label: '96-well plate', role: 'reaction-plate', normalizedId: 'CL:plate96' }],
    equipment: [{ label: 'Flow cytometer', role: 'detector' }],
    steps: [
      { stepNumber: 1, title: 'Seed cells', text: 'Seed 50k cells per well.', notes: ['keep sterile'] },
      {
        stepNumber: 2,
        title: 'Incubate 37C',
        text: 'Incubate for 30 minutes at 37C.',
        evidence: [{ pageNumber: 5, sectionId: 'protocol', snippet: 'Incubate 30 min' }],
      },
    ],
  }
}

describe('candidateToProtocolPayload', () => {
  it('maps materials/equipment/labware to role arrays with roleId from normalizedId', () => {
    const out = candidateToProtocolPayload(sampleCandidate(), 'PRT-x')
    expect(out.roles.materialRoles).toContainEqual({
      roleId: 'cl-cellrox',
      description: 'CellROX reagent',
      allowedMaterialIds: ['CL:CellROX'],
    })
    expect(out.roles.materialRoles).toContainEqual({ roleId: 'dmso', description: 'DMSO' })
    expect(out.roles.labwareRoles[0].expectedLabwareKinds).toEqual(['CL:plate96'])
    expect(out.roles.labwareRoles[0].roleId).toBe('cl-plate96')
    expect(out.roles.instrumentRoles[0].roleId).toBe('detector') // from role, not normalizedId
  })

  it('maps steps with stepId/ordinal + forces `other` kind (schema-safe)', () => {
    const out = candidateToProtocolPayload(sampleCandidate(), 'PRT-x')
    expect(out.steps.map((s) => s.ordinal)).toEqual([1, 2])
    expect(out.steps.map((s) => s.stepId)).toEqual(['step-1', 'step-2'])
    expect(out.steps[1].label).toBe('Incubate 37C')
    expect(out.steps[1].kind).toBe('other') // never a structured kind
    expect(out.steps[0].notes).toBe('keep sterile')
    expect(out.steps[1].provenance?.[0].pageNumber).toBe(5)
  })

  it('extracts step label from title, falls back to text/Step N', () => {
    const bare: AiProtocolCandidateSummary = {
      kind: 'vendor-protocol-candidate',
      title: 'T',
      steps: [{ text: 'Dispense 200 uL to all wells' }, { title: '', text: '' }],
    }
    const out = candidateToProtocolPayload(bare, 'PRT-x')
    expect(out.steps[0].label).toBe('Dispense 200 uL to all wells')
    expect(out.steps[0].label.length).toBeLessThanOrEqual(80)
    expect(out.steps[1].label).toBe('Step 2')
  })

  it('empty candidate produces title fallback and empty roles', () => {
    const out = candidateToProtocolPayload({ kind: 'vendor-protocol-candidate', title: '  ' }, 'PRT-x')
    expect(out.title).toBe('Untitled protocol')
    expect(out.steps).toEqual([])
    expect(out.roles.materialRoles).toEqual([])
  })

  it('threads humanStepsText when provided', () => {
    const out = candidateToProtocolPayload(sampleCandidate(), 'PRT-x', '1. Seed.\n2. Read.')
    expect(out.humanStepsText).toBe('1. Seed.\n2. Read.')
  })

  it('dedupes role arrays by roleId (schema requires uniqueItems)', () => {
    const dup: AiProtocolCandidateSummary = {
      kind: 'vendor-protocol-candidate',
      title: 'T',
      materials: [
        { label: 'Reagent A', normalizedId: 'CL:reagent' },
        { label: 'Reagent A (dup)', normalizedId: 'CL:reagent' },
      ],
    }
    const out = candidateToProtocolPayload(dup, 'PRT-x')
    expect(out.roles.materialRoles).toHaveLength(1)
    expect(out.roles.materialRoles[0].allowedMaterialIds).toEqual(['CL:reagent'])
  })

  it('normalizes non-string prose fields to strings (schema requires type:string)', () => {
    const payload = {
      kind: 'protocol',
      recordId: 'PRT-x',
      title: 'T',
      notes: ['line 1', 'line 2'],            // array → joined string
      purpose: { a: 1 },                       // object → dropped (not stringable)
      humanStepsText: 'ok',
      steps: [
        { stepId: 's1', label: 'Step 1', ordinal: 1, kind: 'other', notes: ['a', 'b'] },
        { stepId: 's2', label: 123 as unknown as string, ordinal: 2, kind: 'other', notes: null as unknown as string },
      ],
    }
    const out = normalizeProtocolPayload(payload)
    expect(out.notes).toBe('line 1\nline 2')
    expect(out.purpose).toBeUndefined()           // object prose dropped
    expect(out.humanStepsText).toBe('ok')          // string kept
    expect((out.steps as Record<string, unknown>[])[0].notes).toBe('a\nb')
    expect((out.steps as Record<string, unknown>[])[1].label).toBe('123')
    expect((out.steps as Record<string, unknown>[])[1].notes).toBeUndefined() // null dropped
  })
})