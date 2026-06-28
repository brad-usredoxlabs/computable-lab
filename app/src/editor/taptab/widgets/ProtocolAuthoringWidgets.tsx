import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import Placeholder from '@tiptap/extension-placeholder'
import type { JSONContent } from '@tiptap/core'
import { apiClient, type ProtocolStructureSuggestion } from '../../../shared/api/client'
import {
  buildSlashMenuExtension,
  editorToText,
  MentionNode,
} from '../../../shared/taptab/slashMenu'
import type { SlashMention } from '../../../shared/taptab/slashMenu'
import { buildOntologyCopilotExtension } from '../../../shared/taptab/ontologyCopilot/OntologyCopilotExtension'

interface ProtocolWidgetProps {
  value: unknown
  readOnly: boolean
  recordId?: string
  onCommit: (newValue: unknown) => void
  onRecordPatch?: (patch: Record<string, unknown>) => void
  getRecordValue?: (path: string) => unknown
}

export function ProtocolProseAuthoringWidget({ value, readOnly, onCommit, onRecordPatch, getRecordValue }: ProtocolWidgetProps) {
  const handleCommit = useCallback((text: string, mentions: SlashMention[]) => {
    onCommit(text)
    const patch = buildMentionRolePatch(mentions, getRecordValue)
    if (Object.keys(patch).length > 0) onRecordPatch?.(patch)
  }, [getRecordValue, onCommit, onRecordPatch])

  if (readOnly) return <span className="taptab-widget-value">{String(value ?? '')}</span>
  return (
    <ProtocolMentionEditor
      value={String(value ?? '')}
      placeholder="Write protocol prose. Use /m for materials, /l or /t for labware, @ for ontology."
      className="taptab-protocol-prose"
      serialize="wire"
      onCommit={handleCommit}
    />
  )
}

export function ProtocolMaterialRolesWidget(props: ProtocolWidgetProps) {
  return <ProtocolRoleListWidget {...props} label="Material" allowedKey="allowedMaterialIds" />
}

export function ProtocolLabwareRolesWidget(props: ProtocolWidgetProps) {
  return <ProtocolRoleListWidget {...props} label="Consumables / Labware" allowedKey="expectedLabwareKinds" />
}

export function ProtocolEquipmentRolesWidget(props: ProtocolWidgetProps) {
  return <ProtocolRoleListWidget {...props} label="Equipment" allowedKey="allowedInstrumentIds" />
}

