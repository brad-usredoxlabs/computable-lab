/**
 * useKnowledgeExtraction — SSE streaming hook for knowledge extraction.
 *
 * Follows the useAiChat pattern: streaming events, preview state, accept/reject.
 * No labware context dependency — operates on bio-source data.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  streamKnowledgeExtraction,
  getAiHealth,
} from '../../shared/api/aiClient'
import type { AiStreamEvent, AiHealthStatus, KnowledgeExtractionResult, OntologyRefProposal } from '../../types/ai'
import type { RecordRef } from '../../types/ref'
import type { BioSourceId } from '../../types/biosource'
import { apiClient } from '../../shared/api/client'

export interface AcceptOptions {
  confidenceMap?: Map<string, number>
  duplicatesMap?: Map<string, string>
}

export interface UseKnowledgeExtractionReturn {
  isExtracting: boolean
  streamEvents: AiStreamEvent[]
  preview: KnowledgeExtractionResult | null
  extract: (source: BioSourceId, sourceId: string, sourceData: Record<string, unknown>, hint?: string) => void
  cancelExtraction: () => void
  acceptSelected: (selectedClaimIds: Set<string>, options?: AcceptOptions) => Promise<SaveResult>
  acceptSelectedWithResolutions: (selectedClaimIds: Set<string>, resolutions: Map<string, RecordRef>, options?: AcceptOptions) => Promise<SaveResult>
  rejectAll: () => void
  unresolvedRefs: OntologyRefProposal[]
  aiAvailable: boolean | null
  recheckHealth: () => void
}

export interface SaveResult {
  success: boolean
  saved: string[]
  failed: Array<{ id: string; error: string }>
}

export function useKnowledgeExtraction(): UseKnowledgeExtractionReturn {
  const [isExtracting, setIsExtracting] = useState(false)
  const [streamEvents, setStreamEvents] = useState<AiStreamEvent[]>([])
  const [preview, setPreview] = useState<KnowledgeExtractionResult | null>(null)
  const [unresolvedRefs, setUnresolvedRefs] = useState<OntologyRefProposal[]>([])
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const resolvedCache = useRef<Map<string, RecordRef>>(new Map())

  const checkHealth = useCallback(() => {
    getAiHealth().then((h: AiHealthStatus) => {
      setAiAvailable(h.available)
    })
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  // ------------------------------------------------------------------
  // Extract knowledge from a bio-source result
  // ------------------------------------------------------------------
  const extract = useCallback(
    async (
      source: BioSourceId,
      sourceId: string,
      sourceData: Record<string, unknown>,
      hint?: string,
    ) => {
      if (isExtracting) return

      setIsExtracting(true)
      setStreamEvents([])
      setPreview(null)
      setUnresolvedRefs([])

      const controller = new AbortController()
      abortRef.current = controller

      const accumulated: AiStreamEvent[] = []

      try {
        for await (const event of streamKnowledgeExtraction(
          { source, sourceId, sourceData, userHint: hint },
          controller.signal,
        )) {
          accumulated.push(event)
          setStreamEvents([...accumulated])

          if (event.type === 'done') {
            const result = event.result as unknown as KnowledgeExtractionResult
            const extractionResult: KnowledgeExtractionResult = {
              success: result.success ?? false,
              claims: Array.isArray(result.claims) ? result.claims : [],
              assertions: Array.isArray(result.assertions) ? result.assertions : [],
              evidence: Array.isArray(result.evidence) ? result.evidence : [],
              unresolvedRefs: result.unresolvedRefs,
              notes: Array.isArray(result.notes) ? result.notes : [],
              error: result.error,
              usage: result.usage,
            }
            setPreview(extractionResult)

            // Filter out refs already resolved in this session
            const pending = (extractionResult.unresolvedRefs ?? []).filter(
              (p) => !resolvedCache.current.has(p.ref.id),
            )
            setUnresolvedRefs(pending)
            break
          }

          if (event.type === 'error') {
            setPreview({
              success: false,
              claims: [],
              assertions: [],
              evidence: [],
              notes: [],
              error: event.message,
            })
            break
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          setPreview({
            success: false,
            claims: [],
            assertions: [],
            evidence: [],
            notes: [],
            error: (err as Error).message || 'Unknown error',
          })
        }
      } finally {
        setIsExtracting(false)
        abortRef.current = null
      }
    },
    [isExtracting],
  )

  // ------------------------------------------------------------------
  // Cancel
  // ------------------------------------------------------------------
  const cancelExtraction = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // ------------------------------------------------------------------
  // Accept selected claims — save only chosen claims + their linked records
  // ------------------------------------------------------------------
  const acceptSelected = useCallback(async (selectedClaimIds: Set<string>, options?: AcceptOptions): Promise<SaveResult> => {
    if (!preview) return { success: false, saved: [], failed: [{ id: '', error: 'No preview' }] }

    const records = buildRecordsFromPreview(preview, resolvedCache.current, selectedClaimIds, options)
    const result = await apiClient.saveKnowledgeRecords(records)
    if (result.success) {
      setPreview(null)
      setUnresolvedRefs([])
    }
    return result
  }, [preview])

  // ------------------------------------------------------------------
  // Accept selected with resolutions
  // ------------------------------------------------------------------
  const acceptSelectedWithResolutions = useCallback(
    async (selectedClaimIds: Set<string>, resolutions: Map<string, RecordRef>, options?: AcceptOptions): Promise<SaveResult> => {
      // Persist new resolutions into session cache
      for (const [key, value] of resolutions) {
        resolvedCache.current.set(key, value)
      }

      if (!preview) return { success: false, saved: [], failed: [{ id: '', error: 'No preview' }] }

      const records = buildRecordsFromPreview(preview, resolvedCache.current, selectedClaimIds, options)
      const result = await apiClient.saveKnowledgeRecords(records)
      if (result.success) {
        setPreview(null)
        setUnresolvedRefs([])
      }
      return result
    },
    [preview],
  )

  // ------------------------------------------------------------------
  // Reject
  // ------------------------------------------------------------------
  const rejectAll = useCallback(() => {
    setPreview(null)
    setUnresolvedRefs([])
    setStreamEvents([])
  }, [])

  return {
    isExtracting,
    streamEvents,
    preview,
    extract,
    cancelExtraction,
    acceptSelected,
    acceptSelectedWithResolutions,
    rejectAll,
    unresolvedRefs,
    aiAvailable,
    recheckHealth: checkHealth,
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Build a triple key for a claim record. */
function claimTripleKey(claim: Record<string, unknown>): string | null {
  const s = claim.subject as Record<string, unknown> | undefined
  const p = claim.predicate as Record<string, unknown> | undefined
  const o = claim.object as Record<string, unknown> | undefined
  if (s?.id && p?.id && o?.id) {
    return `${String(s.id)}|${String(p.id)}|${String(o.id)}`
  }
  return null
}

