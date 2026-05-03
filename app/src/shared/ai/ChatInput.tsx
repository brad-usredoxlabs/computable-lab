import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOptionalLabwareEditor } from '../../graph/context/LabwareEditorContext'
import { apiClient } from '../api/client'
import { searchRecords } from '../api/treeClient'
import { LABWARE_DEFINITIONS } from '../../types/labwareDefinition'
import {
  formatLabwareMentionToken,
  formatMaterialMentionToken,
  formatSelectionMentionToken,
  formatProtocolMentionToken,
  parsePromptMentionMatches,
  parsePromptMentions,
} from '../lib/aiPromptMentions'
import { PastedBlockToken } from './PastedBlockToken'
import { FileAttachmentButton, filesToAttachments } from './FileAttachmentButton'
import { AttachmentChip } from './AttachmentChip'
import type { FileAttachment } from '../../types/aiContext'

interface ChatInputProps {
  onSend: (prompt: string, attachments?: FileAttachment[]) => void
  onCancel: () => void
  isStreaming: boolean
  disabled?: boolean
  inputText?: string
}

type SlashCommandKind = 'material' | 'labware' | 'source' | 'target' | 'protocol'

interface SlashMatch {
  kind: SlashCommandKind
  start: number
  end: number
  query: string
}

interface SuggestionOption {
  key: string
  label: string
  badge: string
  subtitle?: string
  insertText?: string
  disabled?: boolean
}

const MATERIAL_ALIASES = new Set(['m', 'material'])
const LABWARE_ALIASES = new Set(['l', 'labware'])
const SOURCE_ALIASES = new Set(['s', 'source', 'src'])
const TARGET_ALIASES = new Set(['t', 'target', 'tar'])
const PROTOCOL_ALIASES = new Set(['p', 'protocol'])

