import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { JSONContent } from '@tiptap/core'
import { apiClient } from '../../../shared/api/client'
import type { RecordEnvelope } from '../../../types/kernel'
import type { ProtocolStepSummary } from '../../protocol/ProtocolSelectionContext'
import { RichTextToolbar } from '../../../editor/taptab/RichTextToolbar'
import { editableProtocolSteps, insertProtocolStep, stepSummaries } from './protocolStepEditing'
import './ProtocolStepEditModal.css'

interface Props {
  protocolId: string
  step: ProtocolStepSummary
  mode?: 'edit' | 'before' | 'after'
  onClose: () => void
  onSaved: (step: ProtocolStepSummary, steps: ProtocolStepSummary[]) => void
}

function plainTextDocument(text: string): JSONContent {
  return { type: 'doc', content: text.split(/\n\s*\n/).map(paragraph => ({
    type: 'paragraph',
    content: paragraph.split('\n').flatMap((line, index) => [
      ...(index ? [{ type: 'hardBreak' }] : []),
      ...(line ? [{ type: 'text', text: line }] : []),
    ]),
  })) }
}

export function ProtocolStepEditModal({ protocolId, step, mode = 'edit', onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [record, setRecord] = useState<RecordEnvelope | null>(null)
  const [label, setLabel] = useState(mode === 'edit' ? step.label : '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: '',
    editorProps: { attributes: { 'aria-label': 'Step instructions', role: 'textbox', 'aria-multiline': 'true' } },
  })

  useEffect(() => { editor?.setEditable(!saving) }, [editor, saving])

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  useEffect(() => {
    if (!editor) return
    let cancelled = false
    void apiClient.getRecord(protocolId).then(record => {
      if (cancelled) return
      const payload = record.payload as Record<string, unknown>
      const stored = editableProtocolSteps(payload).find(s => s.stepId === step.stepId)
      if (!stored) throw new Error('This step no longer exists. Reload the protocol.')
      if (mode !== 'edit') {
        editor.commands.setContent(plainTextDocument(''))
        setLabel('')
        setRecord(record)
        return
      }
      const text = String(stored.description ?? stored.label ?? '')
      const rich = stored.descriptionRichText as { plainText?: string; document?: JSONContent } | undefined
      // Another authoring surface may have edited the plain text since the
      // formatted document was saved. Never resurrect an outdated rich copy.
      editor.commands.setContent(rich?.plainText === text && rich.document ? rich.document : plainTextDocument(text))
      setLabel(String(stored.label ?? step.label))
      setRecord(record)
    }).catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [editor, protocolId, step.stepId, step.label, mode])

  async function save() {
    if (!record || !editor || !label.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const expectedSha = record.meta?.contentSha ?? record.meta?.commitSha
      if (!expectedSha) throw new Error('The protocol has no save token. Reload it before editing.')
      const description = editor.getText({ blockSeparator: '\n\n' })
      const payload = record.payload as Record<string, unknown>
      // getRandomValues also works on the lab's plain-HTTP LAN origin.
      const stepId = mode === 'edit' ? step.stepId : `step-${Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')}`
      const changes = { label: label.trim(), description,
        descriptionRichText: { plainText: description, document: editor.getJSON() },
      }
      const updatedPayload = mode === 'edit'
        ? { ...payload, steps: editableProtocolSteps(payload).map(s => s.stepId === stepId ? { ...s, ...changes } : s) }
        : insertProtocolStep(payload, step.stepId, mode, { stepId, kind: 'other', ...changes })
      const result = await apiClient.updateRecord(protocolId, updatedPayload, { expectedSha })
      if (!result.record) throw new Error('The step could not be saved.')
      const summaries = stepSummaries(updatedPayload)
      onSaved(summaries.find(s => s.stepId === stepId)!, summaries)
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally { setSaving(false) }
  }

  return (
    <dialog ref={dialogRef} className="protocol-step-edit" aria-labelledby="protocol-step-edit-title"
      onCancel={event => { event.preventDefault(); if (!saving) onClose() }}>
      <form onSubmit={event => { event.preventDefault(); void save() }}>
        <header>
          <h2 id="protocol-step-edit-title">{mode === 'edit' ? `Edit step ${step.ordinal}` : `Add step ${mode} step ${step.ordinal}`}</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close step editor">×</button>
        </header>
        {loading ? <p>Loading step…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {record ? <>
          <label className="protocol-step-edit__label">Step name
            <input value={label} onChange={event => setLabel(event.target.value)} required disabled={saving} />
          </label>
          <div className="protocol-step-edit__instructions">
            <span>Instructions</span>
            <RichTextToolbar editor={editor} />
            <EditorContent editor={editor} />
          </div>
        </> : null}
        <footer>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" disabled={loading || !record || !label.trim() || saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save step' : 'Add step'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
