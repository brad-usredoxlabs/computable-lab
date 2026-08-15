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
import { RefBadge, type Ref } from '../../../shared/ref/RefBadge'
import { focusAdjacentTapTabField } from '../tabNavPlugin'

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
      placeholder="Write protocol prose. Use /m for materials, /l or /t for labware, /e for equipment, @ for ontology."
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

function ProtocolRoleListWidget({ value, readOnly, onCommit, label, allowedKey, onRecordPatch, getRecordValue }: ProtocolWidgetProps & { label: string; allowedKey: string }) {
  const roles = Array.isArray(value) ? value as Array<Record<string, unknown>> : []
  const [newRole, setNewRole] = useState('')
  const [newRoleFocusSignal, setNewRoleFocusSignal] = useState(0)
  const newRoleMentions = useRef<SlashMention[]>([])
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const commitRoles = (next: Array<Record<string, unknown>>) => onCommit(next)
  const syncExternalMentions = useCallback((mentions: SlashMention[]) => {
    const external = mentions.filter((mention) => !mentionMatchesAllowedKey(mention, allowedKey))
    const patch = buildMentionRolePatch(external, getRecordValue)
    if (Object.keys(patch).length > 0) onRecordPatch?.(patch)
  }, [allowedKey, getRecordValue, onRecordPatch])
  const addRole = () => {
    const description = newRole.trim()
    const ids = roleMentionIds(newRoleMentions.current, allowedKey)
    const primaryId = ids[0] ?? description
    const roleId = normalizeRoleId(primaryId || description)
    if (!roleId || roles.some((role) => role.roleId === roleId || asStringArray(role[allowedKey]).some((id) => ids.includes(id)))) return
    commitRoles([...roles, {
      roleId,
      description,
      ...(ids.length > 0 ? { [allowedKey]: ids } : {}),
    }])
    syncExternalMentions(newRoleMentions.current)
    newRoleMentions.current = []
    setNewRole('')
    setNewRoleFocusSignal((signal) => signal + 1)
  }
  const chips = roles.flatMap((role, index) => roleChips(role, index, allowedKey))
  return (
    <div className="taptab-protocol-list">
      {chips.length === 0 && <span className="taptab-widget-empty">No {emptyRoleLabel(label)}</span>}
      {chips.length > 0 && (
        <span className="taptab-chips-list taptab-protocol-chip-list">
          {chips.map((chip) => (
            <RefBadge
              key={`${chip.roleIndex}:${chip.ref.id}`}
              value={chip.ref}
              size="md"
              showExternalLink={false}
              onRemove={readOnly ? undefined : () => commitRoles(roles.filter((_, i) => i !== chip.roleIndex))}
            />
          ))}
        </span>
      )}
      {!readOnly && (
        <div className="taptab-protocol-add" contentEditable={false}>
          <ProtocolMentionEditor
            value={newRole}
            placeholder={`Add ${addRoleLabel(label)}`}
            className="taptab-protocol-role-editor"
            serialize="readable"
            defaultSlashCommand={defaultRoleSlashCommand(allowedKey)}
            focusSignal={newRoleFocusSignal}
            onMentionSelected={() => {
              removeSlashMenuRoots()
              window.setTimeout(() => addButtonRef.current?.focus(), 0)
            }}
            onDraftChange={(text, mentions) => {
              setNewRole(text)
              newRoleMentions.current = mentions
            }}
            onCommit={(text, mentions) => {
              setNewRole(text)
              newRoleMentions.current = mentions
            }}
          />
          <button ref={addButtonRef} type="button" className="taptab-protocol-add-btn" tabIndex={0} contentEditable={false} onFocus={removeSlashMenuRoots} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addRole(); }}>Add</button>
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
      {steps.length > 0 && (
        <ol className="taptab-protocol-numbered-list">
          {steps.map((step, index) => (
        <li className="taptab-protocol-step-item" key={`${step.stepId ?? index}`}>
          <div className="taptab-protocol-step">
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
        </li>
          ))}
        </ol>
      )}
      {!readOnly && (
        <div className="taptab-protocol-add taptab-protocol-add-step" contentEditable={false}>
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
          <button type="button" className="taptab-protocol-add-btn" tabIndex={0} contentEditable={false} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addStep(); }}>Add</button>
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

function addRoleLabel(label: string): string {
  if (label === 'Material') return 'material'
  if (label === 'Consumables / Labware') return 'labware or consumable'
  if (label === 'Equipment') return 'equipment'
  return label.toLowerCase()
}

function emptyRoleLabel(label: string): string {
  if (label === 'Material') return 'materials'
  if (label === 'Consumables / Labware') return 'labware or consumables'
  if (label === 'Equipment') return 'equipment'
  return label.toLowerCase()
}

function roleChips(role: Record<string, unknown>, roleIndex: number, allowedKey: string): Array<{ roleIndex: number; ref: Ref }> {
  const ids = asStringArray(role[allowedKey])
  const label = String(role.description ?? role.roleId ?? ids[0] ?? '')
  if (ids.length === 0 && label) return [{ roleIndex, ref: roleRef(label, label, allowedKey) }]
  return ids.map((id) => ({ roleIndex, ref: roleRef(id, label || id, allowedKey) }))
}

function roleRef(id: string, label: string, allowedKey: string): Ref {
  if (/^[A-Za-z][A-Za-z0-9_]*:[A-Za-z0-9_]+$/.test(id)) {
    const [namespace = '', ...rest] = id.split(':')
    return { kind: 'ontology', id, namespace: namespace.toUpperCase(), label: label || rest.join(':') }
  }
  const type = allowedKey === 'allowedMaterialIds'
    ? 'material'
    : allowedKey === 'expectedLabwareKinds'
      ? 'labware'
      : 'equipment'
  return { kind: 'record', type, id, label: label || id }
}



function defaultRoleSlashCommand(allowedKey: string): string | undefined {
  if (allowedKey === 'allowedMaterialIds') return 'm'
  if (allowedKey === 'expectedLabwareKinds') return 'l'
  if (allowedKey === 'allowedInstrumentIds') return 'e'
  return undefined
}

function mentionMatchesAllowedKey(mention: SlashMention, allowedKey: string): boolean {
  if (allowedKey === 'allowedMaterialIds') return mention.type === 'material'
  if (allowedKey === 'expectedLabwareKinds') return mention.type === 'labware' || mention.type === 'tube'
  if (allowedKey === 'allowedInstrumentIds') return mention.type === 'equipment'
  return false
}

function roleMentionIds(mentions: SlashMention[], allowedKey: string): string[] {
  const ids: string[] = []
  for (const mention of mentions) {
    if (allowedKey === 'allowedMaterialIds' && mention.type === 'material' && mention.id) ids.push(mention.id)
    if (allowedKey === 'expectedLabwareKinds' && mention.type === 'labware' && mention.id) ids.push(mention.id)
    if (allowedKey === 'expectedLabwareKinds' && mention.type === 'tube' && mention.sizeLabel) ids.push(mention.sizeLabel)
    if (allowedKey === 'allowedInstrumentIds' && mention.type === 'equipment' && mention.id) ids.push(mention.id)
  }
  return uniqueStrings(ids)
}

export function ProtocolMentionEditor({
  value,
  placeholder,
  className,
  serialize,
  onCommit,
  onDraftChange,
  defaultSlashCommand,
  onMentionSelected,
  focusSignal,
}: {
  value: string
  placeholder: string
  className: string
  serialize: 'wire' | 'readable'
  onCommit: (text: string, mentions: SlashMention[]) => void
  onDraftChange?: (text: string, mentions: SlashMention[]) => void
  defaultSlashCommand?: string
  onMentionSelected?: (mention: SlashMention) => void
  focusSignal?: number
}) {
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const draftRef = useRef(onDraftChange)
  draftRef.current = onDraftChange
  const editorRef = useRef<Editor | null>(null)
  const latestValueRef = useRef(value)
  const focusSignalRef = useRef(focusSignal)
  const [hasPrimedSlash, setHasPrimedSlash] = useState(false)

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({ placeholder }),
      MentionNode,
      buildSlashMenuExtension({
        defaultCommand: defaultSlashCommand,
        onEmptyDefaultTab: (event) => {
          const currentEditor = editorRef.current
          if (!currentEditor) return false
          currentEditor.commands.setContent(protocolTextToDoc(''), { emitUpdate: false })
          latestValueRef.current = ''
          setHasPrimedSlash(false)
          removeSlashMenuRoots()
          const from = currentEditor.view.dom as HTMLElement
          window.setTimeout(() => focusAdjacentTapTabField(from, event.shiftKey), 0)
          return true
        },
        onMentionSelected,
      }),
      buildOntologyCopilotExtension({ kinds: ['material', 'labware'] }),
    ],
    content: protocolTextToDoc(value),
    editorProps: {
      attributes: { class: 'taptab-protocol-mention-editor__content' },
      handleDOMEvents: {
        blur: (view, event) => {
          const target = event.relatedTarget as Node | null
          const root = view.dom.parentElement
          if (target && root?.contains(target)) return false
          commitEditor(serialize, commitRef.current, editorRef.current, defaultSlashCommand)
          return false
        },
        focus: () => {
          primeDefaultSlashCommand(editorRef.current, defaultSlashCommand)
          setHasPrimedSlash(isPrimedSlashText(editorRef.current, defaultSlashCommand))
          return false
        },
        keydown: (_view, event) => {
          if ((event.key === 'Backspace' || event.key === 'Delete') && isPrimedSlashOnly(editorRef.current, defaultSlashCommand)) {
            event.preventDefault()
            return true
          }
          return false
        },
      },
    },
    onUpdate({ editor }) {
      const mentions = collectMentions(editor.getJSON())
      const text = editorText(editor, serialize, defaultSlashCommand)
      latestValueRef.current = text
      setHasPrimedSlash(isPrimedSlashText(editor, defaultSlashCommand))
      draftRef.current?.(text, mentions)
    },
  })
  editorRef.current = editor

  useEffect(() => {
    if (!editor) return
    if (value === latestValueRef.current) return
    latestValueRef.current = value
    editor.commands.setContent(protocolTextToDoc(value), { emitUpdate: false })
    setHasPrimedSlash(isPrimedSlashText(editor, defaultSlashCommand))
  }, [defaultSlashCommand, editor, value])

  useEffect(() => {
    if (!editor || focusSignal === undefined || focusSignalRef.current === focusSignal) return
    focusSignalRef.current = focusSignal
    latestValueRef.current = value
    editor.commands.setContent(protocolTextToDoc(value), { emitUpdate: false })
    setHasPrimedSlash(false)
    window.setTimeout(() => {
      editor.chain().focus().run()
      primeDefaultSlashCommand(editor, defaultSlashCommand)
      setHasPrimedSlash(isPrimedSlashText(editor, defaultSlashCommand))
    }, 0)
  }, [defaultSlashCommand, editor, focusSignal, value])

  return (
    <div className={`taptab-protocol-mention-editor ${hasPrimedSlash ? 'taptab-protocol-mention-editor--primed' : ''} ${className}`}>
      <EditorContent editor={editor} />
    </div>
  )
}

