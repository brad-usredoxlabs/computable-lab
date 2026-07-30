/**
 * ProtocolSelector — shown in the Protocol tab when no protocol is attached
 * to the active run. Lets the user pick from available protocols at two
 * scope levels: project (study-scoped) and lab (global).
 *
 * On selection, calls apiClient.useProtocolInRun() which creates a planned-run
 * + method event graph and attaches it to the run.
 */

import { useState } from 'react'
import { apiClient, type ProtocolContextResponse } from '../../../shared/api/client'
import type { RecordEnvelope } from '../../../types/kernel'

export interface ProtocolSelectorProps {
  runId: string
  studyId: string
  context: ProtocolContextResponse | null
  onAttached: () => void
}

export function ProtocolSelector({ runId, studyId, context, onAttached }: ProtocolSelectorProps) {
  const [attaching, setAttaching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const projectProtocols = context?.projectTemplates ?? []
  const labProtocols = (context?.availableProtocols ?? []).filter(
    (p) => {
      const links = p.payload?.links as { studyId?: string; experimentId?: string } | undefined
      return !links?.studyId && !links?.experimentId
    }
  )

  async function handleAttach(protocolId: string, replace = false) {
    setAttaching(protocolId)
    setError(null)
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
      if (msg.includes('METHOD_ALREADY_ATTACHED') || msg.includes('409')) {
        if (window.confirm('This run already has a method. Replace it?')) {
          return handleAttach(protocolId, true)
        }
      }
      setError(msg)
    } finally {
      setAttaching(null)
    }
  }

  if (!context) {
    return (
      <div style={{ padding: '16px', color: 'var(--cl-text-dim)', fontSize: '13px' }}>
        Loading available protocols…
      </div>
    )
  }

  const hasAny = projectProtocols.length > 0 || labProtocols.length > 0

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--cl-text)' }}>
        No protocol attached
      </div>
      <p style={{ fontSize: '12px', color: 'var(--cl-text-dim)', lineHeight: 1.4 }}>
        Select a protocol to attach to this run. The protocol's steps will be
        compiled into an event graph for execution.
      </p>

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
              onAttach={(id) => void handleAttach(id)}
            />
          )}
          {labProtocols.length > 0 && (
            <ProtocolGroup
              label="Lab Protocols"
              protocols={labProtocols}
              attaching={attaching}
              onAttach={(id) => void handleAttach(id)}
            />
          )}
        </>
      ) : (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--cl-text-dim)', fontSize: '13px' }}>
          No protocols available. Create one from a PDF using the "Convert to Protocol" button.
        </div>
      )}
    </div>
  )
}

function ProtocolGroup({
  label,
  protocols,
  attaching,
  onAttach,
}: {
  label: string
  protocols: RecordEnvelope[]
  attaching: string | null
  onAttach: (id: string) => void
}) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {protocols.map((p) => {
          const title = (p.payload?.title as string) ?? p.recordId
          const kind = (p.payload?.kind as string) ?? 'protocol'
          const isLocal = kind === 'local-protocol'
          return (
            <button
              key={p.recordId}
              type="button"
              onClick={() => onAttach(p.recordId)}
              disabled={attaching !== null}
              style={{
                padding: '10px 12px',
                background: 'var(--cl-bg-elev)',
                border: `1px solid ${attaching === p.recordId ? 'var(--cl-accent)' : 'var(--cl-border)'}`,
                borderRadius: '6px',
                cursor: attaching ? 'default' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                textAlign: 'left',
                opacity: attaching !== null && attaching !== p.recordId ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--cl-text)' }}>
                {title}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--cl-text-dim)' }}>
                {p.recordId}
                {isLocal ? ' · Local' : ' · Universal'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
