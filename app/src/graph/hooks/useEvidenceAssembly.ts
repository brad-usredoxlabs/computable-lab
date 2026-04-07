import { useCallback, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { streamPipelineSSE } from '../../shared/api/aiClient'
import type { AiStreamEvent } from '../../types/ai'

export interface EvidenceAssemblyResult {
  content: string
  events: AiStreamEvent[]
}

export interface UseEvidenceAssemblyReturn {
  assemblyResult: EvidenceAssemblyResult | null
  assertionResult: EvidenceAssemblyResult | null
  assemblyLoading: boolean
  assertionLoading: boolean
  assemblyError: string | null
  assertionError: string | null
  assembleEvidence: (measurementContextIds?: string[], includeWellGrouping?: boolean) => void
  draftAssertions: (evidenceIds?: string[], checkContradictions?: boolean) => void
  clearAssembly: () => void
  clearAssertions: () => void
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

export function useEvidenceAssembly(runId: string): UseEvidenceAssemblyReturn {
  const [assemblyResult, setAssemblyResult] = useState<EvidenceAssemblyResult | null>(null)
  const [assertionResult, setAssertionResult] = useState<EvidenceAssemblyResult | null>(null)
  const [assemblyLoading, setAssemblyLoading] = useState(false)
  const [assertionLoading, setAssertionLoading] = useState(false)
  const [assemblyError, setAssemblyError] = useState<string | null>(null)
  const [assertionError, setAssertionError] = useState<string | null>(null)
  const assemblyAbortRef = useRef<AbortController | null>(null)
  const assertionAbortRef = useRef<AbortController | null>(null)

  const assembleEvidence = useCallback(async (measurementContextIds?: string[], includeWellGrouping?: boolean) => {
    assemblyAbortRef.current?.abort()
    const abort = new AbortController()
    assemblyAbortRef.current = abort

    setAssemblyLoading(true)
    setAssemblyError(null)
    setAssemblyResult(null)

    const { url, init } = apiClient.assembleEvidence(runId, { measurementContextIds, includeWellGrouping })
    const events: AiStreamEvent[] = []
    let content = ''

    try {
      for await (const event of streamPipelineSSE(url, init, abort.signal)) {
        events.push(event)
        if (event.type === 'error') {
          setAssemblyError(event.message ?? 'Evidence assembly failed')
          break
        }
        const chunk = extractContent(event)
        if (chunk) content += (content ? '\n' : '') + chunk
        setAssemblyResult({ content, events: [...events] })
      }
      setAssemblyResult({ content, events })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAssemblyError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setAssemblyLoading(false)
    }
  }, [runId])

  const draftAssertions = useCallback(async (evidenceIds?: string[], checkContradictions?: boolean) => {
    assertionAbortRef.current?.abort()
    const abort = new AbortController()
    assertionAbortRef.current = abort

    setAssertionLoading(true)
    setAssertionError(null)
    setAssertionResult(null)

    const { url, init } = apiClient.draftAssertions(runId, { evidenceIds, checkContradictions })
    const events: AiStreamEvent[] = []
    let content = ''

    try {
      for await (const event of streamPipelineSSE(url, init, abort.signal)) {
        events.push(event)
        if (event.type === 'error') {
          setAssertionError(event.message ?? 'Assertion drafting failed')
          break
        }
        const chunk = extractContent(event)
        if (chunk) content += (content ? '\n' : '') + chunk
        setAssertionResult({ content, events: [...events] })
      }
      setAssertionResult({ content, events })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAssertionError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setAssertionLoading(false)
    }
  }, [runId])

  const clearAssembly = useCallback(() => {
    assemblyAbortRef.current?.abort()
    setAssemblyResult(null)
    setAssemblyError(null)
  }, [])

  const clearAssertions = useCallback(() => {
    assertionAbortRef.current?.abort()
    setAssertionResult(null)
    setAssertionError(null)
  }, [])

  return {
    assemblyResult,
    assertionResult,
    assemblyLoading,
    assertionLoading,
    assemblyError,
    assertionError,
    assembleEvidence,
    draftAssertions,
    clearAssembly,
    clearAssertions,
  }
}
