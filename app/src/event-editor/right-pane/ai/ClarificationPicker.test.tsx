import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ClarificationPicker, answerFromMention } from './ClarificationPicker'
import type { AiClarificationRequest } from '../../../types/ai'
import type { SlashSuggestion } from '../../../shared/taptab/slashMenu/types'

// Stub the slash-menu resolvers so we control the suggestions deterministically.
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
  // L2-SUITE-A-uifix2 FIX2 [D5]: the product now reads the shared mint-row
  // label helper from this module — the mock must export it or the render
  // throws (undefined is not a function) on ANY card.
  mintLocalTermLabel: (q: string) => `Create local term "${q}"`,
}))

// Ground ontology picks to a local record (the real one hits the API).
const groundMaterialRef = vi.fn()
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))

const materialRequest: AiClarificationRequest = {
  id: 'clar-1',
  kind: 'material',
  prompt: 'Which material for A3?',
  menuProvider: '/m',
  query: 'CHO',
  options: [],
}

/**
 * L2-SUITE-A-uifix2 [C]: the picker is now OPEN-ON-REQUEST (the re-gate's
 * auto-open-on-mount was the stacking defect). These behavior pins keep their
 * intent (resolver runs seeded, picks ground + route, empty-state copy, new
 * question re-searches) — they just OPEN the picker first, the way a
 * scientist does (click the answer field).
 */
function openPickerFor(container: HTMLElement, text?: string) {
  const input = container.querySelector(
    'input.message-log__clarification-search',
  ) as HTMLInputElement
  if (!input) throw new Error('no picker input in container')
  fireEvent.click(input)
  if (text !== undefined) {
    // A SEPARATE change (next tick) so the open + query land and the resolver
    // runs for the typed text (not just the seeded query).
    fireEvent.change(input, { target: { value: text } })
  }
}

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  groundMaterialRef.mockReset()
})

describe('answerFromMention', () => {
  it('maps a workspace material record to a record ref + token', () => {
    const answer = answerFromMention(materialRequest, {
      type: 'material', entityKind: 'material-spec', id: 'MAT-cho-1', label: 'CHO cells',
    })
    expect(answer).toEqual({
      requestId: 'clar-1',
      label: 'CHO cells',
      mentionToken: '[[material-spec:MAT-cho-1|CHO cells]]',
      ref: { kind: 'record', id: 'MAT-cho-1', type: 'material-spec', label: 'CHO cells' },
    })
  })

  it('maps an ontology CURIE hit to an ontology ref', () => {
    const answer = answerFromMention(materialRequest, {
      type: 'material', entityKind: 'material', id: 'CVCL:0213', label: 'CHO-K1',
    })
    expect(answer?.ref).toEqual({ kind: 'ontology', id: 'CVCL:0213', label: 'CHO-K1' })
    expect(answer?.mentionToken).toBe('[[material:CVCL:0213|CHO-K1]]')
  })

  it('maps a labware mention', () => {
    const answer = answerFromMention(
      { ...materialRequest, kind: 'labware', menuProvider: '/l' },
      { type: 'labware', id: 'lbw-1', label: 'Plate 1' },
    )
    expect(answer).toEqual({
      requestId: 'clar-1',
      label: 'Plate 1',
      mentionToken: '[[labware:lbw-1|Plate 1]]',
      ref: { kind: 'labware', id: 'lbw-1', label: 'Plate 1' },
    })
  })
})

