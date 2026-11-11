/**
 * Run-surface READ-ONLY door for GET /runs/:id/role-binding-proposals.
 * Renders the server's projection verbatim: one candidate is only PROPOSED
 * (nothing is written), ambiguous roles list every server candidate, unbound
 * roles state the server's reason. A 404 (run has no attached protocol) and an
 * empty projection both render nothing; any other failure is one visible line.
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiClient, type RoleBindingProposalsResponse } from '../shared/api/client'
import { ApiError, isPlannedRunKindRefusal } from '../shared/api/errors'

export interface RoleBindingProposalsPanelProps {
  runId: string
}

const wrapStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 12px',
  fontSize: '11px', color: 'var(--cl-text)', borderTop: '1px solid var(--cl-border)',
}
const headingStyle: CSSProperties = { margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--cl-text-dim)' }
const protocolStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' }
const protocolTitleStyle: CSSProperties = { margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--cl-text)' }
const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px' }
const roleNameStyle: CSSProperties = { fontWeight: 600 }
const metaStyle: CSSProperties = { color: 'var(--cl-text-dim)' }
const proposedStyle: CSSProperties = { color: 'var(--cl-accent, var(--cl-text))' }
const candidatesStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px' }
const promptStyle: CSSProperties = { margin: 0, color: 'var(--cl-text)' }
const listStyle: CSSProperties = { margin: 0, paddingLeft: '18px', color: 'var(--cl-text-dim)' }
const errorStyle: CSSProperties = {
  margin: 0, padding: '6px 12px', fontSize: '11px', color: 'var(--cl-danger, var(--cl-text))',
}

export function RoleBindingProposalsPanel({ runId }: RoleBindingProposalsPanelProps) {
  const [data, setData] = useState<RoleBindingProposalsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bindError, setBindError] = useState<string | null>(null)
  const [bindingCandidate, setBindingCandidate] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const response = await apiClient.getRoleBindingProposals(runId)
      setData(response)
    } catch (err) {
      if (ApiError.isApiError(err) && (err.status === 404 || isPlannedRunKindRefusal(err))) {
        setData(null)
        return
      }
      setError(err instanceof Error ? err.message : 'unknown error')
    }
  }

  useEffect(() => {
    setError(null)
    setBindError(null)
    void loadData()
  }, [runId])

  const handleBind = async (candidate: { recordId: string; recordKind: string; label: string; lotNumber?: string }, role: { roleId: string; roleKind: 'material' | 'labware' }) => {
    setBindingCandidate(candidate.recordId)
    setBindError(null)
    const body: { labware?: Array<{ roleId: string; labwareInstanceRef: string }>; materials?: Array<{ roleId: string; materialInstanceRef: string }> } = {}
    if (role.roleKind === 'labware') {
      body.labware = [{ roleId: role.roleId, labwareInstanceRef: candidate.recordId }]
    } else {
      body.materials = [{ roleId: role.roleId, materialInstanceRef: candidate.recordId }]
    }
    try {
      await apiClient.updatePlannedRunBindings(runId, body)
      await loadData()
    } catch (err) {
      setBindError(err instanceof Error ? err.message : 'unknown error')
    } finally {
      setBindingCandidate(null)
    }
  }

  if (error) {
    return (
      <p role="alert" style={errorStyle}>
        Could not load role-binding proposals: {error}
      </p>
    )
  }
  if (!data || data.protocols.length === 0) return null

  return (
    <section data-testid="role-binding-proposals" aria-label="Role binding proposals (read-only)" style={wrapStyle}>
      <h3 style={headingStyle}>Role bindings — select candidates to bind</h3>
      {bindError && <p role="alert" style={errorStyle}>Bind failed: {bindError}</p>}
      {data.protocols.map((protocol) => (
        <div key={protocol.protocolId} style={protocolStyle} {...(protocol.protocolNotFound ? { 'data-protocol-not-found': '' } : {})}>
          <p style={protocolTitleStyle}>
            <span>{protocol.protocolId}</span>{protocol.reason ? <> — <span style={metaStyle}>{protocol.reason}</span></> : ''}
          </p>
          {protocol.roles.map((role) => {
            const prompt = data.clarificationRequests?.find((card) => card.roleId === role.roleId)?.prompt
            return (
              <div key={role.roleId} data-role-id={role.roleId} data-proposal-state={role.state} style={rowStyle}>
                <span style={roleNameStyle}>{role.roleId}</span>
                <span style={metaStyle}>{role.roleKind} · {role.state}</span>
                {role.state === 'proposed' ? (
                  <>
                    <span style={proposedStyle}>
                      {role.candidates[0]?.label} (proposed)
                    </span>
                    <button
                      type="button"
                      data-testid="bind-candidate"
                      data-candidate-id={role.candidates[0]?.recordId}
                      onClick={() => role.candidates[0] && handleBind(role.candidates[0], role)}
                      disabled={bindingCandidate === role.candidates[0]?.recordId}
                    >
                      Bind
                    </button>
                  </>
                ) : role.state === 'ambiguous' ? (
                  <div style={candidatesStyle}>
                    <p style={promptStyle}>{prompt ?? `Choose a ${role.roleKind} for ${role.roleId}`}</p>
                    <ul style={listStyle}>
                      {role.candidates.map((candidate) => (
                        <li key={candidate.recordId}>
                          <span>{candidate.label}{candidate.lotNumber ? ` · lot ${candidate.lotNumber}` : ''}</span>
                          <button
                            type="button"
                            data-testid="bind-candidate"
                            data-candidate-id={candidate.recordId}
                            onClick={() => handleBind(candidate, role)}
                            disabled={bindingCandidate === candidate.recordId}
                          >
                            Bind
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : role.state === 'bound' ? (
                  <span style={metaStyle}>
                    {role.bound ? `${role.bound.label}${role.bound.lotNumber ? ` · lot ${role.bound.lotNumber}` : ''}` : 'bound'}
                  </span>
                ) : (
                  <span style={metaStyle}>{role.reason ?? 'no candidate'}</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
