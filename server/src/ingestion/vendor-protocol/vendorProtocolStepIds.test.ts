/**
 * Step ids must be unique within ONE document and stable across re-derivation.
 *
 * Real document that broke this: Zymo Quick-DNA Fecal/Soil Microbe Miniprep
 * (D6010). Its single "Protocol" section contains a main 12-step list, then a
 * second list that restarts at 1 ("For samples collected in DNA/RNA Shield™,
 * transfer up to 1 ml…" / "Continue from Step 2 of the main protocol"). Keying
 * the id on the MANUAL's number produced two `step-1`s and two `step-2`s, so a
 * branch condition naming `step-1` gated two different steps, and the derived
 * proposal's activeStepIds listed both.
 */
import { describe, expect, it } from 'vitest'
import { createVendorProtocolDocumentFromText, extractVendorProtocolCandidate } from './VendorProtocolPdf.js'

const TWO_LISTS = `Product Contents
Component Amount
Lysis Buffer 100 ml

Protocol
1. Add sample to the Lysis Tube and homogenize.
2. Centrifuge at 10,000 x g for 1 minute.
3. Transfer the supernatant to a Spin Column.
4. Discard the flow through.

For samples collected in DNA/RNA Shield:
1. Transfer up to 1 ml of sample into the Lysis Tube and homogenize.
2. Continue from Step 2 of the main protocol.

Specifications
Storage: room temperature
`

function candidateFor(text: string) {
  const document = createVendorProtocolDocumentFromText(text, { filename: 'two-lists.pdf', documentId: 'doc-two-lists' })
  return extractVendorProtocolCandidate(document)
}

describe('vendor protocol step ids', () => {
  it('are unique within the document even when the manual restarts its numbering', () => {
    const candidate = candidateFor(TWO_LISTS)
    // Ground truth of the fixture: the extractor does capture both lists.
    expect(candidate.steps.length).toBeGreaterThanOrEqual(6)

    const ids = candidate.steps.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    // document order, one-based, no gaps
    expect(ids).toEqual(ids.map((_, i) => `step-${i + 1}`))
  })

  it('keeps the manual’s own number on stepNumber (the reader cross-references it)', () => {
    const candidate = candidateFor(TWO_LISTS)
    const numbers = candidate.steps.map((s) => s.stepNumber)
    // the second list restarts at 1 — that is the manual's truth, preserved
    expect(numbers).toEqual([1, 2, 3, 4, 1, 2])
    // the ids stay document-ordered while the numbers repeat
    expect(candidate.steps.map((s) => s.id)).toEqual(['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6'])
  })

  it('is stable across re-extraction (same document ⇒ same ids)', () => {
    expect(candidateFor(TWO_LISTS).steps.map((s) => s.id)).toEqual(candidateFor(TWO_LISTS).steps.map((s) => s.id))
  })
})