import type { ExtractionDiagnostic } from '../../extract/ExtractorAdapter.js';

export interface VendorProtocolProvenance {
  documentId: string;
  pageStart: number;
  pageEnd?: number;
  sectionId?: string;
  spanStart?: number;
  spanEnd?: number;
}

export interface VendorProtocolSource {
  documentId: string;
  filename: string;
  vendor?: string;
  title?: string;
  version?: string;
  pageCount: number;
}

export interface VendorProtocolPage {
  pageNumber: number;
  text: string;
}

export type VendorProtocolSectionKind =
  | 'cover'
  | 'table_of_contents'
  | 'product_contents'
  | 'specifications'
  | 'product_description'
  | 'protocol'
  | 'appendix'
  | 'troubleshooting'
  | 'ordering_information'
  | 'workflow'
  | 'notes'
  | 'guarantee'
  | 'other';

export interface VendorProtocolSection {
  id: string;
  kind: VendorProtocolSectionKind;
  title: string;
  sourceText: string;
  provenance: VendorProtocolProvenance;
}

export interface VendorProtocolTable {
  id: string;
  title: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  sourceText: string;
  provenance: VendorProtocolProvenance;
}

export interface VendorProtocolDocument {
  source: VendorProtocolSource;
  text: string;
  pages: VendorProtocolPage[];
  sections: VendorProtocolSection[];
  tables: VendorProtocolTable[];
  diagnostics: ExtractionDiagnostic[];
}

export interface ExtractedScalarQuantity {
  raw: string;
  value?: number;
  unit?: string;
}

export interface ExtractedCandidateItem {
  id: string;
  label: string;
  sourceText: string;
  provenance: VendorProtocolProvenance;
  confidence: number;
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived';
  role?: string;
  quantity?: string;
}

export interface ProtocolActionCandidate {
  actionKind:
    | 'add'
    | 'mix'
    | 'transfer'
    | 'aspirate'
    | 'discard'
    | 'incubate'
    | 'centrifuge'
    | 'magnetize'
    | 'dry'
    | 'elute'
    | 'seal'
    | 'repeat'
    | 'other';
  sourceText: string;
  target?: string;
  source?: string;
  material?: string;
  volume?: ExtractedScalarQuantity;
  duration?: ExtractedScalarQuantity;
  temperature?: ExtractedScalarQuantity;
  speed?: ExtractedScalarQuantity;
  wellSelector?: string;
  equipment?: string;
  provenance: VendorProtocolProvenance;
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived';
}

export interface ProtocolStepCandidate {
  id: string;
  stepNumber: number;
  substep?: string;
  sourceText: string;
  actions: ProtocolActionCandidate[];
  conditions: {
    volumes?: ExtractedScalarQuantity[];
    durations?: ExtractedScalarQuantity[];
    temperatures?: ExtractedScalarQuantity[];
    speeds?: ExtractedScalarQuantity[];
  };
  materials: string[];
  labware: string[];
  equipment: string[];
  notes: string[];
  branches: string[];
  provenance: VendorProtocolProvenance;
  confidence: number;
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived';
}

export interface ProtocolCandidate {
  kind: 'vendor-protocol-candidate';
  source: VendorProtocolSource;
  title: string;
  scope?: string;
  sections: Array<{
    id: string;
    kind: VendorProtocolSectionKind;
    title: string;
    provenance: VendorProtocolProvenance;
  }>;
  materials: ExtractedCandidateItem[];
  equipment: ExtractedCandidateItem[];
  labware: ExtractedCandidateItem[];
  steps: ProtocolStepCandidate[];
  tables: VendorProtocolTable[];
  notes: ExtractedCandidateItem[];
  outputs: ExtractedCandidateItem[];
  diagnostics: ExtractionDiagnostic[];
}

export interface NormalizedProtocolRole {
  roleId: string;
  label: string;
  normalizedId?: string;
  roleKind: 'material' | 'labware' | 'instrument' | 'output';
  status: 'resolved' | 'manual' | 'unresolved';
  sourceLabels: string[];
  provenance?: VendorProtocolProvenance;
  notes?: string[];
}

export interface NormalizedProtocolCandidate {
  kind: 'normalized-vendor-protocol-candidate';
  source: VendorProtocolSource;
  title: string;
  candidate: ProtocolCandidate;
  materialRoles: NormalizedProtocolRole[];
  labwareRoles: NormalizedProtocolRole[];
  instrumentRoles: NormalizedProtocolRole[];
  outputRoles: NormalizedProtocolRole[];
  diagnostics: ExtractionDiagnostic[];
  gaps: ProtocolAdaptationGap[];
}