describe('ClarificationPicker', () => {
  const hit: SlashSuggestion = {
    key: 'material-spec:MAT-cho-1',
    label: 'CHO cells',
    badge: 'Concept',
    mention: { type: 'material', entityKind: 'material-spec', id: 'MAT-cho-1', label: 'CHO cells' },
  }

  it('runs the material resolver seeded with the request query and routes a pick to onPick', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={onPick} />)

    // seeded query
    expect((screen.getByPlaceholderText(/Search materials/i) as HTMLInputElement).value).toBe('CHO')
    // open-on-request: the popover pass runs when the picker is opened. The
    // OQ3 mount pass (bounded, popover-closed) already ran with the seeded
    // query on mount — the POPOVER pass is the last call, still seeded.
    openPickerFor(container)
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalled())
    const calls = resolveMaterial.mock.calls
    expect(calls[calls.length - 1][0]).toBe('CHO')

    // The POPOVER row (scoped — the top-3 button above it carries the same
    // label; this test is about the open listbox, not the buttons).
    const row = await new Promise<HTMLElement>((resolve) => {
      void waitFor(async () => {
        resolve(within(screen.getByTestId('clarification-popover')).getByText('CHO cells'))
      })
    })
    fireEvent.mouseDown(row)
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    expect(onPick.mock.calls[0][0]).toMatchObject({
      requestId: 'clar-1',
      mentionToken: '[[material-spec:MAT-cho-1|CHO cells]]',
    })
    expect(groundMaterialRef).not.toHaveBeenCalled() // local record needs no grounding
  })

  it('grounds an ontology-term pick to a local record before answering (fixes the re-clarify loop)', async () => {
    const ontologyHit: SlashSuggestion = {
      key: 'ontology:XCO:0000988',
      label: "Dulbecco's Modified Eagle's Medium",
      badge: 'XCO',
      mention: { type: 'material', entityKind: 'material', id: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium" },
    }
    resolveMaterial.mockResolvedValue([ontologyHit])
    groundMaterialRef.mockResolvedValue({ kind: 'record', id: 'MAT-dmem', type: 'material', label: 'DMEM (local)' })
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={onPick} />)
    openPickerFor(container)

    // The POPOVER row (scoped — the top-3 button carries the same label, and
    // it is a click affordance, not the popover row under test).
    const row = await new Promise<HTMLElement>((resolve) => {
      void waitFor(async () => {
        resolve(within(screen.getByTestId('clarification-popover')).getByText("Dulbecco's Modified Eagle's Medium"))
      })
    })
    fireEvent.mouseDown(row)
    await waitFor(() => expect(onPick).toHaveBeenCalled())
    expect(groundMaterialRef).toHaveBeenCalledWith({ kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: "Dulbecco's Modified Eagle's Medium" })
    expect(onPick.mock.calls[0][0]).toEqual({
      requestId: 'clar-1',
      label: 'DMEM (local)',
      mentionToken: '[[material:MAT-dmem|DMEM (local)]]',
      ref: { kind: 'record', id: 'MAT-dmem', type: 'material', label: 'DMEM (local)' },
    })
  })

  it('awaits the mint affordance (resolveMention) before answering', async () => {
    const mintHit: SlashSuggestion = {
      key: 'mint:CHO',
      label: 'Create local term "CHO"',
      badge: 'New',
      pinBottom: true,
      mention: { type: 'material', entityKind: 'material', id: '', label: 'CHO' },
      resolveMention: vi.fn().mockResolvedValue({
        type: 'material', entityKind: 'material', id: 'MAT-minted', label: 'CHO',
      }),
    }
    resolveMaterial.mockResolvedValue([mintHit])
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={materialRequest} onPick={onPick} />)
    openPickerFor(container)

    const row = await screen.findByText('Create local term "CHO"')
    fireEvent.mouseDown(row)
    await waitFor(() => expect(onPick).toHaveBeenCalled())
    expect(onPick.mock.calls[0][0].ref).toEqual({ kind: 'record', id: 'MAT-minted', type: 'material', label: 'CHO' })
  })

  it('maps an equipment mention', () => {
    const answer = answerFromMention(
      { ...materialRequest, kind: 'equipment', menuProvider: '/e' },
      { type: 'equipment', id: 'EQP-reader-1', label: 'Plate reader' },
    )
    expect(answer).toEqual({
      requestId: 'clar-1',
      label: 'Plate reader',
      mentionToken: '[[equipment:EQP-reader-1|Plate reader]]',
      ref: { kind: 'record', id: 'EQP-reader-1', type: 'equipment', label: 'Plate reader' },
    })
  })

  it('uses the labware resolver for /l clarifications', async () => {
    resolveLabware.mockResolvedValue([])
    const { container } = render(
      <ClarificationPicker
        request={{ ...materialRequest, kind: 'labware', menuProvider: '/l', query: '' }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.getByPlaceholderText(/Search labware/i)).toBeTruthy()
    openPickerFor(container)
    await waitFor(() => expect(resolveLabware).toHaveBeenCalled())
    expect(resolveMaterial).not.toHaveBeenCalled()
  })


  it('uses the equipment resolver for /e clarifications', async () => {
    resolveEquipment.mockResolvedValue([])
    const { container } = render(
      <ClarificationPicker
        request={{ ...materialRequest, kind: 'equipment', menuProvider: '/e', query: 'reader' }}
        onPick={vi.fn()}
      />,
    )
    expect(screen.getByPlaceholderText(/Search equipment/i)).toBeTruthy()
    openPickerFor(container)
    await waitFor(() => expect(resolveEquipment).toHaveBeenCalled())
    expect(resolveMaterial).not.toHaveBeenCalled()
    expect(resolveLabware).not.toHaveBeenCalled()
  })
})

