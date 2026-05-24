/**
 * AI thread client — typed wrapper over `/api/ai/threads/:endpoint`.
 *
 * Each appliance endpoint (browser, event-editor, protocols, literature)
 * has a single live thread per user. Live threads persist between reloads
 * but are not yet records; promoting a thread turns it into a `conversation`
 * record. See `specifications/lab-appliance-ui-plan.md` §5 + §5a.
 */

import { API_BASE } from './base'

export type ApplianceEndpoint =
  | 'browser'
  | 'event-editor'
  | 'protocols'
  | 'literature'

export type ThreadRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ThreadMessage {
  role: ThreadRole
  content: string
  createdAt: string
  toolName?: string
  toolCallId?: string
  /**
   * Phase 5: structured payload (preview events, labware additions,
   * clarifications, tool-call args/results). The conversation schema
   * accepts `additionalProperties: true` here.
   */
  metadata?: Record<string, unknown>
}

export interface ThreadMention {
  kind: string
  ref: { recordId: string; kind?: string }
  label?: string
}

export interface AiThread {
  endpoint: ApplianceEndpoint
  userId: string
  messages: ThreadMessage[]
  mentions: ThreadMention[]
  updatedAt: string
}

export interface AppendMessageInput {
  message: Omit<ThreadMessage, 'createdAt'> & { createdAt?: string }
  mentions?: ThreadMention[]
}

export interface PromoteInput {
  title: string
  recordId: string
  reason?: string
  mode?: 'manual' | 'automatic'
  passId?: string
  linkedArtifacts?: Array<{ recordId: string; kind?: string }>
}

export interface PromoteResponse {
  recordId: string
  promotedAt: string
}

export async function getThread(endpoint: ApplianceEndpoint): Promise<AiThread> {
  const res = await fetch(threadUrl(endpoint), { credentials: 'same-origin' })
  if (!res.ok) {
    throw new Error((await safeError(res)) ?? `getThread failed: ${res.status}`)
  }
  return (await res.json()) as AiThread
}

export async function appendThreadMessage(
  endpoint: ApplianceEndpoint,
  input: AppendMessageInput,
): Promise<AiThread> {
  const res = await fetch(threadUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    throw new Error(
      (await safeError(res)) ?? `appendThreadMessage failed: ${res.status}`,
    )
  }
  return (await res.json()) as AiThread
}

export async function promoteThread(
  endpoint: ApplianceEndpoint,
  input: PromoteInput,
): Promise<PromoteResponse> {
  const res = await fetch(`${threadUrl(endpoint)}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) ?? `promoteThread failed: ${res.status}`)
  }
  return (await res.json()) as PromoteResponse
}

function threadUrl(endpoint: ApplianceEndpoint): string {
  return `${API_BASE}/ai/threads/${encodeURIComponent(endpoint)}`
}

async function safeError(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? null
  } catch {
    return null
  }
}
