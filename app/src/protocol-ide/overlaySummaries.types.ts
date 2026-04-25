/**
 * Frontend types for overlay summaries.
 *
 * These mirror the server-side types from ProtocolIdeOverlaySummaryService
 * but are defined here to avoid re-exporting server types into the frontend
 * bundle.
 */

// ---------------------------------------------------------------------------
// Evidence link
// ---------------------------------------------------------------------------

export interface EvidenceLink {
  nodeId: string
  label: string
  kind: 'event' | 'directive' | 'source-ref' | 'labware' | 'material'
}

// ---------------------------------------------------------------------------
// Deck & labware layout summary
// ---------------------------------------------------------------------------

export interface DeckLabwareEntry {
  slot: string
  labwareType: string
  instanceId?: string
  orientation?: 'landscape' | 'portrait'
  evidenceLinks: EvidenceLink[]
}

export interface DeckSummary {
  summary: string
  slotsInUse: number
  totalSlots: number
  labware: DeckLabwareEntry[]
  pinnedSlots: Array<{ slot: string; labwareHint: string }>
  autoFilledSlots: Array<{ slot: string; labwareHint: string; reason: string }>
  conflicts: Array<{ slot: string; candidates: string[] }>
  evidenceLinks: EvidenceLink[]
}

// ---------------------------------------------------------------------------
// Tools & instrument usage summary
// ---------------------------------------------------------------------------

export interface PipetteEntry {
  type: string
  channels: number
  mountSide?: 'left' | 'right'
  evidenceLinks: EvidenceLink[]
}

export interface ToolsSummary {
  summary: string
  pipettes: PipetteEntry[]
  tipRacks: Array<{ pipetteType: string; rackCount: number }>
  evidenceLinks: EvidenceLink[]
}

// ---------------------------------------------------------------------------
// Reagents & concentrations summary
// ---------------------------------------------------------------------------

export interface ReagentEntry {
  kind: string
  totalVolumeUl: number
  wellCount: number
  concentration?: string
  unit: string
  evidenceLinks: EvidenceLink[]
}

export interface ReagentsSummary {
  summary: string
  reagentCount: number
  reagents: ReagentEntry[]
  evidenceLinks: EvidenceLink[]
}

// ---------------------------------------------------------------------------
// Budget & cost summary
// ---------------------------------------------------------------------------

export interface BudgetLine {
  description: string
  category: string
  estimatedCost?: number
  currency: string
  evidenceLinks: EvidenceLink[]
}

export interface BudgetSummary {
  summary: string
  totalCost?: number
  currency: string
  lines: BudgetLine[]
  evidenceLinks: EvidenceLink[]
}

// ---------------------------------------------------------------------------
// Full overlay summaries payload
// ---------------------------------------------------------------------------

export interface OverlaySummariesPayload {
  deck: DeckSummary | null
  tools: ToolsSummary | null
  reagents: ReagentsSummary | null
  budget: BudgetSummary | null
}