describe('mint empty-state copy only appears where a mint floor actually exists (ANSWER-SURFACE-1 FIX1 D1)', () => {
  // The mint row (`mint:<q>`, resolvers.ts:67-92) is emitted by resolveMaterial
  // ONLY — resolveLabware/resolveEquipment emit none. So a '/l' or '/e' card
  // with a non-empty query and zero hits must NOT invite the scientist to mint
  // (advc-ANSWERSURFACE1-c1 D1: dead-end affordance copy).
  const MINT_COPY = 'No matches — keep typing to mint a local term'

  it('a /l card with a non-empty query and zero resolver hits shows plain "No matches", never the mint-inviting copy', async () => {
    resolveLabware.mockResolvedValue([])
    const { container } = render(
      <ClarificationPicker
        request={{ ...materialRequest, id: 'clar-l-1', kind: 'general', menuProvider: '/l', query: 'microcentrifuge tube' }}
        onPick={vi.fn()}
      />,
    )
    openPickerFor(container)
    await waitFor(() => expect(resolveLabware).toHaveBeenCalled())
    expect(await screen.findByText('No matches')).toBeTruthy()
    expect(screen.queryByText(MINT_COPY)).toBeNull()
  })

  it('a /e card with a non-empty query and zero resolver hits shows plain "No matches", never the mint-inviting copy', async () => {
    resolveEquipment.mockResolvedValue([])
    const { container } = render(
      <ClarificationPicker
        request={{ ...materialRequest, id: 'clar-e-1', kind: 'general', menuProvider: '/e', query: 'plate reader' }}
        onPick={vi.fn()}
      />,
    )
    openPickerFor(container)
    await waitFor(() => expect(resolveEquipment).toHaveBeenCalled())
    expect(await screen.findByText('No matches')).toBeTruthy()
    expect(screen.queryByText(MINT_COPY)).toBeNull()
  })

  it('the /m material card KEEPS the mint-inviting copy (the mint floor row exists there)', async () => {
    resolveMaterial.mockResolvedValue([])
    const { container } = render(
      <ClarificationPicker
        request={{ ...materialRequest, id: 'clar-m-1', materialLayer: 'material' }}
        onPick={vi.fn()}
      />,
    )
    openPickerFor(container)
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalled())
    expect(await screen.findByText(MINT_COPY)).toBeTruthy()
  })

  it('a layer-scoped /m card (aliquot) keeps plain "No matches" — minting is never an answer to "which aliquot?"', async () => {
    resolveMaterial.mockResolvedValue([])
    const { container } = render(
      <ClarificationPicker
        request={{ ...materialRequest, id: 'clar-m-2', materialLayer: 'aliquot' }}
        onPick={vi.fn()}
      />,
    )
    openPickerFor(container)
    await waitFor(() => expect(resolveMaterial).toHaveBeenCalled())
    expect(await screen.findByText('No matches')).toBeTruthy()
    expect(screen.queryByText(MINT_COPY)).toBeNull()
  })
})

