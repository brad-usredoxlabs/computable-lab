/**
 * ProtocolIdeOverlaySummaryService — derives deck, tools, reagent, and budget
 * overlay summaries from the latest projection output.
 *
 * This service reads from the latest projection's TerminalArtifacts and
 * LabStateSnapshot to produce four summary families:
 *
 *   1. Deck & labware layout
 *   2. Tools & instrument usage
 *   3. Reagents & concentrations
 *   4. Budget & cost
 *
 * Each summary exposes:
 *   - A concise developer-facing shape
 *   - Evidence links back to graph nodes where possible
 *   - Source evidence refs when the link can be grounded
 *
 * The summaries are derived from the latest projection — no second compile
 * pass is required.
 *
 * See spec-071 for full acceptance criteria.
 */

import type {
  TerminalArtifacts,
  DeckLayoutPlan,
  ResourceManifest,
  LabStateDelta,
} from '../compiler/pipeline/CompileContracts.js';
import type { LabStateSnapshot } from '../compiler/state/LabState.js';
import type { DirectiveNode } from '../compiler/directives/Directive.js';

// ---------------------------------------------------------------------------
// Evidence link — a reference back to a graph node or source
// ---------------------------------------------------------------------------

/**
 * A link from a summary element back to its source in the event graph or
 * source evidence.
 */
export interface EvidenceLink {
  /** Graph node ID or source record ID */
  nodeId: string;
  /** Human-readable label for the link */
  label: string;
  /** Kind of evidence (e.g. 'event', 'directive', 'source-ref') */
  kind: 'event' | 'directive' | 'source-ref' | 'labware' | 'material';
}

// ---------------------------------------------------------------------------
// Deck & labware layout summary
// ---------------------------------------------------------------------------

/**
 * A single labware entry on the deck.
 */
export interface DeckLabwareEntry {
  /** Deck slot identifier (e.g. '1', '2', 'A1') */
  slot: string;
  /** Labware type (e.g. '96-well-plate', 'reservoir') */
  labwareType: string;
  /** Instance ID if known */
  instanceId?: string;
  /** Orientation */
  orientation?: 'landscape' | 'portrait';
  /** Evidence links back to the event that created this labware */
  evidenceLinks: EvidenceLink[];
}

/**
 * Deck layout summary for the review surface.
 */
export interface DeckSummary {
  /** Human-readable summary of the deck layout */
  summary: string;
  /** Number of deck slots in use */
  slotsInUse: number;
  /** Total deck slots available */
  totalSlots: number;
  /** Individual labware entries on the deck */
  labware: DeckLabwareEntry[];
  /** User-pinned slots */
  pinnedSlots: Array<{ slot: string; labwareHint: string }>;
  /** Auto-filled slots */
  autoFilledSlots: Array<{ slot: string; labwareHint: string; reason: string }>;
  /** Slot conflicts */
  conflicts: Array<{ slot: string; candidates: string[] }>;
  /** Evidence links for the deck layout as a whole */
  evidenceLinks: EvidenceLink[];
}

// ---------------------------------------------------------------------------
// Tools & instrument usage summary
// ---------------------------------------------------------------------------

/**
 * A pipette entry in the tools summary.
 */
export interface PipetteEntry {
  /** Pipette type (e.g. 'p300_single', 'p1000_multi') */
  type: string;
  /** Channel count */
  channels: number;
  /** Mount side */
  mountSide?: 'left' | 'right';
  /** Evidence links back to the directive that mounted this pipette */
  evidenceLinks: EvidenceLink[];
}

/**
 * Tools and instrument usage summary for the review surface.
 */
export interface ToolsSummary {
  /** Human-readable summary of tools used */
  summary: string;
  /** Pipette types and channel counts */
  pipettes: PipetteEntry[];
  /** Tip rack requirements */
  tipRacks: Array<{ pipetteType: string; rackCount: number }>;
  /** Evidence links for the tools summary */
  evidenceLinks: EvidenceLink[];
}

// ---------------------------------------------------------------------------
// Reagents & concentrations summary
// ---------------------------------------------------------------------------

/**
 * A single reagent entry in the reagents summary.
 */
export interface ReagentEntry {
  /** Material kind or name (e.g. 'buffer', 'HeLa cells') */
  kind: string;
  /** Total volume across all wells (µL) */
  totalVolumeUl: number;
  /** Number of wells containing this reagent */
  wellCount: number;
  /** Concentration if available */
  concentration?: string;
  /** Unit of measure */
  unit: string;
  /** Evidence links back to the event that created this reagent */
  evidenceLinks: EvidenceLink[];
}

