/** Map a record `kind` to a Lab route category slug (matches LabCollectionView CATEGORIES). */
export const KIND_TO_LAB_CATEGORY: Record<string, string> = {
  protocol: 'protocols', 'local-protocol': 'protocols',
  material: 'materials', 'material-spec': 'materials', 'material-instance': 'materials', 'material-lot': 'materials',
  labware: 'labware', 'labware-instance': 'labware',
  equipment: 'equipment', instrument: 'equipment', 'calibration-record': 'equipment',
  person: 'people',
  document: 'documents',
  'vendor-pdf': 'vendor-pdfs',
}

/** Map a record `kind` to a human type label. */
export const KIND_LABEL: Record<string, string> = {
  study: 'Project', run: 'Run', claim: 'Claim',
  protocol: 'Protocol', material: 'Material', 'material-spec': 'Material Spec',
  'material-instance': 'Material Instance', 'material-lot': 'Material Lot',
  labware: 'Labware', 'labware-instance': 'Labware Instance',
  equipment: 'Equipment', instrument: 'Instrument', 'calibration-record': 'Calibration',
  person: 'Person', document: 'Document', relationship: 'Relationship',
  'vendor-pdf': 'Vendor PDF',
}

/** Entity-type buckets for search grouping / color coding. */
export type SearchEntityType = 'project' | 'run' | 'claim' | 'lab'

/** Map a record `kind` to its search entity-type bucket (null → not a
 *  first-class, routable entity kind — drop from results). */
export function kindToSearchEntityType(kind: string): SearchEntityType | null {
  if (kind === 'study') return 'project'
  if (kind === 'run') return 'run'
  if (kind === 'claim') return 'claim'
  if (KIND_TO_LAB_CATEGORY[kind]) return 'lab'
  return null
}

/** Resolve a record to its app route. */
export function recordRoute(recordId: string, kind: string, entityType?: SearchEntityType): string {
  const et = entityType ?? kindToSearchEntityType(kind) ?? 'lab'
  switch (et) {
    case 'project':
      return `/project/${recordId}`
    case 'run':
      return `/runs/${recordId}`
    case 'claim':
      return `/claims/${recordId}`
    case 'lab': {
      const cat = KIND_TO_LAB_CATEGORY[kind]
      return cat ? `/lab/${cat}/${recordId}` : `/lab/materials/${recordId}`
    }
  }
}
