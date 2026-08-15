/**
 * ExecutionNav - Navigation controls for execution mode.
 * Provides Previous/Next buttons for step navigation.
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
  return (
    <div className="execution-nav" data-testid="execution-nav">
      <button
        type="button"
        className="execution-nav__button"
        onClick={onPrevious}
        disabled={!canGoPrevious}
        aria-label="Previous step"
      >
        ‹
      </button>
      <span className="execution-nav__indicator">
        Step {currentIndex + 1} of {totalEvents}
      </span>
      <button
        type="button"
        className="execution-nav__button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next step"
      >
        ›
      </button>
    </div>
  )
}
