/**
 * L2-SUITE-A-uifix1 [D2] RED — honest-wall copy: the clause joined BARE NOUN
 * PHRASES after "it" and rendered "Draft produced no events — it a deck layout
 * and asked no questions." (gate evidence: run1 step 14 / run2 step 13 trail
 * read, honestWall="Draft produced no events — it a deck layout ...",
 * screenshots 14-03-p1-freeform.png / run2 13-03-p1-after-turn.png).
 *
 * The fix gives the clause a verb ("it delivered only …") — grammatical for
 * every part combination (singular and multi-part joins).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import type { AiContext } from '../../types/aiContext'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

const aiContext: AiContext = {
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', eventGraphId: 'EG-1' },
}

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — L2-SUITE-A-uifix1 D2: the honest wall names its channel GRAMMATICALLY', () => {
  it('a deckLayout-only success: "it delivered only a deck layout" (no verbless "it a deck layout")', async () => {
    frames({
      type: 'done',
      result: {
        success: true,
        notes: [],
        deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
      },
    })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('Navigate to the freeform manual deck')
    })
    const wall = await waitFor(() => {
      if (!result.current.honestWall) throw new Error('wall never set')
      return result.current.honestWall!
    }, { timeout: 4000 })
    // The gate's broken shape is gone.
    expect(wall).not.toContain('it a deck layout')
    // The clause now carries a verb.
    expect(wall).toContain('it delivered only a deck layout')
    expect(wall).toBe(
      'Draft produced no events — it delivered only a deck layout and asked no questions. Nothing was proposed and nothing was applied.',
    )
  })

  it('UIFIX3 D1: a DELIVERED deck layout says "applied to this view" — never "applied to the deck" (the layout is view-session-only; the record never carries the variant, so a "deck" claim would silently reverse on reload)', async () => {
    // regate-5 gate D1: P1 "Navigate to the freeform manual deck" mounted
    // the freeform variant client-only (setPlatform+setVariant — the seam),
    // the record's methodContext.deckVariant stayed "default", a reload
    // reverted to "Single SBS Plate", and the wall still claimed
    // "The deck layout was applied to the deck." — a claim that silently
    // reverses. The mount seam (onDeckLayout) is what makes
    // deckLayoutDelivered true; with it registered and accepting, the
    // closing clause must scope the claim to the VIEW.
    frames({
      type: 'done',
      result: {
        success: true,
        notes: [],
        deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
      },
    })
    const { result } = renderHook(
      () => useAiChat({ aiContext, onDeckLayout: () => true }),
    )
    await act(async () => {
      result.current.sendPrompt('Navigate to the freeform manual deck')
    })
    const wall = await waitFor(() => {
      if (!result.current.honestWall) throw new Error('wall never set')
      return result.current.honestWall!
    }, { timeout: 4000 })
    // The honest, view-scoped claim…
    expect(wall).toContain('The deck layout was applied to this view.')
    // …and the overclaim is gone (it would reverse silently on reload).
    expect(wall).not.toContain('applied to the deck')
    expect(wall).toBe(
      'Draft produced no events — it delivered only a deck layout and asked no questions. The deck layout was applied to this view.',
    )
  })

  it('a multi-part unmountable delivery joins grammatically (verb present, parts named)', async () => {
    frames({
      type: 'done',
      result: {
        success: true,
        notes: [],
        equipmentRequirements: [{ handle: 'water-bath-1', reason: 'for the lysis step' }],
        recordCreations: [{ kind: 'material', name: 'Lysis buffer', curie: 'cl:lysis-1' }],
        labwareRequirements: [{ classCurie: 'cl:pipette', reason: 'a 10 ul tip' }],
        deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
        instrumentApplianceJobs: [{ jobId: 'job-1', status: 'ready' } as never],
      },
    })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('deliver everything at once')
    })
    const wall = await waitFor(() => {
      if (!result.current.honestWall) throw new Error('wall never set')
      return result.current.honestWall!
    }, { timeout: 4000 })
    // Every part is still named…
    expect(wall).toContain('bench-equipment requirements')
    expect(wall).toContain('records to create')
    expect(wall).toContain('labware requirements')
    expect(wall).toContain('a deck layout')
    expect(wall).toContain('appliance jobs')
    // …and the clause still has its verb (the join stays grammatical).
    expect(wall).toContain('it delivered only')
    expect(wall).not.toMatch(/— it (?!delivered)/)
  })
})
