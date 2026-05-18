import { API_BASE } from './base'

export type FoundryAcquisitionJobKind =
  | 'protocol-from-document'
  | 'labware-from-spec'
  | 'material-from-source'
  | 'literature-extraction'

export type FoundryAcquisitionJobStatus =
  | 'queued'
  | 'running'
  | 'needs-review'
  | 'failed'
  | 'canceled'
  | 'complete'

export interface FoundryAcquisitionJobTurn {
  role: 'user' | 'assistant'
  content: string
  ts: string
}

export type FoundryAcquisitionStructuredStatus =
  | 'ready_for_review'
  | 'blocked'
  | 'incomplete'

export interface FoundryAcquisitionArtifactRef {
  kind: string
  path: string
  label?: string
  status?: string
  tool?: string
}

export interface FoundryAcquisitionRecordRef {
  kind: string
  recordId: string
  path?: string
  status?: string
  tool?: string
}

export interface FoundryAcquisitionBlocker {
  code: string
  message: string
  severity?: 'info' | 'warning' | 'error'
  field?: string
  tool?: string
  details?: Record<string, unknown>
}

export interface FoundryAcquisitionToolRunSummary {
  tool: string
  ok: boolean
  kind?: string
  status?: string
  artifactPaths: string[]
  recordIds: string[]
}

export interface FoundryAcquisitionStructuredResult {
  status: FoundryAcquisitionStructuredStatus
  nextAction: string
  artifacts: FoundryAcquisitionArtifactRef[]
  records: FoundryAcquisitionRecordRef[]
  blockers: FoundryAcquisitionBlocker[]
  toolRuns: FoundryAcquisitionToolRunSummary[]
}

export interface FoundryAcquisitionJobRecord {
  kind: 'foundry-acquisition-job'
  id: string
  jobKind: FoundryAcquisitionJobKind
  status: FoundryAcquisitionJobStatus
  createdAt: string
  updatedAt: string
  artifactRoot: string
  jobRoot: string
  eventsPath: string
  prompt: string
  title?: string
  message?: string
  turns: FoundryAcquisitionJobTurn[]
  result?: Record<string, unknown>
  outputSummary?: FoundryAcquisitionStructuredResult
  resultPath?: string
  tracePath?: string
}

export interface FoundryAcquisitionJobEvent {
  ts?: string
  source: 'server' | 'agent' | 'tool' | 'user'
  phase: string
  message: string
  details?: Record<string, unknown>
}

export interface FoundryJobDetailResponse {
  job: FoundryAcquisitionJobRecord
  events: FoundryAcquisitionJobEvent[]
}

export interface FoundryJobsResponse {
  jobs: FoundryAcquisitionJobRecord[]
}

export async function createFoundryJob(body: {
  kind: FoundryAcquisitionJobKind
  prompt: string
  title?: string
}): Promise<FoundryJobDetailResponse> {
  return requestJson('/foundry/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function listFoundryJobs(): Promise<FoundryJobsResponse> {
  return requestJson('/foundry/jobs')
}

export async function getFoundryJob(id: string): Promise<FoundryJobDetailResponse> {
  return requestJson(`/foundry/jobs/${encodeURIComponent(id)}`)
}

export async function continueFoundryJob(id: string, message: string): Promise<FoundryJobDetailResponse> {
  return requestJson(`/foundry/jobs/${encodeURIComponent(id)}/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

export async function completeFoundryJob(id: string): Promise<FoundryJobDetailResponse> {
  return requestJson(`/foundry/jobs/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
  })
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || response.statusText)
  }
  return await response.json() as T
}