export function removeSlashMenuRoots() {
  document.querySelectorAll('[data-slash-menu-root="true"]').forEach((node) => node.remove())
}

function primeDefaultSlashCommand(editor: Editor | null, command: string | undefined) {
  if (!editor || !command) return
  const rawText = editorContentToReadableText(editor.getJSON())
  if (stripPrimedSlashCommandText(rawText, command)) return
  if (rawText.trim()) editor.commands.setContent(protocolTextToDoc(''), { emitUpdate: false })
  editor.chain().focus().insertContent(`/${command} `).run()
}

function isPrimedSlashText(editor: Editor | null, command: string | undefined): boolean {
  if (!editor || !command) return false
  return editorContentToReadableText(editor.getJSON()).trimStart().toLowerCase().startsWith(`/${command.toLowerCase()}`)
}

function isPrimedSlashOnly(editor: Editor | null, command: string | undefined): boolean {
  if (!editor || !command) return false
  return stripPrimedSlashCommandText(editorContentToReadableText(editor.getJSON()), command) === ''
}

function commitEditor(mode: 'wire' | 'readable', commit: (text: string, mentions: SlashMention[]) => void, editor: Editor | null, defaultSlashCommand?: string) {
  if (!editor) return
  const mentions = collectMentions(editor.getJSON())
  const text = editorText(editor, mode, defaultSlashCommand)
  commit(text, mentions)
}

