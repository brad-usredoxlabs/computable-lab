/**
 * SurfaceContext — "where am I" made deterministic and serializable.
 *
 * The first-class payload that flows through every work surface and into the
 * AI: the surface the user is on, the active object it's scoped to, the
 * selected sub-objects (wells / events / text / nodes), and the user's prompt.
 *
 * Selection refs are deliberately lean (ids only, no full payloads) so a
 * SurfaceContext round-trips cheaply and serializes as a stable YAML/JSON unit
 * for corpus capture.
 *
 * Mirrors server/src/surfaceContext/SurfaceContext.ts — keep the two in sync.
 */
import type { Ref } from '../../types/ref'

export type SurfaceId =
  | 'project'
  | 'run-plan'
  | 'run-design'
  | 'run-execute'
  | 'results'
  | 'analysis'
  | 'knowledge'
  | 'find'

export interface ActiveObject {
  objectType: string
  objectId: string
  label: string
  linkedProjectIds?: string[]
}

export interface SelectionItem {
  ref: Ref
  label?: string
  /**
   * The actual data about the selected object — resolved from the graph node
   * properties (e.g. a well's materialRefs, labware, treatment, measurements).
   * Deliberately present: this is the DATA the AI needs to answer, not just
   * the id. Kept compact (properties, not the full graph).
   */
  data?: Record<string, unknown>
}

export interface SurfaceContext {
  surface: SurfaceId
  /** What the surface is scoped to. */
  active: ActiveObject
  /** Arbitrary graph nodes / events / wells / text. */
  selection: SelectionItem[]
  /** User goal / instruction. */
  prompt: string
  /** ISO timestamp. */
  asOf?: string
}

/**
 * Window event a surface dispatches when the user asks the AI to act on the
 * current selection. AiTabPanel listens (mirroring pdf-text-selection /
 * protocol-step-selection) and routes the SurfaceContext into the AI chat.
 * Shared so the dispatcher and listener never drift. Detail: { ctx }.
 */
export const SURFACE_AI_REQUEST_EVENT = 'surface-ai-request'

/**
 * Build the AI message preamble for a dispatched SurfaceContext — the
 * deterministic "from surface, selected N, goal" that grounds the model, WITH
 * the actual data about each selected object (so the model can answer).
 */
export function surfaceAiPrompt(ctx: SurfaceContext): string {
  const lines: string[] = [`From the ${ctx.surface} surface, ${ctx.selection.length} selected:`]
  for (const item of ctx.selection) {
    const name = item.ref.label ?? item.label ?? item.ref.id
    const data = item.data && Object.keys(item.data).length > 0 ? JSON.stringify(item.data) : ''
    lines.push(data ? `- ${name}: ${data}` : `- ${name}`)
  }
  lines.push(`Goal: ${ctx.prompt}`)
  return lines.join('\n')
}