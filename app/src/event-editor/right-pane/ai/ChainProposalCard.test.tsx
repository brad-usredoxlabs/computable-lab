/**
 * MATRES-CHAIN §7.5 — the review wall (RED at base: ChainProposalCard does
 * not exist). Criteria = §12 bait 9 (the browser-gate criteria the coder test
 * mirrors; the :5193 gate itself is orchestrator-owned post-merge):
 *  - the claim table renders each claim's label VERBATIM
 *    (proposed | completed | unknown | reported-by-other — as stored);
 *  - artifactKind rides the card HEADER (Q2: a default is visible, never
 *    invisible);
 *  - the arithmetic reconciliation readout shows sum vs prepared + the
 *    used/stored counts (server-built numbers, rendered verbatim);
 *  - the §7.4 honesty-ceiling copy is REQUIRED card text (bait 10) — the card
 *    renders it and never claims "work complete";
 *  - the identity triple renders absence as the unknown label and NEVER
 *    pre-fills performer with the attestor (P3);
 *  - the card is NON-ACTIONABLE when blocked (canAccept:false): diagnostics
 *    name the offending rule id, NO Accept control exists (PROTO-AI-9
 *    R-Defect-2 class);
 *  - Accept/Reject controls exist ONLY in the review phase; an applied card is
 *    spent (no dead buttons).
 * The card is PRESENTATIONAL: every string here is the server-built card
 * document (chain/ExecuteChainDraft.ts §9b) — the component maps nothing by
 * kind name and adds no copy of its own beyond the phase vocabulary.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChainProposalCard, type ChainCardView } from './ChainProposalCard'

const CARD: ChainCardView = {
  artifactKind: 'attestation-chain',
  claims: [
    {
      label: 'completed',
      verb: 'prepared',
      aboutId: 'MATI-CHAIN-abc',
      aboutType: 'material-instance',
      occurredAtStatus: 'known',
      occurredAt: '2026-10-21T09:30:00-04:00',
      identity: { performer: 'unknown', accountSupplier: 'unknown', attestor: 'Brad' },
    },
    {
      label: 'completed',
      verb: 'consumed',
      aboutId: 'ALI-CHAIN-1',
      aboutType: 'aliquot',
      occurredAtStatus: 'approximate',
      approximation: 'today',
      identity: { performer: 'unknown', accountSupplier: 'unknown', attestor: 'Brad' },
    },
    {
      label: 'reported-by-other',
      verb: 'aliquoted',
      aboutId: 'ALI-CHAIN-2',
      aboutType: 'aliquot',
      occurredAtStatus: 'unknown',
      identity: { performer: 'Ana', accountSupplier: 'Ana', attestor: 'Brad' },
    },
    {
      label: 'unknown',
      verb: 'fulfills',
      aboutId: 'REQE-fenofibrate-stock-abc123',
      aboutType: 'event-requirement',
      occurredAtStatus: 'unknown',
      identity: { performer: 'unknown', accountSupplier: 'unknown', attestor: 'Brad' },
    },
  ],
  reconciliation: {
    title: 'Arithmetic reconciliation',
    sumScaled: 1000,
    preparedScaled: 1000,
    counts: [
      { label: 'stored', count: 9 },
      { label: 'used', count: 1 },
    ],
  },
  ceilingNote:
    'Arithmetic reconciles this draft with itself: it is no evidence the wet work happened. What the acceptance attests is each claim\u2019s label — completed, unknown, or reported-by-other — recorded against the scientist who declared it. A completed label is a person\u2019s attestation, not a measurement.',
}

describe('ChainProposalCard — the §7.5 review wall', () => {
  it('renders the four claim labels VERBATIM as stored (bait 9)', () => {
    render(
      <ChainProposalCard phase="review" card={CARD} draftId="DRAFT-1" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    for (const label of ['completed', 'unknown', 'reported-by-other']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    // proposed NEVER appears on an attestation-chain card whose claims carry
    // no proposed label (the lint wall fires first — the card renders what the
    // server built, nothing else).
    expect(screen.queryByText('proposed')).toBeNull()
  })

  it('artifactKind rides the card header (Q2: visible, never a silent default)', () => {
    render(
      <ChainProposalCard phase="review" card={CARD} draftId="DRAFT-1" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    const header = screen.getByTestId('chain-card-artifact-kind')
    expect(header.textContent).toContain('attestation-chain')
  })

  it('the reconciliation readout shows sum vs prepared + the used/stored counts (server-built numbers, verbatim)', () => {
    render(
      <ChainProposalCard phase="review" card={CARD} draftId="DRAFT-1" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    const block = screen.getByTestId('chain-card-reconciliation')
    expect(block.textContent).toContain('Arithmetic reconciliation')
    expect(block.textContent).toContain('1000')
    expect(block.textContent).toContain('stored')
    expect(block.textContent).toContain('9')
    expect(block.textContent).toContain('used')
    expect(block.textContent).toContain('1')
  })

  it('the honesty-ceiling copy is REQUIRED card text (bait 10) and the card never claims the work is proven', () => {
    render(
      <ChainProposalCard phase="review" card={CARD} draftId="DRAFT-1" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    const ceiling = screen.getByTestId('chain-card-ceiling')
    expect(ceiling.textContent).toContain('no evidence the wet work happened')
    expect(ceiling.textContent).toContain("A completed label is a person\u2019s attestation, not a measurement.")
    expect(screen.queryByText(/work complete|provenance recorded/i)).toBeNull()
  })

  it('the identity triple renders absence as the unknown label and NEVER pre-fills performer with the attestor (P3)', () => {
    render(
      <ChainProposalCard phase="review" card={CARD} draftId="DRAFT-1" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    const rows = screen.getAllByTestId('chain-card-claim')
    const first = rows[0]
    expect(first.textContent).toContain('performer: unknown')
    expect(first.textContent).toContain('attestor: Brad')
    // performer is NOT silently the attestor:
    expect(first.textContent).not.toContain('performer: Brad')
  })

  it('blocked (canAccept:false): diagnostics name the offending rule id and NO Accept control exists (bait 9)', () => {
    render(
      <ChainProposalCard
        phase="blocked"
        card={CARD}
        diagnostics={[{ message: 'volume-sum-lte-prepared: the declared aliquot volumes sum beyond the prepared volume (unit scale from execute-chain-arithmetic.yaml) (sum 1100 > 1000 on the declared unit scale)' }]}
        draftId="DRAFT-1"
        revision={1}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByText(/volume-sum-lte-prepared/)).toBeDefined()
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()
    expect(screen.getByTestId('chain-card-reject')).toBeDefined()
  })

  it('review phase: Accept + Reject exist; applied spends the card (no dead buttons)', () => {
    const onAccept = vi.fn()
    const applied = render(
      <ChainProposalCard phase="applied" card={CARD} draftId="DRAFT-1" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    expect(applied.queryByTestId('chain-card-accept')).toBeNull()
    applied.unmount()
    render(
      <ChainProposalCard phase="review" card={CARD} draftId="DRAFT-1" revision={1} onAccept={onAccept} onReject={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId('chain-card-accept'))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('chain-card-reject')).toBeDefined()
  })

  it('a fulfillment note rides the card when the server built one (honest §7.6 disclosure)', () => {
    const withNote: ChainCardView = { ...CARD, fulfillmentNote: 'No pinned plan — this chain carries no fulfillment claims.' }
    render(
      <ChainProposalCard phase="review" card={withNote} draftId="DRAFT-1" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    expect(screen.getByTestId('chain-card-fulfillment-note').textContent).toContain('no fulfillment claims')
  })
})