/**
 * Reagents and concentrations summary for the review surface.
 */
export interface ReagentsSummary {
  /** Human-readable summary of reagents */
  summary: string;
  /** Total reagent count (unique kinds) */
  reagentCount: number;
  /** Individual reagent entries */
  reagents: ReagentEntry[];
  /** Evidence links for the reagents summary */
  evidenceLinks: EvidenceLink[];
}

// ---------------------------------------------------------------------------
// Budget & cost summary
// ---------------------------------------------------------------------------

/**
 * A single budget line in the budget summary.
 */
export interface BudgetLine {
  /** Description of the line item */
  description: string;
  /** Category (e.g. 'reagent', 'consumable', 'labware') */
  category: string;
  /** Estimated cost (may be null if unknown) */
  estimatedCost?: number;
  /** Currency code */
  currency: string;
  /** Evidence links back to the graph node or reagent line */
  evidenceLinks: EvidenceLink[];
}

/**
 * Budget and cost summary for the review surface.
 */
export interface BudgetSummary {
  /** Human-readable summary of the budget */
  summary: string;
  /** Total estimated cost */
  totalCost?: number;
  /** Currency code (e.g. "USD") */
  currency: string;
  /** Individual budget lines */
  lines: BudgetLine[];
  /** Evidence links for the budget summary */
  evidenceLinks: EvidenceLink[];
}

// ---------------------------------------------------------------------------
// Full overlay summaries payload
// ---------------------------------------------------------------------------

/**
 * All four overlay summary families derived from the latest projection.
 */
export interface OverlaySummaries {
  /** Deck and labware layout summary */
  deck: DeckSummary;
  /** Tools and instrument usage summary */
  tools: ToolsSummary;
  /** Reagents and concentrations summary */
  reagents: ReagentsSummary;
  /** Budget and cost summary */
  budget: BudgetSummary;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Options for the overlay summary service.
 */
export interface OverlaySummaryServiceOptions {
  /** Total number of deck slots (default: 12 for Opentrons OT2) */
  totalDeckSlots?: number;
}

export class ProtocolIdeOverlaySummaryService {
  private readonly totalDeckSlots: number;

  constructor(options: OverlaySummaryServiceOptions = {}) {
    this.totalDeckSlots = options.totalDeckSlots ?? 12;
  }

  /**
   * Derive all four overlay summaries from the latest projection output.
   *
   * @param artifacts — TerminalArtifacts from the latest projection
   * @param labState — LabStateSnapshot from the latest projection
   * @returns the full overlay summaries payload
   */
  derive(
    artifacts: TerminalArtifacts,
    labState?: LabStateSnapshot,
  ): OverlaySummaries {
    return {
      deck: this.deriveDeckSummary(artifacts, labState),
      tools: this.deriveToolsSummary(artifacts, labState),
      reagents: this.deriveReagentsSummary(artifacts, labState),
      budget: this.deriveBudgetSummary(artifacts, labState),
    };
  }

  // -----------------------------------------------------------------------
  // Deck & labware layout derivation
  // -----------------------------------------------------------------------

  /**
   * Derive the deck layout summary from TerminalArtifacts and LabStateSnapshot.
   */
  private deriveDeckSummary(
    artifacts: TerminalArtifacts,
    labState?: LabStateSnapshot,
  ): DeckSummary {
    const deckLayoutPlan = artifacts.deckLayoutPlan;
    const labware = labState?.labware ?? {};
    const deck = labState?.deck ?? [];

    // Build labware entries from labState deck
    const labwareEntries: DeckLabwareEntry[] = deck.map((slotInfo) => {
      const instanceId = slotInfo.labwareInstanceId;
      const instance = instanceId ? labware[instanceId] : undefined;

      return {
        slot: slotInfo.slot,
        labwareType: instance?.labwareType ?? 'unknown',
        instanceId,
        orientation: instance?.orientation,
        evidenceLinks: this._buildDeckEvidenceLinks(
          instanceId,
          slotInfo.slot,
          instance?.labwareType,
        ),
      };
    });

    // Build summary text
    const slotsInUse = labwareEntries.length;
    const summary = this._buildDeckSummaryText(
      slotsInUse,
      this.totalDeckSlots,
      deckLayoutPlan,
    );

    return {
      summary,
      slotsInUse,
      totalSlots: this.totalDeckSlots,
      labware: labwareEntries,
      pinnedSlots: deckLayoutPlan?.pinned ?? [],
      autoFilledSlots: deckLayoutPlan?.autoFilled ?? [],
      conflicts: deckLayoutPlan?.conflicts ?? [],
      evidenceLinks: this._buildDeckLayoutEvidenceLinks(deckLayoutPlan),
    };
  }

