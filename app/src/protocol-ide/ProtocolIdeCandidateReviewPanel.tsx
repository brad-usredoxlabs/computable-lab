/**
 * ProtocolIdeCandidateReviewPanel — surfaces extraction-candidate variants
 * for user selection during the candidate-review step (spec-029).
 *
 * Renders a card per variant with displayName, variantLabel, section count,
 * and a "Use this variant" button. On click, calls onSelectVariant.
 *
 * File size: kept under 200 lines.
 */

import './ProtocolIdeCandidateReviewPanel.css'

export interface VariantSummary {
  index: number
  displayName: string
  variantLabel: string | null
  sectionCount: number
}

export interface AwaitingVariantSelection {
  extractionDraftRef: string
  variants: VariantSummary[]
}

export interface CandidateReviewProps {
  awaitingVariantSelection: AwaitingVariantSelection
  onSelectVariant: (variantIndex: number) => Promise<void>
}

export function ProtocolIdeCandidateReviewPanel({
  awaitingVariantSelection,
  onSelectVariant,
}: CandidateReviewProps): JSX.Element {
  const { variants } = awaitingVariantSelection

  return (
    <div
      className="protocol-ide-candidate-review"
      data-testid="protocol-ide-candidate-review"
    >
      <h3 className="protocol-ide-candidate-review-title">
        Multiple protocol variants found. Choose one to continue.
      </h3>
      <div className="protocol-ide-candidate-review-variants">
        {variants.map((v) => (
          <div
            key={v.index}
            className="protocol-ide-candidate-review-card"
            data-testid={`variant-card-${v.index}`}
          >
            <div className="protocol-ide-candidate-review-card-header">
              <span className="protocol-ide-candidate-review-display-name">
                {v.displayName}
              </span>
              <span className="protocol-ide-candidate-review-variant-label">
                {v.variantLabel ?? '(no variant label)'}
              </span>
            </div>
            <div className="protocol-ide-candidate-review-card-body">
              <span className="protocol-ide-candidate-review-section-count">
                {v.sectionCount} sections
              </span>
              <button
                className="protocol-ide-candidate-review-select-btn"
                data-testid={`variant-select-${v.index}`}
                onClick={() => onSelectVariant(v.index)}
              >
                Use this variant
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
