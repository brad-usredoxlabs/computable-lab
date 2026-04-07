import type { InstrumentDefinition, MeasurementContextRecord } from '../../shared/api/client'

export interface ReadoutContextMetadata {
  readEventIds: string[]
  qcControlIds: string[]
}

export const BIOLOGY_CONTEXT_TAG = 'context:biology'
export const AUTO_CONTEXT_TAG = 'context:auto'

export interface ReadoutNotesFields {
  generalNotes: string
  expectationNotes: string
  qcNotes: string
  qcAssignments: Record<string, string[]>
}

export interface ReadoutQcOption {
  id: string
  label: string
  description: string
  instrumentTypes: InstrumentDefinition['instrument_type'][]
}

export const READOUT_QC_OPTIONS: ReadoutQcOption[] = [
  {
    id: 'blank_background',
    label: 'Blank / Background',
    description: 'Checks instrument and reagent background without biological signal.',
    instrumentTypes: ['plate_reader', 'microscopy', 'other'],
  },
  {
    id: 'no_dye_control',
    label: 'No-Dye Control',
    description: 'Separates reporter chemistry from native fluorescence or absorbance.',
    instrumentTypes: ['plate_reader', 'microscopy'],
  },
  {
    id: 'no_template_control',
    label: 'No-Template Control',
    description: 'Confirms qPCR reactions stay negative without template input.',
    instrumentTypes: ['qpcr'],
  },
  {
    id: 'housekeeping_control',
    label: 'Housekeeping / Reference',
    description: 'Provides within-assay normalization for nucleic acid readouts.',
    instrumentTypes: ['qpcr'],
  },
  {
    id: 'internal_standard',
    label: 'Internal Standard',
    description: 'Tracks extraction and instrument drift for MS workflows.',
    instrumentTypes: ['gc_ms', 'lc_ms'],
  },
  {
    id: 'blank_injection',
    label: 'Blank Injection',
    description: 'Checks carryover and background peaks between MS runs.',
    instrumentTypes: ['gc_ms', 'lc_ms'],
  },
]

const READOUT_META_MARKER = '[computable-lab/readout-meta]'

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function parseReadoutContextMetadata(context: Pick<MeasurementContextRecord, 'tags'>): ReadoutContextMetadata {
  const tags = Array.isArray(context.tags) ? context.tags : []
  const readEventIds = unique(
    tags
      .filter((tag) => tag.startsWith('read_event:'))
      .map((tag) => tag.slice('read_event:'.length)),
  )
  const qcControlIds = unique(
    tags
      .filter((tag) => tag.startsWith('qc:'))
      .map((tag) => tag.slice('qc:'.length)),
  )
  return { readEventIds, qcControlIds }
}

export function isBiologyContext(context: Pick<MeasurementContextRecord, 'tags'>): boolean {
  const tags = Array.isArray(context.tags) ? context.tags : []
  return tags.includes(BIOLOGY_CONTEXT_TAG)
}

export function buildBiologyContextTags(existingTags?: string[]): string[] {
  const base = Array.isArray(existingTags) ? existingTags.filter((tag) => !tag.startsWith('read_event:') && !tag.startsWith('qc:')) : []
  return unique([...base, BIOLOGY_CONTEXT_TAG, AUTO_CONTEXT_TAG])
}

export function buildReadoutContextTags(args: {
  existingTags?: string[]
  readEventId?: string | null
  qcControlIds?: string[]
}): string[] {
  const baseTags = (args.existingTags || []).filter((tag) => !tag.startsWith('read_event:') && !tag.startsWith('qc:'))
  if (args.readEventId) baseTags.push(`read_event:${args.readEventId}`)
  for (const qcId of args.qcControlIds || []) {
    baseTags.push(`qc:${qcId}`)
  }
  return unique(baseTags)
}

