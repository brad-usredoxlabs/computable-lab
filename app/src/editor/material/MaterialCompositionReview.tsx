/**
 * MaterialCompositionReview — AI composition review suggestions.
 *
 * Displays AI-generated suggestions about a material's composition:
 * missing components, concentration warnings, ontology alignment issues.
 */

import { useState } from 'react'
import { apiClient, type MaterialCompositionSuggestion } from '../../shared/api/client'

interface MaterialCompositionReviewProps {
  materialId: string
  hasComposition: boolean
}

function suggestionIcon(type: string): string {
  switch (type) {
    case 'missing_component': return '+'
    case 'concentration_warning': return '!'
    case 'ontology_issue': return '~'
    default: return '?'
  }
}

function suggestionColor(type: string): string {
  switch (type) {
    case 'missing_component': return 'border-blue-200 bg-blue-50 text-blue-800'
    case 'concentration_warning': return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'ontology_issue': return 'border-violet-200 bg-violet-50 text-violet-800'
    default: return 'border-gray-200 bg-gray-50 text-gray-800'
  }
}

export function MaterialCompositionReview({ materialId, hasComposition }: MaterialCompositionReviewProps) {
  const [suggestions, setSuggestions] = useState<MaterialCompositionSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReview() {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.reviewMaterialComposition({ materialId })
      setSuggestions(response.suggestions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review composition')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {!suggestions && hasComposition && (
        <button
          onClick={handleReview}
          disabled={loading}
          className="px-2.5 py-1 text-xs font-medium rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          {loading ? 'Reviewing...' : 'AI Review Composition'}
        </button>
      )}

      {error && <div className="text-xs text-red-600">{error}</div>}

      {suggestions && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-900">AI Review</span>
            <button onClick={() => setSuggestions(null)} className="text-[10px] text-blue-600 hover:underline">Dismiss</button>
          </div>
          {suggestions.map((suggestion, index) => (
            <div key={index} className={`rounded border p-2 text-xs ${suggestionColor(suggestion.type)}`}>
              <div className="flex items-start gap-1.5">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-[10px] font-bold shrink-0 mt-px border border-current">
                  {suggestionIcon(suggestion.type)}
                </span>
                <div>
                  <div>{suggestion.message}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">
                    {Math.round(suggestion.confidence * 100)}% confidence
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
