/**
 * AddRepositorySection — Form to create a new repository when none exists.
 *
 * Sends a PATCH with a new repo object; the backend creates it with defaults
 * and writes config.yaml if it doesn't exist yet.
 */

import { useState, useCallback } from 'react'
import { EditRow, SelectRow, SecretRow } from './EditRow'
import type { GitAuthType } from '../../types/config'

const AUTH_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'token', label: 'Personal access token' },
  { value: 'ssh-key', label: 'SSH key' },
  { value: 'github-app', label: 'GitHub App' },
]

interface Props {
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

export function AddRepositorySection({ onSave, saving }: Props) {
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'restart'; message: string } | null>(null)

  // Form state
  const [id, setId] = useState('')
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [authType, setAuthType] = useState<GitAuthType>('none')
  const [token, setToken] = useState('')
  const [baseUri, setBaseUri] = useState('')
  const [prefix, setPrefix] = useState('')

  const resetForm = useCallback(() => {
    setId('')
    setUrl('')
    setBranch('main')
    setAuthType('none')
    setToken('')
    setBaseUri('')
    setPrefix('')
  }, [])

  const deriveDefaults = useCallback((gitUrl: string) => {
    // Auto-derive id, prefix, and baseUri from git URL
    try {
      const match = gitUrl.match(/[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/)
      if (match) {
        const [, owner, repo] = match
        if (!id) setId(repo)
        if (!prefix) setPrefix(repo)
        if (!baseUri) setBaseUri(`https://${owner}.github.io/${repo}/records/`)
      }
    } catch { /* ignore parse errors */ }
  }, [id, prefix, baseUri])

  const handleUrlChange = useCallback((val: string) => {
    setUrl(val)
    deriveDefaults(val)
  }, [deriveDefaults])

  const handleSave = useCallback(async () => {
    if (!id.trim()) {
      setFeedback({ type: 'error', message: 'Repository ID is required' })
      return
    }
    if (!url.trim()) {
      setFeedback({ type: 'error', message: 'Git URL is required' })
      return
    }

    try {
      const auth: Record<string, unknown> = { type: authType }
      if (authType === 'token' && token) {
        auth.token = token
      }

      const repo: Record<string, unknown> = {
        id: id.trim(),
        git: { url: url.trim(), branch, auth },
      }
      if (baseUri.trim()) {
        repo.namespace = { baseUri: baseUri.trim(), prefix: prefix.trim() || id.trim() }
      }

      const result = await onSave({ repositories: [repo] })

      if (result.restartRequired) {
        setFeedback({ type: 'restart', message: 'Repository added. Restart the server to connect.' })
      } else {
        setFeedback({ type: 'success', message: 'Repository added successfully.' })
      }
      setOpen(false)
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add repository' })
    }
  }, [id, url, branch, authType, token, baseUri, prefix, onSave])

  const FEEDBACK_COLORS = {
    success: { bg: '#d3f9d8', text: '#2b8a3e', border: '#b2f2bb' },
    error: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffc9c9' },
    restart: { bg: '#fff3bf', text: '#e67700', border: '#ffe066' },
  }

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2>Repository</h2>
        {!open && (
          <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }} onClick={() => { setOpen(true); setFeedback(null) }}>
            + Add Repository
          </button>
        )}
      </div>

      {feedback && (
        <div
          className="feedback-banner"
          style={{
            background: FEEDBACK_COLORS[feedback.type].bg,
            color: FEEDBACK_COLORS[feedback.type].text,
            borderBottom: `1px solid ${FEEDBACK_COLORS[feedback.type].border}`,
          }}
        >
          {feedback.message}
          <button className="feedback-banner__dismiss" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      <div className="settings-section__content">
        {!open ? (
          <div className="not-configured">
            <p>No repository configured. Add one to start tracking records in git.</p>
          </div>
        ) : (
          <>
            <EditRow label="Repository ID" value={id} onChange={setId} mono placeholder="my-lab-notebook" />
            <EditRow label="Git URL" value={url} onChange={handleUrlChange} mono placeholder="https://github.com/owner/repo.git" />
            <EditRow label="Branch" value={branch} onChange={setBranch} mono placeholder="main" />
            <SelectRow label="Auth Type" value={authType} onChange={(v) => setAuthType(v as GitAuthType)} options={AUTH_TYPE_OPTIONS} />
            {authType === 'token' && (
              <SecretRow label="Token" value={token} onChange={setToken} />
            )}
            <div style={{ borderTop: '1px solid #e9ecef', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
              <EditRow label="Base URI" value={baseUri} onChange={setBaseUri} mono placeholder="https://example.org/records/" />
              <EditRow label="Prefix" value={prefix} onChange={setPrefix} mono placeholder="my-lab" />
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="settings-section__footer">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Adding...' : 'Add Repository'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setOpen(false); resetForm(); setFeedback(null) }} disabled={saving}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