export interface ProtocolAdaptationGap {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  sourceStepNumbers?: number[];
  provenance?: VendorProtocolProvenance;
}

export interface ProtocolAdaptationRoleBinding {
  roleId: string;
  label: string;
  binding: string;
  status: 'resolved' | 'manual' | 'unresolved';
  reason: string;
}

export interface ReservoirAllocation {
  roleId: string;
  materialLabel: string;
  preferredWell: string;
  wells: Array<{ well: string; loadVolumeUl: number }>;
  perSampleVolumeUl: number;
  sampleCount: number;
  totalTransferVolumeUl: number;
  deadVolumeUl: number;
  requiredVolumeUl: number;
  requiredWells: number;
  capacityPerWellUl: number;
  warning?: string;
}

export interface ProtocolReservoirPlan {
  reservoirRoleId: string;
  reservoirLabwareType: string;
  wellCapacityUl: number;
  totalCapacityUl: number;
  sampleCount: number;
  deadVolumePolicy: {
    kind: 'percent-plus-minimum';
    percent: number;
    minimumUl: number;
  };
  allocations: ReservoirAllocation[];
  totalRequiredVolumeUl: number;
  totalAllocatedVolumeUl: number;
  unallocatedRequiredVolumeUl: number;
}

export interface ProtocolStepAdaptation {
  stepNumber: number;
  sourceText: string;
  support: 'automatable' | 'manual' | 'partial' | 'unresolved';
  adaptedActions: Array<{
    actionKind: string;
    support: 'automatable' | 'manual' | 'unresolved';
    eventHint?: string;
    roleRefs?: string[];
    reason: string;
  }>;
  provenance: VendorProtocolProvenance;
}

export interface ProtocolManualStep {
  stepNumber: number;
  reason: string;
  equipmentRoles: string[];
  sourceText: string;
  provenance: VendorProtocolProvenance;
}

export interface ProtocolAdaptationPlan {
  kind: 'protocol-adaptation-plan';
  protocolTitle: string;
  targetFormat: {
    request: string;
    primaryLabwareType: string;
    sampleCount: number;
    sampleWellSelector: { role: 'all_wells'; count: number };
  };
  labwareRoles: ProtocolAdaptationRoleBinding[];
  materialRoles: ProtocolAdaptationRoleBinding[];
  instrumentRoles: ProtocolAdaptationRoleBinding[];
  deckPlanHints: Array<{ roleId: string; labwareType: string; preferredSlot?: string; reason: string }>;
  reservoirPlan: ProtocolReservoirPlan;
  stepPlan: ProtocolStepAdaptation[];
  manualSteps: ProtocolManualStep[];
  compileAssumptions: string[];
  gaps: ProtocolAdaptationGap[];
  sourceProtocolRef: {
    documentId: string;
    title: string;
    version?: string;
  };
}

export interface VendorEventGraphProposal {
  kind: 'vendor-event-graph-proposal';
  sourceProtocolRef: ProtocolAdaptationPlan['sourceProtocolRef'];
  adaptationPlan: ProtocolAdaptationPlan;
  eventGraph: {
    id: string;
    name: string;
    description: string;
    status: 'draft';
    events: Array<{
      eventId: string;
      event_type: string;
      details: Record<string, unknown>;
      notes?: string;
    }>;
    labwares: Array<{
      labwareId: string;
      labwareType: string;
      name: string;
      notes?: string;
    }>;
    deckLayout: {
      placements: Array<{ slotId: string; labwareId: string }>;
    };
    tags: string[];
  };
  labwareAdditions: Array<{ labwareId: string; labwareType: string; roleId: string; reason: string }>;
  manualActions: ProtocolManualStep[];
  resourceManifest: {
    tipRacks: Array<{ pipetteType: string; rackCount: number }>;
    reservoirLoads: Array<{
      reservoirRef: string;
      well: string;
      reagentKind: string;
      volumeUl: number;
    }>;
    consumables: string[];
  };
  validationReport: {
    findings: Array<{
      severity: 'error' | 'warning' | 'info';
      category: string;
      message: string;
      suggestion?: string;
      details?: Record<string, unknown>;
      affectedIds?: string[];
    }>;
  };
  gaps: ProtocolAdaptationGap[];
}
