/**
 * GC-12 (deliverable D2) — the GC run-sheet CREATE chain, PURE.
 *
 * Pins the mint order (GC-4 create-last: the sequence header LAST) and the
 * schema-required payload shapes (the lane DB has 0 requests/samples/parties,
 * so the chain mints the full minimal-valid chain — bait #12: build the
 * chain, never assume seed state). Ids follow the schema patterns
 * (^PARTY- / ^REQ- / ^SMP- / ^ISEN- / ^ISEQ-; run is a free string).
 */
import { describe, expect, it } from 'vitest'
import { buildGcSampleAdd, buildGcSheetCreateChain, gcSheetCreatedRunId, type CreateChainStep } from './gcSheetCreate'

const INPUT = {
  title: 'FAME batch 10/28',
  gcMethodId: 'GCM-DEMO-AOAC-FAME',
  instrumentId: 'EQP-AUTOCLAVE',
  vial: '101',
  sampleLabel: 'RES35077-4',
  rand: 'AB12',
}

function stepId(steps: CreateChainStep[], schemaTail: string) {
  return steps.find((s) => s.schemaId.includes(schemaTail))?.recordId
}

describe('buildGcSheetCreateChain (the D2 mint chain, create-last)', () => {
  it('mints person → request → sample → run → entry → sequence (header LAST)', () => {
    const chain = buildGcSheetCreateChain(INPUT)
    expect(chain.map((s) => s.schemaId.split('/').pop()!)).toEqual([
      'party.schema.yaml',
      'request.schema.yaml',
      'sample.schema.yaml',
      'run.schema.yaml',
      'instrument-sequence-entry.schema.yaml',
      'instrument-sequence.schema.yaml',
    ])
    // The header is LAST (create-last: a partial failure never leaves a
    // header with dangling entryRefs).
    expect(chain[chain.length - 1].schemaId).toContain('instrument-sequence.schema.yaml')
  })

  it('wires the refs at build time (each later record points at the minted earlier id)', () => {
    const chain = buildGcSheetCreateChain(INPUT)
    const personId = stepId(chain, 'party.schema.yaml')!
    const requestId = stepId(chain, 'request.schema.yaml')!
    const sampleId = stepId(chain, 'sample.schema.yaml')!
    const runId = stepId(chain, 'run.schema.yaml')!
    const entryId = stepId(chain, 'instrument-sequence-entry.schema.yaml')!

    expect(personId).toMatch(/^PARTY-AB12$/)
    expect(requestId).toMatch(/^REQ-AB12$/)
    expect(sampleId).toMatch(/^SMP-AB12$/)
    expect(runId).toMatch(/^RUN-/)

    // request.requesterRef → the minted person.
    const request = chain.find((s) => s.recordId === requestId)!
    expect(request.payload.requesterRef).toEqual({ kind: 'record', id: personId, type: 'party' })
    // sample.requestRef → the minted request.
    const sample = chain.find((s) => s.recordId === sampleId)!
    expect(sample.payload.requestRef).toEqual({ kind: 'record', id: requestId, type: 'request' })
    // entry.runRef/sampleRef/gcMethodRef → minted run, minted sample, the chosen gc-method.
    const entry = chain.find((s) => s.recordId === entryId)!
    expect(entry.payload.runRef).toEqual({ kind: 'record', id: runId, type: 'run' })
    expect(entry.payload.sampleRef).toEqual({ kind: 'record', id: sampleId, type: 'sample' })
    expect(entry.payload.gcMethodRef).toEqual({ kind: 'record', id: INPUT.gcMethodId, type: 'gc-method' })
    expect(entry.payload.position).toEqual({ vial: '101' })
    // The header's runRef + entryRefs → the minted run + entry.
    const sequence = chain[chain.length - 1]
    expect(sequence.payload.runRef).toEqual({ kind: 'record', id: runId, type: 'run' })
    expect(sequence.payload.entryRefs).toEqual([{ kind: 'record', id: entryId, type: 'instrument-sequence-entry' }])
    expect(sequence.payload.instrumentRef).toEqual({ kind: 'record', id: INPUT.instrumentId, type: 'equipment' })
  })

  it('carries every schema-required field on every payload (the live :3092 schemas validate these)', () => {
    const chain = buildGcSheetCreateChain(INPUT)
    for (const s of chain) {
      expect(s.payload.kind).toBeDefined()
      expect(typeof s.payload.recordId === 'string' || s.schemaId.includes('run.schema') || s.schemaId.includes('instrument-sequence')).toBe(true)
    }
    // The entry requires id (the schema uses `id`, not recordId, on entries).
    const entry = chain.find((s) => s.schemaId.includes('instrument-sequence-entry'))!
    expect(entry.payload.id).toBe(entry.recordId)
    expect(entry.payload.state).toBe('draft')
    // The sequence requires title + entryRefs (non-empty here).
    const sequence = chain[chain.length - 1]
    expect(sequence.payload.title).toBe(INPUT.title)
    expect(Array.isArray(sequence.payload.entryRefs)).toBe(true)
  })

  it('omits the optional studyRef/instrumentRef when not supplied (exactOptionalPropertyTypes-clean)', () => {
    const chain = buildGcSheetCreateChain({ ...INPUT, instrumentId: undefined })
    const sequence = chain[chain.length - 1]
    expect(sequence.payload).not.toHaveProperty('instrumentRef')
    const run = chain.find((s) => s.schemaId.includes('run.schema.yaml'))!
    expect(run.payload).not.toHaveProperty('studyId')
  })

  it('the front door lands on the RUN record (the /runs/:runId surface, GC-D1)', () => {
    const chain = buildGcSheetCreateChain(INPUT)
    const runId = gcSheetCreatedRunId(chain)
    expect(runId).toMatch(/^RUN-/)
    // The run recordId is what the section's probe links (header runRef + entry runRef).
    const runStep = chain.find((s) => s.schemaId.includes('run.schema.yaml'))!
    expect(runStep.recordId).toBe(runId)
    expect(runStep.payload.status).toBe('planned')
  })

  // FAME-8 B4 (run-sheet typed sample labels): the ENTRY payload stamps the
  // typed label in the schema-declared `sampleName` field (the run-table
  // label — SAMPLE.XML <Name>). GcRunTable renders declared columns
  // generically, so today (pre-fix) the row shows the SMP-/GCM- ids instead
  // of the typed label. No sampleLabel twin; no id-derived fabrication.
  it('stamps sampleName = the typed label on the entry payload (sheet create)', () => {
    const chain = buildGcSheetCreateChain(INPUT)
    const entry = chain.find((s) => s.schemaId.includes('instrument-sequence-entry'))!
    expect(entry.payload.sampleName).toBe('RES35077-4')
    // The typed label is NOT re-derived from the sample record id.
    const sampleId = stepId(chain, 'sample.schema.yaml')!
    expect(entry.payload.sampleName).not.toBe(sampleId)
  })
})

