/**
 * PreviewBanner — Sticky accept/reject bar when AI preview events exist.
 *
 * Shows event count, affected well count, and Accept/Reject buttons.
 */

import { useMemo } from 'react'
import type { PlateEvent } from '../../types/events'
import type { AiLabwareAddition } from '../../types/ai'
import type { PreviewEventState } from '../hooks/useAiChat'
import { getAffectedWells } from '../../types/events'

interface PreviewBannerProps {
  previewEvents: PlateEvent[]
  previewLabwareAdditions?: AiLabwareAddition[]
  previewEventStates?: Map<string, PreviewEventState>
  unresolvedCount?: number
  onAccept: () => void
  onReject: () => void
  onCommitAccepted?: () => void
  isAccepting?: boolean
}

export function PreviewBanner({ previewEvents, previewLabwareAdditions = [], previewEventStates, unresolvedCount, onAccept, onReject, onCommitAccepted, isAccepting = false }: PreviewBannerProps) {
  const wellCount = useMemo(() => {
    const allWells = new Set<string>()
    for (const event of previewEvents) {
      for (const w of getAffectedWells(event)) {
        allWells.add(w)
      }
    }
    return allWells.size
  }, [previewEvents])

  const acceptedCount = useMemo(() => {
    if (!previewEventStates) return 0
    let count = 0
    for (const state of previewEventStates.values()) {
      if (state === 'accepted') count++
    }
    return count
  }, [previewEventStates])

  if (previewEvents.length === 0 && previewLabwareAdditions.length === 0) return null

  return (
    <div className="preview-banner">
      {previewLabwareAdditions.length > 0 && (
        <div className="preview-labware-additions">
          <div className="preview-labware-additions__header">
            Also add to editor:
          </div>
          <ul className="preview-labware-additions__list">
            {previewLabwareAdditions.map((a) => (
              <li key={a.recordId} className="preview-labware-additions__item">
                <code className="preview-labware-additions__id">{a.recordId}</code>
                {a.reason && <span className="preview-labware-additions__reason"> — {a.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {previewEvents.length > 0 && (
        <span className="preview-banner__info">
          {previewEvents.length} event{previewEvents.length !== 1 ? 's' : ''}
          {wellCount > 0 && ` · ${wellCount} well${wellCount !== 1 ? 's' : ''}`}
          {unresolvedCount != null && unresolvedCount > 0 && (
            <span className="preview-banner__unresolved">
              {' '}&middot; {unresolvedCount} new material{unresolvedCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      )}
      <div className="preview-banner__actions">
        <button
          className="preview-banner__btn preview-banner__btn--reject"
          onClick={onReject}
          disabled={isAccepting}
        >
          Reject
        </button>
        <button
          className="preview-banner__btn preview-banner__btn--commit"
          onClick={onCommitAccepted}
          disabled={acceptedCount === 0 || isAccepting || !onCommitAccepted}
        >
          Commit Accepted ({acceptedCount})
        </button>
        <button
          className="preview-banner__btn preview-banner__btn--accept"
          onClick={onAccept}
          disabled={isAccepting}
        >
          {isAccepting
            ? 'Accepting…'
            : unresolvedCount != null && unresolvedCount > 0
              ? 'Accept & Create Materials…'
              : 'Accept'}
        </button>
      </div>

      <style>{`
        .preview-banner {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          padding: 0.5rem 0.75rem;
          background: #f3d9fa;
          border-top: 2px solid #be4bdb;
        }

        .preview-labware-additions {
          margin-bottom: 0.5rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e0c3fc;
        }

        .preview-labware-additions__header {
          font-size: 0.75rem;
          font-weight: 600;
          color: #862e9c;
          margin-bottom: 0.25rem;
        }

        .preview-labware-additions__list {
          margin: 0;
          padding-left: 1rem;
          list-style: disc;
        }

        .preview-labware-additions__item {
          font-size: 0.75rem;
          color: #5c4b8a;
          margin-bottom: 0.15rem;
        }

        .preview-labware-additions__id {
          font-family: monospace;
          background: #f0ebf5;
          padding: 0.1rem 0.25rem;
          border-radius: 3px;
        }

        .preview-labware-additions__reason {
          color: #664d8a;
        }

        .preview-banner__info {
          font-size: 0.8rem;
          font-weight: 600;
          color: #862e9c;
        }

        .preview-banner__unresolved {
          color: #e67700;
          font-weight: 600;
        }

        .preview-banner__actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }

        .preview-banner__btn {
          padding: 0.3rem 0.75rem;
          border: none;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .preview-banner__btn--accept {
          background: #40c057;
          color: white;
        }

        .preview-banner__btn--accept:hover {
          background: #2f9e44;
        }

        .preview-banner__btn--reject {
          background: #fa5252;
          color: white;
        }

        .preview-banner__btn--reject:hover {
          background: #e03131;
        }

        .preview-banner__btn--commit {
          background: #339af0;
          color: white;
        }

        .preview-banner__btn--commit:hover {
          background: #228be6;
        }

        .preview-banner__btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