function ProtocolRoleListWidget({ value, readOnly, onCommit, label, allowedKey }: ProtocolWidgetProps & { label: string; allowedKey: string }) {
  const roles = Array.isArray(value) ? value as Array<Record<string, unknown>> : []
  const [newRole, setNewRole] = useState('')
  const commitRoles = (next: Array<Record<string, unknown>>) => onCommit(next)
  const addRole = () => {
    const roleId = normalizeRoleId(newRole)
    if (!roleId || roles.some((role) => role.roleId === roleId)) return
    commitRoles([...roles, { roleId, description: newRole.trim() }])
    setNewRole('')
  }
  return (
    <div className="taptab-protocol-list">
      {roles.length === 0 && <span className="taptab-widget-empty">No {label.toLowerCase()} roles</span>}
      {roles.map((role, index) => (
        <div className="taptab-protocol-row" key={`${role.roleId ?? index}`}>
          <label>
            <span>Role</span>
            <input
              value={String(role.roleId ?? '')}
              disabled={readOnly}
              onChange={(event) => {
                const next = roles.map((item, i) => i === index ? { ...item, roleId: normalizeRoleId(event.target.value) } : item)
                commitRoles(next)
              }}
            />
          </label>
          <label>
            <span>Description</span>
            <input
              value={String(role.description ?? '')}
              disabled={readOnly}
              onChange={(event) => {
                const next = roles.map((item, i) => i === index ? { ...item, description: event.target.value } : item)
                commitRoles(next)
              }}
            />
          </label>
          {Array.isArray(role[allowedKey]) && role[allowedKey].length > 0 && (
            <span className="taptab-protocol-grounding">
              {(role[allowedKey] as unknown[]).map((id) => (
                <code key={String(id)}>{String(id)}</code>
              ))}
            </span>
          )}
          {!readOnly && (
            <button type="button" onClick={() => commitRoles(roles.filter((_, i) => i !== index))} aria-label={`Remove ${String(role.roleId ?? label)}`}>x</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="taptab-protocol-add">
          <input
            value={newRole}
            placeholder={`Add ${label.toLowerCase()} role`}
            onChange={(event) => setNewRole(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addRole()
              }
            }}
          />
          <button type="button" onClick={addRole}>Add</button>
        </div>
      )}
    </div>
  )
}

export function ProtocolStepRolesWidget({ value, readOnly, onCommit, onRecordPatch, getRecordValue }: ProtocolWidgetProps) {
  const steps = Array.isArray(value) ? value as Array<Record<string, unknown>> : []
  const [newStep, setNewStep] = useState('')
  const newStepMentions = useRef<SlashMention[]>([])
  const syncMentions = useCallback((mentions: SlashMention[]) => {
    const patch = buildMentionRolePatch(mentions, getRecordValue)
    if (Object.keys(patch).length > 0) onRecordPatch?.(patch)
  }, [getRecordValue, onRecordPatch])
  const addStep = () => {
    const description = newStep.trim()
    if (!description) return
    onCommit([...steps, { stepId: `step_${steps.length + 1}`, kind: 'other', description, label: description.slice(0, 64) }])
    syncMentions(newStepMentions.current)
    newStepMentions.current = []
    setNewStep('')
  }
  const updateStepDescription = (index: number, description: string, mentions: SlashMention[]) => {
    const next = steps.map((step, i) => i === index ? { ...step, description, label: description.slice(0, 64) } : step)
    onCommit(next)
    syncMentions(mentions)
  }
  return (
    <div className="taptab-protocol-list taptab-protocol-steps">
      {steps.length === 0 && <span className="taptab-widget-empty">No steps</span>}
      {steps.map((step, index) => (
        <div className="taptab-protocol-step" key={`${step.stepId ?? index}`}>
          <span className="taptab-protocol-step-index">{index + 1}</span>
          {readOnly ? (
            <span>{String(step.description ?? step.label ?? step.kind ?? 'Step')}</span>
          ) : (
            <ProtocolMentionEditor
              value={String(step.description ?? step.label ?? '')}
              placeholder="Describe this step"
              className="taptab-protocol-step-editor"
              serialize="readable"
              onCommit={(description, mentions) => updateStepDescription(index, description, mentions)}
            />
          )}
          {!readOnly && <button type="button" onClick={() => onCommit(steps.filter((_, i) => i !== index))} aria-label={`Remove step ${index + 1}`}>x</button>}
        </div>
      ))}
      {!readOnly && (
        <div className="taptab-protocol-add taptab-protocol-add-step">
          <ProtocolMentionEditor
            value={newStep}
            className="taptab-protocol-step-editor"
            placeholder="Add plain-text step"
            serialize="readable"
            onDraftChange={(text, mentions) => {
              setNewStep(text)
              newStepMentions.current = mentions
            }}
            onCommit={(text, mentions) => {
              setNewStep(text)
              newStepMentions.current = mentions
            }}
          />
          <button type="button" onClick={addStep}>Add</button>
        </div>
      )}
    </div>
  )
}

export function ProtocolAiSuggestionsWidget({ value, readOnly, recordId, onCommit }: ProtocolWidgetProps) {
  const authoring = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const [suggestions, setSuggestions] = useState<ProtocolStructureSuggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const grouped = useMemo(() => groupSuggestions(suggestions), [suggestions])

  async function ensureSession() {
    if (!recordId) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await apiClient.createProtocolAuthoringSession(recordId)
      onCommit({ ...authoring, sessionRef: { kind: 'record', id: result.sessionId, type: 'protocol-ide-session' } })
      setMessage(`Linked ${result.sessionId}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create authoring session')
    } finally {
      setBusy(false)
    }
  }

  async function suggest() {
    if (!recordId) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await apiClient.suggestProtocolStructure(recordId)
      setSuggestions(result.suggestions)
      setSelected(new Set())
      setMessage(result.suggestions.length ? `${result.suggestions.length} suggestion(s)` : 'No suggestions')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to suggest structure')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!recordId || selected.size === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await apiClient.applyProtocolSuggestions(recordId, {
        suggestions,
        acceptedSuggestionIds: Array.from(selected),
      })
      setSelected(new Set())
      setMessage(`Applied ${result.applied.materialRoles} material, ${result.applied.equipmentRoles} equipment, ${result.applied.steps} step suggestion(s)`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to apply suggestions')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="taptab-protocol-ai">
      <div className="taptab-protocol-ai-actions">
        <button type="button" disabled={readOnly || busy || !recordId} onClick={ensureSession}>Session</button>
        <button type="button" disabled={readOnly || busy || !recordId} onClick={suggest}>Suggest</button>
        <button type="button" disabled={readOnly || busy || selected.size === 0} onClick={apply}>Apply</button>
      </div>
      {message && <span className="taptab-protocol-muted">{message}</span>}
      {Object.entries(grouped).map(([kind, items]) => (
        <div className="taptab-protocol-suggestion-group" key={kind}>
          <span className="taptab-protocol-group-title">{kind === 'equipment' ? 'Equipment' : title(kind)}</span>
          {items.map((suggestion) => (
            <label className="taptab-protocol-suggestion" key={suggestion.id}>
              <input
                type="checkbox"
                disabled={readOnly || busy}
                checked={selected.has(suggestion.id)}
                onChange={(event) => {
                  const next = new Set(selected)
                  if (event.target.checked) next.add(suggestion.id)
                  else next.delete(suggestion.id)
                  setSelected(next)
                }}
              />
              <span>{suggestion.label}</span>
              {suggestion.confidence !== undefined && <span className="taptab-protocol-muted">{Math.round(suggestion.confidence * 100)}%</span>}
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

function groupSuggestions(suggestions: ProtocolStructureSuggestion[]): Record<string, ProtocolStructureSuggestion[]> {
  return suggestions.reduce<Record<string, ProtocolStructureSuggestion[]>>((acc, suggestion) => {
    const key = suggestion.kind
    acc[key] = [...(acc[key] ?? []), suggestion]
    return acc
  }, {})
}

function normalizeRoleId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function title(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function ProtocolMentionEditor({
  value,
  placeholder,
  className,
  serialize,
  onCommit,
  onDraftChange,
}: {
  value: string
  placeholder: string
  className: string
  serialize: 'wire' | 'readable'
  onCommit: (text: string, mentions: SlashMention[]) => void
  onDraftChange?: (text: string, mentions: SlashMention[]) => void
}) {
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const draftRef = useRef(onDraftChange)
  draftRef.current = onDraftChange
  const editorRef = useRef<Editor | null>(null)
  const latestValueRef = useRef(value)

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({ placeholder }),
      MentionNode,
      buildSlashMenuExtension(),
      buildOntologyCopilotExtension({ kinds: ['material', 'labware'] }),
    ],
    content: textToDoc(value),
    editorProps: {
      attributes: { class: 'taptab-protocol-mention-editor__content' },
      handleDOMEvents: {
        blur: (view, event) => {
          const target = event.relatedTarget as Node | null
          const root = view.dom.parentElement
          if (target && root?.contains(target)) return false
          commitEditor(serialize, commitRef.current, editorRef.current)
          return false
        },
      },
    },
    onUpdate({ editor }) {
      const mentions = collectMentions(editor.getJSON())
      const text = serialize === 'wire' ? editorToText(editor) : editorContentToReadableText(editor.getJSON())
      latestValueRef.current = text
      draftRef.current?.(text, mentions)
    },
  })
  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    if (value === latestValueRef.current) return
    latestValueRef.current = value
    editor.commands.setContent(textToDoc(value), { emitUpdate: false })
  }, [editor, value])

  return (
    <div className={`taptab-protocol-mention-editor ${className}`}>
      <EditorContent editor={editor} />
    </div>
  )
}

function commitEditor(mode: 'wire' | 'readable', commit: (text: string, mentions: SlashMention[]) => void, editor: Editor | null) {
  if (!editor) return
  const mentions = collectMentions(editor.getJSON())
  const text = mode === 'wire' ? editorToText(editor) : editorContentToReadableText(editor.getJSON())
  commit(text, mentions)
}

function textToDoc(value: string): JSONContent {
  const paragraphs = (value || '').split(/\n{2,}/)
  return {
    type: 'doc',
    content: paragraphs.length
      ? paragraphs.map((paragraph) => ({
        type: 'paragraph',
        content: paragraphToContent(paragraph),
      }))
      : [{ type: 'paragraph' }],
  }
}

function paragraphToContent(value: string): JSONContent[] {
  const lines = value.split('\n')
  const content: JSONContent[] = []
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: 'hardBreak' })
    if (line) content.push({ type: 'text', text: line })
  })
  return content
}

export function collectMentions(content: JSONContent): SlashMention[] {
  const mentions: SlashMention[] = []
  visitContent(content, (node) => {
    if (node.type !== 'slashMention') return
    const mention = node.attrs?.mention as SlashMention | undefined
    if (mention) mentions.push(mention)
  })
  return mentions
}

function visitContent(node: JSONContent, visitor: (node: JSONContent) => void) {
  visitor(node)
  node.content?.forEach((child) => visitContent(child, visitor))
}

export function editorContentToReadableText(content: JSONContent): string {
  return renderReadableNode(content).trim()
}

function renderReadableNode(node: JSONContent): string {
  switch (node.type) {
    case 'doc':
      return joinReadable(node.content, '\n\n')
    case 'paragraph':
      return joinReadable(node.content, '')
    case 'text':
      return node.text ?? ''
    case 'hardBreak':
      return '\n'
    case 'slashMention': {
      const mention = node.attrs?.mention as SlashMention | undefined
      return mention?.label ?? ''
    }
    default:
      return joinReadable(node.content, '')
  }
}

function joinReadable(children: JSONContent[] | undefined, separator: string): string {
  return (children ?? []).map(renderReadableNode).filter(Boolean).join(separator)
}

export function buildMentionRolePatch(
  mentions: SlashMention[],
  getRecordValue?: (path: string) => unknown,
): Record<string, unknown> {
  const materialRoles = mergeMaterialMentions(
    asRoleArray(getRecordValue?.('$.roles.materialRoles')),
    mentions.filter((mention): mention is Extract<SlashMention, { type: 'material' }> => mention.type === 'material'),
  )
  const labwareRoles = mergeLabwareMentions(
    asRoleArray(getRecordValue?.('$.roles.labwareRoles')),
    mentions.filter((mention): mention is Extract<SlashMention, { type: 'labware' | 'tube' }> => mention.type === 'labware' || mention.type === 'tube'),
  )
  const patch: Record<string, unknown> = {}
  if (materialRoles.changed) patch['$.roles.materialRoles'] = materialRoles.roles
  if (labwareRoles.changed) patch['$.roles.labwareRoles'] = labwareRoles.roles
  return patch
}

function asRoleArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []
}

function mergeMaterialMentions(
  current: Array<Record<string, unknown>>,
  mentions: Array<Extract<SlashMention, { type: 'material' }>>,
): { roles: Array<Record<string, unknown>>; changed: boolean } {
  let changed = false
  const roles = current.map((role) => ({ ...role }))
  for (const mention of mentions) {
    if (!mention.id) continue
    const roleId = normalizeRoleId(mention.label || mention.id)
    const index = findRoleIndex(roles, roleId, 'allowedMaterialIds', mention.id)
    if (index === -1) {
      roles.push({ roleId, description: mention.label, allowedMaterialIds: [mention.id] })
      changed = true
      continue
    }
    const existing = asStringArray(roles[index].allowedMaterialIds)
    const ids = uniqueStrings([...existing, mention.id])
    if (ids.length !== existing.length) {
      roles[index] = { ...roles[index], allowedMaterialIds: ids }
      changed = true
    }
  }
  return { roles, changed }
}

function mergeLabwareMentions(
  current: Array<Record<string, unknown>>,
  mentions: Array<Extract<SlashMention, { type: 'labware' | 'tube' }>>,
): { roles: Array<Record<string, unknown>>; changed: boolean } {
  let changed = false
  const roles = current.map((role) => ({ ...role }))
  for (const mention of mentions) {
    const id = mention.type === 'labware' ? mention.id : mention.sizeLabel
    if (!id) continue
    const roleId = normalizeRoleId(mention.label || id)
    const index = findRoleIndex(roles, roleId, 'expectedLabwareKinds', id)
    if (index === -1) {
      roles.push({ roleId, description: mention.label, expectedLabwareKinds: [id] })
      changed = true
      continue
    }
    const existing = asStringArray(roles[index].expectedLabwareKinds)
    const ids = uniqueStrings([...existing, id])
    if (ids.length !== existing.length) {
      roles[index] = { ...roles[index], expectedLabwareKinds: ids }
      changed = true
    }
  }
  return { roles, changed }
}

function findRoleIndex(roles: Array<Record<string, unknown>>, roleId: string, allowedKey: string, id: string): number {
  return roles.findIndex((role) => role.roleId === roleId || asStringArray(role[allowedKey]).includes(id))
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}
