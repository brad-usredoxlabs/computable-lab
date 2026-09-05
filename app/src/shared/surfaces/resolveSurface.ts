/**
 * resolveSurface — pure route → "where am I" resolver (phase 2 add).
 *
 * Maps the current URL path (+ run-workspace mode + selected nodes) to a
 * SurfaceId from the declarative surface registry. Pure + unit-testable (no
 * API, no DOM): the route is the source of truth for which surface you're on.
 */
import type { SurfaceId } from '../context/SurfaceContext'

export interface ResolvedSurface {
  surface: SurfaceId
  label: string
  /** The active object this surface is scoped to. */
  active: { objectType: string; objectId: string; label: string }
  /** How many well/cell/event nodes are currently selected (best-effort). */
  selectionCount: number
}

/** Route pattern → surface id. Longer/more specific first. */
const SURFACE_BY_PATH: Array<{ pattern: RegExp; surface: SurfaceId }> = [
  { pattern: /^\/find(?:\/|$)/, surface: 'find' },
  { pattern: /^\/literature(?:\/|$)/, surface: 'knowledge' },
  { pattern: /^\/knowledge(?:\/|$)/, surface: 'knowledge' },
  { pattern: /^\/artifact\/(?:pdf|document)\//, surface: 'knowledge' },
  { pattern: /^\/runs\//, surface: 'run-design' },
  { pattern: /^\/run\//, surface: 'run-design' },
  { pattern: /^\/deck\//, surface: 'run-design' },
  { pattern: /^\/project\//, surface: 'project' },
  { pattern: /^\/claims?\//, surface: 'knowledge' },
  { pattern: /^\/record\//, surface: 'knowledge' },
  { pattern: /^\/splash/, surface: 'project' },
  { pattern: /^\/$/, surface: 'project' },
]

const SURFACE_LABELS: Record<SurfaceId, string> = {
  project: 'Project',
  'run-plan': 'Run · Plan',
  'run-design': 'Run · Design',
  'run-execute': 'Run · Execute',
  results: 'Results',
  analysis: 'Analysis',
  knowledge: 'Knowledge',
  find: 'Find',
}

/** Extract the active object id + type from a route path (best-effort). */
function activeFromPath(path: string): { objectType: string; objectId: string; label: string } {
  const run = path.match(/^\/runs\/([^/?#]+)/)
  if (run) return { objectType: 'run', objectId: run[1]!, label: `Run ${run[1]}` }
  const deck = path.match(/^\/deck\/([^/?#]+)/)
  if (deck) return { objectType: 'event_graph', objectId: deck[1]!, label: `Deck ${deck[1]}` }
  const proj = path.match(/^\/project\/([^/?#]+)/)
  if (proj) return { objectType: 'project', objectId: proj[1]!, label: `Project ${proj[1]}` }
  const artifact = path.match(/^\/artifact\/(?:pdf|document)\/([^/?#]+)/)
  if (artifact) return { objectType: 'document', objectId: artifact[1]!, label: `Document ${artifact[1]}` }
  const find = path.match(/^\/find/)
  if (find) return { objectType: 'collection', objectId: 'find', label: 'Find' }
  return { objectType: 'root', objectId: 'home', label: 'Home' }
}

export function resolveSurfaceFromPath(
  path: string,
  opts?: { selectionCount?: number; runMode?: 'plan' | 'design' | 'execute' | 'results' },
): ResolvedSurface {
  const pathname = path.split('?')[0]!.split('#')[0]!
  let surface: SurfaceId = 'project'
  for (const { pattern, surface: s } of SURFACE_BY_PATH) {
    if (pattern.test(pathname)) {
      surface = s
      break
    }
  }
  // A run surface's plan/design/execute/results are MODES of ONE run tab
  // (locked decision #3) — refine the surface id from the mode when given.
  const isRunLike = surface === 'run-design' && /^\/runs\//.test(pathname)
  if (isRunLike && opts?.runMode) {
    surface = (
      { plan: 'run-plan', design: 'run-design', execute: 'run-execute', results: 'results' } as const
    )[opts.runMode]
  }
  const active = activeFromPath(pathname)
  return {
    surface,
    label: SURFACE_LABELS[surface],
    active,
    selectionCount: opts?.selectionCount ?? 0,
  }
}