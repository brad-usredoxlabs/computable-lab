/**
 * Surfaces — client-side mirror of the declarative work-surface registry
 * (phase 2, Task 2.2). Mirrors server/src/surfaces/surfaces.ts.
 */
import type { SurfaceId } from './context/SurfaceContext'

export interface SurfaceSpec {
  id: SurfaceId
  label: string
  path: string
  /**
   * `:token` in `path` → the objectType that fills it. PRESENCE makes the
   * surface deep-linkable (see surfaces/surfaceRoute.ts); a surface without
   * params is an AI-context surface reached through its collection route.
   */
  params?: Record<string, string>
  objectTypes: string[]
  selectableKinds: string[]
  aiRole?: string
}

export interface SurfacesDocument {
  version: number
  title?: string
  description?: string
  surfaces: SurfaceSpec[]
}