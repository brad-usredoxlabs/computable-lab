import { useState } from 'react'
import type { IngestionCandidateRecord } from '../../types/ingestion'

interface OntologyTermSuggestion {
  termId: string
  label: string
  ontology: string
  score: number
  reasoning: string
}

interface MappingItem {
  candidateId: string
  candidateTitle: string
  currentTermId?: string
  suggestions: OntologyTermSuggestion[]
  selectedTermId?: string
}

interface Props {
  candidates: IngestionCandidateRecord[]
}

export function OntologyMappingReview({ candidates }: Props) {
  const ambiguousCandidates = candidates.filter((c) => {
    const matchRefs = c.payload.match_refs ?? []
    return matchRefs.length > 1
  })

  const [mappings, setMappings] = useState<MappingItem[]>(() =>
    ambiguousCandidates.map((c) => {
      const matchRefs = c.payload.match_refs ?? []
      return {
        candidateId: c.recordId,
        candidateTitle: c.payload.title,
        currentTermId: matchRefs[0]?.term_id,
        suggestions: matchRefs.map((ref) => ({
          termId: ref.term_id,
          label: ref.label,
          ontology: ref.match_type,
          score: ref.score,
          reasoning: `${ref.match_type} match with score ${ref.score.toFixed(2)}`,
        })),
      }
    })
  )

  function handleSelect(candidateId: string, termId: string) {
    setMappings((prev) =>
      prev.map((item) =>
        item.candidateId === candidateId ? { ...item, selectedTermId: termId } : item,
      ),
    )
  }

  if (mappings.length === 0) return null

  return (
    <section className="ingestion-section ontology-review">
      <div className="ingestion-section__head">
        <div>
          <p className="ingestion-section__eyebrow">AI Ontology Review</p>
          <h3>Ambiguous Term Mappings ({mappings.length})</h3>
        </div>
      </div>
      <div className="ontology-review__list">
        {mappings.map((item) => (
          <div key={item.candidateId} className="ontology-review__item">
            <div className="ontology-review__item-head">
              <strong>{item.candidateTitle}</strong>
              {item.currentTermId && <span className="ontology-review__current">Current: {item.currentTermId}</span>}
            </div>
            <div className="ontology-review__suggestions">
              {item.suggestions.map((suggestion) => (
                <label
                  key={suggestion.termId}
                  className={`ontology-review__option ${item.selectedTermId === suggestion.termId ? 'ontology-review__option--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`ontology-${item.candidateId}`}
                    checked={item.selectedTermId === suggestion.termId}
                    onChange={() => handleSelect(item.candidateId, suggestion.termId)}
                  />
                  <div className="ontology-review__option-body">
                    <div className="ontology-review__option-head">
                      <strong>{suggestion.label}</strong>
                      <span className="ontology-review__term-id">{suggestion.termId}</span>
                      <span className={`ai-suggestion__confidence ai-suggestion__confidence--${suggestion.score >= 0.7 ? 'high' : suggestion.score >= 0.4 ? 'medium' : 'low'}`}>
                        {Math.round(suggestion.score * 100)}%
                      </span>
                    </div>
                    <span className="ontology-review__reasoning">{suggestion.reasoning}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .ontology-review__list { display: flex; flex-direction: column; gap: 0.75rem; }
        .ontology-review__item { padding: 0.75rem; border: 1px solid #e9ecef; border-radius: 12px; background: white; }
        .ontology-review__item-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
        .ontology-review__current { font-size: 0.78rem; color: #868e96; }
        .ontology-review__suggestions { display: flex; flex-direction: column; gap: 0.35rem; }
        .ontology-review__option { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0.6rem; border: 1px solid #f1f3f5; border-radius: 8px; cursor: pointer; }
        .ontology-review__option:hover { border-color: #bac8ff; background: #f8f9ff; }
        .ontology-review__option--selected { border-color: #4263eb; background: #edf2ff; }
        .ontology-review__option input { margin-top: 0.2rem; }
        .ontology-review__option-body { flex: 1; }
        .ontology-review__option-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .ontology-review__term-id { font-size: 0.78rem; color: #868e96; font-family: monospace; }
        .ontology-review__reasoning { display: block; margin-top: 0.15rem; font-size: 0.78rem; color: #64748b; }
      `}</style>
    </section>
  )
}
