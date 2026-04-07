/**
 * API client for tree navigation and filing operations.
 */

import type { StudyTreeNode, IndexEntry } from '../../types/tree'
import type { TemplateLabwareBinding } from './client'
import { API_BASE } from './base'

/**
 * Response from GET /tree/studies
 */
export interface StudyTreeResponse {
  studies: StudyTreeNode[]
}

/**
 * Response from GET /tree/inbox or /tree/records
 */
export interface RecordsListResponse {
  records: IndexEntry[]
  total: number
}

/**
 * Response from POST /records/:id/file
 */
export interface FileRecordResponse {
  success: boolean
  newPath?: string
  error?: string
}

/**
 * Response from POST /index/rebuild
 */
export interface RebuildIndexResponse {
  success: boolean
  count: number
  generatedAt: string
}

export interface RunMethodSummaryResponse {
  runId: string
  hasMethod: boolean
  methodEventGraphId?: string
  methodPlatform?: string
  methodVocabId?: 'liquid-handling/v1' | 'animal-handling/v1'
  methodTemplateId?: string
  templateInputResolutions: TemplateInputResolution[]
  runOutputs: RunOutputState[]
}

export interface AttachTemplateToRunResponse {
  success: boolean
  runId: string
  methodEventGraphId: string
  replaced: boolean
}

export type TemplateInputResolution =
  | {
      templateLabwareId: string
      slotLabel: string
      kind: 'existing-snapshot'
      status: 'resolved'
      snapshotId: string
    }
  | {
      templateLabwareId: string
      slotLabel: string
      kind: 'upstream-run'
      status: 'planned' | 'run_created' | 'resolved'
      upstreamTemplateId: string
      upstreamOutputId?: string
      upstreamRunId?: string
      producedSnapshotId?: string
    }

export interface RunOutputState {
  outputId: string
  label: string
  sourceLabwareId: string
  status: 'declared' | 'produced'
  snapshotId?: string
}

export interface CreateRunFromTemplateResponse {
  success: boolean
  runId: string
  methodEventGraphId: string
  templateInputResolutions: TemplateInputResolution[]
  runOutputs: RunOutputState[]
}

/**
 * Fetch the study hierarchy tree.
 */
export async function getStudyTree(): Promise<StudyTreeResponse> {
  const response = await fetch(`${API_BASE}/tree/studies`)
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to fetch study tree: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Get active method summary for a run.
 */
export async function getRunMethod(runId: string): Promise<RunMethodSummaryResponse> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/method`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.message || error.error || `Failed to fetch run method: ${response.status}`)
  }

  return response.json()
}

/**
 * Attach a template to a run as its active method.
 */
export async function attachTemplateToRun(
  runId: string,
  options: {
    templateId?: string
    replace?: boolean
    vocabId: 'liquid-handling/v1' | 'animal-handling/v1'
    platform: string
    deckVariant: string
    bindings?: TemplateLabwareBinding[]
    inputResolutions?: TemplateInputResolution[]
  }
): Promise<AttachTemplateToRunResponse> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/method/attach-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(options.templateId ? { templateId: options.templateId } : {}),
      replace: options.replace === true,
      vocabId: options.vocabId,
      platform: options.platform,
      deckVariant: options.deckVariant,
      ...(options.bindings?.length ? { bindings: options.bindings } : {}),
      ...(options.inputResolutions?.length ? { inputResolutions: options.inputResolutions } : {}),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    const message = error.message || error.error || `Failed to attach template to run: ${response.status}`
    const e = new Error(message)
    ;(e as Error & { code?: string; existingMethodEventGraphId?: string }).code = error.error
    ;(e as Error & { code?: string; existingMethodEventGraphId?: string }).existingMethodEventGraphId = error.existingMethodEventGraphId
    throw e
  }

  return response.json()
}

export async function createRunFromTemplate(options: {
  experimentId: string
  studyId?: string
  title?: string
  shortSlug?: string
  templateId: string
  vocabId: 'liquid-handling/v1' | 'animal-handling/v1'
  platform: string
  deckVariant: string
  inputResolutions?: TemplateInputResolution[]
}): Promise<CreateRunFromTemplateResponse> {
  const response = await fetch(`${API_BASE}/runs/create-from-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      experimentId: options.experimentId,
      ...(options.studyId ? { studyId: options.studyId } : {}),
      ...(options.title ? { title: options.title } : {}),
      ...(options.shortSlug ? { shortSlug: options.shortSlug } : {}),
      templateId: options.templateId,
      vocabId: options.vocabId,
      platform: options.platform,
      deckVariant: options.deckVariant,
      ...(options.inputResolutions?.length ? { inputResolutions: options.inputResolutions } : {}),
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.message || error.error || `Failed to create run from template: ${response.status}`)
  }
  return response.json()
}

