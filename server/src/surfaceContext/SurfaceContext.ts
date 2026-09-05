/**
 * SurfaceContext — "where am I" made deterministic and serializable.
 *
 * The first-class payload that flows through every work surface and into the
 * AI: the surface the user is on, the active object it's scoped to, the
 * selected sub-objects (wells / events / text / nodes), and the user's prompt.
 *
 * Mirrors app/src/shared/context/SurfaceContext.ts — keep the two in sync.
 * ExactOptionalPropertyTypes is on: optional fields are ABSENT (never
 * undefined) on serialization — see surfaceContext.ts toYaml/toJson.
 *
 * This is the UI "surface context", NOT the `CTX-…` computed well/plate state
 * after replay — those are cousins, do not conflate them (see schema/context).
 */
import type { Ref } from '../types/ref.js';

export type SurfaceId =
  | 'project'
  | 'run-plan'
  | 'run-design'
  | 'run-execute'
  | 'results'
  | 'analysis'
  | 'knowledge'
  | 'find';

export interface ActiveObject {
  objectType: string;
  objectId: string;
  label: string;
  linkedProjectIds?: string[];
}

export interface SelectionItem {
  ref: Ref;
  label?: string;
}

export interface SurfaceContext {
  surface: SurfaceId;
  /** What the surface is scoped to. */
  active: ActiveObject;
  /** Arbitrary graph nodes / events / wells / text. */
  selection: SelectionItem[];
  /** User goal / instruction. */
  prompt: string;
  /** ISO timestamp. */
  asOf?: string;
}