describe('a NEW question must not show the PREVIOUS material’s options', () => {
  // Brad (2026-09-20): "add 1 million HepG2 cells" — the reasoning was right, but
  // every option in the picker was about clofibrate, the material from the
  // previous question. The picker seeded its query/items once and its search
  // effect did not depend on the request, so a reused instance kept the stale
  // list until the user typed.
  const clofibrateRow: SlashSuggestion = {
    key: 'material-spec:MSP-CLOF',
    label: '1 mM Clofibrate in DMSO',
    badge: 'Formulation',
    mention: { type: 'material', entityKind: 'material-spec', id: 'MSP-CLOF', label: '1 mM Clofibrate in DMSO' },
  }
  const hepg2Row: SlashSuggestion = {
    key: 'material:MAT-HEPG2',
    label: 'HepG2',
    badge: 'Ontology',
    mention: { type: 'material', entityKind: 'material', id: 'MAT-HEPG2', label: 'HepG2' },
  }

  it('re-searches for the new request instead of keeping the old rows', async () => {
    resolveMaterial.mockImplementation(async (q: string) =>
      String(q).toLowerCase().includes('clofibrate') ? [clofibrateRow] : [hepg2Row],
    )
    const clofibrateRequest: AiClarificationRequest = {
      id: 'clar-1',
      kind: 'material',
      prompt: 'Which material should be added to A2?',
      menuProvider: '/m',
      query: 'clofibrate',
      options: [],
      materialLayer: 'material',
    }
    // The PREVIOUS question: a stateful parent (QuestionsPanel) reuses this
    // component for the next question rather than remounting it.
    const { container, rerender } = render(<ClarificationPicker request={clofibrateRequest} onPick={vi.fn()} />)
    openPickerFor(container)
    await waitFor(() => expect(screen.getByText('1 mM Clofibrate in DMSO')).toBeTruthy())

    const hepg2Request: AiClarificationRequest = {
      id: 'clar-2',
      kind: 'material',
      prompt: 'Which material should be added to A2?',
      menuProvider: '/m',
      query: 'HepG2',
      options: [],
      materialLayer: 'material',
    }
    rerender(<ClarificationPicker request={hepg2Request} onPick={vi.fn()} />)
    // A new question (new id) starts CLOSED; open it to re-search.
    openPickerFor(container, 'HepG2')

    await waitFor(() => expect(screen.getByText('HepG2')).toBeTruthy())
    // …and the previous material is gone, not merged alongside it.
    expect(screen.queryByText('1 mM Clofibrate in DMSO')).toBeNull()
  })
});

