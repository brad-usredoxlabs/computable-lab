/**
 * VisibilityBadge — compact indicator of a record's access visibility.
 * `null` means no policy exists (open to anyone who can reach it).
 */

import type { Visibility } from '../api/client'

const META: Record<Visibility, { icon: string; label: string }> = {
  private: { icon: '🔒', label: 'Private' },
  shared: { icon: '👥', label: 'Shared' },
  public: { icon: '🌐', label: 'Public' },
}

export function VisibilityBadge({
  visibility,
  inherited = false,
}: {
  visibility: Visibility | null
  inherited?: boolean
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.72rem',
    padding: '1px 7px',
    borderRadius: 999,
    border: '1px solid var(--cl-border)',
    color: 'var(--cl-text-dim)',
    whiteSpace: 'nowrap',
  }
  if (!visibility) {
    return (
      <span style={base} title="No policy — open to everyone with access">
        open
      </span>
    )
  }
  const m = META[visibility]
  return (
    <span style={base} title={`${m.label}${inherited ? ' (inherited from parent)' : ''}`}>
      <span aria-hidden>{m.icon}</span>
      {m.label}
      {inherited ? <span style={{ color: 'var(--cl-text-faint)' }}>·inherited</span> : null}
    </span>
  )
}
