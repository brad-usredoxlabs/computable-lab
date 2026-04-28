/**
 * CompileStatusBanner — renders compile status as a colored banner.
 *
 * Props: { result: RunPlanCompileResult | null; isCompiling: boolean }
 * Renders:
 *   - isCompiling: spinner + "Compiling..."
 *   - ready: green banner "Plan ready"
 *   - partial: yellow banner "<unboundCount> roles need binding"
 *   - blocked: red banner "<errorCount> capability errors"
 *   - null: empty (no compile yet)
 */

import type { RunPlanCompileResult } from './types'

interface CompileStatusBannerProps {
  result: RunPlanCompileResult | null
  isCompiling: boolean
}

export function CompileStatusBanner({ result, isCompiling }: CompileStatusBannerProps) {
  if (isCompiling) {
    return (
      <div className="compile-status-banner compile-status-banner--compiling">
        <span className="compile-status-banner__spinner" />
        <span>Compiling...</span>
      </div>
    )
  }

  if (!result) {
    return null
  }

  const { status, diagnostics } = result

  if (status === 'ready') {
    return (
      <div className="compile-status-banner compile-status-banner--ready">
        <span className="compile-status-banner__icon">✓</span>
        <span>Plan ready</span>
      </div>
    )
  }

  if (status === 'partial') {
    const unboundCount = diagnostics.filter(
      (d) => d.code === 'unbound_material_role' || d.code === 'unbound_labware_role',
    ).length
    return (
      <div className="compile-status-banner compile-status-banner--partial">
        <span className="compile-status-banner__icon">⚠</span>
        <span>{unboundCount} role{unboundCount !== 1 ? 's' : ''} need binding</span>
      </div>
    )
  }

  if (status === 'blocked') {
    const errorCount = diagnostics.filter(
      (d) => d.code.startsWith('capability_'),
    ).length
    return (
      <div className="compile-status-banner compile-status-banner--blocked">
        <span className="compile-status-banner__icon">✗</span>
        <span>{errorCount} capability error{errorCount !== 1 ? 's' : ''}</span>
      </div>
    )
  }

  // Fallback for unexpected status
  return (
    <div className="compile-status-banner compile-status-banner--error">
      <span>Unexpected compile status: {status}</span>
    </div>
  )
}