function editorText(editor: Editor, mode: 'wire' | 'readable', defaultSlashCommand?: string): string {
  const text = mode === 'wire' ? editorToText(editor) : editorContentToReadableText(editor.getJSON())
  return stripPrimedSlashCommandText(text, defaultSlashCommand)
}

export function stripPrimedSlashCommandText(text: string, defaultSlashCommand?: string): string {
  if (!defaultSlashCommand) return text
  const trimmedCommand = defaultSlashCommand.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!trimmedCommand) return text
  const pattern = new RegExp(`^\\s*/${trimmedCommand}(?:\\s+|$)`, 'i')
  return text.replace(pattern, '').trimStart()
}

export function protocolTextToDoc(value: string): JSONContent {
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
    content.push(...inlineContentFromMentionTokens(line))
  })
  return content
}

const MENTION_TOKEN_PATTERN = /\[\[(material|material-spec|material-instance|aliquot|vendor-product|labware|tube|equipment|protocol|graph-component|selection):(.*?)\]\]/g

function inlineContentFromMentionTokens(value: string): JSONContent[] {
  const content: JSONContent[] = []
  MENTION_TOKEN_PATTERN.lastIndex = 0
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = MENTION_TOKEN_PATTERN.exec(value)) !== null) {
    const raw = match[0]
    const start = match.index
    if (start > cursor) content.push({ type: 'text', text: value.slice(cursor, start) })
    const mention = mentionFromToken(match[1] ?? '', match[2] ?? '')
    content.push(mention ? { type: 'slashMention', attrs: { mention } } : { type: 'text', text: raw })
    cursor = start + raw.length
  }
  if (cursor < value.length) content.push({ type: 'text', text: value.slice(cursor) })
  return content
}

