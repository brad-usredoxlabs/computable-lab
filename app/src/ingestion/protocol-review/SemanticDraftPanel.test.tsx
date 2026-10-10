/**
 * W2-8 T2 — SemanticDraftPanel (spec §3 W2, §5 A2/A3/A4).
 *
 * The MEANT editor: TapTab over candidates[0].draft, semantic-evidence chips
 * that jump the PDF pane (onGotoPage(pageStart)), out-of-range anchors disabled
 * with a reason (bait 7), every branch/variant step visible unfiltered (A4),
 * and a Save that rides the applyProtocolEdit lock discipline (A3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../../shared/api/errors'
import { apiClient } from '../../shared/api/client'
import { SemanticDraftPanel } from './SemanticDraftPanel'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    updateRecord: vi.fn(),
  },
}))

vi.mock('../../editor/taptab/TapTabEditor', () => ({
  // Stand-in for the real projection editor: renders the data it was handed and
  // lets the test push an edit through onUpdate (the same contract the real
  // ProjectionTapTabEditor uses: (serialized, dirty)).
  ProjectionTapTabEditor: ({ data, onUpdate }: {
    data: Record<string, unknown>
    onUpdate?: (serialized: Record<string, unknown>, dirty?: boolean) => void
  }) => (
    <div data-testid="taptab-stub">
      <span data-testid="taptab-title">{String(data.title)}</span>
      <button type="button" data-testid="taptab-edit-title" onClick={() => onUpdate?.({ title: 'EDITED title' }, true)}>
        edit title
      </button>
      <button type="button" data-testid="taptab-noop-edit" onClick={() => onUpdate?.({ title: data.title }, true)}>
        no-op edit
      </button>
    </div>
  ),
}))

const mockClient = apiClient as unknown as {
  getRecord: ReturnType<typeof vi.fn>
  updateRecord: ReturnType<typeof vi.fn>
}

const XDR_ID = 'XDR-semantic-demo0001'
const CAN_ID = 'CAN-w28-demo'

function draftBody() {
  return {
    kind: 'protocol',
    recordId: `PRT-${CAN_ID}-semantic`,
    title: 'ZymoBIOMICS — semantic family draft',
    steps: [
      {
        stepId: 'step-lyse',
        label: 'Lyse samples',
        ordinal: 1,
        kind: 'other',
        intent: {
          semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-lyse' } },
          provenance: [
            { kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Sample prep' },
          ],
        },
      },
      {
        stepId: 'step-lyse-a',
        label: 'Lyse (variant a: bead beater)',
        ordinal: 2,
        kind: 'other',
        intent: {
          semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-beat' } },
          provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 4 }],
        },
      },
      {
        stepId: 'step-lyse-b',
        label: 'Lyse (variant b: freeze-thaw)',
        ordinal: 3,
        kind: 'other',
        intent: {
          semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-thaw' } },
          provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 40 }],
        },
      },
    ],
    branch_axes: [
      {
        axisId: 'lysis-method',
        label: 'Which lysis method?',
        conditions: [
          { id: 'bead-beater', label: 'Bead beater', predicate: {}, then_stepIds: ['step-lyse-a'] },
          { id: 'freeze-thaw', label: 'Freeze-thaw', predicate: {}, then_stepIds: ['step-lyse-b'] },
        ],
      },
    ],
  }
}

function xdrEnvelope() {
  return {
    recordId: XDR_ID,
    schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
    payload: {
      kind: 'extraction-draft',
      recordId: XDR_ID,
      source_artifact: { kind: 'file', id: 'VPDF-ABCDEF012345', locator: 'zymo.pdf' },
      candidates: [{ target_kind: 'protocol', draft: draftBody(), confidence: 0.9 }],
      status: 'pending_review',
    },
    meta: { kind: 'extraction-draft', contentSha: 'sha-current' },
  }
}

const projection = {
  schemaId: 'protocol',
  recordId: XDR_ID,
  title: 'Protocol',
  blocks: [],
  slots: [],
  diagnostics: [],
}

function renderPanel(overrides: Partial<Parameters<typeof SemanticDraftPanel>[0]> = {}) {
  const onGotoPage = vi.fn()
  const props = {
    xdrRecordId: XDR_ID,
    candidateIndex: 0,
    draft: draftBody(),
    sourcePageCount: 31,
    projection: projection as never,
    onGotoPage,
    ...overrides,
  }
  render(<SemanticDraftPanel {...props} />)
  return { onGotoPage }
}

beforeEach(() => {
  mockClient.getRecord.mockReset()
  mockClient.updateRecord.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SemanticDraftPanel — semantic evidence anchors (A2)', () => {
  it('renders one evidence chip per intent.provenance ref and a chip click jumps the PDF pane to pageStart', () => {
    const { onGotoPage } = renderPanel()
    const chips = screen.getAllByTestId(/^semantic-evidence-/)
    expect(chips.length).toBe(3)
    fireEvent.click(screen.getByTestId('semantic-evidence-step-lyse'))
    expect(onGotoPage).toHaveBeenCalledWith(2)
  })

  it('an anchor beyond the source page count is DISABLED and names the reason (bait 7)', () => {
    const { onGotoPage } = renderPanel()
    const chip = screen.getByTestId('semantic-evidence-step-lyse-b') as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    expect(chip.getAttribute('title')).toContain('beyond')
    fireEvent.click(chip)
    expect(onGotoPage).not.toHaveBeenCalled()
  })

  it('renders NO rung badge (OQ4/M6: no rung value is invented)', () => {
    renderPanel()
    const html = document.body.textContent ?? ''
    for (const rung of ['VENDOR', 'DERIVED', 'INFERRED_INVARIANT', 'LOCAL_REALIZATION']) {
      expect(html).not.toContain(rung)
    }
  })
})

describe('SemanticDraftPanel — family visibility (A4)', () => {
  it('shows EVERY branch/variant step unfiltered, plus the family questions as data', () => {
    renderPanel()
    expect(screen.getByText('Lyse (variant a: bead beater)')).toBeTruthy()
    expect(screen.getByText('Lyse (variant b: freeze-thaw)')).toBeTruthy()
    expect(screen.getByTestId('semantic-draft-branch-axes').textContent).toContain('Which lysis method?')
    expect(screen.getByTestId('semantic-draft-branch-axes').textContent).toContain('Bead beater')
    expect(screen.getByTestId('semantic-draft-branch-axes').textContent).toContain('Freeze-thaw')
  })

  it('offers NO question-asking control on the MEANT pane (asking lives at the realization entry)', () => {
    renderPanel()
    expect(screen.queryByTestId('branch-questions')).toBeNull()
    expect(document.body.querySelectorAll('input[type="radio"]').length).toBe(0)
  })
})

describe('SemanticDraftPanel — save rides the XDR (A3)', () => {
  it('Save PUTs the XDR with expectedSha and ONLY candidates[0].draft changed', async () => {
    mockClient.getRecord.mockResolvedValue(xdrEnvelope())
    mockClient.updateRecord.mockResolvedValue({ record: xdrEnvelope(), validation: { valid: true }, lint: { valid: true } })
    renderPanel()

    fireEvent.click(screen.getByTestId('taptab-edit-title'))
    fireEvent.click(screen.getByTestId('semantic-draft-save'))

    await waitFor(() => expect(mockClient.updateRecord).toHaveBeenCalledTimes(1))
    const [id, payload, options] = mockClient.updateRecord.mock.calls[0]!
    expect(id).toBe(XDR_ID)
    expect(options).toEqual({ expectedSha: 'sha-current' })
    const candidates = (payload as Record<string, unknown>).candidates as Record<string, unknown>[]
    expect((candidates[0]!.draft as Record<string, unknown>).title).toBe('EDITED title')
    // provenance survives the edit byte-for-byte (bait 5)
    const steps = (candidates[0]!.draft as Record<string, unknown>).steps as Record<string, unknown>[]
    expect(steps[0]!.intent).toEqual(draftBody().steps[0]!.intent)
    expect((payload as Record<string, unknown>).source_artifact).toEqual(xdrEnvelope().payload.source_artifact)
    await waitFor(() => expect(screen.getByTestId('semantic-draft-note').textContent).toContain('Saved'))
  })

  it('a no-op save writes nothing', async () => {
    mockClient.getRecord.mockResolvedValue(xdrEnvelope())
    renderPanel()
    // Dirty the local copy with an edit that lands the SAME payload.
    fireEvent.click(screen.getByTestId('taptab-noop-edit'))
    fireEvent.click(screen.getByTestId('semantic-draft-save'))
    await waitFor(() => expect(mockClient.getRecord).toHaveBeenCalledTimes(1))
    expect(mockClient.updateRecord).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('semantic-draft-note').textContent).toContain('Nothing to save'))
  })

  it('a stale 409 shows the reload message verbatim and never retries', async () => {
    mockClient.getRecord.mockResolvedValue(xdrEnvelope())
    mockClient.updateRecord.mockRejectedValue(
      new ApiError({ status: 409, code: 'CONFLICT', message: 'SHA mismatch: expected sha-current, found sha-newer' }),
    )
    renderPanel()
    fireEvent.click(screen.getByTestId('taptab-edit-title'))
    fireEvent.click(screen.getByTestId('semantic-draft-save'))
    await waitFor(() => expect(screen.getByTestId('semantic-draft-error').textContent).toContain(
      'Someone changed this protocol - reload and try again.',
    ))
    expect(mockClient.updateRecord).toHaveBeenCalledTimes(1)
  })

  it('a 422 lint refusal shows the server machine-readable body verbatim', async () => {
    mockClient.getRecord.mockResolvedValue(xdrEnvelope())
    mockClient.updateRecord.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'PROMOTION_LINT_BLOCKED',
        message: 'Promotion refused by lint rules',
        details: { lint_findings: [{ rule_id: 'xdr-promote-requires-resolvable-target', severity: 'error', message: 'draft target is not resolvable', paths: ['candidates[0]'] }] },
      }),
    )
    renderPanel()
    fireEvent.click(screen.getByTestId('taptab-edit-title'))
    fireEvent.click(screen.getByTestId('semantic-draft-save'))
    await waitFor(() => expect(screen.getByTestId('semantic-draft-error').textContent).toContain('xdr-promote-requires-resolvable-target'))
  })

  it('Save is disabled until something is dirty (no blind write)', () => {
    renderPanel()
    expect((screen.getByTestId('semantic-draft-save') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('taptab-edit-title'))
    expect((screen.getByTestId('semantic-draft-save') as HTMLButtonElement).disabled).toBe(false)
  })
})
