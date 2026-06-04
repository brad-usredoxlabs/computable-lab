/**
 * useStudyArtifacts — fetches all artifacts for the active study.
 *
 * Both Browse and Search panels need this. Phase 8's RecordStore.list
 * supports the recursive `kind: artifact` listing, but doesn't yet take a
 * `studyId` filter, so we fetch all artifacts and filter client-side.
 * For the seeded-study scale (a few dozen artifacts per study) that's
 * fine; the IndexManager-by-studyId path can replace it later without
 * changing this hook's signature.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import type { Artifact, ArtifactSummary } from '../../types/artifact'

interface UseStudyArtifactsResult {
  artifacts: ArtifactSummary[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useStudyArtifacts(studyId: string): UseStudyArtifactsResult {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Pull up to 500 artifacts. The list() server-side already filters
      // by kind so this is one network call regardless of study count.
      const { records } = await apiClient.listRecordsByKind('artifact', 500)
      const out: ArtifactSummary[] = []
      for (const env of records) {
        const payload = env.payload as unknown as Artifact
        if (payload.studyId !== studyId) continue
        const summary: ArtifactSummary = {
          recordId: env.recordId,
          title: payload.title || env.recordId,
          artifactKind: payload.artifactKind,
          studyId: payload.studyId,
          path: env.meta?.path ?? '',
        }
        if (payload.experimentId) summary.experimentId = payload.experimentId
        if (payload.updatedAt) summary.updatedAt = payload.updatedAt
        // Quick size hint: page count for PDFs, paragraph count for documents.
        if (payload.artifactKind === 'pdf' && payload.extractedText) {
          summary.size = payload.extractedText.length
        } else if (payload.body && Array.isArray(payload.body.content)) {
          summary.size = payload.body.content.length
        }
        out.push(summary)
      }
      out.sort((a, b) => a.title.localeCompare(b.title))
      setArtifacts(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { artifacts, loading, error, refresh }
}
