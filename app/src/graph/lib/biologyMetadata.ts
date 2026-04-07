export const BIOLOGY_META_MARKER = '[computable-lab/biology-meta]'

export interface BiologyNotesFields {
  biologicalIntent: string
  freeformNotes: string
}

export function parseBiologyNotes(notes?: string): BiologyNotesFields {
  const text = (notes || '').trim()
  if (!text) {
    return { biologicalIntent: '', freeformNotes: '' }
  }
  const markerIndex = text.indexOf(BIOLOGY_META_MARKER)
  if (markerIndex === -1) {
    return { biologicalIntent: '', freeformNotes: text }
  }
  const freeformNotes = text.slice(0, markerIndex).trim()
  const rawMeta = text.slice(markerIndex + BIOLOGY_META_MARKER.length).trim()
  try {
    const parsed = JSON.parse(rawMeta) as Partial<BiologyNotesFields>
    return {
      biologicalIntent: typeof parsed.biologicalIntent === 'string' ? parsed.biologicalIntent : '',
      freeformNotes,
    }
  } catch {
    return { biologicalIntent: '', freeformNotes: text }
  }
}

export function buildBiologyNotes(fields: BiologyNotesFields): string | undefined {
  const biologicalIntent = fields.biologicalIntent.trim()
  const freeformNotes = fields.freeformNotes.trim()
  if (!biologicalIntent && !freeformNotes) return undefined
  const sections: string[] = []
  if (freeformNotes) sections.push(freeformNotes)
  if (biologicalIntent) {
    sections.push(
      BIOLOGY_META_MARKER,
      JSON.stringify({ biologicalIntent }),
    )
  }
  return sections.join('\n\n')
}
