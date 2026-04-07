import { useMemo, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import { type OperationTemplateRecord, formatOperationTemplateLabel } from '../../../types/operationTemplate'

interface OperationTemplateLibraryModalProps {
  isOpen: boolean
  templates: OperationTemplateRecord[]
  onClose: () => void
  onUseTemplate: (template: OperationTemplateRecord) => void
  onVersionTemplate: (template: OperationTemplateRecord) => void
  onUpdated: (template: OperationTemplateRecord) => void
}

export function OperationTemplateLibraryModal({
  isOpen,
  templates,
  onClose,
  onUseTemplate,
  onVersionTemplate,
  onUpdated,
}: OperationTemplateLibraryModalProps) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((template) => {
      if (!q) return true
      return (
        template.name.toLowerCase().includes(q)
        || template.id.toLowerCase().includes(q)
        || (template.description || '').toLowerCase().includes(q)
        || (template.tags || []).some((tag) => tag.toLowerCase().includes(q))
      )
    })
  }, [query, templates])

  if (!isOpen) return null

  const handleToggleStatus = async (template: OperationTemplateRecord) => {
    setBusyId(template.id)
    try {
      const payload: Record<string, unknown> = {
        ...template,
        status: template.status === 'deprecated' ? 'active' : 'deprecated',
      }
      await apiClient.updateRecord(template.id, payload)
      onUpdated({
        ...template,
        status: template.status === 'deprecated' ? 'active' : 'deprecated',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="operation-template-library__backdrop" role="presentation" onClick={onClose}>
      <div className="operation-template-library" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="operation-template-library__header">
          <h3>Saved Programs</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
        <input
          className="operation-template-library__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter saved programs"
        />
        <div className="operation-template-library__list">
          {filtered.map((template) => (
            <div key={template.id} className={`operation-template-card ${template.status === 'deprecated' ? 'operation-template-card--deprecated' : ''}`}>
              <div className="operation-template-card__title">
                <strong>{formatOperationTemplateLabel(template)}</strong>
                <span>{template.base_event_type}</span>
              </div>
              {template.description && <div className="operation-template-card__description">{template.description}</div>}
              <div className="operation-template-card__meta">
                <span>{template.visibility || 'personal'}</span>
                <span>{template.status || 'active'}</span>
                {template.semantic_defaults?.volume && (
                  <span>{template.semantic_defaults.volume.value} {template.semantic_defaults.volume.unit}</span>
                )}
              </div>
              {(template.tags || []).length > 0 && (
                <div className="operation-template-card__tags">{template.tags?.join(', ')}</div>
              )}
              <div className="operation-template-card__actions">
                <button type="button" className="btn btn-secondary" onClick={() => onUseTemplate(template)}>
                  Use
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => onVersionTemplate(template)}>
                  New Version
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => void handleToggleStatus(template)} disabled={busyId === template.id}>
                  {template.status === 'deprecated' ? 'Reactivate' : 'Deprecate'}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="operation-template-library__empty">No saved programs match.</div>}
        </div>
        <style>{`
          .operation-template-library__backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.38);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .operation-template-library {
            width: min(760px, calc(100vw - 2rem));
            max-height: calc(100vh - 4rem);
            overflow: hidden;
            background: #fff;
            border-radius: 12px;
            padding: 1rem;
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }
          .operation-template-library__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .operation-template-library__header h3 {
            margin: 0;
          }
          .operation-template-library__search {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 0.55rem 0.7rem;
            font: inherit;
          }
          .operation-template-library__list {
            overflow: auto;
            display: grid;
            gap: 0.75rem;
          }
          .operation-template-card {
            border: 1px solid #dbe4ee;
            border-radius: 10px;
            padding: 0.8rem;
            display: grid;
            gap: 0.5rem;
          }
          .operation-template-card--deprecated {
            opacity: 0.7;
            border-style: dashed;
          }
          .operation-template-card__title,
          .operation-template-card__meta,
          .operation-template-card__actions {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            flex-wrap: wrap;
          }
          .operation-template-card__title span,
          .operation-template-card__meta span,
          .operation-template-card__tags {
            font-size: 0.8rem;
            color: #64748b;
          }
          .operation-template-library__empty {
            font-size: 0.9rem;
            color: #64748b;
            padding: 0.5rem 0;
          }
        `}</style>
      </div>
    </div>
  )
}
