import type { IngestionCandidateRecord } from '../../types/ingestion'

type VariantEntry = {
  label: string
  formulationTitle?: string
  recipeTitle?: string
  ingredientCount?: number
}

export function FormulationVariantReviewPanel({ candidates }: { candidates: IngestionCandidateRecord[] }) {
  const variants = new Map<string, VariantEntry>()

  for (const candidate of candidates) {
    if (candidate.payload.candidate_type !== 'formulation' && candidate.payload.candidate_type !== 'recipe') continue
    const payload = candidate.payload.payload as {
      variant_label?: string
      output?: { composition?: unknown[] }
    }
    const label = payload.variant_label || candidate.payload.normalized_name || candidate.payload.title
    const current = variants.get(label) ?? { label }
    if (candidate.payload.candidate_type === 'formulation') current.formulationTitle = candidate.payload.title
    if (candidate.payload.candidate_type === 'recipe') current.recipeTitle = candidate.payload.title
    if (Array.isArray(payload.output?.composition)) current.ingredientCount = payload.output.composition.length
    variants.set(label, current)
  }

  if (variants.size === 0) return null

  return (
    <section className="ingestion-section">
      <div className="ingestion-section__head">
        <div>
          <p className="ingestion-section__eyebrow">Formulation Variants</p>
          <h3>{variants.size} detected</h3>
        </div>
      </div>
      <div className="ingestion-card-grid">
        {Array.from(variants.values()).map((variant) => (
          <article key={variant.label} className="ingestion-card">
            <div className="ingestion-card__head">
              <div>
                <h4>{variant.label}</h4>
                <p>{variant.ingredientCount ?? 0} listed components</p>
              </div>
            </div>
            <div className="ingestion-card__meta">
              {variant.formulationTitle ? <span>{variant.formulationTitle}</span> : null}
              {variant.recipeTitle ? <span>{variant.recipeTitle}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
