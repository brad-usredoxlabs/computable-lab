/**
 * ExecutionNav - Navigation controls for execution mode.
 * Provides Previous/Next buttons, progress indicator, and step completion controls.
 */

export interface ExecutionNavProps {
  currentIndex: number
  totalEvents: number
  onPrevious: () => void
  onNext: () => void
  canGoPrevious: boolean
  canGoNext: boolean
}

export function ExecutionNav({
  currentIndex,
  totalEvents,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: ExecutionNavProps) {
  const progress = totalEvents > 0 ? ((currentIndex + 1) / totalEvents) * 100 : 0

  return (
    <div className="execution-nav">
      <div className="execution-nav__progress-bar">
        <div 
          className="execution-nav__progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="execution-nav__controls">
        <button
          className="execution-nav__button"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          aria-label="Previous step"
        >
          ‹ Previous
        </button>

        <div className="execution-nav__counter">
          {currentIndex + 1} / {totalEvents}
        </div>

        <button
          className="execution-nav__button execution-nav__button--primary"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label="Next step"
        >
          Next ›
        </button>
      </div>

      <div className="execution-nav__keyboard-hint">
        Use ← → arrow keys to navigate
      </div>

      <style>{`
        .execution-nav {
          padding: 1rem;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .execution-nav__progress-bar {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 1rem;
        }

        .execution-nav__progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%);
          transition: width 0.3s ease;
        }

        .execution-nav__controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .execution-nav__button {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: white;
          color: #374151;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          min-width: 80px;
        }

        .execution-nav__button:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .execution-nav__button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .execution-nav__button--primary {
          background: #2563eb;
          border-color: #2563eb;
          color: white;
        }

        .execution-nav__button--primary:hover:not(:disabled) {
          background: #1d4ed8;
          border-color: #1d4ed8;
        }

        .execution-nav__counter {
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
          min-width: 60px;
          text-align: center;
        }

        .execution-nav__keyboard-hint {
          margin-top: 0.75rem;
          font-size: 0.75rem;
          color: #9ca3af;
          text-align: center;
        }
      `}</style>
    </div>
  )
}
