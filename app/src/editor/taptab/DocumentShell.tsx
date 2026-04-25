/**
 * DocumentShell — a document-first editing surface.
 *
 * Provides:
 *  - A narrow top control bar (breadcrumbs, title, save/cancel, mode toggle)
 *  - A primary paper-like editing column
 *  - An optional secondary diagnostics / related-record rail
 *
 * Intended to replace the old stacked-card chrome across
 * RawRecordEditor, RecordRegistryPage, and SlideOverEditor.
 */

import React from 'react'

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

interface DocumentShellProps {
  /** Narrow top bar content (breadcrumbs, title, actions) */
  topBar: React.ReactNode
  /** Primary document / editing column */
  children: React.ReactNode
  /** Optional secondary rail (diagnostics, related records, etc.) */
  rail?: React.ReactNode
  /** When true, render the rail inline below the document (mobile) */
  railBelow?: boolean
  /** Optional class on the outer wrapper */
  className?: string
}

/**
 * DocumentShell renders a slim top bar, a centered paper-like column,
 * and an optional secondary rail.  On narrow viewports the rail drops
 * below the document column.
 */
export function DocumentShell({
  topBar,
  children,
  rail,
  railBelow = false,
  className = '',
}: DocumentShellProps) {
  return (
    <div className={`document-shell ${className}`}>
      {/* ── Narrow top control bar ─────────────────────────────── */}
      <div className="document-shell__topbar" role="banner">
        {topBar}
      </div>

      {/* ── Main layout: column + optional rail ────────────────── */}
      <div className="document-shell__body">
        <div className="document-shell__column">{children}</div>

        {rail && (
          <aside
            className={`document-shell__rail ${railBelow ? 'document-shell__rail--below' : ''}`}
            role="complementary"
            aria-label="Diagnostics and related records"
          >
            {rail}
          </aside>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  DocumentShellHeader — reusable slim header for the top bar        */
/* ------------------------------------------------------------------ */

interface DocumentShellHeaderProps {
  /** Breadcrumb trail (array of { label, href? } or plain strings) */
  breadcrumbs?: Array<{ label: string; href?: string }> | string[]
  /** Page title */
  title: string
  /** Action buttons (Save, Cancel, mode toggle, etc.) */
  actions?: React.ReactNode
}

export function DocumentShellHeader({
  breadcrumbs,
  title,
  actions,
}: DocumentShellHeaderProps) {
  return (
    <div className="document-shell-header">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="document-shell-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => {
            const label = typeof crumb === 'string' ? crumb : crumb.label
            const href = typeof crumb === 'string' ? undefined : crumb.href
            return (
              <React.Fragment key={i}>
                {href ? (
                  <a href={href} className="document-shell-breadcrumb-link">
                    {label}
                  </a>
                ) : (
                  <span className="document-shell-breadcrumb-current">{label}</span>
                )}
                {i < breadcrumbs.length - 1 && (
                  <span className="document-shell-breadcrumb-sep" aria-hidden="true">/</span>
                )}
              </React.Fragment>
            )
          })}
        </nav>
      )}
      <h1 className="document-shell-title">{title}</h1>
      {actions && <div className="document-shell-actions">{actions}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  DocumentShellRail — reusable diagnostics / related-record rail    */
/* ------------------------------------------------------------------ */

interface DocumentShellRailProps {
  title?: string
  children: React.ReactNode
}

export function DocumentShellRail({ title, children }: DocumentShellRailProps) {
  return (
    <div className="document-shell-rail">
      {title && <h2 className="document-shell-rail-title">{title}</h2>}
      <div className="document-shell-rail-content">{children}</div>
    </div>
  )
}
