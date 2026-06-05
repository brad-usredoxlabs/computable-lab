/**
 * ProjectMode — the canonical list of view modes a project workspace can
 * dispatch on. Centralized so the selector, the dispatcher, the legacy
 * route redirects, and tests all read from one place.
 *
 * Adding a new mode is two-step: append here, then add a body component
 * in ProjectWorkspacePage's mode switch.
 */

export type ProjectMode = 'event-editor' | 'protocols' | 'browser' | 'literature'

export const PROJECT_MODES: readonly ProjectMode[] = [
  'event-editor',
  'protocols',
  'browser',
  'literature',
] as const

export const DEFAULT_PROJECT_MODE: ProjectMode = 'event-editor'

/** Narrow a URL param to a known ProjectMode, falling back to the default. */
export function projectModeFromParam(raw: string | undefined | null): ProjectMode {
  if (!raw) return DEFAULT_PROJECT_MODE
  return (PROJECT_MODES as readonly string[]).includes(raw)
    ? (raw as ProjectMode)
    : DEFAULT_PROJECT_MODE
}
