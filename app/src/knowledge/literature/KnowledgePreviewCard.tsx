/**
 * KnowledgePreviewCard — Single claim triple card in the preview panel.
 */

import { RefBadge } from '../../shared/ref/RefBadge'
import type { Ref } from '../../types/ref'

interface KnowledgePreviewCardProps {
  claim: Record<string, unknown>
  /** Assertions linked to this claim */
  assertions: Array<Record<string, unknown>>
  /** Evidence linked to this claim's assertions */
  evidence: Array<Record<string, unknown>>
  /** Whether this claim is selected for acceptance */
  selected?: boolean
  /** Toggle selection */
  onToggle?: () => void
  /** If set, this claim is a duplicate of the given existing claim ID */
  duplicateOf?: string
  /** Confidence ratings keyed by assertion ID */
  confidenceMap?: Map<string, number>
  /** Callback when user changes a confidence rating */
  onConfidenceChange?: (assertionId: string, value: number) => void
}

// ---------------------------------------------------------------------------
// StarRating — inline 5-star clickable rating
// ---------------------------------------------------------------------------
function StarRating({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <span className="kp-star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`kp-star ${n <= value ? 'kp-star--filled' : 'kp-star--empty'}`}
          onClick={onChange ? () => onChange(n) : undefined}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={n <= value ? '#f59e0b' : 'none'}
          stroke={n <= value ? '#f59e0b' : '#d1d5db'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

function asRef(val: unknown): Ref | null {
  if (!val || typeof val !== 'object') return null
  const r = val as Record<string, unknown>
  if (r.kind === 'ontology' || r.kind === 'record') return r as unknown as Ref
  return null
}

export function KnowledgePreviewCard({ claim, assertions, evidence, selected, onToggle, duplicateOf, confidenceMap, onConfidenceChange }: KnowledgePreviewCardProps) {
  const statement = (claim.statement as string) || '(no statement)'
  const subject = asRef(claim.subject)
  const predicate = asRef(claim.predicate)
  const object = asRef(claim.object)
  const claimId = (claim.id as string) || ''

  return (
    <>
      <div className={`kp-card ${selected === false ? 'kp-card--deselected' : ''}`}>
        <div className="kp-card__header">
          {onToggle && (
            <input
              type="checkbox"
              className="kp-card__checkbox"
              checked={selected ?? true}
              onChange={onToggle}
            />
          )}
          <div className="kp-card__id">{claimId}</div>
          {duplicateOf && (
            <span className="kp-card__dup-badge">Already stored as {duplicateOf}</span>
          )}
        </div>
        <p className="kp-card__statement">{statement}</p>

        {(subject || predicate || object) && (
          <div className="kp-card__triple">
            {subject && <RefBadge value={subject} size="sm" />}
            {predicate && (
              <span className="kp-card__arrow">
                <RefBadge value={predicate} size="sm" />
              </span>
            )}
            {object && <RefBadge value={object} size="sm" />}
          </div>
        )}

        {assertions.length > 0 && (
          <div className="kp-card__assertions">
            {assertions.map((a, i) => {
              const outcome = a.outcome as Record<string, unknown> | undefined
              const aId = String(a.id)
              const confidence = confidenceMap?.get(aId) ?? 3
              return (
                <div key={i} className="kp-card__assertion">
                  <span className="kp-card__assertion-id">{aId}</span>
                  {outcome?.direction ? (
                    <span className="kp-card__direction">
                      {directionIcon(String(outcome.direction))}{' '}
                      {String(outcome.direction)}
                    </span>
                  ) : null}
                  {outcome?.measure ? (
                    <span className="kp-card__measure">{String(outcome.measure)}</span>
                  ) : null}
                  <StarRating
                    value={confidence}
                    onChange={onConfidenceChange ? (n) => onConfidenceChange(aId, n) : undefined}
                  />
                </div>
              )
            })}
          </div>
        )}

        {evidence.length > 0 && (
          <div className="kp-card__evidence">
            {evidence.map((e, i) => {
              const sources = Array.isArray(e.sources) ? e.sources : []
              return (
                <div key={i} className="kp-card__evidence-item">
                  {sources.map((src: Record<string, unknown>, j: number) => {
                    const srcRef = asRef(src.ref)
                    return (
                      <div key={j} className="kp-card__source">
                        <span className="kp-card__source-type">{String(src.type)}</span>
                        {srcRef && <RefBadge value={srcRef} size="sm" />}
                        {src.snippet ? (
                          <span className="kp-card__snippet">
                            {truncate(String(src.snippet), 120)}
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .kp-card {
          padding: 0.75rem;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          background: white;
          transition: opacity 0.15s;
        }
        .kp-card--deselected {
          opacity: 0.45;
        }
        .kp-card__header {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          margin-bottom: 0.25rem;
        }
        .kp-card__checkbox {
          margin: 0;
          cursor: pointer;
          flex-shrink: 0;
        }
        .kp-card__id {
          font-size: 0.65rem;
          font-family: ui-monospace, monospace;
          color: #adb5bd;
        }
        .kp-card__statement {
          margin: 0 0 0.5rem;
          font-size: 0.8rem;
          font-weight: 500;
          color: #212529;
          line-height: 1.4;
        }
        .kp-card__triple {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.375rem;
          margin-bottom: 0.5rem;
        }
        .kp-card__arrow {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .kp-card__arrow::before,
        .kp-card__arrow::after {
          content: '';
          display: inline-block;
          width: 8px;
          height: 1px;
          background: #adb5bd;
        }
        .kp-card__assertions {
          margin-top: 0.375rem;
          padding-left: 0.5rem;
          border-left: 2px solid #e9ecef;
        }
        .kp-card__assertion {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.7rem;
          margin-bottom: 0.25rem;
        }
        .kp-card__assertion-id {
          font-family: ui-monospace, monospace;
          color: #868e96;
          font-size: 0.65rem;
        }
        .kp-card__direction {
          font-weight: 500;
          color: #495057;
        }
        .kp-card__measure {
          color: #868e96;
        }
        .kp-card__evidence {
          margin-top: 0.375rem;
        }
        .kp-card__evidence-item {
          padding-top: 0.25rem;
        }
        .kp-card__source {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.7rem;
          flex-wrap: wrap;
        }
        .kp-card__source-type {
          font-size: 0.65rem;
          font-weight: 500;
          color: #868e96;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .kp-card__snippet {
          font-size: 0.7rem;
          color: #868e96;
          font-style: italic;
        }
        .kp-card__dup-badge {
          font-size: 0.6rem;
          font-weight: 500;
          padding: 0.1rem 0.4rem;
          background: #fff3bf;
          color: #e67700;
          border: 1px solid #ffd43b;
          border-radius: 9999px;
          white-space: nowrap;
        }
        .kp-star-rating {
          display: inline-flex;
          align-items: center;
          gap: 1px;
          margin-left: auto;
        }
        .kp-star {
          cursor: pointer;
          transition: transform 0.1s;
        }
        .kp-star:hover {
          transform: scale(1.2);
        }
      `}</style>
    </>
  )
}

function directionIcon(dir: string): string {
  switch (dir) {
    case 'increased': return '\u2191'
    case 'decreased': return '\u2193'
    case 'no_change': return '\u2192'
    case 'mixed': return '\u2195'
    default: return '?'
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s
}