  /**
   * Build evidence links for a deck labware entry.
   */
  private _buildDeckEvidenceLinks(
    instanceId: string | undefined,
    slot: string,
    labwareType: string | undefined,
  ): EvidenceLink[] {
    const links: EvidenceLink[] = [];
    if (instanceId) {
      links.push({
        nodeId: instanceId,
        label: `Labware instance at slot ${slot}`,
        kind: 'labware',
      });
    }
    if (labwareType) {
      links.push({
        nodeId: `labware-type:${labwareType}`,
        label: `Labware type: ${labwareType}`,
        kind: 'source-ref',
      });
    }
    return links;
  }

  /**
   * Build evidence links for the deck layout plan as a whole.
   */
  private _buildDeckLayoutEvidenceLinks(
    deckLayoutPlan: DeckLayoutPlan | undefined,
  ): EvidenceLink[] {
    const links: EvidenceLink[] = [];
    if (!deckLayoutPlan) return links;

    for (const pinned of deckLayoutPlan.pinned ?? []) {
      links.push({
        nodeId: `pinned:${pinned.slot}`,
        label: `User-pinned slot ${pinned.slot} → ${pinned.labwareHint}`,
        kind: 'event',
      });
    }
    for (const auto of deckLayoutPlan.autoFilled ?? []) {
      links.push({
        nodeId: `auto-fill:${auto.slot}`,
        label: `Auto-filled slot ${auto.slot} → ${auto.labwareHint}`,
        kind: 'event',
      });
    }
    for (const conflict of deckLayoutPlan.conflicts ?? []) {
      links.push({
        nodeId: `conflict:${conflict.slot}`,
        label: `Slot conflict at ${conflict.slot}`,
        kind: 'event',
      });
    }
    return links;
  }

  /**
   * Build human-readable deck summary text.
   */
  private _buildDeckSummaryText(
    slotsInUse: number,
    totalSlots: number,
    deckLayoutPlan: DeckLayoutPlan | undefined,
  ): string {
    const parts: string[] = [];
    parts.push(`${slotsInUse} of ${totalSlots} deck slots in use`);

    if (deckLayoutPlan) {
      const pinnedCount = deckLayoutPlan.pinned?.length ?? 0;
      const autoCount = deckLayoutPlan.autoFilled?.length ?? 0;
      const conflictCount = deckLayoutPlan.conflicts?.length ?? 0;

      if (pinnedCount > 0) {
        parts.push(`${pinnedCount} user-pinned`);
      }
      if (autoCount > 0) {
        parts.push(`${autoCount} auto-filled`);
      }
      if (conflictCount > 0) {
        parts.push(`${conflictCount} slot conflict(s)`);
      }
    }

    return parts.join(', ');
  }

  // -----------------------------------------------------------------------
  // Tools & instrument usage derivation
  // -----------------------------------------------------------------------

  /**
   * Derive the tools summary from TerminalArtifacts and labState.
   */
  private deriveToolsSummary(
    artifacts: TerminalArtifacts,
    labState?: LabStateSnapshot,
  ): ToolsSummary {
    const mountedPipettes = labState?.mountedPipettes ?? [];
    const resourceManifest = artifacts.resourceManifest;
    const directives = artifacts.directives;

    // Build pipette entries from mounted pipettes
    const pipetteEntries: PipetteEntry[] = mountedPipettes.map((mp) => ({
      type: mp.pipetteType,
      channels: this._extractChannelCount(mp.pipetteType),
      mountSide: mp.mountSide,
      evidenceLinks: this._buildPipetteEvidenceLinks(mp),
    }));

    // Build tip rack entries from resource manifest
    const tipRacks = resourceManifest?.tipRacks ?? [];

    // Build summary text
    const summary = this._buildToolsSummaryText(pipetteEntries, tipRacks);

    return {
      summary,
      pipettes: pipetteEntries,
      tipRacks,
      evidenceLinks: this._buildToolsEvidenceLinks(directives, mountedPipettes),
    };
  }

