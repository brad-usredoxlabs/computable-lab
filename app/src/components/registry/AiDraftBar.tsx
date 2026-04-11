import { useState } from 'react'
import { apiClient } from '../../shared/api/client'

interface AiDraftBarProps {
  schemaId: string
  onDraftReady: (payload: Record<string, unknown>) => void
  disabled?: boolean
}

export function AiDraftBar({ schemaId, onDraftReady, disabled }: AiDraftBarProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDraft() {
    if (!prompt.trim() || loading) return

    setLoading(true)
    setError(null)

    try {
      const result = await apiClient.draftRecord(schemaId, prompt.trim())
      if (result.success && result.payload) {
        onDraftReady(result.payload)
        setPrompt('')
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && prompt.trim() && !loading) {
      handleDraft()
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a record to create..."
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-400"
          disabled={loading || disabled}
        />
        {loading && (
          <div className="w-4 h-4 animate-spin border-2 border-gray-300 border-t-blue-500 rounded-full" />
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
