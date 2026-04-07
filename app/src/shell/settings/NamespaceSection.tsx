/**
 * NamespaceSection — Edit base URI and prefix for the repository namespace.
 */

import { useState, useCallback } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { EditRow, InfoRow } from './EditRow'
import type { RepositoryConfig } from '../../types/config'

interface Props {
  repo: RepositoryConfig
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

export function NamespaceSection({ repo, editingSection, onEditChange, onSave, saving }: Props) {
  const [baseUri, setBaseUri] = useState(repo.namespace.baseUri)
  const [prefix, setPrefix] = useState(repo.namespace.prefix)

  const resetForm = useCallback(() => {
    setBaseUri(repo.namespace.baseUri)
    setPrefix(repo.namespace.prefix)
  }, [repo])

  const handleSave = useCallback(async () => {
    return onSave({
      repositories: [{ id: repo.id, namespace: { baseUri, prefix } }],
    })
  }, [onSave, repo.id, baseUri, prefix])

  // Sync form state when config refreshes from server
  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'namespace') {
      setBaseUri(repo.namespace.baseUri)
      setPrefix(repo.namespace.prefix)
    }
    onEditChange(id)
  }, [repo, onEditChange])

  return (
    <EditableSection
      id="namespace"
      title="Namespace"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={saving}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={
        <>
          <InfoRow label="Base URI" value={repo.namespace.baseUri} mono />
          <InfoRow label="Prefix" value={repo.namespace.prefix} mono />
        </>
      }
      editContent={
        <>
          <EditRow label="Base URI" value={baseUri} onChange={setBaseUri} mono placeholder="https://example.org/records/" />
          <EditRow label="Prefix" value={prefix} onChange={setPrefix} mono placeholder="example" />
        </>
      }
    />
  )
}
