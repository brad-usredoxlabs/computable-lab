/**
 * SyncSection — Edit sync mode, pull interval, auto-commit, auto-push.
 */

import { useState, useCallback } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { EditRow, SelectRow, CheckboxRow, InfoRow } from './EditRow'
import type { RepositoryConfig, SyncMode } from '../../types/config'

const SYNC_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pull-on-read', label: 'Pull on read' },
  { value: 'periodic', label: 'Periodic' },
  { value: 'manual', label: 'Manual' },
]

interface Props {
  repo: RepositoryConfig
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

export function SyncSection({ repo, editingSection, onEditChange, onSave, saving }: Props) {
  const [mode, setMode] = useState<SyncMode>(repo.sync.mode)
  const [pullInterval, setPullInterval] = useState(String(repo.sync.pullIntervalSeconds ?? 60))
  const [autoCommit, setAutoCommit] = useState(repo.sync.autoCommit)
  const [autoPush, setAutoPush] = useState(repo.sync.autoPush)

  const resetForm = useCallback(() => {
    setMode(repo.sync.mode)
    setPullInterval(String(repo.sync.pullIntervalSeconds ?? 60))
    setAutoCommit(repo.sync.autoCommit)
    setAutoPush(repo.sync.autoPush)
  }, [repo])

  const handleSave = useCallback(async () => {
    const sync: Record<string, unknown> = {
      mode,
      autoCommit,
      autoPush,
    }
    if (mode === 'periodic') {
      sync.pullIntervalSeconds = parseInt(pullInterval, 10) || 60
    }
    return onSave({ repositories: [{ id: repo.id, sync }] })
  }, [onSave, repo.id, mode, pullInterval, autoCommit, autoPush])

  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'sync') resetForm()
    onEditChange(id)
  }, [resetForm, onEditChange])

  const formatMode = (m: SyncMode) =>
    SYNC_MODE_OPTIONS.find((o) => o.value === m)?.label ?? m

  return (
    <EditableSection
      id="sync"
      title="Sync"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={saving}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={
        <>
          <InfoRow label="Mode" value={formatMode(repo.sync.mode)} />
          {repo.sync.mode === 'periodic' && (
            <InfoRow label="Pull Interval" value={`${repo.sync.pullIntervalSeconds ?? 60}s`} />
          )}
          <InfoRow label="Auto-commit" value={repo.sync.autoCommit ? 'Yes' : 'No'} />
          <InfoRow label="Auto-push" value={repo.sync.autoPush ? 'Yes' : 'No'} />
        </>
      }
      editContent={
        <>
          <SelectRow label="Mode" value={mode} onChange={(v) => setMode(v as SyncMode)} options={SYNC_MODE_OPTIONS} />
          {mode === 'periodic' && (
            <EditRow
              label="Pull Interval (s)"
              value={pullInterval}
              onChange={setPullInterval}
              type="number"
              placeholder="60"
            />
          )}
          <CheckboxRow label="Auto-commit" checked={autoCommit} onChange={setAutoCommit} />
          <CheckboxRow label="Auto-push" checked={autoPush} onChange={setAutoPush} />
        </>
      }
    />
  )
}
