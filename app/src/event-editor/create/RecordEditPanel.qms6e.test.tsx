/**
 * QMS-6E D3b — the /record save payload (RED-first).
 *
 * Receipt (api/a-save-payload-replays.txt (b) + trail-H step 19): saving
 * /record/DOC-DEMO-SOP after only editing Title PUTs
 *   reviewerRef/approverRef -> 422 "Expected type: object"
 *   "/: must NOT have unevaluated properties"
 *
 * The empty ref widget must never put a display string in the payload;
 * the true empty value is ABSENT. And the save must not invent properties the
 * schema does not declare (controlled-document declares `id`, never
 * `recordId`; unevaluatedProperties: false).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getRecordEditorProjection: vi.fn(),
    updateRecord: vi.fn(),
    createPlannedRun: vi.fn(),
  },
}))

// Mock the taptab barrel the panel imports through. The editor handle is
// controllable per test via __qms6eTaptabHandle.setDoc, and serializeDocument
// is re-exported from the REAL module so the panel serializes for real.
vi.mock('../../editor/taptab', async () => {
  const actual = await vi.importActual<typeof import('../../editor/taptab/recordSerializer')>(
    '../../editor/taptab/recordSerializer',
  )
  return {
    ProjectionTapTabEditor: React.forwardRef((_props: unknown, ref: unknown) => {
      const holder = {
        doc: null as unknown,
        setDoc(d: unknown) {
          holder.doc = d
        },
        getEditor: () => ({ getJSON: () => holder.doc }),
      }
      ;(globalThis as { __qms6eTaptabHandle?: unknown }).__qms6eTaptabHandle = holder
      // Attach the handle to the forwarded ref so the panel's taptabRef works.
      if (ref && typeof ref === 'object') (ref as { current: unknown }).current = holder
      return null as never
    }),
    serializeDocument: actual.serializeDocument,
  }
})

import React from 'react'
import { apiClient } from '../../shared/api/client'
import { RecordEditPanel } from './RecordEditPanel'

// Reference the real serializer directly for the emission-contract test.
import * as realSerializer from '../../editor/taptab/recordSerializer'

// A fake editor handle for the panel's taptabRef: returns a doc whose fieldRows
// reproduce what the projection path ACTUALLY holds for an untouched record:
// empty refs carry the fieldRow default (null), untouched text carries the
// payload value.
const PAYLOAD: Record<string, unknown> = {
  kind: 'controlled-document',
  id: 'DOC-DEMO-SOP',
  title: 'DEMO GC-FID Standard Injection SOP',
  state: 'in_review',
  lifecycleId: 'document-controlled-signing',
  docType: 'sop',
  revision: 'Rev A (DEMO)',
  body: '<h2>DEMO</h2>',
  authorRef: { kind: 'record', type: 'user', id: 'USR-BRAD' },
}

const DOC_WITH_EDITED_TITLE: unknown = {
  type: 'doc',
  content: [
    {
      type: 'section',
      attrs: { title: 'Identity' },
      content: [
        { type: 'sectionHeading', content: [{ type: 'text', text: 'Identity' }] },
        { type: 'fieldRow', attrs: { path: '$.title', widget: 'text', label: 'Title', value: 'Edited QMS6E' } },
        { type: 'fieldRow', attrs: { path: '$.docType', widget: 'select', label: 'Document Type', value: 'sop' } },
      ],
    },
    {
      type: 'section',
      attrs: { title: 'Signers' },
      content: [
        { type: 'sectionHeading', content: [{ type: 'text', text: 'Signers' }] },
        { type: 'fieldRow', attrs: { path: '$.authorRef', widget: 'ref', label: 'Author', value: { kind: 'record', type: 'user', id: 'USR-BRAD' } } },
        // Untouched EMPTY refs — what the projection mapper gives a ref with no
        // stored value. The 422 in the receipt is this value reaching the PUT.
        { type: 'fieldRow', attrs: { path: '$.reviewerRef', widget: 'ref', label: 'Reviewer', value: null } },
        { type: 'fieldRow', attrs: { path: '$.approverRef', widget: 'ref', label: 'Approver', value: null } },
      ],
    },
  ],
}

// Simpler doc: what the emission-source fix must guarantee — the ref widget's
// true empty value never reaches the payload as a typed value at all.
function docWithRefDisplayEmpties(): unknown {
  return {
    type: 'doc',
    content: [
      {
        type: 'section',
        attrs: { title: 'Signers' },
        content: [
          { type: 'sectionHeading', content: [{ type: 'text', text: 'Signers' }] },
          { type: 'fieldRow', attrs: { path: '$.reviewerRef', widget: 'ref', label: 'Reviewer', value: '—' } },
        ],
      },
    ],
  }
}

const projection = {
  schemaId: 'controlled-document',
  recordId: 'DOC-DEMO-SOP',
  title: 'DEMO GC-FID Standard Injection SOP',
  blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
  slots: [{ id: 's1', path: '$.title', label: 'Title', widget: 'text' }],
  diagnostics: [],
}

describe('RecordEditPanel save — D3b write-back payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      recordId: 'DOC-DEMO-SOP',
      schemaId: 'controlled-document',
      payload: structuredClone(PAYLOAD),
    })
    ;(apiClient.getRecordEditorProjection as ReturnType<typeof vi.fn>).mockResolvedValue(projection)
    ;(apiClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({})
  })

  afterEach(() => cleanup())

  it('save payload carries NO empty/placeholder ref values (null, "" or "—") for reviewerRef/approverRef', async () => {
    // Make serializeDocument real but let us inject the editor doc.
    render(<RecordEditPanel recordId="DOC-DEMO-SOP" title="DEMO SOP" />)
    const saveBtn = await screen.findByTestId('record-edit-save')

    // Inject a fake editor into the panel's taptabRef via the editor mock.
    const handle = (globalThis as { __qms6eTaptabHandle?: unknown }).__qms6eTaptabHandle as
      | { setDoc: (d: unknown) => void }
      | undefined
    expect(handle).toBeTruthy()
    handle!.setDoc(DOC_WITH_EDITED_TITLE)

    fireEvent.click(saveBtn)

    await waitFor(() => expect(apiClient.updateRecord).toHaveBeenCalled())
    const [recordId, payload] = (apiClient.updateRecord as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(recordId).toBe('DOC-DEMO-SOP')

    // The serializer's job after the fix: an empty ref is ABSENT from the payload.
    expect(payload).not.toHaveProperty('reviewerRef')
    expect(payload).not.toHaveProperty('approverRef')

    // Real values survive.
    expect(payload.title).toBe('Edited QMS6E')
    expect(payload.authorRef).toEqual({ kind: 'record', type: 'user', id: 'USR-BRAD' })
    expect(payload.kind).toBe('controlled-document')
    expect(payload.id).toBe('DOC-DEMO-SOP')
    expect(payload.lifecycleId).toBe('document-controlled-signing')
  })

  it('save payload never carries a property the stored record does not have (no invented recordId on schemas that declare only id)', async () => {
    render(<RecordEditPanel recordId="DOC-DEMO-SOP" title="DEMO SOP" />)
    const saveBtn = await screen.findByTestId('record-edit-save')
    const handle = (globalThis as { __qms6eTaptabHandle?: unknown }).__qms6eTaptabHandle as
      | { setDoc: (d: unknown) => void }
      | undefined
    handle!.setDoc(DOC_WITH_EDITED_TITLE)

    fireEvent.click(saveBtn)
    await waitFor(() => expect(apiClient.updateRecord).toHaveBeenCalled())
    const [, payload] = (apiClient.updateRecord as ReturnType<typeof vi.fn>).mock.calls[0]

    // controlled-document has unevaluatedProperties:false and declares `id`,
    // never `recordId` — the old payload.recordId re-stamp 422s with
    // "must NOT have unevaluated properties".
    expect(payload).not.toHaveProperty('recordId')
  })

  it('serializeDocument itself must not write a display-placeholder or null ref value into the payload (value-emission contract)', () => {
    const out = realSerializer.serializeDocument(
      docWithRefDisplayEmpties() as never,
      structuredClone(PAYLOAD),
    )
    // The ref field's empty value must not exist as a typed value.
    const rv = (out as Record<string, unknown>).reviewerRef
    expect(rv === '—' || rv === null || rv === '').toBe(false)
  })
})
