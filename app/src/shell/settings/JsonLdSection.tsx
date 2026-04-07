/**
 * JsonLdSection — Edit JSON-LD context setting (default / custom URL).
 */

import { useState, useCallback } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { EditRow, SelectRow, InfoRow } from './EditRow'
import type { RepositoryConfig, JsonLdConfig } from '../../types/config'

const CONTEXT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'default', label: 'Default (bundled)' },
  { value: 'custom', label: 'Custom URL' },
]

interface Props {
  repo: RepositoryConfig
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

export function JsonLdSection({ repo, editingSection, onEditChange, onSave, saving }: Props) {
  const [context, setContext] = useState<JsonLdConfig['context']>(repo.jsonld.context)
  const [customUrl, setCustomUrl] = useState(repo.jsonld.customContextUrl ?? '')

  const resetForm = useCallback(() => {
    setContext(repo.jsonld.context)
    setCustomUrl(repo.jsonld.customContextUrl ?? '')
  }, [repo])

  const handleSave = useCallback(async () => {
    const jsonld: Record<string, unknown> = { context }
    if (context === 'custom') {
      jsonld.customContextUrl = customUrl
    }
    return onSave({ repositories: [{ id: repo.id, jsonld }] })
  }, [onSave, repo.id, context, customUrl])

  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'jsonld') resetForm()
    onEditChange(id)
  }, [resetForm, onEditChange])

  const displayContext =
    repo.jsonld.context === 'custom' && repo.jsonld.customContextUrl
      ? repo.jsonld.customContextUrl
      : repo.jsonld.context === 'custom'
        ? 'Custom (not set)'
        : 'Default (bundled)'

  return (
    <EditableSection
      id="jsonld"
      title="JSON-LD"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={saving}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={
        <InfoRow label="Context" value={displayContext} mono />
      }
      editContent={
        <>
          <SelectRow
            label="Context"
            value={context}
            onChange={(v) => setContext(v as JsonLdConfig['context'])}
            options={CONTEXT_OPTIONS}
          />
          {context === 'custom' && (
            <EditRow
              label="Custom URL"
              value={customUrl}
              onChange={setCustomUrl}
              mono
              placeholder="https://example.org/context.jsonld"
            />
          )}
        </>
      }
    />
  )
}
