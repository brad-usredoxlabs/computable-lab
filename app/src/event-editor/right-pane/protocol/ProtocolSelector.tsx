/**
 * ProtocolSelector — shown in the Protocol tab when no protocol is attached
 * to the active run, OR when the user is changing the attached protocol
 * (alreadyAttached=true). Lets the user pick from available protocols at two
 * scope levels: project (study-scoped) and lab (global).
 *
 * Preview-then-commit: clicking a protocol PREVIEWS its steps/full text
 * without attaching it. Only the explicit "Attach to run" button commits
 * (calls apiClient.useProtocolInRun, which creates a planned-run + method
 * event graph and attaches it to the run).
 *
 * While the run is still being planned, the user can return here to switch
 * protocols: when alreadyAttached is true, attaching passes replace:true so
 * the prior method is replaced rather than rejected.
 */

import { useState } from 'react'
import { apiClient, type ProtocolContextResponse } from '../../../shared/api/client'
import type { RecordEnvelope } from '../../../types/kernel'

export interface ProtocolSelectorProps {
  runId: string
  studyId: string
  context: ProtocolContextResponse | null
  onAttached: () => void
  /** True when re-opening the selector to CHANGE an already-attached protocol. */
  alreadyAttached?: boolean
  /** Dismiss the change-protocol flow without attaching (only when alreadyAttached). */
  onCancel?: () => void
  /** Open an ingested vendor PDF's review surface. Vendor-pdfs are NOT
   *  attachable (useProtocolInRun only accepts protocol/local-protocol), so
   *  their rows show Open, never Attach. */
  onOpenIngestedPdf?: (recordId: string) => void
}

interface ProtocolPreview {
  id: string
  title: string
  kind: string
  steps: { ordinal?: number; label?: string }[]
  text: string | null
  loading: boolean
  error: string | null
}

function titleOf(p: { payload?: unknown }): string {
  const payload = p.payload as Record<string, unknown> | undefined
  const t = typeof payload?.title === 'string' ? payload.title : ''
  // Defensive UI fallback for generic extractor draft titles ("Quick
  // Reference", "June 2023", "Untitled"). The real fix is at promotion time;
  // this keeps the row readable until then.
  const GENERIC = /^(quick reference|untitled|june \d{4})$/i
  return t && !GENERIC.test(t) ? t : (t || 'Untitled PDF protocol')
}
function kindOf(p: { payload?: unknown }): string {
  const payload = p.payload as Record<string, unknown> | undefined
  return typeof payload?.kind === 'string' ? payload.kind : 'protocol'
}

