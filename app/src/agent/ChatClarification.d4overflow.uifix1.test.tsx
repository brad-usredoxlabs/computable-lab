/**
 * L2-CLARIFY-TARGET-1 (uifix1 D4) — the picker's option rows stay inside the
 * AI pane (min-width:0 + wrapping discipline; no redesign, no new state, no
 * surface branching).
 *
 * The measured defect (CHATHOST-CONSOLIDATE-1 §D2, all 6 hosts, viewport
 * 1440×900, turn B on the event-editor/deck host): the picker's option rows
 * ran past the pane's right edge and were clipped — the mint row 150 px WIDER
 * than the card (card right 1501 vs row right 1651) and its Create button 42
 * px past the 1440 px viewport. The gated build (c9687463) PRE-DATES fix4 —
 * its track clamp (`grid-template-columns: minmax(0,1fr)` + `max-width:100%`
 * on `.message-log__clarification-picker`) was absent from that tree — and
 * even with the track clamp the picker's GRID ITEMS kept the default
 * automatic minimum (`min-width: auto`) while their content-box `width:100%`
 * ADDED padding + border to the track width, so the rows (the mint row first,
 * the top-three "Composition" rows with it) still carried past the edge.
 *
 * THE FIX (this commit): `min-width: 0` + `box-sizing: border-box` +
 * `overflow-wrap` on the load-bearing nodes — the picker's grid items (search
 * input, mint row, top3 container), the deck-surface card + option rows, and
 * the grouped-card root (defensive sibling of the measured single-arm defect).
 * Markup, testids, labels and semantics are UNCHANGED — the fix is
 * declarations only.
 *
 * jsdom has NO layout — it performs no CSS box calculations, so it cannot
 * prove the 1440×900 geometry. This pin asserts the STRUCTURAL CONTRACT the
 * geometry rests on, in two parts:
 *   (1) the declared CSS discipline (min-width:0 / box-sizing / overflow-wrap
 *       on the load-bearing nodes, with the fix4 track clamp they depend on,
 *       plus the children's shrink discipline) — the part that was actually
 *       ABSENT pre-fix: these assertions are RED against the pre-fix CSS;
 *   (2) the markup contract that discipline acts on (the mint row is a direct
 *       grid item of the picker root — one row, not a nested block — and its
 *       Create button is ON THAT SAME ROW, inside the typed-arm card inside
 *       the assistant bubble; testids/labels/semantics intact). If a later
 *       refactor moves the button off the row or drops a wrapper the clamps
 *       ride on, this part is the lock.
 *
 * The ACTUAL 1440×900 containment is graded by the browser-gate leg in
 * e2e/chatui1-leGE-surface-matrix.spec.ts (leg 7) — RED by construction
 * pre-merge, graded by the orchestrator's post-merge gate (this run does not
 * run the browser gate).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { mintLocalTermLabel } from '../shared/taptab/slashMenu/resolvers'
import { ChatLog } from './ChatLog'

// ChatLog reuses the exported clarificationAnswerPrompt whose import graph
// reaches pdfjs-dist; mock it so jsdom doesn't crash on DOMMatrix (the same
// proven pattern as ChatLog.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

// The picker's resolver/apiClient surface (the proven pattern from
// ChatClarificationCard.mint.test.tsx — mock the resolvers, keep the REAL
// mintLocalTermLabel so the preview assertion uses the product's own string):
// no real network, and the '/m' request still resolves (mocked) so the mint
// row's predicate (`canMint`) sees the resolver reference it compares.
const resolveMaterial = vi.fn()
vi.mock('../shared/taptab/slashMenu/resolvers', async () => {
  const actual = await vi.importActual<typeof import('../shared/taptab/slashMenu/resolvers')>(
    '../shared/taptab/slashMenu/resolvers',
  )
  return {
    resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
    resolveLabware: vi.fn(),
    resolveEquipment: vi.fn(),
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
  mintLocalTerm.mockReset()
  groundMaterialRef.mockReset()
})

// ---------------------------------------------------------------------------
// Part 1 — the declared CSS discipline (the part absent pre-fix).
// The ruleOf idiom is the repo's proven styling-lock pattern (the BGATE
// chrome pins, ChatLog.test.tsx:288-301; the D-3/fix4 mint pins,
// ChatClarificationCard.mint.test.tsx:449-498).
// ---------------------------------------------------------------------------
describe('L2-CLARIFY-TARGET-1 (uifix1 D4) — the option rows stay inside the pane (CSS discipline)', () => {
  const aiCss = readFileSync(resolve(process.cwd(), 'src/event-editor/right-pane/ai/ai.css'), 'utf8')
  const chatLogCss = readFileSync(resolve(process.cwd(), 'src/agent/ChatLog.css'), 'utf8')
  const ruleOf = (source: string, file: string, selector: string): string => {
    const at = source.indexOf(selector)
    expect(at, `${file} must define ${selector}`).toBeGreaterThan(-1)
    // Strip /* … */ comments from the rule body before asserting (advc c5
    // defect 1): these rules carry explanatory comments that literally
    // contain the pinned declaration text, so a comment that merely
    // MENTIONS a declaration must never satisfy the pin — the assertions
    // run on declarations only.
    return source
      .slice(at, source.indexOf('}', at))
      .replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('fix4 track clamp (the contract the item clamps depend on) stays declared: the picker root clamps its single column to the container', () => {
    const picker = ruleOf(aiCss, 'ai.css', '.message-log__clarification-picker {')
    expect(picker).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(picker).toContain('max-width: 100%')
  })

  it('the mint row (the measured defect row) is a border-box 100% grid item with NO automatic minimum — padding/border no longer add to the track width', () => {
    const mint = ruleOf(aiCss, 'ai.css', '.message-log__clarification-mint {')
    expect(mint).toContain('box-sizing: border-box')
    expect(mint).toContain('min-width: 0')
    expect(mint).toContain('width: 100%')
  })

  it('the picker grid items carry the same clamp: the search input and the top3 container cannot grow the track past the card', () => {
    const search = ruleOf(aiCss, 'ai.css', '.message-log__clarification-search {')
    expect(search).toContain('box-sizing: border-box')
    expect(search).toContain('min-width: 0')
    const top3 = ruleOf(aiCss, 'ai.css', '.message-log__clarification-top3 {')
    expect(top3).toContain('min-width: 0')
  })

  it('the deck-surface card + option rows are clamped (same overflow class family the picker mounts in, ProtocolIdeShell.tsx:521)', () => {
    const card = ruleOf(aiCss, 'ai.css', '.message-log__clarification-card {')
    expect(card).toContain('min-width: 0')
    const option = ruleOf(aiCss, 'ai.css', '.message-log__clarification-option {')
    expect(option).toContain('box-sizing: border-box')
    expect(option).toContain('min-width: 0')
    expect(option).toContain('overflow-wrap: anywhere')
  })

  it('the grouped card (the defensive sibling surface) has the same discipline: the card root drops the automatic minimum and its option rows wrap instead of overflowing', () => {
    const card = ruleOf(chatLogCss, 'ChatLog.css', '.chat-clarification-card {')
    expect(card).toContain('min-width: 0')
    const option = ruleOf(chatLogCss, 'ChatLog.css', '.chat-clarification-card__option {')
    expect(option).toContain('box-sizing: border-box')
    expect(option).toContain('min-width: 0')
    expect(option).toContain('overflow-wrap: anywhere')
  })

  it('the mint row children keep the shrink discipline the row depends on (fix2 D-3 lock — regression, unchanged by this fix)', () => {
    const label = ruleOf(aiCss, 'ai.css', '.message-log__clarification-mint__label {')
    expect(label).toContain('min-width: 0')
    const preview = ruleOf(aiCss, 'ai.css', '.message-log__clarification-mint__preview {')
    expect(preview).toContain('min-width: 0')
    const create = ruleOf(aiCss, 'ai.css', '.message-log__clarification-mint__create {')
    expect(create).toContain('flex: none')
    expect(create).toContain('white-space: nowrap')
  })
})