function badgeStyles(badge: string): { background: string; color: string; border: string } {
  switch (badge) {
    case 'Formulation':
      return { background: '#dcfce7', color: '#166534', border: '#86efac' }
    case 'Instance':
      return { background: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' }
    case 'Concept':
      return { background: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' }
    case 'Labware':
      return { background: '#fef3c7', color: '#92400e', border: '#fcd34d' }
    case 'Generic':
      return { background: '#fef3c7', color: '#92400e', border: '#fcd34d' }
    case 'Source':
      return { background: '#e0f2fe', color: '#075985', border: '#7dd3fc' }
    case 'Target':
      return { background: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
    case 'Protocol':
      return { background: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' }
    case 'Component':
      return { background: '#ede9fe', color: '#5b21b6', border: '#ddd6fe' }
    default:
      return { background: '#e5e7eb', color: '#374151', border: '#d1d5db' }
  }
}

function detectSlashCommand(text: string, cursor: number): SlashMatch | null {
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const lineFragment = text.slice(lineStart, cursor)

  for (let i = lineFragment.length - 1; i >= 0; i--) {
    if (lineFragment[i] !== '/') continue
    if (i > 0 && !/\s/.test(lineFragment[i - 1]!)) continue
    const fragment = lineFragment.slice(i)
    const match = fragment.match(/^\/([a-zA-Z]+)(?:\s+(.*))?$/)
    if (!match) continue
    const raw = match[1]?.toLowerCase() ?? ''
    const query = match[2] ?? ''
    const kind = MATERIAL_ALIASES.has(raw)
      ? 'material'
      : LABWARE_ALIASES.has(raw)
        ? 'labware'
        : SOURCE_ALIASES.has(raw)
          ? 'source'
          : TARGET_ALIASES.has(raw)
            ? 'target'
            : PROTOCOL_ALIASES.has(raw)
              ? 'protocol'
              : null
    if (!kind) continue
    const start = lineStart + i
    return { kind, start, end: cursor, query }
  }
  return null
}

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

function formatSelectionLabel(prefix: string, labwareName: string | undefined, wells: string[]): string {
  const preview = wells.length > 6 ? `${wells.slice(0, 6).join(', ')}…` : wells.join(', ')
  return `${prefix}: ${labwareName ?? 'Unknown labware'} ${preview}`.trim()
}

function formatMentionPreview(option: ReturnType<typeof parsePromptMentions>[number]): string {
  if (option.type === 'material') {
    return `${option.entityKind ?? 'material'}: ${option.label}`
  }
  if (option.type === 'labware') {
    return `labware: ${option.label}`
  }
  return `${option.selectionKind ?? 'selection'}: ${option.label}`
}

export function ChatInput({ onSend, onCancel, isStreaming, disabled, inputText }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const editorCtx = useOptionalLabwareEditor()
  const state = editorCtx?.state ?? null
  const sourceLabware = editorCtx?.sourceLabware ?? null
  const targetLabware = editorCtx?.targetLabware ?? null
  const sourceSelection = editorCtx?.sourceSelection ?? null
  const targetSelection = editorCtx?.targetSelection ?? null

  const [pastedBlock, setPastedBlock] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const [slashMatch, setSlashMatch] = useState<SlashMatch | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [materialOptions, setMaterialOptions] = useState<SuggestionOption[]>([])
  const [materialLoading, setMaterialLoading] = useState(false)

  const [labwareOptions, setLabwareOptions] = useState<SuggestionOption[]>([])
  const [labwareLoading, setLabwareLoading] = useState(false)

  const [protocolOptions, setProtocolOptions] = useState<SuggestionOption[]>([])
  const [protocolLoading, setProtocolLoading] = useState(false)

  // One-shot pre-fill from parent (e.g. applyToGraph). Sync into local
  // state when the prop changes; the textarea is otherwise driven by `value`.
  useEffect(() => {
    if (inputText && inputText !== value) {
      setValue(inputText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText])

  useEffect(() => {
    if (!isStreaming) {
      setIsSubmittingLocal(false)
    }
  }, [isStreaming])

  const selectionOptions = useMemo<SuggestionOption[]>(() => {
    if (!slashMatch || (slashMatch.kind !== 'source' && slashMatch.kind !== 'target')) return []
    const isSource = slashMatch.kind === 'source'
    const selection = isSource ? sourceSelection : targetSelection
    const labware = isSource ? sourceLabware : targetLabware
    const wells = selection ? Array.from(selection.selectedWells) : []
    if (wells.length === 0 || !labware) {
      return [{
        key: `${slashMatch.kind}:none`,
        label: `No ${slashMatch.kind} wells selected`,
        badge: slashMatch.kind === 'source' ? 'Source' : 'Target',
        subtitle: `Select wells in the ${slashMatch.kind} pane first`,
        disabled: true,
      }]
    }
    const label = formatSelectionLabel(isSource ? 'Source' : 'Target', labware.name, wells)
    return [{
      key: `${slashMatch.kind}:${labware.labwareId}`,
      label,
      badge: isSource ? 'Source' : 'Target',
      subtitle: `${labware.labwareId} • ${wells.length} well${wells.length !== 1 ? 's' : ''}`,
      insertText: formatSelectionMentionToken(isSource ? 'source' : 'target', labware.labwareId, wells, label),
    }]
  }, [slashMatch, sourceSelection, targetSelection, sourceLabware, targetLabware])

  const options = slashMatch?.kind === 'material'
    ? materialOptions
    : slashMatch?.kind === 'labware'
      ? labwareOptions
      : slashMatch?.kind === 'protocol'
        ? protocolOptions
        : selectionOptions

  const mentionMatches = useMemo(() => parsePromptMentionMatches(value), [value])
  const mentionsPreview = useMemo(() => mentionMatches.map((entry) => entry.mention), [mentionMatches])

  const updateSlashMatch = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart ?? 0
    const next = detectSlashCommand(value, cursor)
    setSlashMatch(next)
    setDropdownOpen(Boolean(next))
    setFocusedIndex(0)
  }, [value])

  useEffect(() => {
    requestAnimationFrame(() => updateSlashMatch())
  }, [value, updateSlashMatch])

  useEffect(() => {
    if (!slashMatch || slashMatch.kind !== 'material') {
      setMaterialOptions([])
      setMaterialLoading(false)
      return
    }
    const query = slashMatch.query.trim()
    if (query.length < 1) {
      setMaterialOptions([])
      setMaterialLoading(false)
      return
    }
    let cancelled = false
    setMaterialLoading(true)
    Promise.all([
      apiClient.getFormulationsSummary({ q: query, limit: 6 }),
      apiClient.getMaterialInventory({ q: query, limit: 6, status: 'available' }),
      searchRecords(query, { kind: 'material', limit: 6 }),
    ])
      .then(([formulations, inventory, materials]) => {
        if (cancelled) return
        const next: SuggestionOption[] = []
        const seen = new Set<string>()
        for (const summary of formulations) {
          const key = `material-spec:${summary.outputSpec.id}`
          if (seen.has(key)) continue
          seen.add(key)
          next.push({
            key,
            label: summary.outputSpec.name,
            badge: 'Formulation',
            subtitle: summary.outputSpec.materialName || summary.recipeName,
            insertText: formatMaterialMentionToken('material-spec', summary.outputSpec.id, summary.outputSpec.name),
          })
        }
        for (const item of inventory) {
          const key = `aliquot:${item.aliquotId}`
          if (seen.has(key)) continue
          seen.add(key)
          next.push({
            key,
            label: item.name,
            badge: 'Instance',
            subtitle: item.materialSpec.name,
            insertText: formatMaterialMentionToken('aliquot', item.aliquotId, item.name),
          })
        }
        for (const item of materials.records) {
          const key = `material:${item.recordId}`
          if (seen.has(key)) continue
          seen.add(key)
          next.push({
            key,
            label: item.title ?? item.recordId,
            badge: 'Concept',
            subtitle: item.recordId,
            insertText: formatMaterialMentionToken('material', item.recordId, item.title ?? item.recordId),
          })
        }
        setMaterialOptions(next.slice(0, 10))
      })
      .catch(() => {
        if (!cancelled) setMaterialOptions([])
      })
      .finally(() => {
        if (!cancelled) setMaterialLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slashMatch])

  useEffect(() => {
    if (!slashMatch || slashMatch.kind !== 'labware') {
      setLabwareOptions([])
      setLabwareLoading(false)
      return
    }
    const query = slashMatch.query.trim()
    // Empty query: show only in-editor instances, no record index blast
    if (query.length === 0) {
      if (!state) {
        setLabwareOptions([])
        setLabwareLoading(false)
        return
      }
      const options: SuggestionOption[] = Array.from(state.labwares.values()).map((labware) => ({
        key: `labware:inst:${labware.labwareId}`,
        label: labware.name,
        badge: 'Labware',
        subtitle: `${labware.labwareType} • ${labware.labwareId}`,
        insertText: formatLabwareMentionToken(labware.labwareId, labware.name),
      }))
      setLabwareOptions(options.slice(0, 10))
      setLabwareLoading(false)
      return
    }
    let cancelled = false
    setLabwareLoading(true)
    const normalizedQuery = normalize(query)

    // Gather from all three sources
    const instanceOptions: SuggestionOption[] = Array.from(state?.labwares.values() ?? [])
      .map((labware) => ({
        key: `labware:inst:${labware.labwareId}`,
        label: labware.name,
        badge: 'Labware',
        subtitle: `${labware.labwareType} • ${labware.labwareId}`,
        insertText: formatLabwareMentionToken(labware.labwareId, labware.name),
      }))
      .filter((option) =>
        [option.label, option.subtitle, option.key].some((value) => normalize(value ?? '').includes(normalizedQuery))
      )

    // Generic definitions
    const genericOptions: SuggestionOption[] = LABWARE_DEFINITIONS
      .map((definition) => ({
        key: `labware:def:${definition.id}`,
        label: definition.display_name,
        badge: 'Generic' as const,
        subtitle: definition.id,
        insertText: formatLabwareMentionToken(`def:${definition.id}`, definition.display_name),
      }))
      .filter((option) =>
        [option.label, option.subtitle, option.key].some((value) => normalize(value ?? '').includes(normalizedQuery))
      )

    // Record index
    searchRecords(query, { kind: 'labware', limit: 6 })
      .then((result) => {
        if (cancelled) return
        const recordOptions: SuggestionOption[] = result.records.map((record) => ({
          key: `labware:rec:${record.recordId}`,
          label: record.title ?? record.recordId,
          badge: 'Record' as const,
          subtitle: record.recordId,
          insertText: formatLabwareMentionToken(record.recordId, record.title ?? record.recordId),
        }))

        // De-dup and combine: instances first, then generics, then records
        const seen = new Set<string>()
        const combined: SuggestionOption[] = []

        for (const opt of instanceOptions) {
          if (!seen.has(opt.key)) {
            seen.add(opt.key)
            combined.push(opt)
          }
        }
        for (const opt of genericOptions) {
          if (!seen.has(opt.key)) {
            seen.add(opt.key)
            combined.push(opt)
          }
        }
        for (const opt of recordOptions) {
          if (!seen.has(opt.key)) {
            seen.add(opt.key)
            combined.push(opt)
          }
        }

        if (!cancelled) {
          setLabwareOptions(combined.slice(0, 10))
          setLabwareLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLabwareOptions(instanceOptions.slice(0, 10))
      })
      .finally(() => {
        if (!cancelled) setLabwareLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slashMatch, state?.labwares])

  useEffect(() => {
    if (!slashMatch || slashMatch.kind !== 'protocol') {
      setProtocolOptions([])
      setProtocolLoading(false)
      return
    }
    const query = slashMatch.query.trim()
    if (query.length < 1) {
      setProtocolOptions([])
      setProtocolLoading(false)
      return
    }
    let cancelled = false
    setProtocolLoading(true)
    Promise.all([
      searchRecords(query, { kind: 'protocol', limit: 6 }),
      searchRecords(query, { kind: 'graph-component', limit: 6 }),
    ])
      .then(([protocols, components]) => {
        if (cancelled) return
        const next: SuggestionOption[] = []
        const seen = new Set<string>()
        
        // Add protocols first
        for (const item of protocols.records) {
          const key = `protocol:${item.recordId}`
          if (seen.has(key)) continue
          seen.add(key)
          next.push({
            key,
            label: item.title ?? item.recordId,
            badge: 'Protocol',
            subtitle: item.recordId,
            insertText: formatProtocolMentionToken('protocol', item.recordId, item.title ?? item.recordId),
          })
        }
        
        // Then add graph-components
        for (const item of components.records) {
          const key = `graph-component:${item.recordId}`
          if (seen.has(key)) continue
          seen.add(key)
          next.push({
            key,
            label: item.title ?? item.recordId,
            badge: 'Component',
            subtitle: item.recordId,
            insertText: formatProtocolMentionToken('graph-component', item.recordId, item.title ?? item.recordId),
          })
        }
        
        setProtocolOptions(next.slice(0, 10))
      })
      .catch(() => {
        if (!cancelled) setProtocolOptions([])
      })
      .finally(() => {
        if (!cancelled) setProtocolLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slashMatch])

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]')
      const current = items[focusedIndex] as HTMLElement | undefined
      current?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  const insertOption = useCallback((option: SuggestionOption) => {
    if (!slashMatch || !option.insertText || option.disabled) return
    const insertText = option.insertText
    const before = value.slice(0, slashMatch.start)
    const after = value.slice(slashMatch.end)
    const suffix = after.startsWith(' ') || after.length === 0 ? '' : ' '
    const nextValue = `${before}${insertText}${suffix}${after}`
    setValue(nextValue)
    setDropdownOpen(false)
    setSlashMatch(null)
    setFocusedIndex(0)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const position = before.length + insertText.length + suffix.length
      el.setSelectionRange(position, position)
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    })
  }, [slashMatch, value])

  const slashKind = slashMatch?.kind
  const showDropdown = dropdownOpen && Boolean(slashMatch) && (
    options.length > 0
    || materialLoading
    || labwareLoading
    || protocolLoading
    || slashKind === 'material'
    || slashKind === 'labware'
    || slashKind === 'protocol'
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Readline keybindings: Ctrl+A → beginning of line, Ctrl+E → end of line
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      const el = textareaRef.current
      if (el && (e.key === 'a' || e.key === 'e')) {
        e.preventDefault()
        const pos = el.selectionStart ?? 0
        const text = el.value
        if (e.key === 'a') {
          const lineStart = text.lastIndexOf('\n', pos - 1) + 1
          el.setSelectionRange(lineStart, lineStart)
        } else {
          let lineEnd = text.indexOf('\n', pos)
          if (lineEnd === -1) lineEnd = text.length
          el.setSelectionRange(lineEnd, lineEnd)
        }
        return
      }
    }

    if (slashMatch && e.key === 'Tab' && !showDropdown) {
      e.preventDefault()
      return
    }

    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((index) => Math.max(index - 1, 0))
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const option = options[focusedIndex]
        if (option) {
          e.preventDefault()
          insertOption(option)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDropdownOpen(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const hasContent = value.trim() || pastedBlock || attachments.length > 0
      if (hasContent && !isStreaming && !isSubmittingLocal && !disabled) {
        const parts: string[] = []
        if (value.trim()) parts.push(value.trim())
        if (pastedBlock) parts.push(`---pasted-content---\n${pastedBlock}\n---end-pasted-content---`)
        setIsSubmittingLocal(true)
        onSend(parts.join('\n\n'), attachments.length > 0 ? attachments : undefined)
        setValue('')
        setPastedBlock(null)
        setAttachments([])
        setDropdownOpen(false)
        setSlashMatch(null)
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      }
    }
  }, [slashMatch, showDropdown, options, focusedIndex, insertOption, value, isStreaming, isSubmittingLocal, disabled, onSend, pastedBlock, attachments])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
  }, [])

  const handleSendClick = useCallback(() => {
    const hasContent = value.trim() || pastedBlock || attachments.length > 0
    if (hasContent && !isStreaming && !isSubmittingLocal && !disabled) {
      const parts: string[] = []
      if (value.trim()) parts.push(value.trim())
      if (pastedBlock) parts.push(`---pasted-content---\n${pastedBlock}\n---end-pasted-content---`)
      setIsSubmittingLocal(true)
      onSend(parts.join('\n\n'), attachments.length > 0 ? attachments : undefined)
      setValue('')
      setPastedBlock(null)
      setAttachments([])
      setDropdownOpen(false)
      setSlashMatch(null)
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
  }, [value, isStreaming, isSubmittingLocal, disabled, onSend, pastedBlock, attachments])

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const handleAttach = useCallback((files: FileAttachment[]) => {
    setAttachments((prev) => [...prev, ...files])
    setAttachError(null)
  }, [])

  const handleAttachError = useCallback((message: string) => {
    setAttachError(message)
    setTimeout(() => setAttachError(null), 5000)
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Check for image paste first
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) {
        e.preventDefault()
        const newAttachments = await filesToAttachments([file], attachments, handleAttachError)
        if (newAttachments.length > 0) handleAttach(newAttachments)
        return
      }
    }

    // Existing multiline paste behavior
    const text = e.clipboardData.getData('text/plain')
    const lines = text.split('\n')
    if (lines.length >= 3) {
      e.preventDefault()
      setPastedBlock(text)
    }
  }, [attachments, handleAttach, handleAttachError])

  const commandHint = '/m material, /l labware, /p protocol, /s source selection, /t target selection'

  const removeMentionAt = useCallback((index: number) => {
    const match = mentionMatches[index]
    if (!match) return
    const before = value.slice(0, match.start)
    const after = value.slice(match.end)
    const nextValue = `${before}${after}`.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trimStart()
    setValue(nextValue)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const position = Math.min(before.length, nextValue.length)
      el.setSelectionRange(position, position)
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    })
  }, [mentionMatches, value])

  const focusMentionAt = useCallback((index: number) => {
    const match = mentionMatches[index]
    if (!match) return
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(match.start, match.end)
    })
  }, [mentionMatches])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files.length === 0) return
    const newAttachments = await filesToAttachments(files, attachments, handleAttachError)
    if (newAttachments.length > 0) handleAttach(newAttachments)
  }, [attachments, handleAttach, handleAttachError])

  return (
    <div
      className="chat-input"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: 'relative',
        borderTop: '1px solid #e9ecef',
        padding: '0.75rem 1rem',
        flexShrink: 0,
        ...(isDragOver ? { background: '#eff6ff', borderColor: '#3b82f6' } : {}),
      }}
    >
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {showDropdown && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            bottom: 'calc(100% - 8px)',
            left: '1rem',
            right: '1rem',
            zIndex: 1000,
            background: 'white',
            border: '1px solid #d0d5dd',
            borderRadius: '8px',
            boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {materialLoading && options.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '0.85rem', color: '#64748b' }}>Searching materials...</div>
          ) : labwareLoading && options.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '0.85rem', color: '#64748b' }}>Searching labware...</div>
          ) : (
            options.map((option, index) => (
              <button
                key={option.key}
                data-option
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertOption(option)
                }}
                disabled={option.disabled}
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: index === focusedIndex ? '#f1f5f9' : 'white',
                  cursor: option.disabled ? 'not-allowed' : 'pointer',
                  opacity: option.disabled ? 0.7 : 1,
                  alignItems: 'flex-start',
                  gap: '10px',
                  textAlign: 'left',
                }}
              >
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#1d4ed8',
                  background: '#dbeafe',
                  borderRadius: '999px',
                  padding: '2px 6px',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                }}>
                  {option.badge}
                </span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', color: '#0f172a' }}>{option.label}</div>
                  {option.subtitle && (
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{option.subtitle}</div>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <FileAttachmentButton
          attachments={attachments}
          onAttach={handleAttach}
          onError={handleAttachError}
          disabled={disabled || isStreaming}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onClick={updateSlashMatch}
          onKeyUp={updateSlashMatch}
          rows={1}
          placeholder={`Ask AI to plan events. ${commandHint}`}
          disabled={disabled || isStreaming}
          style={{
            flex: 1,
            minHeight: '40px',
            maxHeight: '120px',
            resize: 'none',
            padding: '0.65rem 0.75rem',
            border: '1px solid #d0d5dd',
            borderRadius: '8px',
            fontSize: '0.9rem',
            lineHeight: 1.4,
          }}
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            type="button"
            style={{
              padding: '0.6rem 0.9rem',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              background: '#fff1f2',
              color: '#b91c1c',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleSendClick}
            type="button"
            disabled={!(value.trim() || pastedBlock || attachments.length > 0) || disabled || isSubmittingLocal}
            style={{
              padding: '0.6rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: isSubmittingLocal ? '#64748b' : '#2563eb',
              color: 'white',
              cursor: !(value.trim() || pastedBlock || attachments.length > 0) || disabled || isSubmittingLocal ? 'not-allowed' : 'pointer',
              opacity: !(value.trim() || pastedBlock || attachments.length > 0) || disabled ? 0.6 : 1,
            }}
          >
            {isSubmittingLocal ? 'Submitting...' : 'Send'}
          </button>
        )}
      </div>
      {isSubmittingLocal && !isStreaming && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#475569' }}>
          Prompt submitted...
        </div>
      )}
      <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>{commandHint}</div>
      {pastedBlock && (
        <PastedBlockToken
          lineCount={pastedBlock.split('\n').length}
          content={pastedBlock}
          onRemove={() => setPastedBlock(null)}
        />
      )}
      {attachments.length > 0 && (
        <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              name={attachment.name}
              size={attachment.size}
              type={attachment.type}
              previewUrl={attachment.previewUrl}
              onRemove={() => removeAttachment(attachment.id)}
            />
          ))}
        </div>
      )}
      {attachError && (
        <div style={{
          marginTop: '0.35rem',
          fontSize: '0.75rem',
          color: '#dc2626',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 6,
          padding: '4px 8px',
        }}>
          {attachError}
        </div>
      )}
      {isDragOver && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(59, 130, 246, 0.08)',
          border: '2px dashed #3b82f6',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.85rem',
          color: '#2563eb',
          fontWeight: 600,
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          Drop files to attach
        </div>
      )}
      {mentionsPreview.length > 0 && (
        <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {mentionsPreview.map((mention, index) => {
            const badge = mention.type === 'material'
              ? mention.entityKind === 'material-spec'
                ? 'Formulation'
                : mention.entityKind === 'aliquot'
                  ? 'Instance'
                  : 'Concept'
              : mention.type === 'labware'
                ? 'Labware'
                : mention.selectionKind === 'source'
                  ? 'Source'
                  : 'Target'
            const colors = badgeStyles(badge)
            return (
            <span
              key={`${mention.type}-${mention.id ?? mention.label}-${index}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.72rem',
                color: '#0f172a',
                background: '#ffffff',
                border: '1px solid #dbe2ea',
                borderRadius: '999px',
                padding: '4px 8px 4px 4px',
                boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
              }}
            >
              <button
                type="button"
                onClick={() => focusMentionAt(index)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'inherit',
                  font: 'inherit',
                }}
                title="Focus mention in prompt"
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: '999px',
                  padding: '2px 6px',
                  fontWeight: 700,
                  background: colors.background,
                  color: colors.color,
                  border: `1px solid ${colors.border}`,
                }}>
                  {badge}
                </span>
                <span>{formatMentionPreview(mention)}</span>
              </button>
              <button
                type="button"
                onClick={() => removeMentionAt(index)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: '0.9rem',
                }}
                title="Remove mention"
              >
                ×
              </button>
            </span>
          )})}
        </div>
      )}
    </div>
    </div>
  )
}
