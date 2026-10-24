/**
 * ChainProposalCard — MATRES-CHAIN §7.5: the execute-chain review wall card.
 *
 * PRESENTATIONAL ONLY (the WorkstateProposalCard doctrine): every string here
 * is the SERVER-BUILT card document (server/src/chain/ExecuteChainDraft.ts
 * §9b — labels VERBATIM from the claims, reconciliation numbers from the DATA
 * scale table, the honesty-ceiling copy loaded from
 * config/drafting/execute-chain-arithmetic.yaml). This component maps nothing
 * by kind name, adds no copy of its own, and gates controls by PHASE exactly
 * like the workstate card: no Accept control exists until the server says
 * canAccept:true (the phase is 'review'), a blocked card names the offending
 * rule id and is NON-actionable (PROTO-AI-9 R-Defect-2 class), and an applied
 * card is spent (no dead buttons).
 *
 * The claim table shows EVERY claim's label VERBATIM
 * (proposed | completed | unknown | reported-by-other — bait 9); artifactKind
 * rides the header (Q2: a visible default, never invisible); the identity
 * triple renders absence as the server's unknown label and NEVER pre-fills
 * performer with the attestor (P3).
 */
import type { WorkstateCardDiagnostic, WorkstateCardPhase } from './WorkstateProposalCard'

export interface ChainCardClaimView {
  label: string
  verb: string
  aboutId: string
  aboutType: string
  occurredAtStatus: string
  occurredAt?: string
  approximation?: string
  identity: { performer: string; accountSupplier: string; attestor: string }
}

export interface ChainCardView {
  artifactKind: string
  claims: ChainCardClaimView[]
  reconciliation?: {
    title: string
    sumScaled: number
    preparedScaled: number
    counts: Array<{ label: string; count: number }>
  }
  ceilingNote: string
  fulfillmentNote?: string
}

export interface ChainProposalCardProps {
  phase: WorkstateCardPhase
  /** The SERVER-BUILT card document (flow card state). Absent only in the
   *  'compiling' phase (nothing compiled yet — the card renders the spinner
   *  and builds NO placeholder copy of its own). */
  card?: ChainCardView
  summary?: string
  diagnostics?: WorkstateCardDiagnostic[]
  draftId?: string
  revision?: number
  onAccept: () => void
  onReject: () => void
}

export function ChainProposalCard({
  phase,
  card,
  summary,
  diagnostics,
  draftId,
  revision,
  onAccept,
  onReject,
}: ChainProposalCardProps) {
  if (phase === 'compiling') {
    return (
      <div className="chain-card chain-card--compiling" data-testid="chain-card-compiling" role="status">
        <span className="chain-card__spinner" aria-hidden="true" />
        compiling…
      </div>
    )
  }

  // A non-compiling phase with NO server-built card document is a named
  // honest state (the compile returned nothing reviewable) — the card builds
  // no placeholder copy of its own.
  if (!card) {
    return (
      <div className="chain-card chain-card--blocked" data-testid="chain-card-nocard" role="alert">
        The compile returned no chain card document — nothing was written.
      </div>
    )
  }

  return (
    <div className={`chain-card chain-card--${phase}`} data-testid="chain-card" role="region" aria-label="Execute-chain proposal">
      <header className="chain-card__header">
        <span className="chain-card__title">Execute chain</span>
        {/* Q2: the declared posture is VISIBLE in the header, never a silent
            default. The value is the server-built artifactKind, verbatim. */}
        <span className="chain-card__artifact-kind" data-testid="chain-card-artifact-kind">
          {card.artifactKind}
        </span>
        {draftId && revision != null ? (
          <span className="chain-card__identity">
            {draftId} · revision {revision}
          </span>
        ) : null}
      </header>

      {summary ? <p className="chain-card__summary">{summary}</p> : null}

      {card.claims.length > 0 ? (
        <table className="chain-card__claims" data-testid="chain-card-claims">
          <thead>
            <tr>
              <th>claim</th>
              <th>label</th>
              <th>occurred</th>
              <th>identity</th>
            </tr>
          </thead>
          <tbody>
            {card.claims.map((claim, i) => (
              <tr key={`${claim.aboutId}-${i}`} data-testid="chain-card-claim">
                <td className="chain-card__claim-verb">
                  {claim.verb} · {claim.aboutType} {claim.aboutId}
                </td>
                {/* The label VERBATIM as stored (bait 9) — no mapping, no
                    re-derivation. */}
                <td className="chain-card__claim-label">{claim.label}</td>
                <td className="chain-card__claim-time">
                  {claim.occurredAtStatus}
                  {claim.occurredAt ? ` · ${claim.occurredAt}` : ''}
                  {claim.approximation ? ` (${claim.approximation})` : ''}
                </td>
                {/* P3: the DECLARED triple; absence renders as the server's
                    unknown label — never the acceptor, never performer=attestor. */}
                <td className="chain-card__claim-identity">
                  performer: {claim.identity.performer}; accountSupplier: {claim.identity.accountSupplier}; attestor: {claim.identity.attestor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {card.reconciliation ? (
        <div className="chain-card__reconciliation" data-testid="chain-card-reconciliation">
          <span className="chain-card__reconciliation-title">{card.reconciliation.title}</span>
          <span className="chain-card__reconciliation-volumes">
            aliquots {card.reconciliation.sumScaled} / prepared {card.reconciliation.preparedScaled}
          </span>
          <ul className="chain-card__reconciliation-counts">
            {card.reconciliation.counts.map((c, i) => (
              <li key={`${c.label}-${i}`}>
                {c.label}: {c.count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* §7.4 r2 honesty ceiling — REQUIRED card text (bait 10), loaded from
          DATA server-side. The card never claims the wet work is proven. */}
      {card.ceilingNote ? (
        <p className="chain-card__ceiling" data-testid="chain-card-ceiling">
          {card.ceilingNote}
        </p>
      ) : null}

      {card.fulfillmentNote ? (
        <p className="chain-card__fulfillment-note" data-testid="chain-card-fulfillment-note">
          {card.fulfillmentNote}
        </p>
      ) : null}

      {diagnostics && diagnostics.length > 0 ? (
        <ul className="chain-card__diagnostics">
          {diagnostics.map((d, i) => (
            <li key={`${d.code ?? 'diag'}-${i}`} className="chain-card__diagnostic">
              {d.code ? `${d.code}: ` : ''}
              {d.message}
            </li>
          ))}
        </ul>
      ) : null}

      {phase === 'applied' ? (
        <p className="chain-card__applied" data-testid="chain-card-applied">
          Accepted — the chain records were written as ONE reviewed act.
        </p>
      ) : null}

      {phase === 'review' ? (
        <div className="chain-card__actions">
          <button type="button" className="chain-card__btn chain-card__btn--accept" data-testid="chain-card-accept" onClick={onAccept}>
            Accept
          </button>
          <button type="button" className="chain-card__btn chain-card__btn--reject" data-testid="chain-card-reject" onClick={onReject}>
            Reject
          </button>
          <span className="chain-card__revise-note">or revise through chat</span>
        </div>
      ) : null}

      {phase === 'blocked' ? (
        // A blocked compile cannot be accepted (the canAccept gate is
        // structural — no Accept control exists here, bait 9). Reject is real:
        // it abandons.
        <div className="chain-card__actions">
          <button type="button" className="chain-card__btn chain-card__btn--reject" data-testid="chain-card-reject" onClick={onReject}>
            Reject
          </button>
          <span className="chain-card__revise-note">fix it through chat, then re-propose</span>
        </div>
      ) : null}
    </div>
  )
}