export function ProtocolSelector({ runId, studyId, context, onAttached, alreadyAttached = false, onCancel, onOpenIngestedPdf }: ProtocolSelectorProps) {
  const [attaching, setAttaching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ProtocolPreview | null>(null)

  const approved = (p: { payload?: Record<string, unknown> | null }): boolean => {
    const state = p?.payload?.state as string | undefined
    return state === 'approved' || state === 'effective' || state === 'accepted' || state === 'superseded'
  }

  // A protocol is attachable when it is approved-ish. Localization is NOT a gate:
  // the run-editor is exactly where a universal protocol's steps get localized in
  // the event editor, so approved universals must remain attachable (gating on
  // step-realization here hid them and left only vendor PDFs' "Open" rows).
  const attachable = approved

  const projectProtocols = (context?.projectTemplates ?? []).filter(attachable)
  const labProtocols = (context?.availableProtocols ?? []).filter(
    (p) => {
      const links = p.payload?.links as { studyId?: string; experimentId?: string } | undefined
      return !links?.studyId && !links?.experimentId && attachable(p)
    },
  )
  const ingestedPdfs = context?.ingestedPdfs ?? []

  async function handleAttach(protocolId: string, forceReplace = false) {
    setAttaching(protocolId)
    setError(null)
    const replace = forceReplace || alreadyAttached
    try {
      await apiClient.useProtocolInRun({
        protocolId,
        runId,
        studyId,
        ...(replace ? { replace: true } : {}),
      })
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
      onAttached()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!replace && (msg.includes('METHOD_ALREADY_ATTACHED') || msg.includes('409'))) {
        if (window.confirm('This run already has a method. Replace it?')) {
          return handleAttach(protocolId, true)
        }
      }
      setError(msg)
    } finally {
      setAttaching(null)
    }
  }

  async function handlePreview(p: ProtocolContextResponse['projectTemplates'][number]) {
    const id = p.recordId
    const title = titleOf(p) || id
    const kind = kindOf(p)
    setPreview({ id, title, kind, steps: [], text: null, loading: true, error: null })
    try {
      const res = await fetch(`/api/protocols/${encodeURIComponent(id)}/steps`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { steps?: { ordinal?: number; label?: string }[]; humanStepsText?: unknown }
      let text: string | null = typeof data.humanStepsText === 'string' ? data.humanStepsText : null
      if (text === null) {
        const env = await apiClient.getRecord(id).catch(() => null)
        const payload = (env?.payload ?? env) as Record<string, unknown> | null
        if (payload && typeof payload.humanStepsText === 'string') text = payload.humanStepsText
      }
      setPreview({
        id,
        title,
        kind,
        steps: Array.isArray(data.steps) ? data.steps : [],
        text,
        loading: false,
        error: null,
      })
    } catch (err) {
      setPreview((prev) =>
        prev?.id === id
          ? { ...prev, loading: false, error: err instanceof Error ? err.message : String(err) }
          : prev,
      )
    }
  }

  if (!context) {
    return (
      <div style={{ padding: '16px', color: 'var(--cl-text-dim)', fontSize: '13px' }}>
        Loading available protocols…
      </div>
    )
  }

  const hasAny = projectProtocols.length > 0 || labProtocols.length > 0 || ingestedPdfs.length > 0

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--cl-text)' }}>
            {alreadyAttached ? 'Change protocol' : 'No protocol attached'}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--cl-text-dim)', lineHeight: 1.4, margin: '2px 0 0' }}>
            {alreadyAttached
              ? "Preview any protocol below — clicking one only shows its steps. 'Attach to run' replaces the current method."
              : "Preview any protocol below — clicking one only shows its steps. 'Attach to run' commits it to this run."}
          </p>
        </div>
        {alreadyAttached && onCancel ? (
          <button
            type="button"
            data-testid="change-cancel"
            onClick={onCancel}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: '1px solid var(--cl-border)',
              borderRadius: '6px',
              color: 'var(--cl-text-dim)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(248,81,73,0.1)', border: '1px solid var(--cl-danger)', borderRadius: '6px', color: 'var(--cl-danger)', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {hasAny ? (
        <>
          {projectProtocols.length > 0 && (
            <ProtocolGroup
              label="Project Protocols"
              protocols={projectProtocols}
              attaching={attaching}
              previewingId={preview?.id ?? null}
              onPreview={(p) => void handlePreview(p)}
              onAttach={(id) => void handleAttach(id)}
            />
          )}
          {labProtocols.length > 0 && (
            <ProtocolGroup
              label="Lab Protocols"
              protocols={labProtocols}
              attaching={attaching}
              previewingId={preview?.id ?? null}
              onPreview={(p) => void handlePreview(p)}
              onAttach={(id) => void handleAttach(id)}
            />
          )}
          {ingestedPdfs.length > 0 && (
            <IngestedPdfGroup
              pdfs={ingestedPdfs}
              onOpenIngestedPdf={onOpenIngestedPdf}
            />
          )}
        </>
      ) : (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--cl-text-dim)', fontSize: '13px' }}>
          No protocols available. Create one from a PDF using the "Convert to Protocol" button.
        </div>
      )}

      {preview ? (
        <div data-testid="protocol-preview" style={{ border: '1px solid var(--cl-border)', borderRadius: '6px', padding: '10px 12px', background: 'var(--cl-bg-elev)' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--cl-text)' }}>
            {preview.title}{' '}
            <span style={{ color: 'var(--cl-text-dim)', fontWeight: 400 }}>
              {preview.id} · {preview.kind}
            </span>
          </div>
          {preview.loading ? (
            <div style={{ padding: '8px 0', color: 'var(--cl-text-dim)', fontSize: '12px' }}>Loading preview…</div>
          ) : preview.error ? (
            <div style={{ padding: '8px 0', color: 'var(--cl-danger)', fontSize: '12px' }}>Could not preview: {preview.error}</div>
          ) : (
            <>
              <ol style={{ margin: '8px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {preview.steps.map((s, i) => (
                  <li key={`${preview.id}-${s.ordinal ?? i}`} style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--cl-text-dim)' }}>
                    <strong style={{ color: 'var(--cl-accent)' }}>{s.ordinal ?? i + 1}.</strong> {s.label ?? `Step ${i + 1}`}
                  </li>
                ))}
                {preview.steps.length === 0 ? <li style={{ fontSize: '12px', color: 'var(--cl-text-dim)' }}>No steps in this protocol.</li> : null}
              </ol>
              {preview.text ? (
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '8px', background: 'var(--cl-bg)', borderRadius: '4px', maxHeight: '220px', overflow: 'auto', color: 'var(--cl-text-dim)', fontSize: '12px', lineHeight: 1.5 }}>
                  {preview.text}
                </pre>
              ) : (
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--cl-text-dim)' }}>No full protocol text available.</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProtocolGroup({
  label,
  protocols,
  attaching,
  previewingId,
  onPreview,
  onAttach,
}: {
  label: string
  protocols: RecordEnvelope[]
  attaching: string | null
  previewingId: string | null
  onPreview: (p: RecordEnvelope) => void
  onAttach: (id: string) => void
}) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {protocols.map((p) => {
          const title = titleOf(p) || p.recordId
          const kind = kindOf(p)
          const isLocal = kind === 'local-protocol'
          const isPreviewed = previewingId === p.recordId
          return (
            <div
              key={p.recordId}
              style={{
                padding: '8px 10px',
                background: 'var(--cl-bg-elev)',
                border: `1px solid ${isPreviewed ? 'var(--cl-accent)' : 'var(--cl-border)'}`,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                opacity: attaching !== null && attaching !== p.recordId ? 0.5 : 1,
              }}
            >
              <button
                type="button"
                data-testid={`preview-${p.recordId}`}
                onClick={() => onPreview(p)}
                disabled={attaching !== null}
                title={`Preview ${title}`}
                style={{
                  background: 'transparent',
                  border: 0,
                  cursor: attaching ? 'default' : 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                  font: 'inherit',
                  padding: 0,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--cl-text)' }}>{title}</span>
                <span style={{ fontSize: '11px', color: 'var(--cl-text-dim)' }}>
                  {p.recordId}
                  {isLocal ? ' · Local' : ' · Universal'}
                </span>
              </button>
              <button
                type="button"
                data-testid={`attach-${p.recordId}`}
                onClick={() => onAttach(p.recordId)}
                disabled={attaching !== null}
                title="Attach this protocol to the run"
                style={{
                  padding: '6px 10px',
                  background: 'var(--cl-accent)',
                  color: '#fff',
                  border: 0,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: attaching ? 'default' : 'pointer',
                  flexShrink: 0,
                }}
              >
                {attaching === p.recordId ? 'Attaching…' : 'Attach to run'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IngestedPdfGroup({
  pdfs,
  onOpenIngestedPdf,
}: {
  pdfs: RecordEnvelope[]
  onOpenIngestedPdf?: (recordId: string) => void
}) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Ingested PDFs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {pdfs.map((p) => {
          const title = titleOf(p) || p.recordId
          return (
            <div
              key={p.recordId}
              style={{
                padding: '8px 10px',
                background: 'var(--cl-bg-elev)',
                border: '1px solid var(--cl-border)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--cl-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--cl-text-dim)' }}>
                  {p.recordId} · Vendor PDF
                </span>
              </div>
              <button
                type="button"
                data-testid={`open-pdf-${p.recordId}`}
                onClick={() => onOpenIngestedPdf?.(p.recordId)}
                title="Open this PDF's review surface to extract a protocol"
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  color: 'var(--cl-accent)',
                  border: '1px solid var(--cl-accent)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Open
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}