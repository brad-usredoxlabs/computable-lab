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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('W9 copy/affordance agreement, both directions (one predicate — copy and affordance cannot disagree): seed-less + empty filter shows NO mint row and a search-only placeholder; a seeded fact shows the row whenever the placeholder promises it; an empty-seed fact with a TYPED filter shows NO row (D2 fix1)', async () => {
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

    // (c) advc-c1 D2 (fix1), PROBE3 shape: the SAME empty-seed fixture with a
    // TYPED filter (the user types `mystery` into the search box — the popover
    // opens on the first keystroke — then Escape closes it). Pre-fix the
    // predicate read the filter fallback (mintLabelFor(request, query)), so the
    // row APPEARED off the live filter with an EMPTY label and a disabled
    // Create while the placeholder promised creation ("row exists" but not
    // "row is actionable"). Post-fix the predicate reads the PROMPT NOUN only:
    // the filter is non-empty but the card names no noun, so there is NO mint
    // row and the placeholder promises search only.
    const typedFilter: AiClarificationRequest = { ...noSeed, id: 'req-typed' }
    resolveMaterial.mockResolvedValue([])
    const { container: container3, unmount: unmount3 } = render(<ClarificationPicker request={typedFilter} onPick={vi.fn()} />)
    const search3 = container3.querySelector(SEARCH) as HTMLInputElement
    fireEvent.change(search3, { target: { value: 'mystery' } })
    await waitFor(() => expect(screen.getByTestId('clarification-popover')).toBeTruthy())
    fireEvent.keyDown(search3, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('clarification-popover')).toBeNull())
    // The filter IS typed (this is the typed-filter arm, not the empty-filter
    // arm (a)) — yet the empty-seed card grows NO mint row and its copy still
    // promises search only.
    expect((container3.querySelector(SEARCH) as HTMLInputElement).value).toBe('mystery')
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
    expect(screen.queryByTestId('clarification-mint-create')).toBeNull()
    const placeholderTyped = (screen.getByPlaceholderText(/Search materials/i) as HTMLInputElement)
    expect(placeholderTyped.placeholder).not.toMatch(/mint|create a material record/i)
    expect(placeholderTyped.placeholder).toBe('Search materials…')
    unmount3()
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

  it('D-2 (browser-gate fix2): a MINT-INTENT blob as request.query unwraps to the PROMPT noun — the label input, the honest preview, and the mint call all name the noun, never the raw blob (object AND JS-literal-string forms)', async () => {
    // The browser gate (shots/02-draw-02.png) observed the model's mint-intent
    // DSL reach the mint label verbatim: {mint:{label:"frobnicate",domain:"chemical"}}
    // rendered in [clarification-mint-label] with a preview of the raw JSON and
    // Create ENABLED (a click would write a record named after raw JSON). The
    // seed point must unwrap it to the noun. Two shapes are pinned: (a) the
    // structured {mint:{label,domain}} object (the DSL as typed data) and
    // (b) the JS-OBJECT-LITERAL string the live wire actually delivered
    // (unquoted keys — not JSON). A bare noun (control) must stay byte-unchanged.
    const noun = 'frobnicate'
    const blobString = '{mint:{label:"frobnicate",domain:"chemical"}}'
    const blobObject = { mint: { label: 'frobnicate', domain: 'chemical' } } as unknown as string

    const makeRequest = (id: string, query: string) => ({
      id,
      kind: 'material' as const,
      prompt: `The draft names "${noun}" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.`,
      entityType: 'material' as const,
      menuProvider: '/m' as const,
      query,
      options: [] as { id: string; label: string }[],
      allowCreateLocal: true,
    })

    // (a) the structured object form.
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-frob-obj', label: noun, iri: 'urn:cl:local:MAT-frob-obj' })
    const onPickObj = vi.fn()
    render(<ClarificationPicker request={makeRequest('req-obj', blobObject)} onPick={onPickObj} />)
    // The label is the BARE noun — never the raw blob.
    const labelObj = () => screen.getByTestId('clarification-mint-label') as HTMLInputElement
    expect(labelObj().value).toBe(noun)
    expect(labelObj().value).not.toContain('mint')
    expect(labelObj().value).not.toContain('{')
    // The honest preview names the noun (the one-source sentence).
    expect(screen.getByText(mintLocalTermLabel(noun))).toBeTruthy()
    expect(screen.queryByText(mintLocalTermLabel(blobString))).toBeNull()
    // Create is enabled (the noun is mintable) and the search box is seeded
    // with the noun too (same root — the blob is not a material to search).
    const createObj = () => screen.getByTestId('clarification-mint-create') as HTMLButtonElement
    expect(createObj().disabled).toBe(false)
    const searchObj = document.querySelector(SEARCH) as HTMLInputElement
    expect(searchObj.value).toBe(noun)
    // The call mints the BARE noun, never the blob.
    fireEvent.click(createObj())
    await waitFor(() => expect(onPickObj).toHaveBeenCalledTimes(1))
    // D4 (advc-c3): the LAST call — leg (a)'s own call (the mock is shared
    // across the legs inside this single `it`; only afterEach resets it, so
    // calls[0] is leg-independent and could not fail if the wire form minted
    // something else).
    const lastCallA = mintLocalTerm.mock.calls[mintLocalTerm.mock.calls.length - 1]
    expect(lastCallA?.[1]).toBe(noun)
    expect(lastCallA?.[1]).not.toContain('mint')
    cleanup()

    // (b) the JS-OBJECT-LITERAL string the live wire delivered (unquoted keys,
    // not JSON — JSON.parse throws; the unwrap must still recover the noun).
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-frob-str', label: noun, iri: 'urn:cl:local:MAT-frob-str' })
    const onPickStr = vi.fn()
    render(<ClarificationPicker request={makeRequest('req-str', blobString)} onPick={onPickStr} />)
    const labelStr = () => screen.getByTestId('clarification-mint-label') as HTMLInputElement
    expect(labelStr().value).toBe(noun)
    expect(labelStr().value).not.toContain('mint')
    expect(screen.getByText(mintLocalTermLabel(noun))).toBeTruthy()
    const searchStr = document.querySelector(SEARCH) as HTMLInputElement
    expect(searchStr.value).toBe(noun)
    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(onPickStr).toHaveBeenCalledTimes(1))
    // D4 (advc-c3): assert the LAST call (leg (b)'s own mint). The mock is NOT
    // reset between legs inside this single `it` (only afterEach resets it), so
    // `mock.calls[0]` is leg (a)'s call — the pre-fix assertion repeated the
    // :312 check and could not fail if the string-form path minted something
    // else. Exactly TWO mints have happened (one per leg); the last is leg (b)'s.
    expect(mintLocalTerm).toHaveBeenCalledTimes(2)
    const lastCallB = mintLocalTerm.mock.calls[mintLocalTerm.mock.calls.length - 1]
    expect(lastCallB?.[1]).toBe(noun)
    expect(lastCallB?.[1]).not.toContain('mint')
    cleanup()

    // (c) CONTROL: a bare noun is byte-unchanged (the pre-fix path, untouched).
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-ctl', label: 'radicicol', iri: 'urn:cl:local:MAT-ctl' })
    const onPickCtl = vi.fn()
    render(<ClarificationPicker request={makeRequest('req-ctl', 'radicicol')} onPick={onPickCtl} />)
    const labelCtl = () => screen.getByTestId('clarification-mint-label') as HTMLInputElement
    expect(labelCtl().value).toBe('radicicol')
    expect(screen.getByText(mintLocalTermLabel('radicicol'))).toBeTruthy()
    cleanup()
  })

  it('D3 (advc-c3 fix3): the DSL unwrap is QUOTE/ESCAPE-AWARE and NARROW — an apostrophe label unwraps WHOLE (never truncated at the quote), and a JSON array / a quoted scalar / a malformed blob are NOT nouns (the affordance stays hidden, no partial or bracketed label ever reaches the mint row)', async () => {
    // The reviewer's probe (receipt dom/draw-02.json wire shapes): the pre-fix
    // /label\s*:\s*["']([^"']*)["']/ regex stopped at an inner apostrophe, so
    // {mint:{label:"O'Brien extract"}} minted a durable record named "O" with
    // Create ENABLED; and the pre-fix string gate returned ANY non-`{` string
    // verbatim, so ["frobnicate","zymosolve"] (the plausible array-typed-slot
    // wire shape) and "frobnicate" reached the mint row as "labels". The
    // post-fix unwrap: the object-literal form is parsed by a quote/escape-
    // aware scanner (a value is read from its opening quote to its matching
    // closing quote — escapes honored — so an apostrophe inside a value is
    // part of the value), and every other bracketed value returns '' so
    // mintAvailable keeps the affordance hidden.
    const mkRequest = (id: string, query: string) => ({
      id,
      kind: 'material' as const,
      prompt: 'Choose what it is, or create a material record.',
      entityType: 'material' as const,
      menuProvider: '/m' as const,
      query,
      options: [] as { id: string; label: string }[],
      allowCreateLocal: true,
    })

    // (a) APOSTROPHE (the reviewer's exact probe): the label unwraps WHOLE —
    // never "O", never "Komagataeibacter" — and the mint call mints the whole
    // label (a click writes a record named "O'Brien extract", not "O").
    const obrien = "O'Brien extract"
    const obrienBlob = `{mint:{label:"${obrien}",domain:"chemical"}}`
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-obrien', label: obrien, iri: 'urn:cl:local:MAT-obrien' })
    const onPickObrien = vi.fn()
    render(<ClarificationPicker request={mkRequest('req-obrien', obrienBlob)} onPick={onPickObrien} />)
    const labelObrien = screen.getByTestId('clarification-mint-label') as HTMLInputElement
    expect(labelObrien.value).toBe(obrien)
    expect(labelObrien.value).not.toBe('O')
    expect(screen.getByText(mintLocalTermLabel(obrien))).toBeTruthy()
    const createObrien = screen.getByTestId('clarification-mint-create') as HTMLButtonElement
    expect(createObrien.disabled).toBe(false)
    fireEvent.click(createObrien)
    await waitFor(() => expect(onPickObrien).toHaveBeenCalledTimes(1))
    const lastCall = mintLocalTerm.mock.calls[mintLocalTerm.mock.calls.length - 1]
    expect(lastCall?.[1]).toBe(obrien)
    expect(lastCall?.[1]).not.toBe('O')
    cleanup()

    // (b) JSON ARRAY (the array-typed-slot wire shape): NOT a noun. The mint
    // row is ABSENT (mintAvailable hides the affordance) — and critically, the
    // search box is NOT seeded with the bracketed text either (seed = '').
    resolveMaterial.mockResolvedValue([])
    const onPickArr = vi.fn()
    render(<ClarificationPicker request={mkRequest('req-arr', '["frobnicate","zymosolve"]')} onPick={onPickArr} />)
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
    expect(screen.queryByTestId('clarification-mint-create')).toBeNull()
    expect((document.querySelector(SEARCH) as HTMLInputElement).value).toBe('')
    const placeholderArr = screen.getByPlaceholderText(/Search materials/i) as HTMLInputElement
    expect(placeholderArr.placeholder).toBe('Search materials…')
    cleanup()

    // (c) QUOTED SCALAR: NOT a noun (the pre-fix gate passed it through WITH
    // the quotes as the label). Same affordance-hidden outcome.
    resolveMaterial.mockResolvedValue([])
    const onPickQuoted = vi.fn()
    render(<ClarificationPicker request={mkRequest('req-quoted', '"frobnicate"')} onPick={onPickQuoted} />)
    expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
    expect((document.querySelector(SEARCH) as HTMLInputElement).value).toBe('')
    cleanup()

    // (d) NOT-the-DSL-SHAPE bracketed values: the affordance stays hidden and
    // the label is never a partial/truncated fragment of the raw text.
    for (const malformed of [
      '{mint:"frobnicate"}',
      '{"mint":["x"]}',
      '{label:"outer",domain:"chemical"}',
      '{mint:{label:"unterminated',
    ]) {
      resolveMaterial.mockResolvedValue([])
      const { unmount } = render(<ClarificationPicker request={mkRequest('req-mal', malformed)} onPick={vi.fn()} />)
      expect(screen.queryByTestId('clarification-mint-row')).toBeNull()
      expect((document.querySelector(SEARCH) as HTMLInputElement).value).toBe('')
      unmount()
    }
  })
})