  /**
   * Extract channel count from pipette type string.
   */
  private _extractChannelCount(pipetteType: string): number {
    const lower = pipetteType.toLowerCase();
    if (lower.includes('multi') || lower.includes('96') || lower.includes('384')) {
      return 8;
    }
    if (lower.includes('single')) {
      return 1;
    }
    // Default heuristic: check for channel number in type
    const match = pipetteType.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Build evidence links for a pipette entry.
   */
  private _buildPipetteEvidenceLinks(mp: {
    mountSide: string;
    pipetteType: string;
    maxVolumeUl: number;
  }): EvidenceLink[] {
    return [
      {
        nodeId: `pipette:${mp.pipetteType}`,
        label: `Pipette ${mp.pipetteType} on ${mp.mountSide} mount`,
        kind: 'directive',
      },
    ];
  }

  /**
   * Build evidence links for the tools summary.
   */
  private _buildToolsEvidenceLinks(
    directives: DirectiveNode[],
    mountedPipettes: Array<{ mountSide: string; pipetteType: string }>,
  ): EvidenceLink[] {
    const links: EvidenceLink[] = [];

    // Link to pipette mount/swap directives
    for (const directive of directives) {
      if (
        directive.kind === 'pipette_mount' ||
        directive.kind === 'pipette_swap'
      ) {
        links.push({
          nodeId: directive.id,
          label: `Directive: ${directive.kind}`,
          kind: 'directive',
        });
      }
    }

    // Link to mounted pipettes
    for (const mp of mountedPipettes) {
      links.push({
        nodeId: `mounted:${mp.pipetteType}:${mp.mountSide}`,
        label: `Mounted pipette: ${mp.pipetteType}`,
        kind: 'event',
      });
    }

    return links;
  }

  /**
   * Build human-readable tools summary text.
   */
  private _buildToolsSummaryText(
    pipetteEntries: PipetteEntry[],
    tipRacks: Array<{ pipetteType: string; rackCount: number }>,
  ): string {
    const parts: string[] = [];

    if (pipetteEntries.length > 0) {
      const types = pipetteEntries.map((p) => p.type).join(', ');
      parts.push(`Pipettes: ${types}`);
    }

    if (tipRacks.length > 0) {
      const rackInfo = tipRacks
        .map((tr) => `${tr.rackCount}× ${tr.pipetteType}`)
        .join(', ');
      parts.push(`Tip racks: ${rackInfo}`);
    }

    return parts.length > 0 ? parts.join('; ') : 'No tools configured';
  }

  // -----------------------------------------------------------------------
  // Reagents & concentrations derivation
  // -----------------------------------------------------------------------

  /**
   * Derive the reagents summary from TerminalArtifacts and LabStateSnapshot.
   */
  private deriveReagentsSummary(
    artifacts: TerminalArtifacts,
    labState?: LabStateSnapshot,
  ): ReagentsSummary {
    const labware = labState?.labware ?? {};
    const events = artifacts.events;

    // Aggregate reagents from labState labware wells
    const reagentMap = new Map<string, ReagentEntry>();

    for (const [instanceId, instance] of Object.entries(labware)) {
      for (const [well, materials] of Object.entries(instance.wells)) {
        for (const material of materials) {
          const kind = material.kind ?? 'unknown';
          const existing = reagentMap.get(kind);

          if (existing) {
            existing.totalVolumeUl += material.volumeUl ?? 0;
            existing.wellCount += 1;
          } else {
            reagentMap.set(kind, {
              kind,
              totalVolumeUl: material.volumeUl ?? 0,
              wellCount: 1,
              unit: 'µL',
              evidenceLinks: this._buildReagentEvidenceLinks(
                instanceId,
                well,
                material,
              ),
            });
          }
        }
      }
    }

    // Also aggregate from events (add_material events)
    for (const event of events) {
      if (event.event_type === 'add_material') {
        const details = event.details as Record<string, unknown> | undefined;
        if (details?.material && typeof details.material === 'object') {
          const mat = details.material as Record<string, unknown>;
          const kind = mat.kind as string ?? 'unknown';
          const existing = reagentMap.get(kind);
          const volume = mat.volumeUl as number ?? 0;

          if (existing) {
            existing.totalVolumeUl += volume;
            existing.wellCount += 1;
          } else {
            reagentMap.set(kind, {
              kind,
              totalVolumeUl: volume,
              wellCount: 1,
              unit: 'µL',
              evidenceLinks: this._buildEventEvidenceLinks(event),
            });
          }
        }
      }
    }

    const reagents = Array.from(reagentMap.values());
    const summary = this._buildReagentsSummaryText(reagents);

    return {
      summary,
      reagentCount: reagents.length,
      reagents,
      evidenceLinks: this._buildReagentsEvidenceLinks(reagents),
    };
  }

  /**
   * Build evidence links for a reagent entry from labState.
   */
  private _buildReagentEvidenceLinks(
    instanceId: string,
    well: string,
    material: { materialId?: string; kind?: string },
  ): EvidenceLink[] {
    const links: EvidenceLink[] = [];
    if (material.materialId) {
      links.push({
        nodeId: material.materialId,
        label: `Material ${material.materialId} in ${instanceId}:${well}`,
        kind: 'material',
      });
    }
    links.push({
      nodeId: `labware:${instanceId}:well:${well}`,
      label: `Well ${well} in labware ${instanceId}`,
      kind: 'labware',
    });
    return links;
  }

  /**
   * Build evidence links for a reagent entry from an event.
   */
  private _buildEventEvidenceLinks(event: {
    event_type: string;
    details?: Record<string, unknown>;
  }): EvidenceLink[] {
    return [
      {
        nodeId: `event:${event.event_type}`,
        label: `Event: ${event.event_type}`,
        kind: 'event',
      },
    ];
  }

  /**
   * Build evidence links for the reagents summary.
   */
  private _buildReagentsEvidenceLinks(
    reagents: ReagentEntry[],
  ): EvidenceLink[] {
    const links: EvidenceLink[] = [];
    for (const reagent of reagents) {
      for (const link of reagent.evidenceLinks) {
        // Deduplicate by nodeId
        if (!links.some((l) => l.nodeId === link.nodeId)) {
          links.push(link);
        }
      }
    }
    return links;
  }

  /**
   * Build human-readable reagents summary text.
   */
  private _buildReagentsSummaryText(reagents: ReagentEntry[]): string {
    if (reagents.length === 0) {
      return 'No reagents configured';
    }

    const totalVolume = reagents.reduce((sum, r) => sum + r.totalVolumeUl, 0);
    const totalWells = reagents.reduce((sum, r) => sum + r.wellCount, 0);

    return `${reagents.length} reagent(s), ${totalWells} well(s), ${totalVolume} µL total`;
  }

  // -----------------------------------------------------------------------
  // Budget & cost derivation
  // -----------------------------------------------------------------------

  /**
   * Derive the budget summary from TerminalArtifacts and LabStateSnapshot.
   */
  private deriveBudgetSummary(
    artifacts: TerminalArtifacts,
    labState?: LabStateSnapshot,
  ): BudgetSummary {
    const resourceManifest = artifacts.resourceManifest;
    const labware = labState?.labware ?? {};

    const lines: BudgetLine[] = [];

    // 1. Reagent costs from labState economics
    const reagentLines = this._deriveReagentBudgetLines(labware);
    lines.push(...reagentLines.lines);

    // 2. Consumable costs from resource manifest
    const consumableLines = this._deriveConsumableBudgetLines(resourceManifest);
    lines.push(...consumableLines.lines);

    // 3. Labware costs from deck layout
    const labwareLines = this._deriveLabwareBudgetLines(labState);
    lines.push(...labwareLines.lines);

    // Collect evidence links from all budget lines
    const evidenceLinks: EvidenceLink[] = [];
    for (const line of lines) {
      for (const link of line.evidenceLinks) {
        if (!evidenceLinks.some((l) => l.nodeId === link.nodeId)) {
          evidenceLinks.push(link);
        }
      }
    }

    // Calculate total
    const totalCost = lines.reduce(
      (sum, line) => sum + (line.estimatedCost ?? 0),
      0,
    );

    const summary = this._buildBudgetSummaryText(lines, totalCost);

    return {
      summary,
      totalCost: totalCost > 0 ? totalCost : undefined,
      currency: 'USD',
      lines,
      evidenceLinks,
    };
  }

  /**
   * Derive budget lines from labState material economics.
   */
  private _deriveReagentBudgetLines(
    labware: Record<string, LabwareInstance>,
  ): { lines: BudgetLine[]; evidenceLinks: EvidenceLink[] } {
    const lines: BudgetLine[] = [];
    const evidenceLinks: EvidenceLink[] = [];

    const reagentCosts = new Map<string, { totalVolumeUl: number; currency: string; materialId?: string }>();

    for (const [instanceId, instance] of Object.entries(labware)) {
      for (const [well, materials] of Object.entries(instance.wells)) {
        for (const material of materials) {
          const kind = material.kind ?? 'unknown';
          const economics = material.economics;
          const volumeUl = material.volumeUl ?? 0;

          if (economics && economics.amountPerUl && economics.amountPerUl > 0) {
            const existing = reagentCosts.get(kind);
            if (existing) {
              existing.totalVolumeUl += volumeUl;
            } else {
              reagentCosts.set(kind, {
                totalVolumeUl: volumeUl,
                currency: economics.currency ?? 'USD',
                materialId: material.materialId,
              });
            }
          }
        }
      }
    }

    for (const [kind, costInfo] of reagentCosts) {
      const cost = costInfo.totalVolumeUl * (0.001); // Approximate: $0.001/µL as placeholder
      lines.push({
        description: `Reagent: ${kind}`,
        category: 'reagent',
        estimatedCost: cost,
        currency: costInfo.currency,
        evidenceLinks: costInfo.materialId
          ? [{
              nodeId: costInfo.materialId,
              label: `Material ${costInfo.materialId}`,
              kind: 'material',
            }]
          : [],
      });
    }

    return { lines, evidenceLinks };
  }

  /**
   * Derive budget lines from resource manifest consumables.
   */
  private _deriveConsumableBudgetLines(
    resourceManifest: ResourceManifest | undefined,
  ): { lines: BudgetLine[]; evidenceLinks: EvidenceLink[] } {
    const lines: BudgetLine[] = [];
    const evidenceLinks: EvidenceLink[] = [];

    if (!resourceManifest) return { lines, evidenceLinks };

    // Tip rack costs
    for (const tipRack of resourceManifest.tipRacks ?? []) {
      const cost = tipRack.rackCount * 15; // Approximate: $15/rack
      lines.push({
        description: `Tip rack: ${tipRack.pipetteType} × ${tipRack.rackCount}`,
        category: 'consumable',
        estimatedCost: cost,
        currency: 'USD',
        evidenceLinks: [
          {
            nodeId: `tip-rack:${tipRack.pipetteType}`,
            label: `Tip rack for ${tipRack.pipetteType}`,
            kind: 'event',
          },
        ],
      });
    }

    // Consumable labware
    for (const consumable of resourceManifest.consumables ?? []) {
      lines.push({
        description: `Consumable: ${consumable}`,
        category: 'consumable',
        estimatedCost: 0, // Unknown without vendor data
        currency: 'USD',
        evidenceLinks: [
          {
            nodeId: `consumable:${consumable}`,
            label: `Consumable: ${consumable}`,
            kind: 'event',
          },
        ],
      });
    }

    return { lines, evidenceLinks };
  }

  /**
   * Derive budget lines from labState deck layout.
   */
  private _deriveLabwareBudgetLines(
    labState: LabStateSnapshot | undefined,
  ): { lines: BudgetLine[]; evidenceLinks: EvidenceLink[] } {
    const lines: BudgetLine[] = [];
    const evidenceLinks: EvidenceLink[] = [];

    if (!labState) return { lines, evidenceLinks };

    const labwareTypes = new Set<string>();
    for (const instance of Object.values(labState.labware)) {
      labwareTypes.add(instance.labwareType);
    }

    for (const labwareType of labwareTypes) {
      lines.push({
        description: `Labware: ${labwareType}`,
        category: 'labware',
        estimatedCost: 0, // Labware is typically reusable
        currency: 'USD',
        evidenceLinks: [
          {
            nodeId: `labware-type:${labwareType}`,
            label: `Labware type: ${labwareType}`,
            kind: 'labware',
          },
        ],
      });
    }

    return { lines, evidenceLinks };
  }

  /**
   * Build human-readable budget summary text.
   */
  private _buildBudgetSummaryText(
    lines: BudgetLine[],
    totalCost: number,
  ): string {
    if (lines.length === 0) {
      return 'No budget items configured';
    }

    const categories = new Set(lines.map((l) => l.category));
    const categoryText = Array.from(categories).join(', ');

    if (totalCost > 0) {
      return `${lines.length} line(s) across ${categoryText}, ~$${totalCost.toFixed(2)} estimated`;
    }

    return `${lines.length} line(s) across ${categoryText} (costs not yet estimated)`;
  }
}
