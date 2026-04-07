import type { PromptMention } from '../../types/ai'

const MENTION_PATTERN = /\[\[(material|material-spec|aliquot|labware|selection):(.*?)\]\]/g

export interface ParsedPromptMention {
  mention: PromptMention
  raw: string
  start: number
  end: number
}

export function formatMaterialMentionToken(entityKind: 'material' | 'material-spec' | 'aliquot', id: string, label: string): string {
  return `[[${entityKind}:${id}|${label}]]`
}

export function formatLabwareMentionToken(id: string, label: string): string {
  return `[[labware:${id}|${label}]]`
}

export function formatSelectionMentionToken(selectionKind: 'source' | 'target', labwareId: string, wells: string[], label: string): string {
  return `[[selection:${selectionKind}|${labwareId}|${wells.join(',')}|${label}]]`
}

export function parsePromptMentionMatches(prompt: string): ParsedPromptMention[] {
  const mentions: ParsedPromptMention[] = []
  let match: RegExpExecArray | null
  while ((match = MENTION_PATTERN.exec(prompt)) !== null) {
    const kind = match[1]
    const body = match[2] ?? ''
    const start = match.index
    const raw = match[0]
    const end = start + raw.length
    if (kind === 'material' || kind === 'material-spec' || kind === 'aliquot') {
      const [id = '', label = id] = body.split('|')
      if (!id) continue
      mentions.push({
        mention: {
          type: 'material',
          entityKind: kind,
          id,
          label,
        },
        raw,
        start,
        end,
      })
      continue
    }
    if (kind === 'labware') {
      const [id = '', label = id] = body.split('|')
      if (!id) continue
      mentions.push({
        mention: {
          type: 'labware',
          id,
          label,
        },
        raw,
        start,
        end,
      })
      continue
    }
    if (kind === 'selection') {
      const [selectionKindRaw = '', labwareId = '', wellsRaw = '', label = ''] = body.split('|')
      if ((selectionKindRaw !== 'source' && selectionKindRaw !== 'target') || !labwareId) continue
      mentions.push({
        mention: {
          type: 'selection',
          selectionKind: selectionKindRaw,
          labwareId,
          wells: wellsRaw ? wellsRaw.split(',').filter(Boolean) : [],
          label: label || `${selectionKindRaw}:${labwareId}`,
        },
        raw,
        start,
        end,
      })
    }
  }
  return mentions
}

export function parsePromptMentions(prompt: string): PromptMention[] {
  return parsePromptMentionMatches(prompt).map((entry) => entry.mention)
}
