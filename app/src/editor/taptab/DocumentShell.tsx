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

import React, { useEffect, useRef, useState } from 'react'

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
  /**
   * Column width posture. 'prose' (default) keeps the capped paper column every
   * existing surface expects; 'full' lets the column fill the main pane — used
   * by the registry, whose records are wide diagnostic/QMS forms, not prose.
   */
  width?: 'prose' | 'full'
  /**
   * Let the user drag the rail's left edge. Width persists to localStorage and
   * clamps to [220px, 40% of the body]. Off by default — only the registry
   * opts in; other surfaces keep the fixed --shell-rail-width.
   */
  railResizable?: boolean
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
  width = 'prose',
  railResizable = false,
}: DocumentShellProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  /* Rail width clamp: [220px, 40% of the body]. The rail is right-anchored,
   * so a drag LEFT widens it: width = rect.right - clientX. Max wins ties
   * when 40% < 220 (narrow body) — do not reorder min/max. */
  const clampRailWidth = (raw: number, body: HTMLElement): number => {
    const rect = body.getBoundingClientRect()
    return Math.min(Math.max(raw, 220), rect.width * 0.4)
  }

  const applyRailWidth = (body: HTMLElement, w: number): void => {
    body.style.setProperty('--shell-rail-width', `${w}px`)
  }

  const persistRailWidth = (w: number): void => {
    try { localStorage.setItem('cl-registry-rail-width', String(Math.round(w))) } catch { /* private mode */ }
  }

  /* Restore the saved width on mount — re-clamped (W4-D1 / AS-ORCH-L1-167):
   * a width saved in a wide window must not breach 40% when restored in a
   * narrow one. */
  useEffect(() => {
    if (!railResizable) return
    let saved: string | null = null
    try { saved = localStorage.getItem('cl-registry-rail-width') } catch { /* private mode */ }
    if (saved === null) return
    const parsed = Number(saved)
    if (!Number.isFinite(parsed)) return
    const body = bodyRef.current
    if (!body) return
    applyRailWidth(body, clampRailWidth(parsed, body))
  }, [railResizable])

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
    document.body.classList.add('cl-rail-dragging')
    const move = (ev: PointerEvent) => {
      const body = bodyRef.current
      if (!body) return
      const w = clampRailWidth(body.getBoundingClientRect().right - ev.clientX, body)
      applyRailWidth(body, w)
    }
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.classList.remove('cl-rail-dragging')
      setDragging(false)
      const body = bodyRef.current
      if (!body) return
      const w = clampRailWidth(body.getBoundingClientRect().right - ev.clientX, body)
      persistRailWidth(w)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  /* Keyboard nudge: ArrowLeft widens (rail is on the RIGHT), ArrowRight
   * narrows — 16px through the identical clamp + persist path. */
  const nudgeRail = (delta: number): void => {
    const body = bodyRef.current
    if (!body) return
    const current = parseFloat(body.style.getPropertyValue('--shell-rail-width'))
    const base = Number.isFinite(current) ? current : 320
    const w = clampRailWidth(base + delta, body)
    applyRailWidth(body, w)
    persistRailWidth(w)
  }

  const onSplitterKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      nudgeRail(16)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      nudgeRail(-16)
    }
  }

  return (
    <div className={`document-shell document-shell--width-${width} ${className}`}>
      {/* ── Narrow top control bar ─────────────────────────────── */}
      <div className="document-shell__topbar" role="banner">
        {topBar}
      </div>

      {/* ── Main layout: column + optional rail ────────────────── */}
      <div className="document-shell__body" ref={bodyRef}>
        <div className="document-shell__column">{children}</div>

        {rail && railResizable && !railBelow && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize rail"
            tabIndex={0}
            onPointerDown={startDrag}
            onKeyDown={onSplitterKeyDown}
            className={`document-shell__rail-resizer${dragging ? ' document-shell__rail-resizer--dragging' : ''}`}
          />
        )}

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
