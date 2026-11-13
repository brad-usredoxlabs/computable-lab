/**
 * MaterialReceivingDoor — tests for the /lab "Receive a lot" door
 * (L2-LAB-INVENTORY-CREATE-1, unit u6recvdoor).
 *
 * The door stages a material-receiving attestation through the EXISTING
 * /drafts/compile seam (adapter `receiving`) and renders the compiled draft or
 * the server's own refusal. Compiling alone never accepts; the accept control
 * (canAccept only) relays the compiled {draftId, revision, reviewHash} to the
 * EXISTING /drafts/accept seam and renders the ids the server returned.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

const compileSpy = vi.fn()
const acceptSpy = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: {
    compileWorkstateDraft: (...args: unknown[]) => compileSpy(...args),
    acceptWorkstateDraft: (...args: unknown[]) => acceptSpy(...args),
  },
}))

import { MaterialReceivingDoor } from './MaterialReceivingDoor'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderDoor() {
  return render(<MaterialReceivingDoor isOpen onClose={() => {}} />)
}

function type(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

function fillClaim() {
  type('material-receiving-vendor', 'Sigma')
  type('material-receiving-product-label', 'D6429-500ML')
  type('material-receiving-lot-number', 'L2601')
  type('material-receiving-received-by-status', 'known')
  type('material-receiving-received-by-label', 'Brad')
  type('material-receiving-occurred-at-status', 'unknown')
}

const OK = { draftId: 'DRAFT-u6recv-1', revision: 1, reviewHash: 'sha256:abc123', canAccept: true, diagnostics: [] }

beforeEach(() => {
  compileSpy.mockResolvedValue(OK)
})

describe('MaterialReceivingDoor', () => {
  it('renders the attested-fact inputs (vendor, product label, lot, status triples, occurredAt)', () => {
    renderDoor()
    expect(screen.getByTestId('material-receiving-vendor')).toBeDefined()
    expect(screen.getByTestId('material-receiving-product-label')).toBeDefined()
    expect(screen.getByTestId('material-receiving-lot-number')).toBeDefined()
    expect(screen.getByTestId('material-receiving-occurred-at')).toBeDefined()
    const receivedBy = screen.getByTestId('material-receiving-received-by-status')
    for (const v of ['known', 'approximate', 'unknown']) {
      expect(within(receivedBy).getByRole('option', { name: v })).toBeDefined()
    }
    const occurredAt = screen.getByTestId('material-receiving-occurred-at-status')
    for (const v of ['known', 'approximate', 'unknown']) {
      expect(within(occurredAt).getByRole('option', { name: v })).toBeDefined()
    }
  })

  it('submits ONE compile with adapter receiving + operation compose-receiving and renders draftId/reviewHash', async () => {
    renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(screen.getByTestId('material-receiving-draft-id')).toBeDefined())

    expect(compileSpy).toHaveBeenCalledTimes(1)
    const req = compileSpy.mock.calls[0][0] as { adapter: string; intent: Record<string, unknown> }
    expect(req.adapter).toBe('receiving')
    expect(req.intent.operation).toBe('compose-receiving')
    const claim = req.intent.claim as Record<string, unknown>
    expect(claim).toMatchObject({
      vendor: 'Sigma', productLabel: 'D6429-500ML', lotNumber: 'L2601',
      receivedByLabel: 'Brad', receivedByStatus: 'known', occurredAtStatus: 'unknown',
    })
    // exactOptionalPropertyTypes bait: no optional key rides as present-but-undefined.
    expect(Object.values(claim).every((v) => v !== undefined)).toBe(true)
    expect('occurredAt' in claim).toBe(false)

    expect(screen.getByTestId('material-receiving-draft-id').textContent).toBe('DRAFT-u6recv-1')
    expect(screen.getByTestId('material-receiving-review-hash').textContent).toBe('sha256:abc123')
    // Compiling alone stages nothing durable: the accept control is offered but never fired.
    expect(screen.getByTestId('material-receiving-accept')).toBeDefined()
    expect(acceptSpy).not.toHaveBeenCalled()
  })

  it('sends occurredAt when the occurrence status is stated and omits it when unknown', async () => {
    renderDoor()
    fillClaim()
    type('material-receiving-occurred-at-status', 'known')
    type('material-receiving-occurred-at', '2026-11-01')
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(compileSpy).toHaveBeenCalledTimes(1))
    const claim = (compileSpy.mock.calls[0][0] as { intent: { claim: Record<string, unknown> } }).intent.claim
    expect(claim.occurredAt).toBe('2026-11-01T00:00:00.000Z')
    expect(claim.occurredAtStatus).toBe('known')
  })

  it('anchors the stated arrival date on the approximate arm too, with its approximation (g3 D5)', async () => {
    renderDoor()
    fillClaim()
    type('material-receiving-occurred-at-status', 'approximate')
    type('material-receiving-occurred-at', '2026-11-01')
    type('material-receiving-approximation', 'last week')
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(compileSpy).toHaveBeenCalledTimes(1))
    const claim = (compileSpy.mock.calls[0][0] as { intent: { claim: Record<string, unknown> } }).intent.claim
    expect(claim.occurredAt).toBe('2026-11-01T00:00:00.000Z')
    expect(claim.occurredAtStatus).toBe('approximate')
    expect(claim.approximation).toBe('last week')
  })

  it('renders the server diagnostics VERBATIM on refusal with draftId+reviewHash present-but-refused and no accept affordance', async () => {
    const message = 'material-receiving-lot-requires-product: vendor-scoped lot: a receipt claim carries assertion.lot without assertion.vendorProductRef (claims)'
    compileSpy.mockResolvedValue({
      draftId: 'DRAFT-u6recv-2', revision: 1, reviewHash: 'sha256:def456', canAccept: false,
      diagnostics: [{ ruleId: 'material-receiving-lot-requires-product', message }],
    })
    renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy())
    // u6fix1 D2: the server returns draftId+reviewHash on BOTH arms — the refusal
    // panel must show them present-but-refused alongside the verbatim diagnostics.
    const refusal = screen.getByTestId('material-receiving-refusal')
    expect(within(refusal).queryByTestId('material-receiving-draft-id')).not.toBeNull()
    expect(within(refusal).getByTestId('material-receiving-draft-id').textContent).toBe('DRAFT-u6recv-2')
    expect(within(refusal).getByTestId('material-receiving-review-hash').textContent).toBe('sha256:def456')
    expect(screen.queryByTestId('material-receiving-accept')).toBeNull()
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull()
    expect(acceptSpy).not.toHaveBeenCalled()
  })

  it('makes the unknown-status discard explicit: date input disabled with a cue, claim carries no occurredAt', async () => {
    renderDoor()
    fillClaim()
    type('material-receiving-occurred-at-status', 'known')
    type('material-receiving-occurred-at', '2026-11-01')
    type('material-receiving-occurred-at-status', 'unknown')
    const dateInput = screen.getByTestId('material-receiving-occurred-at')
    // u6fix1 D1: the typed fact stays visible (value retained) but the discard is explicit.
    expect(dateInput).toBeDisabled()
    expect(dateInput).toHaveValue('2026-11-01')
    expect(screen.getByText('not sent while status is unknown')).toBeDefined()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(compileSpy).toHaveBeenCalledTimes(1))
    const claim = (compileSpy.mock.calls[0][0] as { intent: { claim: Record<string, unknown> } }).intent.claim
    expect('occurredAt' in claim).toBe(false)
    expect(claim.occurredAtStatus).toBe('unknown')
  })

  it('makes the unknown-status discard explicit: name input disabled with a cue, claim carries no receivedByLabel', async () => {
    renderDoor()
    fillClaim()
    type('material-receiving-received-by-status', 'known')
    type('material-receiving-received-by-label', 'Brad')
    type('material-receiving-received-by-status', 'unknown')
    const nameInput = screen.getByTestId('material-receiving-received-by-label')
    // u6fix2: the typed name stays visible (value retained) but the discard is explicit.
    expect(nameInput).toBeDisabled()
    expect(nameInput).toHaveValue('Brad')
    expect(screen.getByTestId('material-receiving-received-by-cue')).toBeDefined()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await waitFor(() => expect(compileSpy).toHaveBeenCalledTimes(1))
    const claim = (compileSpy.mock.calls[0][0] as { intent: { claim: Record<string, unknown> } }).intent.claim
    expect('receivedByLabel' in claim).toBe(false)
    expect(claim.receivedByStatus).toBe('unknown')
  })

  it('rapid double submit hits the busy guard: exactly one compile, no accept/create', async () => {
    renderDoor()
    fillClaim()
    const submit = screen.getByTestId('material-receiving-submit')
    fireEvent.click(submit)
    fireEvent.click(submit)
    // u6fix1 D3: pinned per actual behaviour — the busy flag disables the submit
    // button while the first compile is in flight, so a second rapid click never
    // reaches the form: exactly ONE compile, and no accept/create call ever.
    await waitFor(() => expect(screen.getByTestId('material-receiving-draft-id')).toBeDefined())
    expect(compileSpy).toHaveBeenCalledTimes(1)
    expect(acceptSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('material-receiving-accept')).toBeDefined()
  })

  it('accepts a canAccept draft through the ONE existing seam and renders the ids the server returned', async () => {
    acceptSpy.mockResolvedValue({
      recordId: 'MATREC-u8-1', instanceRecordId: 'MATINST-u8-1',
    })
    renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    const accept = await screen.findByTestId('material-receiving-accept')
    // Compiling alone must not commit: no accept call until the scientist presses it.
    expect(acceptSpy).not.toHaveBeenCalled()

    fireEvent.click(accept)
    await waitFor(() => expect(acceptSpy).toHaveBeenCalledTimes(1))
    // The server accepts ONLY these three keys; no document/claim/envelope rides back.
    expect(acceptSpy.mock.calls[0][0]).toEqual({
      draftId: 'DRAFT-u6recv-1', revision: 1, reviewHash: 'sha256:abc123',
    })
    await waitFor(() => expect(screen.getByTestId('material-receiving-accepted-record-id').textContent)
      .toBe('MATREC-u8-1'))
    expect(screen.getByTestId('material-receiving-accepted-instance-id').textContent).toBe('MATINST-u8-1')
    expect(screen.queryByTestId('material-receiving-request-error')).toBeNull()
  })

  it('renders the server message VERBATIM when the accept is rejected, and shows no accepted ids', async () => {
    const message = 'Draft changed. Review the current revision before accepting.'
    acceptSpy.mockRejectedValue(new Error(message))
    renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    fireEvent.click(await screen.findByTestId('material-receiving-accept'))
    await waitFor(() => expect(screen.getByTestId('material-receiving-request-error').textContent).toBe(message))
    expect(screen.queryByTestId('material-receiving-accepted-record-id')).toBeNull()
    expect(screen.queryByTestId('material-receiving-accepted-instance-id')).toBeNull()
  })

  it('pins the accept in-flight guard: a second click in the same batch fires ONE accept and leaves the control disabled', async () => {
    // advc c1 D1: THE CHANGE item 2 shipped this behaviour with no test. Mirror the
    // submit-guard convention (:165): decline the first accept, click twice, and
    // require exactly one relay of the three-key body plus a disabled control while
    // the promise is still open — a double-POST stays invisible otherwise.
    let release: (v: { recordId: string; instanceRecordId: string }) => void = () => {}
    acceptSpy.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    const accept = await screen.findByTestId('material-receiving-accept')

    fireEvent.click(accept)
    fireEvent.click(accept)
    expect(acceptSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('material-receiving-accept')).toBeDisabled()

    release({ recordId: 'MATREC-u8-2', instanceRecordId: 'MATINST-u8-2' })
    await waitFor(() => expect(screen.getByTestId('material-receiving-accepted-record-id').textContent)
      .toBe('MATREC-u8-2'))
    expect(acceptSpy).toHaveBeenCalledTimes(1)
  })

  it('wraps the unbroken reviewHash/ids inside the panel: the shared dd rule carries overflow-wrap (hashwrap)', async () => {
    // Browser gate LABINV-browser-bundle-g4-l2t1857 LEG 1: the 64-char monospace
    // reviewHash ran past the panel's right edge. jsdom does no layout, so pin the
    // DECLARATION on the rendered dd rule (both result and refusal use it); the
    // visual proof stays with the g5 browser bundle.
    const { container } = renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await screen.findByTestId('material-receiving-review-hash')
    const css = Array.from(container.querySelectorAll('style'))
      .map((el) => el.textContent ?? '').join('\n')
    const ddRule = /\.lab-modal__result dd,\s*\.lab-modal__refusal dl dd\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(ddRule).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('carries the shared .lab-modal base layout authority, not only its own rules (gate D1)', () => {
    // Browser gate L2-LABINV-SEEDLAB-browser-g1-l2t2210 D1: the door's own
    // <style> block declared ONLY __result/__refusal/__hint, so the backdrop sat
    // in normal flow (position: static) and cl-workspace__pane--left swallowed
    // every click. jsdom does not cascade author <style> rules, so pin the rule
    // TEXT here rather than a vacuous getComputedStyle assertion.
    const { container } = renderDoor()
    const styleText = Array.from(container.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n')
    expect(styleText).toMatch(/\.lab-modal__backdrop\s*\{[^}]*position:\s*fixed/s)
    expect(styleText).toMatch(/\.lab-modal\s*\{/)
  })

  it('backs every .lab-modal__* token on the rendered CTAs with one declared rule (gate g3 D7)', async () => {
    // Gate g3 D7: the door's CTAs carried `__primary`, which the shared stylesheet
    // never declares, so they rendered as bare text. jsdom does not cascade <style>,
    // so join the RENDERED buttons to the injected rule text — not a grep of the string.
    const { container } = renderDoor()
    fillClaim()
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await screen.findByTestId('material-receiving-accept')
    const styleText = Array.from(container.querySelectorAll('style'))
      .map((el) => el.textContent ?? '').join('\n')
    const tokens: string[] = []
    for (const btn of Array.from(container.querySelectorAll<HTMLButtonElement>('.lab-modal button'))) {
      tokens.push(...Array.from(btn.classList).filter((c) => c.startsWith('lab-modal__')))
    }
    // Both CTAs are rendered here (Stage draft + Accept): a rename that misses
    // either site surfaces below as an undeclared token.
    const undeclared = tokens.filter((t) => !new RegExp(`\\.${t}\\s*\\{`).test(styleText))
    expect(undeclared, `no declared rule for: ${undeclared.join(', ')}`).toEqual([])
    const primaryClass = Array.from(screen.getByTestId('material-receiving-submit').classList)
      .find((c) => c.startsWith('lab-modal__')) as string
    expect(styleText).toMatch(new RegExp(`\\.${primaryClass}\\s*\\{[^}]*background:\\s*var\\(--cl-accent\\)`))
    expect(styleText).toMatch(new RegExp(`\\.${primaryClass}:disabled\\s*\\{[^}]*opacity:\\s*0\\.6`))
  })

  it('discards a staged draft on close: reopen shows no staged block and a discard cue is visible', async () => {
    // Browser gate L2-LABINV-discardfix (g5 LEG 1 DEFECT 1, trail step 33; shots
    // 22-04 vs 31-06 md5-identical): the door is ALWAYS mounted by
    // LabCollectionView and early-returns null on !isOpen, so every useState
    // survived close/reopen and a staged draft resurrected byte-identical. The
    // defect is state SURVIVING a close, so the harness re-renders the SAME
    // component instance with isOpen false then true — no unmount between
    // toggles (cleanup() only runs in the shared afterEach, pinned here).
    // The harness mirrors the LabCollectionView placement: the PARENT owns the
    // cue state and shows the banner when the door reports a discard through
    // its optional onDiscard callback.
    function Harness() {
      const [open, setOpen] = useState(true)
      const [discarded, setDiscarded] = useState(false)
      return (
        <>
          <button type="button" data-testid="harness-open" onClick={() => setOpen(true)}>harness open</button>
          <MaterialReceivingDoor
            isOpen={open}
            onClose={() => setOpen(false)}
            onDiscard={() => setDiscarded(true)}
          />
          {discarded && (
            <div data-testid="material-receiving-discarded">staged draft discarded</div>
          )}
        </>
      )
    }
    render(<Harness />)
    type('material-receiving-vendor', 'Sigma')
    type('material-receiving-lot-number', 'LOT-DISCARD-TEST')
    fireEvent.click(screen.getByTestId('material-receiving-submit'))
    await screen.findByTestId('material-receiving-draft-id')

    // Close while a compiled/staged draft is on screen, then re-open the SAME
    // instance. The discard is purely local (compile never writes): no
    // accept/commit relay may fire on the discard path.
    fireEvent.click(document.querySelector<HTMLButtonElement>('.lab-modal__cancel')!)
    expect(screen.queryByTestId('material-receiving-draft-id')).toBeNull()
    fireEvent.click(screen.getByTestId('harness-open'))

    // No resurrected draftId, no staged block, no live Accept button, empty fields.
    expect(screen.queryByTestId('material-receiving-draft-id')).toBeNull()
    expect(screen.queryByTestId('material-receiving-result')).toBeNull()
    expect(screen.queryByTestId('material-receiving-accept')).toBeNull()
    expect((screen.getByTestId('material-receiving-vendor') as HTMLInputElement).value).toBe('')
    expect((screen.getByTestId('material-receiving-lot-number') as HTMLInputElement).value).toBe('')
    // The discard path is purely local: exactly ONE compile (the original
    // stage), nothing else committed — no accept, no second compile.
    expect(compileSpy).toHaveBeenCalledTimes(1)
    expect(acceptSpy).not.toHaveBeenCalled()
    // A visible discard cue: the cue element is present on the page and its
    // text matches /discard/i. (jsdom 29 does not implement
    // document.body.innerText — it is undefined — so assert the page text via
    // textContent, the realizable equivalent of the gate's innerText check.)
    const cue = screen.getByTestId('material-receiving-discarded')
    expect(cue.textContent).toMatch(/discard/i)
    expect(document.body.textContent ?? '').toMatch(/discard/i)
  })
})
