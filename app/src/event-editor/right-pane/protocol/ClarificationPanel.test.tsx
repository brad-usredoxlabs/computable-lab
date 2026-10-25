/**
 * MATRES-PANEL — the grouped clarification panel (RED-first, spec §9 FIRST
 * TARGETED CHECK + §7.1-§7.3).
 *
 * The canonical four-term utterance ("Trypsin-EDTA + DMEM + FBS + HepG2
 * cells") yields FOUR unresolved facts with distinct labels/argument
 * positions. Today the fold renders one flat card per fact with a flat
 * option list. The panel collapses them into ONE panel container per turn
 * with FOUR slot sections, candidates GROUPED referent-level x tier from the
 * merged ELIG payload fields (resolutionEngine.ts:127-146 candidateFact —
 * tier/referentLevel/eligibility via conditional spread; shape-diffed against
 * the blessed golden goldens/__records__/ambiguous-material.golden.json),
 * per-selection semantics from the client DATA table, mint affordance ONLY at
 * NON-PHYSICAL layers, and the unspecified-level degradation branch for
 * candidates carrying NO ELIG keys (live code per the post-merge re-verify).
 *
 * Fixture candidate shape is byte-shaped after the blessed 422 golden:
 * {label, confidence, ref?, tier, referentLevel, eligibility{display,
 * suppress, bind, policyIds{display,suppress,bind}, bindRole?, displayRole?}}.
 *
 * RED at base: ClarificationPanel does not exist (import fails).
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClarificationPanel } from './ClarificationPanel'
import { foldCards } from './ProtocolLocalizationThread.clarificationAdapter'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../../types/ai'

// Mirror the shipped resolver layer routing (resolvers.ts): the mint floor row
// is emitted by the unscoped/concept resolveMaterial arm ONLY — the instance/
// aliquot layer (resolveInstanceLayer) and the vendor layer emit none.
const materialCtx: Array<Record<string, unknown>> = []
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: Record<string, unknown>) => {
    materialCtx.push(ctx)
    const layer = ctx.materialLayer
    if (layer === 'material-instance' || layer === 'aliquot' || layer === 'vendor-product' || layer === 'material-spec') {
      return Promise.resolve([])
    }
    return Promise.resolve([{
      key: `mint:${q}`,
      label: `Create local term "${q}"`,
      badge: 'New',
      pinBottom: true,
      mention: { type: 'material', entityKind: 'material', id: '', label: q },
    }])
  },
  resolveLabware: () => Promise.resolve([]),
  resolveEquipment: () => Promise.resolve([]),
}))

/** A widened ELIG candidate (merged candidateFact shape). */
function elig(
  label: string,
  referentLevel: string,
  tier: number,
  ref: string | undefined,
  verdicts: { display?: string; suppress?: string; bind?: string },
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    label,
    confidence: 0.9,
    ...(ref !== undefined ? { ref } : {}),
    tier,
    referentLevel,
    eligibility: {
      display: verdicts.display ?? 'pass',
      suppress: verdicts.suppress ?? 'pass',
      bind: verdicts.bind ?? 'pass',
      policyIds: {
        display: 'display-tier-legal',
        suppress: 'suppress-unconstrained-presence',
        bind: 'bind-unconstrained-identity',
      },
      ...extras,
    },
  }
}

/** The canonical four-term fact set (harvest T4 utterance), each fact a
 *  distinct slot (distinct label + argument position), candidates carrying the
 *  merged ELIG keys. */
const FOUR_TERM_FACTS: Array<Record<string, unknown>> = [
  {
    label: 'Trypsin-EDTA',
    reason: 'ambiguous-noun',
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    candidates: [
      elig('Trypsin-EDTA', 'concept', 1, 'MAT-trypsin-edta-100w', {}),
      elig('Trypsin-EDTA/DMEM (50:50)', 'formulation', 1, 'MAT-trypsin-edta-dmem-50-50-12i0', {}),
    ],
  },
  {
    label: 'DMEM',
    reason: 'ambiguous-noun',
    actionLocation: { actionIndex: 1, action: 'add_material', argument: 'material' },
    candidates: [
      elig('DMEM', 'concept', 1, 'MAT-dmem-2x4k', {}),
      elig('DMEM + 10% FBS', 'formulation', 1, 'MAT-dmem-10-fbs-77ab', {}),
    ],
  },
  {
    label: 'FBS',
    reason: 'ambiguous-noun',
    actionLocation: { actionIndex: 2, action: 'add_material', argument: 'material' },
    candidates: [
      elig('FBS', 'concept', 1, 'MAT-fbs-9c1d', {}),
      elig('Thermo FBS (catalog 16000)', 'vendor-product', 3, undefined, { display: 'pass' }, { displayRole: 'catalog-identity' }),
      // display-fail candidate: §7.2 excludes it from its group (PANEL-side).
      elig('Retired FBS lot', 'vendor-product', 4, undefined, { display: 'fail' }),
    ],
  },
  {
    label: 'HepG2 cells',
    reason: 'eligibility-incomplete',
    actionLocation: { actionIndex: 3, action: 'add_material', argument: 'material' },
    candidates: [
      elig('HepG2 preparation 2026-09-14', 'aliquot', 1, 'ALQ-hepg2-4401', { bind: 'incomplete' }, { bindRole: 'catalog-identity' }),
      elig('HepG2 stock flask B', 'aliquot', 1, 'ALQ-hepg2-5150', { bind: 'incomplete' }),
    ],
  },
]

