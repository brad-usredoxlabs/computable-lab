/**
 * MaterialSmartSearch — AI-enhanced search with provenance labels.
 *
 * When the normal search returns few or no results, this component
 * offers an "AI Search" button that searches across local records,
 * ontology terms, and vendor catalogs.
 */

import { useState } from 'react'
import { apiClient, type MaterialSmartSearchResult } from '../../shared/api/client'

interface MaterialSmartSearchProps {
  query: string
  localResultCount: number
  onAddToLibrary?: (record: Record<string, unknown>, source: string) => void
}

function sourceLabel(source: string): { text: string; color: string } {
  switch (source) {
    case 'local': return { text: 'Found in local records', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
    case 'ontology': return { text: 'Found via ontology', color: 'bg-blue-50 text-blue-800 border-blue-200' }
    case 'vendor': return { text: 'Found via vendor search', color: 'bg-purple-50 text-purple-800 border-purple-200' }
    default: return { text: source, color: 'bg-gray-50 text-gray-800 border-gray-200' }
  }
}

export function MaterialSmartSearch({ query, localResultCount, onAddToLibrary }: MaterialSmartSearchProps) {
  const [results, setResults] = useState<MaterialSmartSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showTrigger = query.trim().length >= 2 && localResultCount < 3 && !searched

  async function handleSearch() {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.smartSearchMaterials({
        query: query.trim(),
        includeOntology: true,
        includeVendor: true,
      })
      setResults(response.results)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI search failed')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setResults([])
    setSearched(false)
    setError(null)
  }

  if (!showTrigger && !searched) return null

  return (
    <div className="mt-2">
      {showTrigger && (
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          {loading ? 'Searching...' : `AI Search for "${query}"`}
        </button>
      )}

      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}

      {searched && results.length === 0 && (
        <div className="mt-2 text-xs text-gray-500">
          No additional results found via AI search.
          <button onClick={handleReset} className="ml-2 text-blue-600 hover:underline">Clear</button>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">AI Search Results</span>
            <button onClick={handleReset} className="text-[10px] text-blue-600 hover:underline">Clear</button>
          </div>
          {results.map((result, index) => {
            const label = sourceLabel(result.source)
            const name = typeof result.record.name === 'string'
              ? result.record.name
              : typeof result.record.label === 'string'
              ? result.record.label
              : typeof result.record.productName === 'string'
              ? result.record.productName
              : 'Unknown'

            return (
              <div key={index} className="rounded border border-gray-200 bg-white p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{name}</div>
                    <div className="text-gray-500 mt-0.5">{result.matchReason}</div>
                  </div>
                  <span className={`inline-block px-1.5 py-px text-[10px] rounded border whitespace-nowrap ${label.color}`}>
                    {label.text}
                  </span>
                </div>
                {result.source !== 'local' && onAddToLibrary && (
                  <button
                    onClick={() => onAddToLibrary(result.record, result.source)}
                    className="mt-1.5 px-2 py-0.5 text-[10px] font-medium rounded bg-blue-500 text-white hover:bg-blue-600"
                  >
                    Add to Library
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
