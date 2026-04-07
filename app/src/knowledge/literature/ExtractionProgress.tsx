/**
 * ExtractionProgress — Stream progress display during knowledge extraction.
 */

import type { AiStreamEvent } from '../../types/ai'

interface ExtractionProgressProps {
  events: AiStreamEvent[]
  isExtracting: boolean
  onCancel: () => void
}

export function ExtractionProgress({ events, isExtracting, onCancel }: ExtractionProgressProps) {
  if (events.length === 0 && !isExtracting) return null

  return (
    <>
      <div className="extract-progress">
        <div className="extract-progress__header">
          <span className="extract-progress__title">
            {isExtracting ? (
              <>
                <span className="extract-progress__spinner" />
                Extracting knowledge...
              </>
            ) : (
              'Extraction complete'
            )}
          </span>
          {isExtracting && (
            <button className="extract-progress__cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>

        <div className="extract-progress__events">
          {events.map((ev, i) => (
            <div key={i} className="extract-progress__event">
              {ev.type === 'status' && (
                <span className="extract-progress__status">{ev.message}</span>
              )}
              {ev.type === 'thinking' && (
                <span className="extract-progress__thinking">{ev.text}</span>
              )}
              {ev.type === 'tool_call' && (
                <span className="extract-progress__tool">
                  <span className="extract-progress__tool-icon">&#9881;</span>
                  {ev.toolName || (ev as unknown as Record<string, string>).tool}
                </span>
              )}
              {ev.type === 'tool_result' && (
                <span className={`extract-progress__tool-result ${
                  (ev as unknown as Record<string, boolean>).success
                    ? 'extract-progress__tool-result--ok'
                    : 'extract-progress__tool-result--err'
                }`}>
                  {(ev as unknown as Record<string, boolean>).success ? '\u2713' : '\u2717'}{' '}
                  {ev.toolName || (ev as unknown as Record<string, string>).tool}
                  {(ev as unknown as Record<string, number>).durationMs != null && (
                    <span className="extract-progress__duration">
                      {Math.round((ev as unknown as Record<string, number>).durationMs)}ms
                    </span>
                  )}
                </span>
              )}
              {ev.type === 'error' && (
                <span className="extract-progress__error">{ev.message}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .extract-progress {
          padding: 0.75rem;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          background: #f8f9fa;
        }
        .extract-progress__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .extract-progress__title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          font-weight: 500;
          color: #495057;
        }
        .extract-progress__spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid #dee2e6;
          border-top-color: #228be6;
          border-radius: 50%;
          animation: ep-spin 0.8s linear infinite;
        }
        @keyframes ep-spin {
          to { transform: rotate(360deg); }
        }
        .extract-progress__cancel {
          padding: 0.2rem 0.5rem;
          font-size: 0.7rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          background: white;
          color: #868e96;
          cursor: pointer;
        }
        .extract-progress__cancel:hover {
          border-color: #fa5252;
          color: #fa5252;
        }
        .extract-progress__events {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          max-height: 150px;
          overflow-y: auto;
        }
        .extract-progress__event {
          font-size: 0.7rem;
        }
        .extract-progress__status {
          color: #868e96;
        }
        .extract-progress__thinking {
          color: #495057;
          font-style: italic;
        }
        .extract-progress__tool {
          color: #5f3dc4;
          font-family: ui-monospace, monospace;
          font-size: 0.65rem;
        }
        .extract-progress__tool-icon {
          margin-right: 0.25rem;
        }
        .extract-progress__tool-result {
          font-family: ui-monospace, monospace;
          font-size: 0.65rem;
        }
        .extract-progress__tool-result--ok {
          color: #2b8a3e;
        }
        .extract-progress__tool-result--err {
          color: #c92a2a;
        }
        .extract-progress__duration {
          margin-left: 0.5rem;
          color: #adb5bd;
        }
        .extract-progress__error {
          color: #c92a2a;
          font-weight: 500;
        }
      `}</style>
    </>
  )
}