function renderPanel(facts: Array<Record<string, unknown>> = FOUR_TERM_FACTS, onPick?: (a: AiClarificationAnswer, r: AiClarificationRequest) => void) {
  const requests = foldCards(facts)
  render(<ClarificationPanel
    requests={requests}
    turnKey="golden-four-term:1"
    disabled={false}
    onPick={onPick ?? (() => undefined)}
  />)
  return requests
}

describe('ClarificationPanel — one grouped panel per drafting turn (MATRES-PANEL)', () => {
  it('1. the canonical four-term fact set renders EXACTLY ONE panel container with FOUR distinct slot sections (never one global choice)', () => {
    renderPanel()
    const panels = screen.getAllByTestId('pl-clarification-panel')
    expect(panels.length).toBe(1)
    const slots = screen.getAllByTestId('pl-clarification-card')
    expect(slots.length).toBe(4)
    const labels = slots.map((s) => s.querySelector('.pl-held-clarification-label')?.textContent)
    expect(labels).toEqual(['Trypsin-EDTA', 'DMEM', 'FBS', 'HepG2 cells'])
    // Distinct per-component bindings: each slot carries its own slot identity
    // (actionLocation argument:actionIndex) — the answers still ride the
    // fact-label key byte-unchanged (D2).
    const slotKeys = slots.map((s) => s.querySelector('.pl-held-clarification-slot')?.textContent)
    expect(slotKeys).toEqual(['material:0', 'material:1', 'material:2', 'material:3'])
  })

  it('2. candidates are bucketed by referent-level x tier group headers from the payload fields (level x tier, never tier-as-truth)', () => {
    renderPanel()
    const slots = screen.getAllByTestId('pl-clarification-card')
    const trypsin = slots[0]!
    expect(trypsin.querySelector('[data-testid="pl-candidate-group-concept-tier-1"]')).toBeTruthy()
    expect(trypsin.querySelector('[data-testid="pl-candidate-group-formulation-tier-1"]')).toBeTruthy()
    expect(trypsin.querySelector('.pl-candidate-group__header')?.textContent).toContain('Concept')
    const fbs = slots[2]!
    expect(fbs.querySelector('[data-testid="pl-candidate-group-vendor-product-tier-3"]')).toBeTruthy()
    // §7.2: a display-fail candidate is excluded from its group (PANEL-side
    // rendering; the engine never drops it from the payload).
    expect(fbs.textContent).not.toContain('Retired FBS lot')
    // §7.2: the record ref shows as the option subtitle when present
    // (duplicate-label disambiguation).
    expect(trypsin.textContent).toContain('MAT-trypsin-edta-100w')
  })

  it('3. per-selection semantics are VISIBLE at the point of choice from the DATA table: concept may ground a proposed record; aliquot selection is REFERENCE attach, never custody', () => {
    renderPanel()
    const slots = screen.getAllByTestId('pl-clarification-card')
    const conceptGroup = slots[0]!.querySelector('[data-testid="pl-candidate-group-concept-tier-1"]')!
    expect(conceptGroup.textContent).toMatch(/ground a proposed/i)
    const aliquotGroup = slots[3]!.querySelector('[data-testid="pl-candidate-group-aliquot-tier-1"]')!
    expect(aliquotGroup.textContent).toMatch(/attaches a REFERENCE/i)
    expect(aliquotGroup.textContent).toMatch(/asserts nothing about custody/i)
    // Vendor mint-on-select is DISCLOSED at the point of choice (not hover).
    const vendorGroup = slots[2]!.querySelector('[data-testid="pl-candidate-group-vendor-product-tier-3"]')!
    expect(vendorGroup.textContent).toMatch(/creates a local vendor-product record now/i)
  })

  it('4. mint absent below formulation: an all-aliquot slot has NO mint affordance and its picker is layer-scoped; a concept slot keeps the ONE mint floor', async () => {
    renderPanel()
    const slots = screen.getAllByTestId('pl-clarification-card')
    const hepG2 = slots[3]!
    // Zero mint rows inside the physical slot.
    expect(hepG2.textContent).not.toContain('Create local term')
    // The shipped canMint gate + resolver layer scoping do the gating (table
    // column pickerLayer), never a TS tier switchboard.
    await waitFor(() => expect(materialCtx.length).toBeGreaterThan(0))
    const hepG2Ctx = materialCtx.find((c) => c.materialLayer === 'aliquot')
    expect(hepG2Ctx, 'the all-aliquot slot scopes its picker search to the aliquot layer').toBeTruthy()
    expect(hepG2.querySelector('.message-log__clarification-search')?.getAttribute('placeholder')).toContain('aliquots')
    // The concept-bearing slot keeps the picker's ONE mint floor row (bait 8:
    // the picker floor is the slot's ONE affordance — the panel renders no
    // mint row of its own, so the mint text appears exactly once).
    const trypsin = slots[0]!
    const input = trypsin.querySelector('.message-log__clarification-search') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Trypsin-EDTA' } })
    await waitFor(() => expect(trypsin.textContent).toContain('Create local term "Trypsin-EDTA"'))
    const mintRows = [...trypsin.querySelectorAll('button')].filter((b) => (b.textContent ?? '').includes('Create local term'))
    expect(mintRows.length).toBe(1)
  })

  it('5. eligibility verdicts render as per-candidate markers showing the RAW policy id strings (OQ-3: no prose, no client table); catalog-identity role tags are read from the payload', () => {
    renderPanel()
    const slots = screen.getAllByTestId('pl-clarification-card')
    const markers = slots[3]!.querySelectorAll('.pl-candidate-marker')
    expect(markers.length).toBeGreaterThan(0)
    const text = [...markers].map((m) => m.textContent).join(' | ')
    expect(text).toContain('bind:incomplete')
    expect(text).toContain('bind-unconstrained-identity') // raw policy id, verbatim
    expect(text).toContain('catalog-identity')            // payload role tag, verbatim
    // A pass/pass/pass candidate carries no verdict marker.
    const trypsinOption = slots[0]!.querySelector('.pl-held-clarification-option')!
    expect(trypsinOption.querySelectorAll('.pl-candidate-marker').length).toBe(0)
  })

  it('6. unspecified-level degradation (LIVE branch): candidates carrying NO ELIG keys render in the unspecified group with no verdict markers', () => {
    renderPanel([
      {
        label: 'unobtainium',
        reason: 'unknown-noun',
        candidates: [
          { label: 'unobtainium-ish', confidence: 0.4 }, // near-miss suggestion shape
          { label: 'phlogiston', confidence: 0.3 },      // model-side stripped shape
        ],
      },
    ])
    const slot = screen.getByTestId('pl-clarification-card')
    expect(slot.querySelector('[data-testid="pl-candidate-group-unspecified"]')).toBeTruthy()
    expect(slot.querySelector('.pl-candidate-group__header')?.textContent).toContain('Unspecified level')
    expect(slot.querySelectorAll('.pl-candidate-marker').length).toBe(0)
  })

  it('7. a referentLevel the table does not name (the spine\'s "unknown" spelling) degrades to the unspecified arm — never a re-derivation from tier (bait 13)', () => {
    renderPanel([
      {
        label: 'standard plate',
        reason: 'ambiguous-noun',
        actionLocation: { actionIndex: 0, action: 'transfer', argument: 'labware' },
        candidates: [elig('standard plate alpha', 'unknown', 1, 'LAB-plate-alpha', {})],
      },
    ])
    const slot = screen.getByTestId('pl-clarification-card')
    expect(slot.querySelector('[data-testid="pl-candidate-group-unspecified-tier-1"]')).toBeTruthy()
  })

  it('8. each slot keeps its OWN picker instance keyed per slot (clofibrate state-leak law): two slots show two independent search inputs', () => {
    renderPanel()
    const slots = screen.getAllByTestId('pl-clarification-card')
    const inputs = document.querySelectorAll('.message-log__clarification-search')
    expect(inputs.length).toBe(4)
    const first = slots[0]!.querySelector('.message-log__clarification-search') as HTMLInputElement
    fireEvent.change(first, { target: { value: 'typed-for-slot-0' } })
    expect((slots[1]!.querySelector('.message-log__clarification-search') as HTMLInputElement).value).not.toBe('typed-for-slot-0')
  })

  it('9. picking a slot option answers THAT slot through the existing onPick round-trip (answers ride the fact label, D2)', () => {
    const picks: Array<{ answer: AiClarificationAnswer; request: AiClarificationRequest }> = []
    renderPanel(FOUR_TERM_FACTS, (answer, request) => picks.push({ answer, request }))
    const slots = screen.getAllByTestId('pl-clarification-card')
    const option = slots[0]!.querySelector('.pl-held-clarification-option') as HTMLButtonElement
    fireEvent.click(option)
    expect(picks.length).toBe(1)
    expect(picks[0]!.request.prompt).toBe('Trypsin-EDTA')
    expect(picks[0]!.answer.label).toBe('Trypsin-EDTA')
    // A ref-bearing candidate rides the binding idiom exactly as the pre-panel
    // card did (W28-OPTIONBIND-1 posture preserved).
    expect(picks[0]!.answer.mentionToken).toBe('[[material:MAT-trypsin-edta-100w|Trypsin-EDTA]]')
  })
})
