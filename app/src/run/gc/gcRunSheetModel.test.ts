/**
 * GC-12 (deliverable A) — the GC run-sheet model: pure functions for the
 * sequence-link probe, the full-column run-table row projection, the
 * append-only analysisRunRefs merge (rerun keeps history), and the Analyze
 * handoff payload builder (ids only — no embedded payloads).
 *
 * Pure: no fetch, no React, no DOM. The component layer (GcRunSheetSection)
 * consumes these; the probe accounting pin (D7) lives on the component.
 */
import { describe, expect, it } from 'vitest'
import {
  findLinkedSequences,
  entryRunTableRows,
  appendAnalysisRunRef,
  buildGcHandoff,
  gcHandoffUrlParam,
  parseGcHandoffParam,
  positionText,
  amountText,
  type Envelope,
  type EntryPayload,
  type RecordRef,
  type SequencePayload,
} from './gcRunSheetModel'

describe('findLinkedSequences (the D1 linking probe)', () => {
  const runId = 'RUN-gc-sheet-abc1'
  it('links a sequence by header runRef', () => {
    const seqs: Envelope<SequencePayload>[] = [
      {
        recordId: 'ISEQ-001',
        payload: {
          kind: 'instrument-sequence',
          id: 'ISEQ-001',
          title: 'Sheet',
          runRef: { kind: 'record', id: runId, type: 'run' },
          entryRefs: [],
        },
      },
      {
        recordId: 'ISEQ-002',
        payload: {
          kind: 'instrument-sequence',
          id: 'ISEQ-002',
          title: 'Other',
          entryRefs: [],
        },
      },
    ]
    const linked = findLinkedSequences(seqs, runId)
    expect(linked.map((s) => s.recordId)).toEqual(['ISEQ-001'])
  })

  it('links a sequence whose ENTRIES carry the runRef (header ref optional)', () => {
    // The entry runRef is REQUIRED by schema; the header runRef is optional.
    // The probe must check BOTH so a header-less sheet still links its run.
    const seqs: Envelope<SequencePayload>[] = [
      {
        recordId: 'ISEQ-003',
        payload: {
          kind: 'instrument-sequence',
          id: 'ISEQ-003',
          title: 'No header ref',
          entryRefs: [{ kind: 'record', id: 'ISEN-003-001', type: 'instrument-sequence-entry' }],
        },
      },
    ]
    const entryPayloads: Record<string, EntryPayload> = {
      'ISEN-003-001': { runRef: { kind: 'record', id: runId, type: 'run' } },
    }
    const linked = findLinkedSequences(seqs, runId, entryPayloads)
    expect(linked.map((s) => s.recordId)).toEqual(['ISEQ-003'])
  })

  it('renders NOTHING (zero links) when no sequence references the run — the DNA case', () => {
    const seqs: Envelope<SequencePayload>[] = [
      {
        recordId: 'ISEQ-999',
        payload: {
          kind: 'instrument-sequence',
          id: 'ISEQ-999',
          title: 'Unrelated',
          runRef: { kind: 'record', id: 'RUN-someone-else', type: 'run' },
          entryRefs: [],
        },
      },
    ]
    expect(findLinkedSequences(seqs, runId)).toEqual([])
  })

  it('keeps every linked sequence (multiple sheets may link one run)', () => {
    const a: Envelope<SequencePayload> = { recordId: 'ISEQ-A', payload: { runRef: { kind: 'record', id: runId, type: 'run' }, entryRefs: [] } }
    const b: Envelope<SequencePayload> = { recordId: 'ISEQ-B', payload: { runRef: { kind: 'record', id: runId, type: 'run' }, entryRefs: [] } }
    expect(findLinkedSequences([a, b], runId).map((s) => s.recordId)).toEqual(['ISEQ-A', 'ISEQ-B'])
  })
})

describe('entryRunTableRows (the full-column projection, bait #9)', () => {
  it('projects EVERY declared entry column incl. the *Uninterpreted / uninterpreted honesty arms', () => {
    const payload: EntryPayload = {
      id: 'ISEN-2026-0001-007',
      position: { vial: '101', tray: 'front' },
      sampleName: 'RES35077-4',
      dataFileName: 'RES35077-4.D',
      acquisitionStartedAt: '2026-10-23T10:08:18-05:00',
      dateTimeRaw: 'Method started 10:08:18 10/23/26',
      amount: { value: 10, unit: 'uL' },
      multiplier: 2,
      dilution: 0.5,
      istdNum: 1,
      istdAmountUninterpreted: 20,
      manualInjection: true,
      vendorMethodLabel: 'AOAC_FAME_NO_INJECTION.M',
      uninterpreted: { ECM: '3.41', 'unknown-col': 'x' },
      acquisitionPackageRef: { kind: 'record', id: 'ACQP-000001', type: 'acquisition-package' },
      analysisRunRefs: [
        { kind: 'record', id: 'ANR-000001', type: 'analysis-run' },
        { kind: 'record', id: 'ANR-000002', type: 'analysis-run' },
      ],
    }
    const rows = entryRunTableRows(payload)
    // The honesty arms: dimensioned amount AND unknown-unit amount coexist.
    expect(rows.get('amount.value')).toBe(10)
    expect(rows.get('amount.unit')).toBe('uL')
    // The uninterpreted map is preserved VERBATIM (bait #9: never drop).
    expect(rows.get('uninterpreted.ECM')).toBe('3.41')
    expect(rows.get('uninterpreted.unknown-col')).toBe('x')
    // position is a fixed-shape object: vial + tray survive as leaves.
    expect(rows.get('position.vial')).toBe('101')
    expect(rows.get('position.tray')).toBe('front')
    // The machine links + analysis-run history are data, not chrome.
    expect(rows.get('acquisitionPackageRef')).toBe('ACQP-000001')
    expect(rows.get('analysisRunRefs')).toEqual(['ANR-000001', 'ANR-000002'])
    // Plain scalars pass through.
    expect(rows.get('sampleName')).toBe('RES35077-4')
    expect(rows.get('manualInjection')).toBe(true)
  })

  it('amountText: dimensioned quantity reads "value unit"; unknown unit reads the raw number + a stated unknown', () => {
    expect(amountText({ value: 10, unit: 'uL' })).toBe('10 uL')
    // The *Uninterpreted arm: a bare number with NO faked unit.
    expect(amountText(undefined, 3.7)).toBe('3.7 (unit unknown)')
    expect(amountText(undefined, undefined)).toBe('—')
  })

  it('positionText: string positions and object positions both read', () => {
    expect(positionText('Vial 7')).toBe('Vial 7')
    expect(positionText({ vial: '101', tray: 'front' })).toBe('Vial 101 (front)')
    expect(positionText({ vial: '101' })).toBe('Vial 101')
    expect(positionText(undefined)).toBe('—')
  })
})

