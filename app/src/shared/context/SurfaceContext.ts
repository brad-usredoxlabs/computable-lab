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
 * deterministic "from surface, selected N, goal" that grounds the model.
 */
export function surfaceAiPrompt(ctx: SurfaceContext): string {
  const labels = ctx.selection
    .map((s) => (s.ref.label ?? s.ref.id ?? s.label ?? '').trim())
    .filter((s) => s.length > 0)
  return [
    `From the ${ctx.surface} surface, ${ctx.selection.length} selected`,
    ...(labels.length > 0 ? [`( ${labels.join(', ')} )`] : []),
    `Goal: ${ctx.prompt}`,
  ].join(' ')
}