describe('a material question with no words does not show another material', () => {
  // Observed live 2026-09-20: "Which material should be added to A2?" (no material
  // named) rendered clofibrate formulations — the previous question's material —
  // because the /m resolver ran with an empty query and listed the workspace.
  it('does not call the material resolver when the question names no material', async () => {
    render(
      <ClarificationPicker
        request={{ ...materialRequest, id: 'material-9', prompt: 'Which material should be added to A2?', query: '' }}
        onPick={vi.fn()}
      />,
    )
    await new Promise((r) => setTimeout(r, 250))
    expect(resolveMaterial).not.toHaveBeenCalled()
  })

  it('still lets a labware question browse an empty query — that IS the answer', async () => {
    // TEST-HYGIENE (fix1 D5): the resolver must return a SETTLED promise. The
    // product's `.then` (ClarificationPicker.tsx:308) reads the resolved rows;
    // an unimplemented mock returns `undefined`, so the debounced callback's
    // `resolver(...).then` throws `Cannot read properties of undefined (reading
    // 'then')` after the test body ends (vitest prints "Unhandled Errors ... may
    // cause false positive tests"). Give the mock a settled value and flush the
    // 150ms debounce + the `.then` microtask so the promise chain settles
    // WITHIN the test while the mock is still valid. The product `.then` path
    // is untouched (pre-existing).
    resolveLabware.mockResolvedValue([])
    const { container } = render(
      <ClarificationPicker
        request={{ ...materialRequest, kind: 'labware', menuProvider: '/l', query: '' }}
        onPick={vi.fn()}
      />
    )
    openPickerFor(container)
    await waitFor(() => expect(resolveLabware).toHaveBeenCalled())
    // Let the debounced resolver's promise chain settle (past the 150ms debounce
    // + the `.then` microtask) BEFORE afterEach's cleanup() unmount and
    // mockReset() — so no `.then` fires against a reset mock / unmounted state.
    await new Promise((r) => setTimeout(r, 250))
    expect(resolveLabware).toHaveBeenCalled()
  })

  /**
   * L2-SUITE-A-uifix2 FIX3 (advc1 defect 4, MINOR) — the mint row's mandate
   * includes the "rows empty" precondition: a card that carries candidate
   * OPTIONS does not need (and must not advertise) the mint affordance.
   * Pre-fix, showMintRow never looked at request.options, so a card with
   * allowCreateLocal + a seeded query + TWO options still rendered the
   * visible mint row (the reviewer's probe: MINT_ROW_WITH_2_OPTIONS=true) —
   * the duplicate-mint temptation the criterion exists to prevent (a
   * candidate row answers the question without a new local term).
   */
  it('hides the mint row when the question carries CANDIDATE options (rows non-empty — a candidate answers without a mint)', () => {
    // allowCreateLocal true + seeded query + TWO server options: the card's
    // own rows answer the question, so the create-local affordance is dead
    // chrome (and a duplicate-mint temptation) — the row must be ABSENT.
    resolveMaterial.mockResolvedValue([])
    const request: AiClarificationRequest = {
      ...materialRequest,
      id: 'clar-mint-rows',
      allowCreateLocal: true,
      options: [
        { id: 'opt-1', label: 'CHO cells (vial A)' },
        { id: 'opt-2', label: 'CHO cells (vial B)' },
      ],
    }
    render(<ClarificationPicker request={request} onPick={vi.fn()} />)
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
  })
})

/**
 * L2-CLARIFY-PICKER-1 (P3) RED — the top-three ranked candidates render as
 * inline buttons under the question (one click answers the card), the
 * `None of these — search…` escape hatch opens the EXISTING popover (the
 * single-open store is untouched), and the mount pass is BOUNDED +
 * POPOVER-CLOSED (spec OQ3 ruling: it fetches candidates for the buttons only;
 * it must NOT open the picker — the uifix2 single-open pins above stay green).
 */
const top3Request: AiClarificationRequest = {
  id: 'clar-t3',
  kind: 'material',
  prompt: 'The draft names "DMEM" — which record? (ambiguous-noun)',
  menuProvider: '/m',
  query: 'DMEM',
  options: [],
}