describe('buildGcSampleAdd (sample-add to an existing sheet)', () => {
  it('stamps sampleName = the typed label on the new entry payload (sample add)', () => {
    const res = buildGcSampleAdd({
      runId: 'RUN-EX',
      gcMethodId: INPUT.gcMethodId,
      vial: '102',
      sampleLabel: 'RES35077-5',
      rand: 'ZZ9',
    })
    const entry = res.steps.find((s) => s.schemaId.includes('instrument-sequence-entry'))!
    expect(entry.payload.sampleName).toBe('RES35077-5')
    expect(entry.payload.position).toEqual({ vial: '102' })
    expect(entry.recordId).toBe(res.entryRecordId)
  })

  // The empty-label path is blocked by the FORM gate (GcSectionChrome —
  // pinned there: an empty label yields a named reason and mints nothing),
  // so the builders never receive an empty label from the form. This pin
  // documents the boundary: the stamp is the label AS TYPED, and there is no
  // `|| sampleId` fallback that would fabricate a label past the gate.
  it('carries the label as typed (no id-derived fallback fabricates a label)', () => {
    const res = buildGcSampleAdd({
      runId: 'RUN-EX',
      gcMethodId: INPUT.gcMethodId,
      vial: '103',
      sampleLabel: 'COUNTRYSIDE-BUTTER',
      rand: 'YY8',
    })
    const entry = res.steps.find((s) => s.schemaId.includes('instrument-sequence-entry'))!
    expect(entry.payload.sampleName).toBe('COUNTRYSIDE-BUTTER')
    // No fabricated fallback to the minted sample id:
    const sampleId = res.steps.find((s) => s.schemaId.includes('sample.schema.yaml'))!.recordId
    expect(entry.payload.sampleName).not.toBe(sampleId)
  })

  // FAME-8 fix1 D5 (spec §5 B4: "a minLength: 1 violation can never be
  // constructed from the form path"). The form gate is what blocks the empty
  // label (GcSectionChrome.tsx:145-151: `!label || !vial || !method` ⇒ NAMED
  // reason + return — the builders are never reached; the sheet-create front
  // door has the same gate, RunCollectionView.tsx:202-207; the component-level
  // pin — named reason, createRecord NOT called — sits at
  // GcSectionChrome.test.tsx:261-272, outside this suite). This is the
  // BUILDER-LEVEL invariant that the gate defends: an empty label can never
  // construct a VALID entry through the builder path —
  //   (a) the builders stamp the label AS TYPED (no `|| sampleId` fallback
  //       fabricating a label);
  //   (b) the stamped value FAILS the schema-declared `minLength: 1` on
  //       sampleName (instrument-sequence-entry.schema.yaml:133-137) — i.e.
  //       the entry is un-constructible as valid data;
  //   (c) the gate is upstream, so an empty label never MINTS anything.
  // Honest note: this pin is GREEN at base (the run-1 builders already stamp
  // the empty string with no fallback) — it guards a FUTURE fallback, not a
  // run-1 defect; there is no RED for it.
  it('an empty sampleLabel can never produce a valid entry (the minLength:1 pin, both builders)', () => {
    // (a)+(b) sheet create: the stamp is the empty label as typed, and the
    // empty string fails the schema's minLength: 1 — no valid entry.
    const chain = buildGcSheetCreateChain({ ...INPUT, sampleLabel: '' })
    const entry = chain.find((s) => s.schemaId.includes('instrument-sequence-entry'))!
    expect(entry.payload.sampleName).toBe('')
    expect((entry.payload.sampleName as string).length >= 1).toBe(false)
    // (c) no id-derived fallback fabricates a label out of the empty label:
    const sampleId = chain.find((s) => s.schemaId.includes('sample.schema.yaml'))!.recordId
    expect(entry.payload.sampleName).not.toBe(sampleId)

    // The sample-add path honours the SAME invariant.
    const res = buildGcSampleAdd({
      runId: 'RUN-EX',
      gcMethodId: INPUT.gcMethodId,
      vial: '104',
      sampleLabel: '',
      rand: 'XX7',
    })
    const addEntry = res.steps.find((s) => s.schemaId.includes('instrument-sequence-entry'))!
    expect(addEntry.payload.sampleName).toBe('')
    expect((addEntry.payload.sampleName as string).length >= 1).toBe(false)
    const addSampleId = res.steps.find((s) => s.schemaId.includes('sample.schema.yaml'))!.recordId
    expect(addEntry.payload.sampleName).not.toBe(addSampleId)
  })
})
