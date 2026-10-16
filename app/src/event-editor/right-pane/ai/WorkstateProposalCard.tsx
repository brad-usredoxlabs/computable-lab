/**
 * WorkstateProposalCard — the tier-2 review card (PB-CH-4 §5).
 *
 * THE trust rule this component encodes: it becomes actionable ONLY from a
 * server `POST /api/drafts/compile` response with `canAccept: true`. The
 * `compiling` phase (POST in flight) and the `blocked` phase (canAccept:false)
 * render NO accept control — a raw model term or a merely schema-valid intent
 * never produces an Accept button. ChangesPanel-styled precedent: native
 * controls, theme tokens, light+dark readable (PROTO-AI-14).
 *
 * Tab labels come from the surfaces registry (`useSurfaceRegistry`) — the card
 * contains ZERO surface-name literals; the registry is the authority.
 */
import { useSurfaceRegistry } from '../../../shared/surfaces/registry'
import './WorkstateProposalCard.css'

export type WorkstateCardPhase = 'compiling' | 'review' | 'blocked' | 'applied'

export interface WorkstateCardTab {
  kind: string
  title?: string
}

export interface WorkstateCardTerm {
  term: string
  label?: string
}

export interface WorkstateCardDiagnostic {
  code?: string
  message: string
}

/**
 * QMS7-7 — one compiled record field for the record-drafting card block.
 * The label/value pair is BUILT SERVER-SIDE from the target schema's ui-v1
 * projection (labels from the ui spec, values rendered with the schema's own
 * vocabulary) — the card renders them verbatim and maps nothing by kind name.
 */
export interface WorkstateCardRecordField {
  label: string
  value: string
}

export interface WorkstateProposalCardProps {
  phase: WorkstateCardPhase
  summary?: string
  tabs?: WorkstateCardTab[]
  resolvedTerms?: WorkstateCardTerm[]
  diagnostics?: WorkstateCardDiagnostic[]
  /** QMS7-7: the compiled record proposal's field list (presentational only). */
  recordFields?: WorkstateCardRecordField[]
  draftId?: string
  revision?: number
  onAccept: () => void
  onReject: () => void
}

export function WorkstateProposalCard({
  phase,
  summary,
  tabs,
  resolvedTerms,
  diagnostics,
  recordFields,
  draftId,
  revision,
  onAccept,
  onReject,
}: WorkstateProposalCardProps) {
  const registry = useSurfaceRegistry()

  if (phase === 'compiling') {
    // Friction-first: prompt progress while the compile POST is in flight.
    // NO controls here — the card is not actionable until the server answers.
    return (
      <div className="workstate-card workstate-card--compiling" data-testid="workstate-card-compiling" role="status">
        <span className="workstate-card__spinner" aria-hidden="true" />
        compiling…
      </div>
    )
  }

  // Registry label for a tab kind — data lookup, never a literal. Falls back
  // to the kind itself when the registry has not loaded (never a throw).
  const labelForKind = (kind: string): string => {
    const spec = registry?.find((s) => s.id === kind)
    return spec?.label ?? kind
  }

  return (
    <div className={`workstate-card workstate-card--${phase}`} data-testid="workstate-card" role="region" aria-label="Workstate proposal">
      <header className="workstate-card__header">
        <span className="workstate-card__title">Proposed workspace</span>
        {draftId && revision != null ? (
          <span className="workstate-card__identity">
            {draftId} · revision {revision}
          </span>
        ) : null}
      </header>

      {summary ? <p className="workstate-card__summary">{summary}</p> : null}

      {phase === 'review' && tabs && tabs.length > 0 ? (
        <ul className="workstate-card__tabs">
          {tabs.map((t, i) => (
            <li key={`${t.kind}-${i}`} className="workstate-card__tab">
              {t.title ?? labelForKind(t.kind)}
            </li>
          ))}
        </ul>
      ) : null}

      {resolvedTerms && resolvedTerms.length > 0 ? (
        <p className="workstate-card__terms">
          {resolvedTerms.length} term{resolvedTerms.length === 1 ? '' : 's'} resolved
          {': '}
          {resolvedTerms.map((t) => t.label ?? t.term).join(', ')}
        </p>
      ) : null}

      {recordFields && recordFields.length > 0 ? (
        // QMS7-7: the compiled record proposal's fields (the ONE optional
        // presentational block). Labels/values arrive VERBATIM from the
        // server's ui-v1 projection — this component maps nothing by kind
        // name and adds no controls here (the phase below still gates
        // accept/reject exactly as before).
        <dl className="workstate-card__record-fields" data-testid="workstate-card-record-fields">
          {recordFields.map((f, i) => (
            <div key={`${f.label}-${i}`} className="workstate-card__record-field">
              <dt className="workstate-card__record-field-label">{f.label}</dt>
              <dd className="workstate-card__record-field-value">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {diagnostics && diagnostics.length > 0 ? (
        <ul className="workstate-card__diagnostics">
          {diagnostics.map((d, i) => (
            <li key={`${d.code ?? 'diag'}-${i}`} className="workstate-card__diagnostic">
              {d.code ? `${d.code}: ` : ''}
              {d.message}
            </li>
          ))}
        </ul>
      ) : null}

      {phase === 'applied' ? (
        // Spent card: controls disappear — no dead buttons (friction rule).
        <p className="workstate-card__applied" data-testid="workstate-card-applied">
          Applied — the workspace adopted the accepted draft.
        </p>
      ) : null}

      {phase === 'review' ? (
        <div className="workstate-card__actions">
          <button type="button" className="workstate-card__btn workstate-card__btn--accept" data-testid="workstate-card-accept" onClick={onAccept}>
            Accept
          </button>
          <button type="button" className="workstate-card__btn workstate-card__btn--reject" data-testid="workstate-card-reject" onClick={onReject}>
            Reject
          </button>
          <span className="workstate-card__revise-note">or revise through chat</span>
        </div>
      ) : null}

      {phase === 'blocked' ? (
        // A blocked compile cannot be accepted (the contract: pending or
        // blocked drafts cannot be accepted). Reject is real: it abandons.
        <div className="workstate-card__actions">
          <button type="button" className="workstate-card__btn workstate-card__btn--reject" data-testid="workstate-card-reject" onClick={onReject}>
            Reject
          </button>
          <span className="workstate-card__revise-note">fix it through chat, then re-propose</span>
        </div>
      ) : null}
    </div>
  )
}
