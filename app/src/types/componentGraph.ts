import type { RecordEnvelope } from './kernel'

export interface ComponentListResponse {
  components: RecordEnvelope[]
  total: number
}

export interface ComponentCreateRequest {
  recordId?: string
  title: string
  description?: string
  roles?: Record<string, unknown>
  compatibility?: Record<string, unknown>
  template: Record<string, unknown>
  tags?: string[]
  notes?: string
}

export interface ComponentCreateResponse {
  success: boolean
  component: RecordEnvelope
}

export interface ComponentPublishResponse {
  success: boolean
  component: RecordEnvelope
  version: RecordEnvelope
}

export interface ComponentInstantiateResponse {
  success: boolean
  instance: RecordEnvelope
}

export interface ComponentInstanceStatusResponse {
  status: {
    instance: RecordEnvelope
    stale: boolean
    latestVersionRef?: { kind: 'record'; id: string; type: 'graph-component-version' }
  }
}

export interface ComponentSuggestionResponse {
  suggestions: {
    eventGraphId: string
    minOccurrences: number
    suggestions: Array<{
      signature: string
      eventType: string
      count: number
      eventIds: string[]
      labwareIds: string[]
    }>
  }
}