/**
 * Build the records array for saveKnowledgeRecords from a preview.
 * When selectedClaimIds is provided, only include claims that are selected
 * plus their linked assertions and evidence.
 *
 * Handles duplicates: if a claim's triple key exists in duplicatesMap,
 * skip saving the claim and rewrite assertion claim_ref to the existing ID.
 *
 * Handles confidence: merges confidenceMap values into assertion records.
 */
function buildRecordsFromPreview(
  preview: KnowledgeExtractionResult,
  resolutions: Map<string, RecordRef>,
  selectedClaimIds?: Set<string>,
  options?: AcceptOptions,
): Array<{ id: string; record: Record<string, unknown> }> {
  const records: Array<{ id: string; record: Record<string, unknown> }> = []
  const { confidenceMap, duplicatesMap } = options ?? {}

  // Determine which claims to include
  const selectedClaims = selectedClaimIds
    ? preview.claims.filter((c) => selectedClaimIds.has(c.id as string))
    : preview.claims
  const selectedClaimIdSet = new Set(selectedClaims.map((c) => c.id as string))

  // Determine which orphan assertions are selected (pseudo-ID: "orphan-a-<id>")
  const selectedOrphanAssertionIds = new Set<string>()
  if (selectedClaimIds) {
    for (const id of selectedClaimIds) {
      if (id.startsWith('orphan-a-')) {
        selectedOrphanAssertionIds.add(id.replace('orphan-a-', ''))
      }
    }
  }

  // Track which claims are duplicates: original claim ID → existing claim ID
  const dupClaimRewrites = new Map<string, string>()

  for (const claim of selectedClaims) {
    const claimId = claim.id as string
    const key = claimTripleKey(claim)
    const existingId = key ? duplicatesMap?.get(key) : undefined

    if (existingId) {
      // Duplicate — don't save claim, but remember rewrite for assertions
      dupClaimRewrites.set(claimId, existingId)
    } else {
      // New claim — save it
      const c = resolutions.size > 0 ? rewriteRefs(claim, resolutions) : claim
      records.push({ id: (c as Record<string, unknown>).id as string, record: c as Record<string, unknown> })
    }
  }

  // Include assertions linked to selected claims, or selected orphan assertions
  const includedAssertionIds = new Set<string>()
  for (const assertion of preview.assertions) {
    const cr = assertion.claim_ref as Record<string, unknown> | undefined
    const claimRefId = cr?.id as string | undefined
    const isLinked = claimRefId && selectedClaimIdSet.has(claimRefId)
    const isOrphan = !claimRefId || !preview.claims.some((c) => c.id === claimRefId)
    const isSelectedOrphan = isOrphan && (
      !selectedClaimIds || selectedOrphanAssertionIds.has(assertion.id as string)
    )

    if (isLinked || isSelectedOrphan) {
      let a: Record<string, unknown> = resolutions.size > 0 ? rewriteRefs(assertion, resolutions) : { ...assertion }

      // Rewrite claim_ref if the claim is a duplicate
      if (claimRefId && dupClaimRewrites.has(claimRefId)) {
        const existingClaimId = dupClaimRewrites.get(claimRefId)!
        a = {
          ...a,
          claim_ref: { ...(a.claim_ref as Record<string, unknown>), id: existingClaimId },
        }
      }

      // Merge confidence
      const aId = a.id as string
      if (confidenceMap?.has(aId)) {
        a = { ...a, confidence: confidenceMap.get(aId) }
      }

      records.push({ id: aId, record: a })
      includedAssertionIds.add(assertion.id as string)
    }
  }

  // Include evidence linked to included assertions
  for (const evidence of preview.evidence) {
    const supports = Array.isArray(evidence.supports) ? evidence.supports : []
    const linked = supports.some((s: Record<string, unknown>) =>
      includedAssertionIds.has(s.id as string),
    )
    if (linked) {
      const e = resolutions.size > 0 ? rewriteRefs(evidence, resolutions) : evidence
      records.push({ id: (e as Record<string, unknown>).id as string, record: e as Record<string, unknown> })
    }
  }

  return records
}

/**
 * Deep rewrite ontology refs in a record using resolved record refs.
 */
function rewriteRefs(
  record: Record<string, unknown>,
  resolutions: Map<string, RecordRef>,
): Record<string, unknown> {
  if (resolutions.size === 0) return record

  const json = JSON.stringify(record)
  const parsed = JSON.parse(json) as Record<string, unknown>

  function walk(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return obj.map(walk)

    const rec = obj as Record<string, unknown>
    if (rec.kind === 'ontology' && typeof rec.id === 'string') {
      const resolved = resolutions.get(rec.id)
      if (resolved) return { ...resolved }
    }

    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rec)) {
      result[k] = walk(v)
    }
    return result
  }

  return walk(parsed) as Record<string, unknown>
}