// ---------------------------------------------------------------------------
// Part 2 — the markup contract that discipline acts on (jsdom structural).
// Drives the REAL ChatLog typed single-request arm with the measured defect
// shape (one '/m' picker request, zero options, mint allowed — singleCards: 1,
// groupedCards: 0) and asserts the row/button co-location and the wrapper
// chain the clamps ride on. jsdom performs no layout: this proves the
// STRUCTURE, not the geometry (the geometry is leg 7's browser-gate job).
// ---------------------------------------------------------------------------
describe('L2-CLARIFY-TARGET-1 (uifix1 D4) — the option-row markup contract (structural, jsdom has no layout)', () => {
  const request: AiClarificationRequest = {
    id: 'req-d4-mint',
    kind: 'material',
    prompt: 'Which medium is the growth plate?',
    entityType: 'material',
    menuProvider: '/m',
    query: 'DMEM',
    options: [],
    allowCreateLocal: true,
  }

  it('the mint row is a direct grid item of the picker root and its Create button sits ON THE SAME ROW, inside the typed-arm card inside the assistant bubble (labels/testids/semantics intact)', () => {
    resolveMaterial.mockResolvedValue([])
    const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }
    const onClarificationPick = vi.fn()
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: request.prompt,
      timestamp: 0,
      clarificationRequests: [request],
    }
    render(<ChatLog
      {...props}
      onClarificationPick={onClarificationPick}
      messages={[{ id: 'u1', role: 'user', content: 'Plate the DMEM growth medium.', timestamp: 0 }, assistant]}
    />)

    // Exactly ONE answer surface for the request (the typed arm) — no second
    // copy, no grouped card (the measured shape: singleCards: 1).
    const wrappers = document.querySelectorAll('[data-testid="chat-log-request-req-d4-mint"]')
    expect(wrappers).toHaveLength(1)
    const wrapper = wrappers[0] as HTMLElement
    expect(wrapper.classList.contains('chat-log-clarification')).toBe(true)
    expect(document.querySelectorAll('.chat-clarification-card')).toHaveLength(0)

    // The wrapper is inside the assistant bubble (the flex item the overflow
    // escaped from, .sequence-chat-messages clipping it silently).
    const bubble = document.querySelector('.chat-log-msg--assistant') as HTMLElement | null
    expect(bubble).not.toBeNull()
    expect(bubble!.contains(wrapper)).toBe(true)

    // The picker root is a DIRECT child of the wrapper (one card, the picker
    // rides it — no intermediate wrapper the clamps do not cover).
    const picker = wrapper.querySelector(':scope > .message-log__clarification-picker')
    expect(picker, 'the picker root is a direct child of the typed-arm card').not.toBeNull()

    // The mint row is a DIRECT child of the picker root — a grid ITEM on the
    // picker's single clamped track, not a nested block — and the row is the
    // one the dispatch names (testid + class both intact).
    const mintRow = picker!.querySelector(':scope > .message-log__clarification-mint') as HTMLElement | null
    expect(mintRow, 'the mint row is a direct grid item of the picker root').not.toBeNull()
    expect(mintRow!.getAttribute('data-testid')).toBe('clarification-mint-row')

    // The Create button is ON THE SAME ROW (a direct child of the row — the
    // row is the unit that must fit inside the pane) alongside the label
    // input — markup/testids/labels unchanged by the fix.
    const createBtn = mintRow!.querySelector(':scope > .message-log__clarification-mint__create')
    expect(createBtn, 'the Create button is a direct child of the mint row (same row)').not.toBeNull()
    expect((createBtn as HTMLButtonElement).textContent).toBe('Create')
    const labelInput = mintRow!.querySelector<HTMLInputElement>('[data-testid="clarification-mint-label"]')
    expect(labelInput).not.toBeNull()
    // The label is seeded from the request's query (mintNounFromQuery) — the
    // deterministic seed that made the CHATHOST row read "DMEM".
    expect(labelInput!.value).toBe('DMEM')
    // The preview is the product's own one-source sentence for that label.
    expect(mintRow!.textContent).toContain(mintLocalTermLabel('DMEM'))
    // Semantics: the row announces itself as a create affordance (the badge's
    // vocabulary word is present in the row).
    expect(mintRow!.querySelector('.message-log__clarification-mint__badge')).not.toBeNull()
  })
})