describe('ClarificationPicker — L2-CLARIFY-PICKER-1 P3: top-3 inline buttons (RED)', () => {
  const hits: SlashSuggestion[] = [
    {
      key: 'material:MAT-dmem-ykg0', label: 'DMEM', badge: 'Concept',
      mention: { type: 'material', entityKind: 'material', id: 'MAT-dmem-ykg0', label: 'DMEM' },
    },
    {
      key: 'material-spec:MSP-DRAFT-EVG_CELLROX-01', label: 'DMEM + FBS', badge: 'Composition',
      mention: { type: 'material', entityKind: 'material-spec', id: 'MSP-DRAFT-EVG_CELLROX-01', label: 'DMEM + FBS' },
    },
    {
      key: 'material:MAT-thermo-dmem-1vq1', label: 'Thermo DMEM', badge: 'Concept',
      mention: { type: 'material', entityKind: 'material', id: 'MAT-thermo-dmem-1vq1', label: 'Thermo DMEM' },
    },
    {
      key: 'material:MAT-dmemhepg2-1a2b', label: 'DMEMHepG2', badge: 'Concept',
      mention: { type: 'material', entityKind: 'material', id: 'MAT-dmemhepg2-1a2b', label: 'DMEMHepG2' },
    },
  ]

  it('renders ≤3 inline candidate buttons under the question + the search escape hatch; the popover stays CLOSED on mount', async () => {
    resolveMaterial.mockResolvedValue(hits)
    const { container } = render(<ClarificationPicker request={top3Request} onPick={vi.fn()} />)
    // One click answers the card: the top THREE ranked candidates as buttons
    // (the row's accessible name carries its badge word, so the LABEL span is
    // asserted inside each row).
    const rows = await screen.findAllByTestId('clarification-top3-row')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText('DMEM')).toBeTruthy()
    expect(within(rows[1]!).getByText('DMEM + FBS')).toBeTruthy()
    expect(within(rows[2]!).getByText('Thermo DMEM')).toBeTruthy()
    // The FOURTH candidate is not inlined (top-three only).
    expect(screen.queryByText('DMEMHepG2')).toBeNull()
    // Escape hatch: the existing popover, still open-on-request.
    expect(screen.getByTestId('clarification-top3-search')).toBeTruthy()
    expect(screen.getByText('None of these — search…')).toBeTruthy()
    // The mount pass must NOT have opened the picker (single-open invariant:
    // the popover is open-on-request only — the uifix2 stacking defect).
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(screen.queryByTestId('clarification-popover')).toBeNull()
  })

  it('a top-3 button answers the card through onPick with the candidate\'s mention (one click, no popover)', async () => {
    resolveMaterial.mockResolvedValue(hits)
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={top3Request} onPick={onPick} />)
    const rows = await screen.findAllByTestId('clarification-top3-row')
    fireEvent.click(rows[0]!)
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    const answer = onPick.mock.calls[0][0] as { mentionToken?: string; ref?: unknown }
    expect(answer.mentionToken).toBe('[[material:MAT-dmem-ykg0|DMEM]]')
    expect(answer.ref).toEqual({ kind: 'record', id: 'MAT-dmem-ykg0', type: 'material', label: 'DMEM' })
    // The popover was never involved.
    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('the mount pass is a SINGLE bounded, non-UI resolver call (no onUpdate) with an AbortSignal aborted on unmount (OQ3)', async () => {
    let passCtx: { signal?: AbortSignal; onUpdate?: unknown } = {}
    // Never settles: the pass is still in flight when the card unmounts, so
    // the abort is observable.
    resolveMaterial.mockImplementation((_q: string, c: unknown) => {
      passCtx = c as typeof passCtx
      return new Promise<SlashSuggestion[]>(() => {})
    })
    const view = render(<ClarificationPicker request={top3Request} onPick={vi.fn()} />)
    // Exactly ONE resolver pass on mount (the OQ3 top-3 source), seeded noun.
    await new Promise((r) => setTimeout(r, 50))
    expect(resolveMaterial).toHaveBeenCalledTimes(1)
    expect(resolveMaterial.mock.calls[0][0]).toBe('DMEM')
    // NON-UI: the pass carries no streaming onUpdate (it feeds buttons only)
    // and carries an AbortSignal (a card that unmounts mid-fetch drops it).
    expect(passCtx.onUpdate).toBeUndefined()
    expect(passCtx.signal).toBeInstanceOf(AbortSignal)
    expect(passCtx.signal!.aborted).toBe(false)
    view.unmount()
    expect(passCtx.signal!.aborted).toBe(true)
    // …and still no open popover (the mount pass is non-UI).
    expect(document.querySelectorAll('[role="listbox"]').length).toBe(0)
  })
})
