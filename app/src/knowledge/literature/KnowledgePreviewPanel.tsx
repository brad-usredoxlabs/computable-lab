/**
 * KnowledgePreviewPanel — Container for knowledge preview cards.
 *
 * Shows accept/reject banner, scrollable list of claim cards with per-claim
 * selection checkboxes, notes, and unresolved material count.
 */

import { useState, useCallback } from 'react'
import { KnowledgePreviewCard } from './KnowledgePreviewCard'
import type { KnowledgeExtractionResult } from '../../types/ai'

interface KnowledgePreviewPanelProps {
  preview: KnowledgeExtractionResult
  unresolvedCount: number
  onAcceptSelected: (selectedClaimIds: Set<string>) => void
  onReject: () => void
  accepting?: boolean
  /** Map of claim triple-key → existing claim ID for duplicates */
  duplicatesMap?: Map<string, string>
  /** Confidence ratings keyed by assertion ID */
  confidenceMap?: Map<string, number>
  /** Callback when user changes a confidence rating */
  onConfidenceChange?: (assertionId: string, value: number) => void
}

export function KnowledgePreviewPanel({
  preview,
  unresolvedCount,
  onAcceptSelected,
  onReject,
  accepting,
  duplicatesMap,
  confidenceMap,
  onConfidenceChange,
}: KnowledgePreviewPanelProps) {
  // All claim IDs (including orphan assertion pseudo-claims)
  const allClaimIds = getAllClaimIds(preview)

  // Count duplicates for the banner
  const dupCount = duplicatesMap ? countDuplicateClaims(preview, duplicatesMap) : 0

  // Initialize selection: all non-duplicate claims selected, duplicates deselected
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!duplicatesMap || duplicatesMap.size === 0) return new Set(allClaimIds)
    const initial = new Set<string>()
    for (const id of allClaimIds) {
      if (!isDuplicateClaim(id, preview, duplicatesMap)) {
        initial.add(id)
      }
    }
    return initial
  })

  const toggleClaim = useCallback((claimId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(claimId)) next.delete(claimId)
      else next.add(claimId)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === allClaimIds.length ? new Set() : new Set(allClaimIds)))
  }, [allClaimIds])

  const selectedCount = selected.size

  // Group assertions and evidence by their claim ref
  function getLinkedAssertions(claimId: string) {
    return preview.assertions.filter((a) => {
      const cr = a.claim_ref as Record<string, unknown> | undefined
      return cr?.id === claimId
    })
  }

  function getLinkedEvidence(assertionIds: string[]) {
    return preview.evidence.filter((e) => {
      const supports = Array.isArray(e.supports) ? e.supports : []
      return supports.some((s: Record<string, unknown>) =>
        assertionIds.includes(s.id as string),
      )
    })
  }

  const orphanAssertions = preview.assertions.filter((a) => {
    const cr = a.claim_ref as Record<string, unknown> | undefined
    return !cr?.id || !preview.claims.some((c) => c.id === cr.id)
  })

  return (
    <>
      <div className="kp-panel">
        {/* Banner */}
        <div className="kp-panel__banner">
          <div className="kp-panel__banner-info">
            <label className="kp-panel__select-all">
              <input
                type="checkbox"
                checked={selectedCount === allClaimIds.length}
                ref={(el) => {
                  if (el) el.indeterminate = selectedCount > 0 && selectedCount < allClaimIds.length
                }}
                onChange={toggleAll}
              />
              <strong>{selectedCount}</strong> of {allClaimIds.length} claim{allClaimIds.length !== 1 ? 's' : ''} selected
              {dupCount > 0 && (
                <span className="kp-panel__dup-count"> ({dupCount} already stored)</span>
              )}
            </label>
            {unresolvedCount > 0 && (
              <span className="kp-panel__unresolved">
                ({unresolvedCount} unresolved material{unresolvedCount !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          <div className="kp-panel__banner-actions">
            <button
              className="kp-panel__reject-btn"
              onClick={onReject}
              disabled={accepting}
            >
              Dismiss
            </button>
            <button
              className="kp-panel__accept-btn"
              onClick={() => onAcceptSelected(selected)}
              disabled={accepting || selectedCount === 0}
            >
              {accepting
                ? 'Saving...'
                : unresolvedCount > 0
                  ? `Resolve & Accept (${selectedCount})`
                  : `Accept Selected (${selectedCount})`}
            </button>
          </div>
        </div>

        {/* Error */}
        {preview.error && (
          <div className="kp-panel__error">
            {preview.error}
          </div>
        )}

        {/* Notes */}
        {preview.notes.length > 0 && (
          <div className="kp-panel__notes">
            {preview.notes.map((n, i) => (
              <p key={i} className="kp-panel__note">{n}</p>
            ))}
          </div>
        )}

        {/* Cards */}
        <div className="kp-panel__cards">
          {preview.claims.map((claim) => {
            const claimId = claim.id as string
            const linkedAssertions = getLinkedAssertions(claimId)
            const assertionIds = linkedAssertions.map((a) => a.id as string)
            const linkedEvidence = getLinkedEvidence(assertionIds)

            const dupOf = getDuplicateOf(claimId, claim, duplicatesMap)

            return (
              <KnowledgePreviewCard
                key={claimId}
                claim={claim}
                assertions={linkedAssertions}
                evidence={linkedEvidence}
                selected={selected.has(claimId)}
                onToggle={() => toggleClaim(claimId)}
                duplicateOf={dupOf}
                confidenceMap={confidenceMap}
                onConfidenceChange={onConfidenceChange}
              />
            )
          })}

          {/* Show orphan assertions (not linked to any claim) */}
          {orphanAssertions.map((a) => {
            const pseudoId = `orphan-a-${String(a.id)}`
            return (
              <KnowledgePreviewCard
                key={pseudoId}
                claim={{ id: a.id, statement: a.statement, kind: 'assertion' }}
                assertions={[a]}
                evidence={[]}
                selected={selected.has(pseudoId)}
                onToggle={() => toggleClaim(pseudoId)}
              />
            )
          })}
        </div>
      </div>

      <style>{`
        .kp-panel {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          height: 100%;
        }
        .kp-panel__banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          background: #e7f5ff;
          border: 1px solid #a5d8ff;
          border-radius: 8px;
          flex-shrink: 0;
        }
        .kp-panel__banner-info {
          font-size: 0.8rem;
          color: #1971c2;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .kp-panel__select-all {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .kp-panel__select-all input[type="checkbox"] {
          margin: 0;
          cursor: pointer;
        }
        .kp-panel__unresolved {
          margin-left: 0.5rem;
          color: #e67700;
          font-size: 0.75rem;
        }
        .kp-panel__dup-count {
          color: #e67700;
          font-size: 0.75rem;
          font-weight: normal;
        }
        .kp-panel__banner-actions {
          display: flex;
          gap: 0.5rem;
        }
        .kp-panel__reject-btn {
          padding: 0.3rem 0.75rem;
          font-size: 0.75rem;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          background: white;
          color: #495057;
          cursor: pointer;
          transition: all 0.15s;
        }
        .kp-panel__reject-btn:hover:not(:disabled) {
          border-color: #fa5252;
          color: #fa5252;
        }
        .kp-panel__accept-btn {
          padding: 0.3rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          border: none;
          border-radius: 6px;
          background: #228be6;
          color: white;
          cursor: pointer;
          transition: all 0.15s;
        }
        .kp-panel__accept-btn:hover:not(:disabled) {
          background: #1c7ed6;
        }
        .kp-panel__accept-btn:disabled,
        .kp-panel__reject-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .kp-panel__error {
          padding: 0.5rem 0.75rem;
          background: #fff5f5;
          border: 1px solid #ffc9c9;
          border-radius: 6px;
          color: #c92a2a;
          font-size: 0.8rem;
        }
        .kp-panel__notes {
          padding: 0.5rem 0.75rem;
          background: #fff9db;
          border: 1px solid #ffe066;
          border-radius: 6px;
        }
        .kp-panel__note {
          margin: 0;
          font-size: 0.75rem;
          color: #5c4813;
          line-height: 1.4;
        }
        .kp-panel__note + .kp-panel__note {
          margin-top: 0.25rem;
        }
        .kp-panel__cards {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }
      `}</style>
    </>
  )
}

/** Collect all claim IDs including pseudo-IDs for orphan assertions. */
function getAllClaimIds(preview: KnowledgeExtractionResult): string[] {
  const ids: string[] = preview.claims.map((c) => c.id as string)
  preview.assertions.forEach((a) => {
    const cr = a.claim_ref as Record<string, unknown> | undefined
    if (!cr?.id || !preview.claims.some((c) => c.id === cr.id)) {
      ids.push(`orphan-a-${String(a.id)}`)
    }
  })
  return ids
}

/** Build the triple key for a claim to look up in the duplicates map. */
function claimTripleKey(claim: Record<string, unknown>): string | null {
  const s = claim.subject as Record<string, unknown> | undefined
  const p = claim.predicate as Record<string, unknown> | undefined
  const o = claim.object as Record<string, unknown> | undefined
  if (s?.id && p?.id && o?.id) {
    return `${String(s.id)}|${String(p.id)}|${String(o.id)}`
  }
  return null
}

/** Get the existing claim ID if this claim is a duplicate. */
function getDuplicateOf(
  _claimId: string,
  claim: Record<string, unknown>,
  duplicatesMap?: Map<string, string>,
): string | undefined {
  if (!duplicatesMap || duplicatesMap.size === 0) return undefined
  const key = claimTripleKey(claim)
  return key ? duplicatesMap.get(key) : undefined
}

/** Check if a claim ID corresponds to a duplicate. */
function isDuplicateClaim(
  claimId: string,
  preview: KnowledgeExtractionResult,
  duplicatesMap: Map<string, string>,
): boolean {
  const claim = preview.claims.find((c) => c.id === claimId)
  if (!claim) return false
  const key = claimTripleKey(claim)
  return key ? duplicatesMap.has(key) : false
}

/** Count how many claims are duplicates. */
function countDuplicateClaims(
  preview: KnowledgeExtractionResult,
  duplicatesMap: Map<string, string>,
): number {
  let count = 0
  for (const claim of preview.claims) {
    const key = claimTripleKey(claim)
    if (key && duplicatesMap.has(key)) count++
  }
  return count
}
