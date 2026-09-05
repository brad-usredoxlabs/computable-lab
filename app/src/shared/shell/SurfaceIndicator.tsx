/**
 * SurfaceIndicator — the visible "where am I" widget.
 *
 * Renders a compact chip in the workspace tab row showing the current work
 * surface (surface label + active object) + how many nodes are selected, all
 * resolved from the CURRENT ROUTE. Grounded on the declarative surface registry
 * via GET /api/surfaces — the label/role come from DATA, never hardcoded.
 *
 * This is what makes SurfaceContext visible: the same surface the user is on
 * here is the `surface` field that flows into the AI (+ corpus) on every turn.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import type { SurfaceSpec } from '../../shared/surfaces'
import { resolveSurfaceFromPath } from '../../shared/surfaces/resolveSurface'
import './SurfaceIndicator.css'

export interface SurfaceIndicatorProps {
  /** Optional run-workspace mode (plan/design/execute/results) to refine a run surface. */
  runMode?: 'plan' | 'design' | 'execute' | 'results'
  /** Optional selected-node count (from the active surface's selection). */
  selectionCount?: number
}

/** Surfaces that don't have a registry entry still need a sensible label. */
export function SurfaceIndicator({ runMode, selectionCount }: SurfaceIndicatorProps) {
  const location = useLocation()
  const [registry, setRegistry] = useState<SurfaceSpec[] | null>(null)

  // Load the declarative surface registry once (labels/roles from data).
  useEffect(() => {
    let cancelled = false
    void apiClient
      .getSurfaces()
      .then((res) => {
        if (!cancelled) setRegistry(res.surfaces)
      })
      .catch(() => {
        /* registry unavailable → fall back to route-resolved label only */
        if (!cancelled) setRegistry([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const resolved = useMemo(
    () => resolveSurfaceFromPath(location.pathname, { runMode, selectionCount }),
    [location.pathname, runMode, selectionCount],
  )

  // Prefer the registry's label (declarative); fall back to the resolver's.
  const registryLabel = registry?.find((s) => s.id === resolved.surface)?.label
  const surfaceLabel = registryLabel ?? resolved.label
  const role = registry?.find((s) => s.id === resolved.surface)?.aiRole

  const hasSelection = (selectionCount ?? 0) > 0

  return (
    <span className="surface-indicator" data-testid="surface-indicator" data-surface={resolved.surface}>
      <span className="surface-indicator__dot" aria-hidden />
      <span className="surface-indicator__label" title={role ?? undefined}>
        {surfaceLabel}
      </span>
      <span className="surface-indicator__active" title={resolved.active.objectId}>
        {resolved.active.label}
      </span>
      {hasSelection && (
        <span className="surface-indicator__sel" data-testid="surface-indicator-sel">
          {selectionCount} selected
        </span>
      )}
    </span>
  )
}