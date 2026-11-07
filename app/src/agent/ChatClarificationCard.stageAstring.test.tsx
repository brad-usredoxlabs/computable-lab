/**
 * L2-CANONICAL-LABEL-STAGE-A-FALLBACK unit 2 (app pins) — AC-3 + AC-7.
 *
 * One-string chain (AC-3): the seed sent to mint is the entity's offered
 * phrasing (never a join/fold), the equality case renders one literal
 * across question/mint/answered rows, and the lowercase STAGE-B identity
 * form appears nowhere once the record is grounded.
 *
 * Mint badge word (AC-7): the badge is the DATA token "New" in exactly one
 * home.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AiClarificationRequest, AiClarificationAnswer, ChatMessage } from '../types/ai'
import { ClarificationPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
import { mintLocalTermLabel } from '../shared/taptab/slashMenu/resolvers'
import { clarificationAnswerPrompt } from '../shared/hooks/clarificationAnswerPrompt'
import { ChatLog } from './ChatLog'
import { VOCABULARY_BADGE } from '../shared/taptab/slashMenu/tokens'

const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../shared/taptab/slashMenu/resolvers', async () => {
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

const LEGACY_TITLE = '1 mM Clofibrate in DMSO'
const LEGACY_ID = 'MAT-1-mm-clofibrate1-mm-clof-l84l'

const MOCK_MINT_RESULT = {
  success: true,
  recordId: LEGACY_ID,
  label: LEGACY_TITLE,
  iri: `urn:cl:local:${LEGACY_ID}`,
} as const

function makeRequest(unresolvedLabel: string): AiClarificationRequest {
  return {
    id: 'req-canon',
    kind: 'material',
    entityType: 'material',
    menuProvider: '/m',
    options: [],
    allowCreateLocal: true,
    prompt: 'The draft names "1 mM Clofibrate in DMSO" and the lab spine could not bind it.',
    unresolvedFact: {
      label: unresolvedLabel,
      reason: 'ambiguous-noun',
      actionLocation: { actionIndex: 0 },
    },
  }
}

describe('L2-CANONICAL-LABEL-STAGE-A-FALLBACK unit 2: AC-3 + AC-7', () => {
  it('AC-3(a) STAGE-B label: the seed is the raw provenance label, never a join/fold — input value, preview, and mint argument are the lowercase STAGE-B form', async () => {
    const stageBLabel = '1 mM clofibrate in DMSO'
    const request = makeRequest(stageBLabel)
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue(MOCK_MINT_RESULT)
    const onPick = vi.fn()

    render(<ClarificationPicker request={request} onPick={onPick} />)

    const labelInput = screen.getByTestId('clarification-mint-label') as HTMLInputElement
    expect(labelInput.value).toBe(stageBLabel)
    expect(screen.getByText(mintLocalTermLabel(stageBLabel))).toBeTruthy()

    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))

    expect(mintLocalTerm).toHaveBeenCalledTimes(1)
    const argsA = mintLocalTerm.mock.calls[0]
    expect(argsA[0]).toBe('material')
    expect(argsA[1]).toBe(stageBLabel)
    expect(argsA[1]).not.toBe(LEGACY_TITLE)
  })

  it('AC-3(b) equality case: when label == LEGACY_TITLE, input/preview/mint/answer all carry the same string', async () => {
    const request = makeRequest(LEGACY_TITLE)
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue(MOCK_MINT_RESULT)
    const onPick = vi.fn()

    render(<ClarificationPicker request={request} onPick={onPick} />)

    const labelInput = screen.getByTestId('clarification-mint-label') as HTMLInputElement
    expect(labelInput.value).toBe(LEGACY_TITLE)
    expect(screen.getByText(mintLocalTermLabel(LEGACY_TITLE))).toBeTruthy()

    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))

    expect(mintLocalTerm).toHaveBeenCalledTimes(1)
    const argsB = mintLocalTerm.mock.calls[0]
    expect(argsB[0]).toBe('material')
    expect(argsB[1]).toBe(LEGACY_TITLE)

    const answer = onPick.mock.calls[0]?.[0] as AiClarificationAnswer
    expect(answer.ref).toBeTruthy()
    expect(answer.ref!.label).toBe(LEGACY_TITLE)
  })

  it('AC-3(c) answered row: the ChatLog answered text contains LEGACY_TITLE and NOT the lowercase form', async () => {
    const request = makeRequest(LEGACY_TITLE)
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue(MOCK_MINT_RESULT)
    const onPick = vi.fn()

    render(<ClarificationPicker request={request} onPick={onPick} />)

    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    const answer = onPick.mock.calls[0]?.[0] as AiClarificationAnswer
    cleanup()

    const hostSentence = clarificationAnswerPrompt(answer, request)
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
    expect(answered!.textContent).toContain(LEGACY_TITLE)
    expect(answered!.textContent).not.toContain('1 mm clofibrate in dmso')
    expect(container.textContent).not.toContain('1 mm clofibrate in dmso')
  })

  it('AC-7(d) mint badge is "New" in exactly one home', async () => {
    const request = makeRequest(LEGACY_TITLE)
    resolveMaterial.mockResolvedValue([])
    const onPick = vi.fn()

    render(<ClarificationPicker request={request} onPick={onPick} />)

    expect(VOCABULARY_BADGE.mint).toBe('New')

    const mintRow = screen.getByTestId('clarification-mint-row')
    const badge = mintRow.querySelector('.message-log__clarification-mint__badge')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toBe('New')
    expect(mintRow.textContent).not.toMatch(/Local/)
  })

  it('AC-7(e) single-home grep guard: "New" badge literal appears only in tokens.ts, never in ClarificationPicker.tsx', async () => {
    const pickerSource = readFileSync(
      resolve(process.cwd(), 'src/event-editor/right-pane/ai/ClarificationPicker.tsx'),
      'utf8',
    )
    expect(pickerSource).not.toMatch(/'New'|"New"/)
  })
})
