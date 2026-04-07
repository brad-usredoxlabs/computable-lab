/**
 * PreviewBanner — Sticky accept/reject bar when AI preview events exist.
 *
 * Shows event count, affected well count, and Accept/Reject buttons.
 */

import { useMemo } from 'react'
import type { PlateEvent } from '../../types/events'
import { getAffectedWells } from '../../types/events'

interface PreviewBannerProps {
  previewEvents: PlateEvent[]
  unresolvedCount?: number
  onAccept: () => void
  onReject: () => void
}

export function PreviewBanner({ previewEvents, unresolvedCount, onAccept, onReject }: PreviewBannerProps) {
  const wellCount = useMemo(() => {
    const allWells = new Set<string>()
    for (const event of previewEvents) {
      for (const w of getAffectedWells(event)) {
        allWells.add(w)
      }
    }
    return allWells.size
  }, [previewEvents])

  if (previewEvents.length === 0) return null

  return (
    <div className="preview-banner">
      <span className="preview-banner__info">
        {previewEvents.length} event{previewEvents.length !== 1 ? 's' : ''}
        {wellCount > 0 && ` \u00B7 ${wellCount} well${wellCount !== 1 ? 's' : ''}`}
        {unresolvedCount != null && unresolvedCount > 0 && (
          <span className="preview-banner__unresolved">
            {' '}&middot; {unresolvedCount} new material{unresolvedCount !== 1 ? 's' : ''}
          </span>
        )}
      </span>
      <div className="preview-banner__actions">
        <button className="preview-banner__btn preview-banner__btn--reject" onClick={onReject}>
          Reject
        </button>
        <button className="preview-banner__btn preview-banner__btn--accept" onClick={onAccept}>
          {unresolvedCount != null && unresolvedCount > 0
            ? 'Accept & Create Materials\u2026'
            : 'Accept'}
        </button>
      </div>

      <style>{`
        .preview-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: #f3d9fa;
          border-top: 2px solid #be4bdb;
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
      `}</style>
    </div>
  )
}
