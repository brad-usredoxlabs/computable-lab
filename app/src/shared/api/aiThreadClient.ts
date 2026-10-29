/**
 * AI thread client — typed wrapper over `/api/ai/threads/:endpoint`.
 *
 * L2-THREAD-SCOPED-1: each browser tab has its OWN thread, and (per the
 * SUITEA-D3 deck-scope amendment) a per-(tab, SCOPE) thread. The client mints
 * a thread id ONCE per (tab, scope) — `crypto.randomUUID()` — into
 * sessionStorage under `cl.ai-thread-tab-ids` (a JSON map { [scope or ""]:
 * threadId }). The id rides every thread request as the `x-cl-thread-id`
 * header; a surface with an instance identity (deck: the loaded event-graph
 * recordId) also rides `x-cl-thread-scope`. Non-instance surfaces send NO
 * scope header and are placed under the server's reserved "_" scope.
 *
 * Live threads persist between reloads but are not yet records; promoting a
 * thread turns it into a `conversation` record. See
 * `specifications/lab-appliance-ui-plan.md` §5 + §5a.
 */

import { API_BASE, getCurrentUserId, getSessionToken } from './base'

export type ApplianceEndpoint =
  | 'browser'
  | 'event-editor'
  | 'protocols'
  | 'literature'
  | 'sequences'

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

/** One row of the thread LIST (GET /api/ai/threads/:endpoint/threads). */
export interface ThreadSummary {
  threadId: string
  title: string
  updatedAt: string
  messageCount: number
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

/**
 * Optional per-request thread context. `scope` is the surface's instance
 * identity (deck: the loaded event-graph recordId); absent for non-instance
 * surfaces (the server places them under its reserved "_" scope).
 */
export interface ThreadRequestOptions {
  scope?: string
}

// ---------------------------------------------------------------------------
// Per-(tab, scope) thread-id mint (L2-THREAD-SCOPED-1 + amendment A-1)
//
// D3 fix: the map + mint lives in ONE module (`./threadTabIds`) imported by
// BOTH sides of the seam — this client (threadHeaders, below) and the hook
// (useAiChat). The previous shape duplicated the read/write/mint inside
// useAiChat under the same storage key (two writers, two ephemeral-mint
// fallbacks that could disagree with the wire header); the fork is gone.
// ---------------------------------------------------------------------------

import { getThreadTabId } from './threadTabIds'

// Re-export the single mint surface (spec §4.1: aiThreadClient's module-level
// getThreadTabId, with set/new siblings for the picker). The IMPLEMENTATION
// lives in ./threadTabIds — one source of truth shared with the hook; this
// re-export keeps the documented client surface stable (D3 fix).
export { getThreadTabId, setThreadTabId, newThreadTabId } from './threadTabIds'

// ---------------------------------------------------------------------------
// HTTP wrappers
// ---------------------------------------------------------------------------

export async function getThread(endpoint: ApplianceEndpoint, opts?: ThreadRequestOptions): Promise<AiThread> {
  const res = await fetch(threadUrl(endpoint), { credentials: 'same-origin', headers: threadHeaders(opts?.scope) })
  if (!res.ok) {
    throw new Error((await safeError(res)) ?? `getThread failed: ${res.status}`)
  }
  return (await res.json()) as AiThread
}

/** List the user's threads for (endpoint, scope) — feeds the picker. */
export async function listThreads(
  endpoint: ApplianceEndpoint,
  opts?: ThreadRequestOptions,
): Promise<{ threads: ThreadSummary[] }> {
  const res = await fetch(`${threadUrl(endpoint)}/threads`, {
    credentials: 'same-origin',
    headers: threadHeaders(opts?.scope),
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) ?? `listThreads failed: ${res.status}`)
  }
  return (await res.json()) as { threads: ThreadSummary[] }
}

export async function appendThreadMessage(
  endpoint: ApplianceEndpoint,
  input: AppendMessageInput,
  opts?: ThreadRequestOptions,
): Promise<AiThread> {
  const res = await fetch(threadUrl(endpoint), {
    method: 'POST',
    headers: { ...threadHeaders(opts?.scope), 'Content-Type': 'application/json' },
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
  opts?: ThreadRequestOptions,
): Promise<PromoteResponse> {
  const res = await fetch(`${threadUrl(endpoint)}/promote`, {
    method: 'POST',
    headers: { ...threadHeaders(opts?.scope), 'Content-Type': 'application/json' },
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

/**
 * The SINGLE identity site for every thread request (all four methods):
 * x-user-id + x-cl-session (as before) plus the L2-THREAD-SCOPED-1 identity
 * headers. `x-cl-thread-id` is ALWAYS sent (the tab's minted id for the
 * scope); `x-cl-thread-scope` is sent ONLY for instance-identity surfaces
 * (conditionally — never an empty/undefined value).
 */
function threadHeaders(scope?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const user = getCurrentUserId()
  const session = getSessionToken()
  if (user) headers['x-user-id'] = user
  if (session) headers['x-cl-session'] = session
  headers['x-cl-thread-id'] = getThreadTabId(scope)
  if (scope && scope.length > 0) headers['x-cl-thread-scope'] = scope
  return headers
}
