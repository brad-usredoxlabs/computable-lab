import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import { buildOperationTemplatePayload } from '../../lib/operationTemplates'
import { OPERATION_TEMPLATE_SCHEMA_ID, type OperationTemplateRecord } from '../../../types/operationTemplate'
import type { TransferVignetteMacroProgram } from '../../../types/macroProgram'

interface OperationTemplateModalProps {
  isOpen: boolean
  program: TransferVignetteMacroProgram | null
  template?: OperationTemplateRecord | null
  onClose: () => void
  onSaved: (template: OperationTemplateRecord) => void
}

function slugify(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
}

export function OperationTemplateModal({
  isOpen,
  program,
  template = null,
  onClose,
  onSaved,
}: OperationTemplateModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'personal' | 'team'>('personal')
  const [version, setVersion] = useState(1)
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !program) return
    const modeLabel = program.params.transferMode === 'multi_dispense' ? 'Multi-Dispense' : 'Transfer'
    setName(template?.name || `${modeLabel} Program`)
    setDescription(template?.description || '')
    setVisibility(template?.visibility || 'personal')
    setVersion(template?.version ? template.version + 1 : 1)
    setTags((template?.tags || []).join(', '))
    setError(null)
  }, [isOpen, program, template])

  const suggestedId = useMemo(() => {
    const base = slugify(name || 'transfer-program')
    return `OPT-${base || 'TRANSFER-PROGRAM'}-V${version}`
  }, [name, version])

  if (!isOpen || !program) return null

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = buildOperationTemplatePayload({
        id: suggestedId,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        visibility,
        version,
        program,
        status: 'active',
        tags: tags.split(',').map((entry) => entry.trim()).filter(Boolean),
      })
      await apiClient.createRecord(OPERATION_TEMPLATE_SCHEMA_ID, payload)
      onSaved({
        kind: 'operation-template',
        id: suggestedId,
        name: name.trim(),
        version,
        category: 'transfer',
        scope: 'program',
        ...(description.trim() ? { description: description.trim() } : {}),
        visibility,
        status: 'active',
        base_event_type: program.params.transferMode === 'multi_dispense' ? 'multi_dispense' : 'transfer',
        semantic_defaults: {
          transfer_mode: program.params.transferMode || 'transfer',
          ...(program.params.volume ? { volume: program.params.volume } : {}),
          ...(program.params.deadVolume ? { dead_volume: program.params.deadVolume } : {}),
          ...(program.params.discardToWaste ? { discard_to_waste: true } : {}),
        },
        ...(program.execution_hints ? { execution_defaults: program.execution_hints } : {}),
        ...(tags.split(',').map((entry) => entry.trim()).filter(Boolean).length > 0
          ? { tags: tags.split(',').map((entry) => entry.trim()).filter(Boolean) }
          : {}),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save program')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="operation-template-modal__backdrop" role="presentation" onClick={onClose}>
      <div className="operation-template-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{template ? 'Save New Program Version' : 'Save Transfer Program'}</h3>
        <div className="operation-template-modal__field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Transfer media with mix" />
        </div>
        <div className="operation-template-modal__row">
          <div className="operation-template-modal__field">
            <label>Version</label>
            <input
              type="number"
              min="1"
              step="1"
              value={version}
              onChange={(e) => setVersion(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
            />
          </div>
          <div className="operation-template-modal__field">
            <label>Visibility</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'personal' | 'team')}>
              <option value="personal">Personal</option>
              <option value="team">Team</option>
            </select>
          </div>
        </div>
        <div className="operation-template-modal__field">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional notes about when to use this program." />
        </div>
        <div className="operation-template-modal__field">
          <label>Tags</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="media change, wash, cells" />
        </div>
        <div className="operation-template-modal__hint">ID: {suggestedId}</div>
        {error && <div className="operation-template-modal__error">{error}</div>}
        <div className="operation-template-modal__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save Program'}
          </button>
        </div>
      </div>
      <style>{`
        .operation-template-modal__backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.38);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .operation-template-modal {
          width: min(480px, calc(100vw - 2rem));
          background: #fff;
          border-radius: 12px;
          padding: 1rem;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .operation-template-modal h3 {
          margin: 0;
          font-size: 1rem;
        }
        .operation-template-modal__row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        .operation-template-modal__field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .operation-template-modal__field label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #475569;
        }
        .operation-template-modal__field input,
        .operation-template-modal__field select,
        .operation-template-modal__field textarea {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0.5rem 0.65rem;
          font: inherit;
        }
        .operation-template-modal__hint {
          font-size: 0.76rem;
          color: #64748b;
        }
        .operation-template-modal__error {
          color: #b91c1c;
          font-size: 0.8rem;
        }
        .operation-template-modal__actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
      `}</style>
    </div>
  )
}
