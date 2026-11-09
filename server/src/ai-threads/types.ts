/**
 * AI-thread types. Mirror of the relevant fields in
 * `schema/knowledge/conversation.schema.yaml` — kept narrowly in TS so the
 * store and handlers can be strict without re-implementing the schema.
 *
 * Live (un-promoted) threads use these types directly. When promoted, the
 * fields here are merged into a `conversation` record payload along with
 * provenance and FAIRCommon metadata.
 */

export const APPLIANCE_ENDPOINTS = [
  'browser',
  'event-editor',
  'protocols',
  'literature',
  'sequences',
] as const;
export type ApplianceEndpoint = (typeof APPLIANCE_ENDPOINTS)[number];

export function isApplianceEndpoint(value: unknown): value is ApplianceEndpoint {
  return typeof value === 'string' && (APPLIANCE_ENDPOINTS as readonly string[]).includes(value);
}

export type ThreadRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ThreadMessage {
  role: ThreadRole;
  content: string;
  createdAt: string;
  toolName?: string;
  toolCallId?: string;
  /**
   * Phase 5: structured payload that accompanies the message — preview
   * events, labware additions, clarifications, tool-call args/results, etc.
   * The conversation schema accepts `additionalProperties: true` here so the
   * frontend can persist surface-specific fields without a schema change.
   */
  metadata?: Record<string, unknown>;
}

export interface ThreadMention {
  kind: string;
  ref: { recordId: string; kind?: string };
  label?: string;
}

export interface AiThread {
  endpoint: ApplianceEndpoint;
  userId: string;
  /** Stable identity independent of endpoint/route/mount (agent harness). */
  conversationId?: string;
  messages: ThreadMessage[];
  mentions: ThreadMention[];
  updatedAt: string;
}

/**
 * L2-THREAD-SCOPED-1 — one row of the thread LIST (GET /api/ai/threads/
 * :endpoint/threads). Pure store data (a readdir + a messages[0] read): NO
 * new schema, NO new record type — threads remain non-records until promoted.
 */
export interface ThreadSummary {
  threadId: string;
  /** First USER message content, trimmed, truncated (store-side). */
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface AppendMessageInput {
  message: Omit<ThreadMessage, 'createdAt'> & { createdAt?: string };
  mentions?: ThreadMention[];
  /** When set, the append is addressed to this stable conversation regardless
   *  of which endpoint surface is currently active. */
  conversationId?: string;
}

export interface PromoteOptions {
  title: string;
  recordId: string;
  reason?: string;
  mode?: 'manual' | 'automatic';
  passId?: string;
  linkedArtifacts?: Array<{ recordId: string; kind?: string }>;
}
