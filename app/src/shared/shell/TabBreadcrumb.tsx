/**
 * TabBreadcrumb — renders a tab's origin trail ("how I got here").
 * Shown in the viewer-toolbar slot (NOT a new pane). Clickable crumbs
 * navigate back; the current (last) crumb is static.
 */
import { useNavigate } from 'react-router-dom'
import type { BreadcrumbItem } from '../../event-editor/workspace/types'
import './TabBreadcrumb.css'

export interface TabBreadcrumbProps {
  crumbs: BreadcrumbItem[]
  /** The current surface label (the "you are here" item). */
  current: string
}

export function TabBreadcrumb({ crumbs, current }: TabBreadcrumbProps) {
  const navigate = useNavigate()
  if (!crumbs || crumbs.length === 0) return null
  return (
    <span className="tab-breadcrumb" data-testid="tab-breadcrumb">
      {crumbs.map((c, i) => (
        <span key={i} className="tab-breadcrumb__item">
          {i > 0 && <span className="tab-breadcrumb__sep" aria-hidden>›</span>}
          {c.route ? (
            <button
              type="button"
              className="tab-breadcrumb__link"
              data-testid={`tab-crumb-${i}`}
              onClick={() => navigate(c.route as string)}
              title={c.label}
            >
              {c.label}
            </button>
          ) : (
            <span className="tab-breadcrumb__static">{c.label}</span>
          )}
        </span>
      ))}
      <span className="tab-breadcrumb__sep" aria-hidden>›</span>
      <span className="tab-breadcrumb__current" data-testid="tab-breadcrumb-current">{current}</span>
    </span>
  )
}