// D-3 (browser-gate fix2, chrome): the mint row's Create button clipped its
// verb to "Crea/te" (shots/c1-prompt-and-card.png). The row is a full-width
// flex line whose children all default to `flex: 0 1 auto`, so the button was
// the one that collapsed and wrapped. jsdom cannot measure layout, so this pin
// reads the CSS SOURCE (the same ruleOf idiom the BGATE chrome pins use —
// ChatLog.test.tsx:288) and asserts the fix: the button is given the width its
// verb needs (flex: none + nowrap) and the flexible siblings are allowed to
// absorb the shrinkage (min-width: 0).
describe('L2-CLARIFY-CARD-1 (fix2) D-3 — the mint row Create button does not clip its verb', () => {
  const cssSource = readFileSync(resolve(process.cwd(), 'src/event-editor/right-pane/ai/ai.css'), 'utf8')
  const ruleOf = (selector: string): string => {
    const at = cssSource.indexOf(selector)
    expect(at, `ai.css must define ${selector}`).toBeGreaterThan(-1)
    return cssSource.slice(at, cssSource.indexOf('}', at))
  }

  it('the Create button is flex:none + nowrap (its verb never wraps) and the label/preview siblings shrink instead', () => {
    const create = ruleOf('.message-log__clarification-mint__create {')
    expect(create).toContain('flex: none')
    expect(create).toContain('white-space: nowrap')
    // The flexible siblings must be able to absorb the shrinkage (min-width:0)
    // — otherwise the button would still be the one that collapses.
    const label = ruleOf('.message-log__clarification-mint__label {')
    expect(label).toContain('min-width: 0')
    const preview = ruleOf('.message-log__clarification-mint__preview {')
    expect(preview).toContain('min-width: 0')
  })
})