export function inferInstrumentTypeFromRead(args: {
  instrument?: string
  assayRef?: string
}): InstrumentDefinition['instrument_type'] {
  const haystack = `${args.instrument || ''} ${args.assayRef || ''}`.toLowerCase()
  if (haystack.includes('qpcr') || haystack.includes('quantstudio') || haystack.includes('ct ')) return 'qpcr'
  if (haystack.includes('gc-ms') || haystack.includes('gc ms') || haystack.includes('gcms')) return 'gc_ms'
  if (haystack.includes('lc-ms') || haystack.includes('lc ms') || haystack.includes('lcms')) return 'lc_ms'
  if (haystack.includes('microscop') || haystack.includes('image')) return 'microscopy'
  if (haystack.includes('plate') || haystack.includes('fluor') || haystack.includes('absorb') || haystack.includes('lumin')) return 'plate_reader'
  return 'plate_reader'
}

export function summarizeQcControls(qcControlIds: string[]): string {
  if (qcControlIds.length === 0) return 'No explicit QC controls'
  return qcControlIds
    .map((id) => READOUT_QC_OPTIONS.find((option) => option.id === id)?.label || id.replace(/_/g, ' '))
    .join(' · ')
}

export function defaultQcControlsForInstrumentType(
  instrumentType: InstrumentDefinition['instrument_type'],
): string[] {
  switch (instrumentType) {
    case 'qpcr':
      return ['no_template_control', 'housekeeping_control']
    case 'gc_ms':
    case 'lc_ms':
      return ['internal_standard', 'blank_injection']
    case 'plate_reader':
    case 'microscopy':
      return ['blank_background', 'no_dye_control']
    default:
      return ['blank_background']
  }
}

export function parseReadoutNotes(notes?: string): ReadoutNotesFields {
  const text = (notes || '').trim()
  if (!text) {
    return { generalNotes: '', expectationNotes: '', qcNotes: '', qcAssignments: {} }
  }
  const markerIndex = text.indexOf(READOUT_META_MARKER)
  if (markerIndex === -1) {
    return { generalNotes: text, expectationNotes: '', qcNotes: '', qcAssignments: {} }
  }
  const generalNotes = text.slice(0, markerIndex).trim()
  const rawMeta = text.slice(markerIndex + READOUT_META_MARKER.length).trim()
  try {
    const parsed = JSON.parse(rawMeta) as Partial<ReadoutNotesFields>
    const qcAssignments = typeof parsed.qcAssignments === 'object' && parsed.qcAssignments
      ? Object.fromEntries(
          Object.entries(parsed.qcAssignments).map(([key, value]) => [
            key,
            Array.isArray(value) ? unique(value.filter((item): item is string => typeof item === 'string')) : [],
          ]),
        )
      : {}
    return {
      generalNotes,
      expectationNotes: typeof parsed.expectationNotes === 'string' ? parsed.expectationNotes : '',
      qcNotes: typeof parsed.qcNotes === 'string' ? parsed.qcNotes : '',
      qcAssignments,
    }
  } catch {
    return { generalNotes: text, expectationNotes: '', qcNotes: '', qcAssignments: {} }
  }
}

export function buildReadoutNotes(fields: ReadoutNotesFields): string | undefined {
  const generalNotes = fields.generalNotes.trim()
  const expectationNotes = fields.expectationNotes.trim()
  const qcNotes = fields.qcNotes.trim()
  const qcAssignments = Object.fromEntries(
    Object.entries(fields.qcAssignments || {})
      .map(([key, wells]) => [key, unique((wells || []).filter(Boolean))])
      .filter(([, wells]) => wells.length > 0),
  )
  if (!generalNotes && !expectationNotes && !qcNotes && Object.keys(qcAssignments).length === 0) return undefined
  const sections: string[] = []
  if (generalNotes) sections.push(generalNotes)
  if (expectationNotes || qcNotes || Object.keys(qcAssignments).length > 0) {
    sections.push(
      READOUT_META_MARKER,
      JSON.stringify({
        expectationNotes,
        qcNotes,
        qcAssignments,
      }),
    )
  }
  return sections.join('\n\n')
}