function mentionFromToken(kind: string, body: string): SlashMention | null {
  if (kind === 'material' || kind === 'material-spec' || kind === 'material-instance' || kind === 'aliquot' || kind === 'vendor-product') {
    const [id = '', label = id] = body.split('|')
    if (!id) return null
    return { type: 'material', entityKind: kind, id, label }
  }
  if (kind === 'labware') {
    const [id = '', label = id] = body.split('|')
    if (!id) return null
    return { type: 'labware', id, label }
  }
  if (kind === 'tube') {
    const [sizeLabel = '', label = sizeLabel] = body.split('|')
    if (!sizeLabel) return null
    return { type: 'tube', sizeLabel, maxVolume_uL: 0, label }
  }
  if (kind === 'equipment') {
    const [id = '', label = id] = body.split('|')
    if (!id) return null
    return { type: 'equipment', id, label }
  }
  if (kind === 'protocol' || kind === 'graph-component') {
    const [id = '', label = id] = body.split('|')
    if (!id) return null
    return { type: 'protocol', entityKind: kind, id, label }
  }
  if (kind === 'selection') {
    const [selectionKindRaw = '', labwareId = '', wellsRaw = '', label = ''] = body.split('|')
    if ((selectionKindRaw !== 'source' && selectionKindRaw !== 'target') || !labwareId) return null
    return {
      type: 'selection',
      selectionKind: selectionKindRaw,
      labwareId,
      wells: wellsRaw ? wellsRaw.split(',').filter(Boolean) : [],
      label: label || `${selectionKindRaw}:${labwareId}`,
    }
  }
  return null
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
  const equipmentRoles = mergeEquipmentMentions(
    asRoleArray(getRecordValue?.('$.roles.instrumentRoles')),
    mentions.filter((mention): mention is Extract<SlashMention, { type: 'equipment' }> => mention.type === 'equipment'),
  )
  const patch: Record<string, unknown> = {}
  if (materialRoles.changed) patch['$.roles.materialRoles'] = materialRoles.roles
  if (labwareRoles.changed) patch['$.roles.labwareRoles'] = labwareRoles.roles
  if (equipmentRoles.changed) patch['$.roles.instrumentRoles'] = equipmentRoles.roles
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

function mergeEquipmentMentions(
  current: Array<Record<string, unknown>>,
  mentions: Array<Extract<SlashMention, { type: 'equipment' }>>,
): { roles: Array<Record<string, unknown>>; changed: boolean } {
  let changed = false
  const roles = current.map((role) => ({ ...role }))
  for (const mention of mentions) {
    if (!mention.id) continue
    const roleId = normalizeRoleId(mention.label || mention.id)
    const index = findRoleIndex(roles, roleId, 'allowedInstrumentIds', mention.id)
    if (index === -1) {
      roles.push({ roleId, description: mention.label, allowedInstrumentIds: [mention.id] })
      changed = true
      continue
    }
    const existing = asStringArray(roles[index].allowedInstrumentIds)
    const ids = uniqueStrings([...existing, mention.id])
    if (ids.length !== existing.length) {
      roles[index] = { ...roles[index], allowedInstrumentIds: ids }
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