// D4 (browser-gate tier1, FIX RUN 4): the mint row overran the card. The
// reporter measured the clarification card x=981 w=520 right=1501 but the mint
// row right=1651 (150 px WIDER than the card) and its Create button
// x=1584 w=57 right=1642 — 42 px PAST a 1600 px viewport. Root cause: the
// picker root is display:grid with no column constraint, so its single
// implicit track is max-content sized; the nowrap Create verb + the seeded
// label force the track (and the mint row's width:100%) wider than the card.
// jsdom cannot measure layout, so this pin reads the CSS SOURCE (the ruleOf
// idiom the BGATE chrome pins use — ChatLog.test.tsx:288, the D-3 block above)
// and asserts the containment fix: the picker's single column is clamped to
// the container with minmax(0,1fr) (min 0 lets the nowrap children shrink
// instead of growing the track) and the preview still declares the deliberate
// ellipsis contract. Live visual proof is the orchestrator's browser gate.
describe('L2-CLARIFY-CARD-1 (fix4) D4 — the mint row stays inside the card at every width', () => {
  const cssSource = readFileSync(resolve(process.cwd(), 'src/event-editor/right-pane/ai/ai.css'), 'utf8')
  const ruleOf = (selector: string): string => {
    const at = cssSource.indexOf(selector)
    expect(at, `ai.css must define ${selector}`).toBeGreaterThan(-1)
    return cssSource.slice(at, cssSource.indexOf('}', at))
  }

  it('the picker root clamps its single column to the card (minmax(0,1fr)) so the mint row cannot grow past it', () => {
    const picker = ruleOf('.message-log__clarification-picker {')
    // min 0 is the load-bearing part: without it the track is max-content and
    // the nowrap Create verb forces the whole row wider than the card.
    expect(picker).toContain('grid-template-columns: minmax(0, 1fr)')
    // The card content must never overflow the card horizontally.
    expect(picker).toContain('max-width: 100%')
  })

  it('the preview declares the deliberate ellipsis contract (no horizontal overflow, no clipped verb)', () => {
    const preview = ruleOf('.message-log__clarification-mint__preview {')
    expect(preview).toContain('text-overflow: ellipsis')
    expect(preview).toContain('white-space: nowrap')
    expect(preview).toContain('min-width: 0')
    const create = ruleOf('.message-log__clarification-mint__create {')
    expect(create).toContain('flex: none')
  })
})
