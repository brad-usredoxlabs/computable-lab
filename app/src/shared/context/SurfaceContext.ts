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