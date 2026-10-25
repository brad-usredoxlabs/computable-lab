/**
 * MATRES-CHAIN fix-run 4 D3 (gate g1d) — the blocked chain wall NAMES the
 * offending rule ids (§7.5 / §12 bait 9). RED at base: ChainProposalCard
 * early-returns the generic `chain-card-nocard` branch BEFORE rendering
 * diagnostics, so a refused compile (canAccept:false, result:{} — the live
 * refused shape) surfaces as "The compile returned no chain card document"
 * with NO rule id.
 *
 * The shipped sibling pattern this mirrors: the record-drafting blocked wall
 * (WorkstateProposalCard renders the DRAFT_INVALID diagnostics verbatim —
 * AiTabPanel.recordDraft.test.tsx 'canAccept:false ⇒ summary + diagnostics and
 * NO accept control'). The server names every fired wall in the diagnostics it
 * returns (attestation-occurred-approximate-needs-approximation,
 * volume-sum-lte-prepared, chain.prepared.sourceSpecRef); the card renders
 * them VERBATIM and stays NON-actionable (no Accept on canAccept:false —
 * preserved) with Reject real.
 *
 * The honest no-document wall (no card AND no diagnostics) is PRESERVED.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChainProposalCard } from './ChainProposalCard'

describe('ChainProposalCard — the D3 blocked wall names the offending rule id (bait 9)', () => {
  it('blocked + NO card document + the attestation pairing diagnostic: the wall NAMES the rule id, NO Accept, Reject real', () => {
    render(
      <ChainProposalCard
        phase="blocked"
        diagnostics={[{ code: 'DRAFT_INVALID', message: 'attestation-occurred-approximate-needs-approximation: claims pairing: a claim with occurredAtStatus approximate must carry occurredAt and approximation' }]}
        draftId="DRAFT-CHAIN-B1"
        revision={1}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    // The named blocked wall mounts (NOT the generic nocard copy):
    expect(screen.getByTestId('chain-card-blocked')).toBeDefined()
    expect(screen.getByTestId('chain-card-blocked-diagnostics').textContent).toContain('attestation-occurred-approximate-needs-approximation')
    expect(screen.queryByText('The compile returned no chain card document — nothing was written.')).toBeNull()
    // NON-actionable (bait 9 / PROTO-AI-9 R-Defect-2 class): no Accept on a blocked draft.
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()
    // Reject is real even on the blocked wall.
    const onReject = vi.fn()
    render(
      <ChainProposalCard phase="blocked" diagnostics={[{ message: 'x' }]} onAccept={vi.fn()} onReject={onReject} />,
    )
    fireEvent.click(screen.getAllByTestId('chain-card-reject')[screen.getAllByTestId('chain-card-reject').length - 1]!)
    expect(onReject).toHaveBeenCalled()
  })

  it('blocked + NO card document + the arithmetic rule diagnostic: the wall NAMES volume-sum-lte-prepared (the C6 case)', () => {
    render(
      <ChainProposalCard
        phase="blocked"
        diagnostics={[{ code: 'DRAFT_INVALID', message: 'volume-sum-lte-prepared: the declared aliquot volumes sum beyond the prepared volume (unit scale from execute-chain-arithmetic.yaml) (sum 2000 > 1000 on the declared unit scale)' }]}
        draftId="DRAFT-CHAIN-B2"
        revision={1}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByTestId('chain-card-blocked-diagnostics').textContent).toContain('volume-sum-lte-prepared')
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()
    expect(screen.getByTestId('chain-card-reject')).toBeDefined()
  })

  it('blocked + NO card document + the material-gap diagnostic: the wall NAMES chain.prepared.sourceSpecRef (the unresolvable-name case)', () => {
    render(
      <ChainProposalCard
        phase="blocked"
        diagnostics={[{ code: 'DRAFT_INVALID', message: "chain.prepared.sourceSpecRef: no material-spec record names the declared prep 'cell suspension' — the compiler resolves the prep's material through the lab's name->record spine (resolve/providers/records tier 1) and NEVER guesses or mints a spec" }]}
        draftId="DRAFT-CHAIN-B3"
        revision={1}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByTestId('chain-card-blocked-diagnostics').textContent).toContain('chain.prepared.sourceSpecRef')
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()
  })

  it('the honest no-document wall is PRESERVED: no card AND no diagnostics renders the named nocard copy', () => {
    render(
      <ChainProposalCard phase="blocked" draftId="DRAFT-CHAIN-B4" revision={1} onAccept={vi.fn()} onReject={vi.fn()} />,
    )
    expect(screen.getByTestId('chain-card-nocard').textContent).toContain('The compile returned no chain card document')
    expect(screen.queryByTestId('chain-card-accept')).toBeNull()
  })
})
