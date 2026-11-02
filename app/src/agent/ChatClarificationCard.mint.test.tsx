/**
 * L2-CLARIFY-CARD-1 (Change 2) RED — W9 copy/affordance agreement, W14/P5 mint
 * honesty (the label is the prompt's noun, not the filter), W7 single-source
 * mint (the call mints EXACTLY the previewed label), P5 answered row names the
 * new record id.
 *
 * One root cause (spec): the row's label and the row's existence were computed
 * from the LIVE FILTER BOX while the honest sentence describes a durable write
 * of the PROMPT's noun. The observed W7 defect: `[Local] 1 mM clofibrate1 mM
 * Clofibrate in DMSO` (filter + seed joined into a stored name, r3-14/19/24).
 *
 * These drive the REAL ClarificationPicker (resolvers + apiClient mocked) so
 * the assertions are on the product's own predicate, label state, and call.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ClarificationPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
import { mintLocalTermLabel } from '../shared/taptab/slashMenu/resolvers'
import { clarificationAnswerPrompt } from '../shared/hooks/clarificationAnswerPrompt'
import { ChatLog } from './ChatLog'

const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../shared/taptab/slashMenu/resolvers', async () => {
  // The REAL mintLocalTermLabel (one source — the row's preview, the popover
  // floor, and the mint call's label all render/derive from it).
  const actual = await vi.importActual<typeof import('../shared/taptab/slashMenu/resolvers')>(
    '../shared/taptab/slashMenu/resolvers',
  )
  return {
    resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
    resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
    resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
    mintLocalTermLabel: actual.mintLocalTermLabel,
  }
})

const mintLocalTerm = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: { mintLocalTerm: (a: string, b: string, c?: string) => mintLocalTerm(a, b, c) },
}))

const groundMaterialRef = vi.fn().mockResolvedValue({ kind: 'ontology' })
vi.mock('../event-editor/right-pane/lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  mintLocalTerm.mockReset()
  groundMaterialRef.mockReset()
})

const SEARCH = 'input.message-log__clarification-search'

describe('L2-CLARIFY-CARD-1 (Change 2): mint honesty (W9/W14/W7/P5)', () => {
  it('W7 red case: typing in the SEARCH box never feeds the mint — the create button mints the SEED (the previewed label), never a seed+filter concatenation', async () => {
    const seed = '1 mM Clofibrate in DMSO'
    const request: AiClarificationRequest = {
      id: 'req-clof',
      kind: 'material',
      prompt: 'Which material is the clofibrate stock?',
      entityType: 'material',
      menuProvider: '/m',
      query: seed,
      options: [],
      allowCreateLocal: true,
    }
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-clof-1', label: seed, iri: 'urn:cl:local:MAT-clof-1' })
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={request} onPick={onPick} />)

    // The row previews the EXACT label (seeded from the prompt's noun) with the
    // one-source sentence — before any click.
    const labelInput = () => screen.getByTestId('clarification-mint-label') as HTMLInputElement
    expect(labelInput().value).toBe(seed)
    expect(screen.getByText(mintLocalTermLabel(seed))).toBeTruthy()

    // The user types the FILTER into the search box (it opens on first typing),
    // then closes the popover (Escape) — the filter must NOT have changed the
    // minted label (W14: the label never tracks the filter).
    const search = container.querySelector(SEARCH) as HTMLInputElement
    fireEvent.change(search, { target: { value: '1 mM clofibrate' } })
    await waitFor(() => expect(screen.getByTestId('clarification-popover')).toBeTruthy())
    fireEvent.keyDown(search, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('clarification-popover')).toBeNull())
    // The row is back (popover closed) and its label is STILL the seed — the
    // filter keystrokes never touched it.
    expect(labelInput().value).toBe(seed)
    expect(screen.getByText(mintLocalTermLabel(seed))).toBeTruthy()

    // Click create: the call mints EXACTLY the previewed label — the seed.
    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))

    expect(mintLocalTerm).toHaveBeenCalledTimes(1)
    const args = mintLocalTerm.mock.calls[0]
    expect(args[0]).toBe('material')
    // W7: the argument is the SEED (the previewed label) — never the filter,
    // never seed+filter or filter+seed (the observed r3-14/19/24 shape).
    const seedFilter = `${seed}1 mM clofibrate`
    const filterSeed = `1 mM clofibrate${seed}`
    expect(args[1]).toBe(seed)
    expect(args[1]).not.toBe(seedFilter)
    expect(args[1]).not.toBe(filterSeed)
    expect(args[1]).not.toBe('1 mM clofibrate')
    // The preview string and the argument are the SAME source: the rendered
    // preview equals mintLocalTermLabel(argument).
    expect(screen.getByText(mintLocalTermLabel(String(args[1])))).toBeTruthy()
  })

  it('W14 seed rule: the search box never changes the minted label; editing the mint LABEL input does, and the preview follows before the click', async () => {
    const request: AiClarificationRequest = {
      id: 'req-edit',
      kind: 'material',
      prompt: 'Which material is the solvent?',
      entityType: 'material',
      menuProvider: '/m',
      query: 'Solvent A',
      options: [],
      allowCreateLocal: true,
    }
    resolveMaterial.mockResolvedValue([])
    const onPick = vi.fn()
    const { container } = render(<ClarificationPicker request={request} onPick={onPick} />)

    const labelInput = () => screen.getByTestId('clarification-mint-label') as HTMLInputElement
    // The preview follows the label input BEFORE the click (one source): edit
    // the label, the one-source sentence re-renders immediately.
    fireEvent.change(labelInput(), { target: { value: 'Solvent A (fresh)' } })
    expect(screen.getByText(mintLocalTermLabel('Solvent A (fresh)'))).toBeTruthy()
    expect(screen.queryByText(mintLocalTermLabel('Solvent A'))).toBeNull()

    // The call mints the EDITED label (the previewed one), not the seed, not
    // the filter.
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-solv-1', label: 'Solvent A (fresh)', iri: 'urn:cl:local:MAT-solv-1' })
    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    expect(mintLocalTerm.mock.calls[0]?.[1]).toBe('Solvent A (fresh)')
    expect(container.querySelector(SEARCH)).toBeTruthy() // the search box is a no-op on the label
  })

  it('W9 copy/affordance agreement, both directions (one predicate — copy and affordance cannot disagree): seed-less + empty filter shows NO mint row and a search-only placeholder; a seeded fact shows the row whenever the placeholder promises it', () => {
    // (a) The empty-seed card (request.query absent — the "of what?" fact) +
    // empty filter: no mint row AND the placeholder promises search only.
    const noSeed: AiClarificationRequest = {
      id: 'req-noseed',
      kind: 'material',
      prompt: 'Which material should be added to A2?',
      entityType: 'material',
      menuProvider: '/m',
      options: [],
      allowCreateLocal: true,
    }
    resolveMaterial.mockResolvedValue([])
    const { unmount } = render(<ClarificationPicker request={noSeed} onPick={vi.fn()} />)
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
    const placeholderNoSeed = (screen.getByPlaceholderText(/Search materials/i) as HTMLInputElement)
    expect(placeholderNoSeed.placeholder).not.toMatch(/mint|create a material record/i)
    expect(placeholderNoSeed.placeholder).toBe('Search materials…')
    unmount()

    // (b) The SAME fixture pair with the prompt noun present: the placeholder
    // promises create AND the row exists (asserted from the same fixture so
    // drift is impossible — one predicate drives both).
    const seeded: AiClarificationRequest = { ...noSeed, id: 'req-seeded', query: 'DMSO' }
    resolveMaterial.mockResolvedValue([])
    const { unmount: unmount2 } = render(<ClarificationPicker request={seeded} onPick={vi.fn()} />)
    const placeholderSeeded = (screen.getByPlaceholderText(/Search materials/i) as HTMLInputElement)
    expect(placeholderSeeded.placeholder).toMatch(/create a material record/i)
    expect(screen.getByTestId('clarification-mint-row')).toBeTruthy()
    // The row's preview is the one-source sentence for the seeded noun.
    expect(screen.getByText(mintLocalTermLabel('DMSO'))).toBeTruthy()
    unmount2()
  })

  it('P5: after a successful mint the answered row names the new record id (the id reaches the transcript through the host answer sentence)', async () => {
    const request: AiClarificationRequest = {
      id: 'req-id',
      kind: 'material',
      prompt: 'Which material is the clofibrate stock?',
      entityType: 'material',
      menuProvider: '/m',
      query: 'Clofibrate',
      options: [],
      allowCreateLocal: true,
    }
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-clof-9', label: 'Clofibrate', iri: 'urn:cl:local:MAT-clof-9' })
    const onPick = vi.fn()
    render(<ClarificationPicker request={request} onPick={onPick} />)

    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    // The answer carries the minted record (ref {kind:'record', type:'material'})
    // and a mention token that NAMES the new id.
    const answer = onPick.mock.calls[0]?.[0]
    expect(answer.ref).toEqual({ kind: 'record', id: 'MAT-clof-9', type: 'material', label: 'Clofibrate' })
    expect(String(answer.mentionToken)).toContain('MAT-clof-9')

    // The harness-visible outcome: the host's answer sentence (the byte-stable
    // builder) becomes the user turn; the answered row renders it and NAMES
    // the new record id (PICKER-1 owns the sentence rendering — CARD-1 only
    // asserts the row contains the id).
    const hostSentence = clarificationAnswerPrompt(answer, request)
    expect(hostSentence).toContain('MAT-clof-9')
    const messages: ChatMessage[] = [
      { id: 'm1', role: 'assistant', content: request.prompt, clarificationRequests: [request], timestamp: 0 },
      { id: 'm2', role: 'user', content: hostSentence, timestamp: 1 },
    ]
    const { container } = render(
      <ChatLog
        isStreaming={false}
        prompt=""
        onPromptChange={vi.fn()}
        onSend={vi.fn()}
        onCancel={vi.fn()}
        onReview={vi.fn()}
        onClarificationPick={vi.fn()}
        onClarificationSubmit={vi.fn()}
        messages={messages}
      />,
    )
    const answered = container.querySelector('[data-testid="chat-log-clarification-answered"]')
    expect(answered).toBeTruthy()
    expect(answered!.textContent).toContain('MAT-clof-9')
    expect(within(container as HTMLElement).getByTestId('chat-log-clarification-answered').textContent).toContain('MAT-clof-9')
  })
})
