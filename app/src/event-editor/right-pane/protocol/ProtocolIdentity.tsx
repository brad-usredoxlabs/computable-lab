/**
 * ProtocolIdentity — "WHICH protocol am I looking at?" for the Protocol tab.
 *
 * The tab used to open straight onto the run header and the step list, so a
 * biologist could not tell which protocol the run is executing, nor where that
 * protocol record came from. This renders the protocol's NAME as the tab's
 * identity line and reveals the rest of the record's metadata on hover/focus:
 * canonical ID, parent artifact (the source document / inherited protocol),
 * state, version, created/updated timestamps and author.
 *
 * Everything comes from the record itself (`GET /api/records/:id` — payload
 * plus envelope meta). A field the record does not carry produces NO row: a
 * hand-authored protocol has no `source`, so it shows no parent artifact
 * rather than an invented one.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import './protocolTabPanel.css'

/** The parts of RecordEnvelope this panel reads (payload + provenance meta). */
interface ProtocolEnvelope {
  recordId: string
  payload?: Record<string, unknown> | null
  meta?: {
    kind?: string
    path?: string
    commitSha?: string
    createdAt?: string
    updatedAt?: string
    createdBy?: string
  } | null
}

export interface ProtocolMetaRow {
  label: string
  value: string
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * ISO timestamp → "2026-09-12 20:30 UTC". A `Z`-suffixed record timestamp is
 * UTC and is labelled as such; any other offset is left as recorded rather
 * than re-labelled (never claim a timezone the record does not state).
 */
export function formatProtocolTimestamp(iso: string | null | undefined): string | null {
  const s = str(iso)
  if (!s) return null
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (!m) return s
  return `${m[1]} ${m[2]}${s.endsWith('Z') ? ' UTC' : ''}`
}

/** The protocol's display name: record title → name → ref label → record id. */
export function protocolDisplayName(
  env: ProtocolEnvelope | null,
  fallbackTitle?: string | null,
  recordIdFallback?: string | null,
): string {
  return (
    str(env?.payload?.title)
    ?? str(env?.payload?.name)
    ?? str(fallbackTitle)
    ?? str(env?.recordId)
    ?? str(recordIdFallback)
    ?? 'Protocol'
  )
}

/** "vendor-pdf ZymoBIOMICS DNA Miniprep (VPDF-651F03789D80)" for a ref-like node. */
function describeRef(ref: unknown): string | null {
  if (!ref || typeof ref !== 'object') return null
  const r = ref as Record<string, unknown>
  const id = str(r.id)
  if (!id) return null
  const type = str(r.type) ?? str(r.kind) ?? 'record'
  const label = str(r.label) ?? str(r.name)
  return label && label !== id ? `${type} ${label} (${id})` : `${type} ${id}`
}

/**
 * The hover rows, in reading order. Only present fields are emitted.
 * Parent artifact = `source.ref` (the document a promoted protocol came from)
 * or `inherits_from` (a local protocol's parent universal protocol).
 */
export function protocolMetaRows(env: ProtocolEnvelope | null): ProtocolMetaRow[] {
  if (!env) return []
  const payload = (env.payload ?? {}) as Record<string, unknown>
  const rows: ProtocolMetaRow[] = [{ label: 'ID', value: env.recordId }]

  const kind = str(payload.kind) ?? str(env.meta?.kind)
  if (kind) rows.push({ label: 'Kind', value: kind })

  const layer = str(payload.protocolLayer)
  if (layer) rows.push({ label: 'Layer', value: layer })

  const source = payload.source && typeof payload.source === 'object'
    ? (payload.source as Record<string, unknown>)
    : null
  const sourceType = source ? str(source.type) : null
  if (sourceType) rows.push({ label: 'Source', value: sourceType })

  const parent = describeRef(source?.ref ?? payload.inherits_from)
  if (parent) rows.push({ label: 'Parent artifact', value: parent })

  const state = str(payload.state)
  if (state) rows.push({ label: 'State', value: state })

  const version = str(payload.version)
  if (version) rows.push({ label: 'Version', value: version })

  const created = formatProtocolTimestamp(str(payload.createdAt) ?? env.meta?.createdAt)
  if (created) rows.push({ label: 'Created', value: created })

  const createdBy = str(payload.createdBy) ?? str(env.meta?.createdBy)
  if (createdBy) rows.push({ label: 'Created by', value: createdBy })

  const updated = formatProtocolTimestamp(str(payload.updatedAt) ?? env.meta?.updatedAt)
  if (updated) rows.push({ label: 'Updated', value: updated })

  const path = str(env.meta?.path)
  if (path) rows.push({ label: 'Path', value: path })

  return rows
}

export interface ProtocolIdentityProps {
  /** The attached protocol's canonical record id (run → plannedRunRef → protocolRef). */
  protocolId: string
  /** Ref label from the run's chain, shown until the record lands. */
  fallbackTitle?: string | null
}

/**
 * Tooltip width budget. Declared here (not only in CSS) because the anchor sits
 * in the right-hand pane, so the popover must be shifted left to stay on screen
 * rather than run off the viewport edge.
 */
const TOOLTIP_MAX_WIDTH_PX = 420
const VIEWPORT_MARGIN_PX = 12

export function ProtocolIdentity({ protocolId, fallbackTitle }: ProtocolIdentityProps) {
  const [env, setEnv] = useState<ProtocolEnvelope | null>(null)
  const [failed, setFailed] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setEnv(null)
    setFailed(false)
    void apiClient
      .getRecord(protocolId)
      .then((record) => {
        if (!cancelled) setEnv(record as unknown as ProtocolEnvelope)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [protocolId])

  const name = protocolDisplayName(env, fallbackTitle, protocolId)
  const rows = protocolMetaRows(env)
  // The id is worth reading even when the record fetch failed — it is the
  // identity the run's chain actually carries.
  const idLine = env?.recordId ?? (failed ? protocolId : null)

  const showTip = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Keep the popover inside the viewport: the anchor lives in the right-hand
    // pane, so its left edge is often too far right for a 420px-wide tooltip.
    const x = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(rect.left, window.innerWidth - TOOLTIP_MAX_WIDTH_PX - VIEWPORT_MARGIN_PX),
    )
    setTip({ x, y: rect.bottom + 6 })
  }, [])

  const hideTip = useCallback(() => setTip(null), [])

  // A fixed-position tooltip must not survive a scroll of its anchor.
  useEffect(() => {
    if (!tip) return
    const onScroll = () => setTip(null)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [tip])

  return (
    <div className="protocol-identity" data-testid="protocol-identity">
      <span className="protocol-identity__eyebrow">Protocol</span>
      <div
        ref={anchorRef}
        className="protocol-identity__main"
        data-testid="protocol-identity-name"
        tabIndex={0}
        aria-describedby={tip ? 'protocol-identity-tooltip' : undefined}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        <span className="protocol-identity__name">{name}</span>
        {idLine ? <span className="protocol-identity__id">{idLine}</span> : null}
      </div>
      {tip && rows.length > 0 ? (
        <div
          id="protocol-identity-tooltip"
          role="tooltip"
          className="protocol-identity__tooltip"
          data-testid="protocol-identity-tooltip"
          style={{ left: tip.x, top: tip.y, maxWidth: TOOLTIP_MAX_WIDTH_PX }}
        >
          <div className="protocol-identity__tooltip-title">{name}</div>
          <dl className="protocol-identity__tooltip-rows">
            {rows.map((row) => (
              <div key={row.label} className="protocol-identity__tooltip-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
