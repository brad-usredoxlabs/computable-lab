/**
 * Types for GET /api/config and PATCH /api/config.
 *
 * These mirror the backend RepositoryConfig / AIConfig shapes
 * with secrets redacted in GET responses.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Placeholder the backend uses for redacted secret values. */
export const REDACTED = '***'

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

export type GitAuthType = 'token' | 'github-app' | 'ssh-key' | 'none'

export interface GitAuthConfig {
  type: GitAuthType
  token?: string
  appId?: string
  privateKeyPath?: string
  installationId?: string
  sshKeyPath?: string
}

export interface GitConfig {
  url: string
  branch: string
  auth: GitAuthConfig
}

// ---------------------------------------------------------------------------
// Repository sub-configs
// ---------------------------------------------------------------------------

export interface NamespaceConfig {
  baseUri: string
  prefix: string
}

export interface JsonLdConfig {
  context: 'default' | 'custom'
  customContextUrl?: string
}

export type SyncMode = 'pull-on-read' | 'periodic' | 'manual'

export interface SyncConfig {
  mode: SyncMode
  pullIntervalSeconds?: number
  autoCommit: boolean
  autoPush: boolean
}

export interface RecordsConfig {
  directory: string
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface RepositoryConfig {
  id: string
  default?: boolean
  git: GitConfig
  namespace: NamespaceConfig
  jsonld: JsonLdConfig
  sync: SyncConfig
  records: RecordsConfig
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export interface InferenceConfig {
  provider?: 'openai' | 'openai-compatible'
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs?: number
  maxTokens?: number
  temperature?: number
}

export interface AgentConfig {
  maxTurns?: number
  maxToolCallsPerTurn?: number
  systemPromptPath?: string
}

export interface AIConfig {
  activeProfile?: string
  profiles?: Record<string, { inference: InferenceConfig; agent: AgentConfig }>
  inference: InferenceConfig
  agent: AgentConfig
}

export interface LabConfig {
  materialTracking: {
    mode: 'relaxed' | 'tracked'
    allowAdHocEventInstances: boolean
  }
}

export type ExaSearchType = 'auto' | 'fast' | 'instant' | 'deep' | 'deep-reasoning'
export type ExaContentMode = 'highlights' | 'text' | 'summary'

export interface ExaConfig {
  enabled?: boolean
  apiKey?: string
  baseUrl?: string
  defaultSearchType?: ExaSearchType
  defaultContentMode?: ExaContentMode
  defaultMaxCharacters?: number
  userLocation?: string
  timeoutMs?: number
}

export interface IntegrationsConfig {
  exa?: ExaConfig
}

export type MaterialTrackingMode = LabConfig['materialTracking']['mode']

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

/** GET /api/config response body. */
export interface ConfigResponse {
  repositories: RepositoryConfig[]
  ai: AIConfig | null
  lab?: LabConfig | null
  integrations?: IntegrationsConfig | null
  aiStatus?: AiRuntimeStatus | null
}

export interface AiRuntimeStatus {
  available: boolean
  inferenceUrl: string
  model: string
  provider?: string
  error?: string
}

/** Successful PATCH /api/config response body. */
export interface ConfigPatchResponse {
  success: true
  message: string
  restartRequired: boolean
  config: ConfigResponse
}

/** Failed PATCH /api/config response body. */
export interface ConfigPatchError {
  success: false
  error: string
  details?: Array<{ path: string; message: string }>
}

export interface AiConnectionTestRequest {
  provider?: 'openai' | 'openai-compatible'
  baseUrl: string
  apiKey?: string
  model?: string
}

export interface AiConnectionTestResponse {
  success: boolean
  available: boolean
  provider: 'openai' | 'openai-compatible'
  baseUrl: string
  model: string | null
  modelKnown: boolean
  modelWarning?: string
  models: string[]
  error?: string
}
