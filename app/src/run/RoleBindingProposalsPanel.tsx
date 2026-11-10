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
import { ApiError } from '../shared/api/errors'

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

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    const load = async () => {
      try {
        const response = await apiClient.getRoleBindingProposals(runId)
        if (cancelled) return
        setData(response)
      } catch (err) {
        if (cancelled) return
        // A run with no attached protocol has no proposals to show: 404 is
        // indistinguishable from an empty projection, never a broken panel.
        if (ApiError.isApiError(err) && err.status === 404) {
          setData(null)
          return
        }
        setError(err instanceof Error ? err.message : 'unknown error')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [runId])

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
      <h3 style={headingStyle}>Role bindings — proposals (read-only)</h3>
      {data.protocols.map((protocol) => (
        <div key={protocol.protocolId} style={protocolStyle}>
          <p style={protocolTitleStyle}>{protocol.protocolId}</p>
          {protocol.roles.map((role) => {
            const prompt = data.clarificationRequests?.find((card) => card.roleId === role.roleId)?.prompt
            return (
              <div key={role.roleId} data-role-id={role.roleId} data-proposal-state={role.state} style={rowStyle}>
                <span style={roleNameStyle}>{role.roleId}</span>
                <span style={metaStyle}>{role.roleKind} · {role.state}</span>
                {role.state === 'proposed' ? (
                  <span style={proposedStyle}>
                    {role.candidates[0]?.label} (proposed, read-only)
                  </span>
                ) : role.state === 'ambiguous' ? (
                  <div style={candidatesStyle}>
                    <p style={promptStyle}>{prompt ?? `Choose a ${role.roleKind} for ${role.roleId}`}</p>
                    <ul style={listStyle}>
                      {role.candidates.map((candidate) => (
                        <li key={candidate.recordId}>
                          {candidate.label}{candidate.lotNumber ? ` · lot ${candidate.lotNumber}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
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
