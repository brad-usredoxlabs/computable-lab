/**
 * projectModeFromParam — narrow URL params to a known ProjectMode.
 *
 * The dispatcher uses this for every workspace render, and the mode
 * selector uses it to decide which tab is active. Unknown / missing
 * params fall back to event-editor.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_MODE, PROJECT_MODES, projectModeFromParam } from './projectMode'

describe('projectModeFromParam', () => {
  it('returns the default mode for undefined/null/empty', () => {
    expect(projectModeFromParam(undefined)).toBe(DEFAULT_PROJECT_MODE)
    expect(projectModeFromParam(null)).toBe(DEFAULT_PROJECT_MODE)
    expect(projectModeFromParam('')).toBe(DEFAULT_PROJECT_MODE)
  })

  it('returns each known mode verbatim', () => {
    for (const mode of PROJECT_MODES) {
      expect(projectModeFromParam(mode)).toBe(mode)
    }
  })

  it('falls back to default on unknown strings', () => {
    expect(projectModeFromParam('foo')).toBe(DEFAULT_PROJECT_MODE)
    expect(projectModeFromParam('event-graph')).toBe(DEFAULT_PROJECT_MODE) // not a mode, even though it's a route path
  })
})
