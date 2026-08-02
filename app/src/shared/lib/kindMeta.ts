/** Map a record `kind` to a Lab route category slug (matches LabCollectionView CATEGORIES). */
export const KIND_TO_LAB_CATEGORY: Record<string, string> = {
  protocol: 'protocols', 'local-protocol': 'protocols',
  material: 'materials', 'material-spec': 'materials', 'material-instance': 'materials', 'material-lot': 'materials',
  labware: 'labware', 'labware-instance': 'labware',
  equipment: 'equipment', instrument: 'equipment', 'calibration-record': 'equipment',
  person: 'people',
  document: 'documents',
}

/** Map a record `kind` to a human type label. */
export const KIND_LABEL: Record<string, string> = {
  study: 'Project', run: 'Run', claim: 'Claim',
  protocol: 'Protocol', material: 'Material', 'material-spec': 'Material Spec',
  'material-instance': 'Material Instance', 'material-lot': 'Material Lot',
  labware: 'Labware', 'labware-instance': 'Labware Instance',
  equipment: 'Equipment', instrument: 'Instrument', 'calibration-record': 'Calibration',
  person: 'Person', document: 'Document', relationship: 'Relationship',
}
