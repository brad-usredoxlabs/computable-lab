import { useCallback, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { streamPipelineSSE } from '../../shared/api/aiClient'
import type { AiStreamEvent } from '../../types/ai'

export interface InterpretationResult {
  content: string
  events: AiStreamEvent[]
}

export interface UseResultInterpretationReturn {
  interpretation: InterpretationResult | null
  loading: boolean
  error: string | null
  interpret: (measurementContextIds?: string[]) => void
  clear: () => void
}

function extractContent(event: AiStreamEvent): string {
  if (event.type === 'done') {
    const result = event.result
    if (result.notes?.length) return result.notes.join('\n')
    if (result.error) return result.error
    return JSON.stringify(result, null, 2)
  }
  if (event.type === 'tool_result' && event.result != null) {
    return typeof event.result === 'string' ? event.result : JSON.stringify(event.result, null, 2)
  }
  return ''
}

export function useResultInterpretation(runId: string): UseResultInterpretationReturn {
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const interpret = useCallback(async (measurementContextIds?: string[]) => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setLoading(true)
    setError(null)
    setInterpretation(null)

    const { url, init } = apiClient.interpretResults(runId, { measurementContextIds })
    const events: AiStreamEvent[] = []
    let content = ''

    try {
      for await (const event of streamPipelineSSE(url, init, abort.signal)) {
        events.push(event)
        if (event.type === 'error') {
          setError(event.message ?? 'Interpretation failed')
          break
        }
        const chunk = extractContent(event)
        if (chunk) content += (content ? '\n' : '') + chunk
        setInterpretation({ content, events: [...events] })
      }
      setInterpretation({ content, events })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setLoading(false)
    }
  }, [runId])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setInterpretation(null)
    setError(null)
  }, [])

  return { interpretation, loading, error, interpret, clear }
}
