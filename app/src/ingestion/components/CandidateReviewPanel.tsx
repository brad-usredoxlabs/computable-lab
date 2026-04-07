import type { IngestionCandidateRecord } from '../../types/ingestion'

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

export function CandidateReviewPanel({ candidates }: { candidates: IngestionCandidateRecord[] }) {
  const byType = candidates.reduce<Record<string, IngestionCandidateRecord[]>>((acc, candidate) => {
    const key = candidate.payload.candidate_type
    acc[key] = acc[key] ?? []
    acc[key]!.push(candidate)
    return acc
  }, {})

  if (candidates.length === 0) {
    return <div className="ingestion-empty">No review candidates yet.</div>
  }

  return (
    <div className="ingestion-card-grid">
      {Object.entries(byType).map(([type, items]) => (
        <article key={type} className="ingestion-card">
          <div className="ingestion-card__head">
            <div>
              <h4>{humanize(type)}</h4>
              <p>{items.length} candidate{items.length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <div className="ingestion-card__meta">
            {items.slice(0, 4).map((item) => <span key={item.recordId}>{item.payload.title}</span>)}
            {items.length > 4 && <span>+{items.length - 4} more</span>}
          </div>
        </article>
      ))}
    </div>
  )
}