export async function createUpstreamRunForInput(
  runId: string,
  templateLabwareId: string,
  options?: { title?: string },
): Promise<CreateRunFromTemplateResponse> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/inputs/${encodeURIComponent(templateLabwareId)}/create-upstream-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(options?.title ? { title: options.title } : {}),
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.message || error.error || `Failed to create upstream run: ${response.status}`)
  }
  return response.json()
}

export async function useExistingPlateForInput(
  runId: string,
  templateLabwareId: string,
  snapshotId: string,
): Promise<{ success: boolean; templateInputResolutions: TemplateInputResolution[] }> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/inputs/${encodeURIComponent(templateLabwareId)}/use-existing-plate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.message || error.error || `Failed to use existing prepared plate: ${response.status}`)
  }
  return response.json()
}

export async function promoteRunOutput(
  runId: string,
  outputId: string,
  body: {
    snapshotId?: string
    sourceContextIds: string[]
    title?: string
    tags?: string[]
    sourceEventGraphRef?: {
      kind: 'record' | 'ontology'
      id: string
      type?: string
      namespace?: string
      label?: string
      uri?: string
    }
    labwareRef?: {
      kind: 'record' | 'ontology'
      id: string
      type?: string
      namespace?: string
      label?: string
      uri?: string
    }
    wellMappings?: Array<{ well: string; contextId: string; role?: string }>
  },
): Promise<{ success: boolean; snapshotId: string; runOutputs: RunOutputState[] }> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/outputs/${encodeURIComponent(outputId)}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.message || error.error || `Failed to promote run output: ${response.status}`)
  }
  return response.json()
}

/**
 * Fetch records linked to a specific run.
 */
export async function getRecordsForRun(runId: string): Promise<RecordsListResponse> {
  const response = await fetch(`${API_BASE}/tree/records?runId=${encodeURIComponent(runId)}`)
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to fetch records for run: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Fetch inbox records (status = inbox).
 */
export async function getInbox(): Promise<RecordsListResponse> {
  const response = await fetch(`${API_BASE}/tree/inbox`)
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to fetch inbox: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Full-text search records.
 * Searches across recordId, title, kind, and path.
 * Results are sorted by relevance.
 */
export async function searchRecords(
  query?: string,
  options?: { kind?: string; limit?: number }
): Promise<RecordsListResponse> {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (options?.kind) params.set('kind', options.kind)
  if (options?.limit) params.set('limit', options.limit.toString())
  
  const response = await fetch(`${API_BASE}/tree/search?${params.toString()}`)
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to search records: ${response.status}`)
  }
  
  return response.json()
}

/**
 * File a record from inbox into a run.
 */
export async function fileRecord(
  recordId: string,
  runId: string
): Promise<FileRecordResponse> {
  const response = await fetch(`${API_BASE}/records/${encodeURIComponent(recordId)}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to file record: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Rebuild the record index.
 */
export async function rebuildIndex(): Promise<RebuildIndexResponse> {
  const response = await fetch(`${API_BASE}/index/rebuild`, {
    method: 'POST',
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `Failed to rebuild index: ${response.status}`)
  }
  
  return response.json()
}