describe('appendAnalysisRunRef (rerun keeps history — bait #8)', () => {
  it('APPENDS the new ref and preserves every prior ref (never replaces)', () => {
    const existing: RecordRef[] = [
      { kind: 'record', id: 'ANR-000001', type: 'analysis-run' },
      { kind: 'record', id: 'ANR-000002', type: 'analysis-run' },
    ]
    const merged = appendAnalysisRunRef(existing, {
      kind: 'record',
      id: 'ANR-000003',
      type: 'analysis-run',
    })
    expect(merged.map((r) => r.id)).toEqual(['ANR-000001', 'ANR-000002', 'ANR-000003'])
    // The input array is NOT mutated (immutability for React state).
    expect(existing.map((r) => r.id)).toEqual(['ANR-000001', 'ANR-000002'])
  })

  it('dedupes a ref that is already present (uniqueItems on the schema)', () => {
    const existing: RecordRef[] = [{ kind: 'record', id: 'ANR-000001', type: 'analysis-run' }]
    const merged = appendAnalysisRunRef(existing, { kind: 'record', id: 'ANR-000001', type: 'analysis-run' })
    expect(merged.map((r) => r.id)).toEqual(['ANR-000001'])
  })

  it('treats an absent array as empty (first analyze starts the history)', () => {
    const merged = appendAnalysisRunRef(undefined, { kind: 'record', id: 'ANR-1', type: 'analysis-run' })
    expect(merged.map((r) => r.id)).toEqual(['ANR-1'])
  })
})

describe('buildGcHandoff (the Analyze payload — bait #10: ids only)', () => {
  it('carries revisionRef + pinned input ids + title + parameters — NEVER file bytes or payloads', () => {
    const payload = buildGcHandoff({
      title: 'FAME sheet run',
      revisionId: 'ANREV-000006',
      inputs: {
        signal: { kind: 'record', id: 'DREF-000101', type: 'data-reference' },
        package: { kind: 'record', id: 'DREF-000102', type: 'data-reference' },
      },
      parameters: { baseline_window_s: 20, peak_width_s: 5 },
    })
    expect(payload.title).toBe('FAME sheet run')
    expect(payload.revisionRef).toEqual({ kind: 'record', type: 'analysis-revision', id: 'ANREV-000006' })
    expect(payload.inputs).toEqual({
      signal: { kind: 'record', id: 'DREF-000101', type: 'data-reference' },
      package: { kind: 'record', id: 'DREF-000102', type: 'data-reference' },
    })
    expect(payload.parameters).toEqual({ baseline_window_s: 20, peak_width_s: 5 })
    // Frozen-input discipline: ids + declared parameters only.
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('contentHash')
    expect(serialized).not.toContain('bytes')
  })

  it('omits parameters when the form produced none (the NO_PARAMS decision)', () => {
    const payload = buildGcHandoff({
      title: 't',
      revisionId: 'ANREV-1',
      inputs: { signal: { kind: 'record', id: 'D', type: 'data-reference' } },
    })
    expect('parameters' in payload).toBe(false)
  })

  it('the URL round-trip carries ids only (through a real URLSearchParams, bait #10)', () => {
    const payload = buildGcHandoff({
      title: 'my sheet',
      revisionId: 'ANREV-9',
      inputs: { signal: { kind: 'record', id: 'DREF-1', type: 'data-reference' } },
    })
    // The model value is plain JSON; the URL LAYER (URLSearchParams) encodes
    // it. Prove the round-trip the way the router will read it back.
    const url = new URL('http://localhost/analysis')
    url.searchParams.set('gc', gcHandoffUrlParam(payload))
    const parsed = parseGcHandoffParam(url.searchParams.get('gc'))
    expect(parsed).not.toBeNull()
    expect(parsed!.title).toBe('my sheet')
    expect(parsed!.revisionRef.id).toBe('ANREV-9')
    expect(parsed!.inputs.signal.id).toBe('DREF-1')
  })

  it('parseGcHandoffParam refuses malformed values (never a crash)', () => {
    expect(parseGcHandoffParam('not-json')).toBeNull()
    expect(parseGcHandoffParam('[1,2]')).toBeNull()
    // Missing revisionId is not a valid handoff.
    expect(parseGcHandoffParam(JSON.stringify({ title: 'x' }))).toBeNull()
  })
})
