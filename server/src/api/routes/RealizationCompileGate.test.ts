import { describe, it, expect } from 'vitest'
import { checkRealizationProposal } from './RealizationCompileGate.js'

describe('checkRealizationProposal', () => {
  const okValidate: ValidateFn = async () => ({ valid: true, errors: [] })
  const failSchema: ValidateFn = async () => ({
    valid: false,
    errors: [{ path: '/events/0', message: 'Missing required property: eventId' }],
  })

  it('accepts a structurally valid, reference-connected proposal', async () => {
    const events = [
      { eventId: 'E1', event_type: 'transfer', details: { source_labwareId: 'a', target_labwareId: 'b', wells: ['A1'] } },
    ]
    const labwares = [
      { labwareId: 'a', labwareType: 'plate_96' },
      { labwareId: 'b', labwareType: 'plate_96' },
    ]
    const r = await checkRealizationProposal(events, labwares, { validate: okValidate })
    expect(r.valid).toBe(true)
    expect(r.findings).toEqual([])
    expect(r.changed).toBe(false)
  })

  it('reports a schema failure as a blocking finding (draft stays, not accepted)', async () => {
    const r = await checkRealizationProposal([], [], { validate: failSchema })
    expect(r.valid).toBe(false)
    expect(r.findings[0]).toMatchObject({ severity: 'error', code: 'schema', path: '/events/0' })
  })

  it('flags an event whose labware ref is not declared (dangling reference)', async () => {
    const events = [
      { eventId: 'E1', event_type: 'transfer', details: { source_labwareId: 'missing', target_labwareId: 'a', wells: ['A1'] } },
    ]
    const labwares = [{ labwareId: 'a', labwareType: 'plate_96' }]
    const r = await checkRealizationProposal(events, labwares, { validate: okValidate })
    expect(r.valid).toBe(false)
    expect(r.findings.some((f) => f.code === 'dangling-labware-ref')).toBe(true)
  })

  it('surfaces lint findings when a lint authority is provided', async () => {
    const failLint: LintFn = async () => ({
      valid: false,
      errors: [{ path: '/', message: 'lint: semantic-key-requires-components' }],
    })
    const r = await checkRealizationProposal([], [], { validate: okValidate, lint: failLint })
    expect(r.valid).toBe(false)
    expect(r.findings[0]).toMatchObject({ severity: 'error', code: 'lint' })
  })

  it('does not mutate the reviewed proposal (committed exactly as reviewed)', async () => {
    const events = [{ eventId: 'E1', event_type: 'wash', details: { target_labwareId: 'a', wells: ['A1'] } }]
    const labwares = [{ labwareId: 'a', labwareType: 'plate_96' }]
    const before = JSON.stringify({ events, labwares })
    const r = await checkRealizationProposal(events, labwares, { validate: okValidate })
    expect(JSON.stringify({ events: r.events, labwares: r.labwares })).toBe(before)
  })
})