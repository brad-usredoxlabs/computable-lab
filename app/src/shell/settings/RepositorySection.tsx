/**
 * RepositorySection — Edit git URL, branch, auth type, and token.
 * Also shows live status badge from useServerMeta.
 */

import { useState, useCallback } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { EditRow, SelectRow, SecretRow, SecretDisplay, InfoRow, resolveSecret } from './EditRow'
import type { RepositoryConfig, GitAuthType } from '../../types/config'
import { REDACTED } from '../../types/config'
import type { RepoStatusInfo } from '../../types/server'

const AUTH_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'token', label: 'Personal access token' },
  { value: 'ssh-key', label: 'SSH key' },
  { value: 'github-app', label: 'GitHub App' },
]

interface Props {
  repo: RepositoryConfig
  repoStatus: RepoStatusInfo
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  clean: { bg: '#d3f9d8', text: '#2b8a3e' },
  dirty: { bg: '#fff3bf', text: '#e67700' },
  syncing: { bg: '#d0ebff', text: '#1971c2' },
  error: { bg: '#ffe3e3', text: '#c92a2a' },
  unknown: { bg: '#e9ecef', text: '#495057' },
  disconnected: { bg: '#e9ecef', text: '#495057' },
}

export function RepositorySection({
  repo,
  repoStatus,
  editingSection,
  onEditChange,
  onSave,
  saving,
}: Props) {
  const [url, setUrl] = useState(repo.git.url)
  const [branch, setBranch] = useState(repo.git.branch)
  const [authType, setAuthType] = useState<GitAuthType>(repo.git.auth.type)
  const [token, setToken] = useState('')

  const resetForm = useCallback(() => {
    setUrl(repo.git.url)
    setBranch(repo.git.branch)
    setAuthType(repo.git.auth.type)
    setToken('')
  }, [repo])

  const handleSave = useCallback(async () => {
    const auth: Record<string, unknown> = { type: authType }
    if (authType === 'token') {
      auth.token = resolveSecret(token)
    }
    return onSave({
      repositories: [{ id: repo.id, git: { url, branch, auth } }],
    })
  }, [onSave, repo.id, url, branch, authType, token])

  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'repository') resetForm()
    onEditChange(id)
  }, [resetForm, onEditChange])

  const tokenConfigured = repo.git.auth.token === REDACTED

  const statusColors = STATUS_COLORS[repoStatus.status] ?? STATUS_COLORS.unknown

  return (
    <EditableSection
      id="repository"
      title="Repository"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={saving}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={
        <>
          <InfoRow label="URL" value={repo.git.url} mono />
          <InfoRow label="Branch" value={repo.git.branch} mono />
          <InfoRow label="Auth" value={AUTH_TYPE_OPTIONS.find((o) => o.value === repo.git.auth.type)?.label ?? repo.git.auth.type} />
          {repo.git.auth.type === 'token' && (
            <SecretDisplay label="Token" configured={tokenConfigured} />
          )}
          <InfoRow
            label="Status"
            value={
              <span
                className="status-badge"
                style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
              >
                {repoStatus.status}
              </span>
            }
          />
          {repoStatus.ahead > 0 && <InfoRow label="Commits Ahead" value={repoStatus.ahead} />}
          {repoStatus.behind > 0 && <InfoRow label="Commits Behind" value={repoStatus.behind} />}
        </>
      }
      editContent={
        <>
          <EditRow label="Git URL" value={url} onChange={setUrl} mono placeholder="https://github.com/owner/repo.git" />
          <EditRow label="Branch" value={branch} onChange={setBranch} mono placeholder="main" />
          <SelectRow label="Auth Type" value={authType} onChange={(v) => setAuthType(v as GitAuthType)} options={AUTH_TYPE_OPTIONS} />
          {authType === 'token' && (
            <SecretRow label="Token" value={token} onChange={setToken} />
          )}
        </>
      }
    />
  )
}
