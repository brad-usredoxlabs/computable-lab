/**
 * ProcurementManifestService
 *
 * Derives procurement requirement lines from planned-run bindings and
 * event-graph/compiler evidence. Each line carries a stable `requirementId`,
 * category, description, quantity hint, unit, provenance summary, and
 * coverage status (explicit | inferred | unresolved).
 *
 * Provenance rules:
 * - "explicit"  → directly from planned-run.bindings.materials or labware
 * - "inferred"  → derived from event-graph transfer counts (e.g. tip usage)
 * - "unresolved" → required but no concrete material/labware reference found
 */

import type { RecordEnvelope } from '../store/types.js';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Provenance = 'explicit' | 'inferred' | 'unresolved';
export type CoverageStatus = 'covered' | 'partial' | 'uncovered';
export type RequirementCategory =
  | 'reagent'
  | 'consumable'
  | 'labware'
  | 'cell-line'
  | 'instrument-supply'
  | 'other';

export interface RequirementLine {
  /** Stable identifier within the manifest scope. */
  requirementId: string;
  /** High-level category. */
  category: RequirementCategory;
  /** Human-readable description. */
  description: string;
  /** Quantity hint (may be approximate). */
  quantityHint: number;
  /** Unit of measure (e.g. mL, µL, pcs, vials). */
  unit: string;
  /** Where this requirement came from. */
  provenance: Provenance;
  /** Summary of the source that drove this line. */
  provenanceSummary: string;
  /** Whether vendor coverage is known. */
  coverageStatus: CoverageStatus;
  /** Optional: the material/labware reference that drove this line. */
  sourceRef?: string;
}

export interface ProcurementManifest {
  /** The derived requirement lines. */
  lines: RequirementLine[];
  /** Timestamp of derivation. */
  derivedAt: string;
  /** Source planned-run ID. */
  sourcePlannedRunId: string;
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface PlannedRunBindings {
  materials?: Array<{
    roleId: string;
    materialRef?: { id?: string; type?: string; label?: string };
    lotNumber?: string;
  }>;
  labware?: Array<{
    roleId: string;
    labwareInstanceRef?: { id?: string; type?: string; label?: string };
    labwareGeometryRef?: { id?: string };
  }>;
}

export interface EventGraphSummary {
  events?: Array<{
    eventType?: string;
    volume?: number;
    volumeUnit?: string;
    pipetteChannelCount?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProcurementManifestService {
  /**
   * Derive a procurement manifest from a planned-run envelope and optional
   * event-graph summary.
   *
   * @param plannedRunEnvelope – the planned-run record envelope
   * @param eventGraphSummary  – optional event-graph data for inferred lines
   * @returns the derived manifest
   */
  derive(
    plannedRunEnvelope: RecordEnvelope,
    eventGraphSummary?: EventGraphSummary,
  ): ProcurementManifest {
    const payload = plannedRunEnvelope.payload as Record<string, unknown>;
    const bindings = (payload.bindings as PlannedRunBindings) ?? {};
    const lines: RequirementLine[] = [];
    let seq = 1;

    // 1. Explicit material requirements
    const materials = bindings.materials ?? [];
    for (const mat of materials) {
      const materialRef = mat.materialRef as { id?: string; type?: string; label?: string } | undefined;
      const materialId = materialRef?.id ?? `unknown-material-${seq}`;
      const materialLabel = materialRef?.label ?? mat.roleId;
      const materialType = materialRef?.type ?? 'reagent';

      // Determine category from material type
      const category = this._inferCategory(materialType);
      const description = materialLabel || `Material for role ${mat.roleId}`;

      // Quantity hint: default 1 unit if not specified
      const quantityHint = this._extractQuantity(mat) ?? 1;
      const unit = this._extractUnit(mat) ?? 'pcs';

      lines.push({
        requirementId: `REQ-${String(seq).padStart(4, '0')}`,
        category,
        description,
        quantityHint,
        unit,
        provenance: 'explicit',
        provenanceSummary: `planned-run.bindings.materials[${mat.roleId}]`,
        coverageStatus: materialId.startsWith('unknown-') ? 'uncovered' : 'covered',
        sourceRef: materialId,
      });
      seq++;
    }

    // 2. Explicit labware requirements
    const labware = bindings.labware ?? [];
    for (const lw of labware) {
      const lwRef = lw.labwareInstanceRef as { id?: string; type?: string; label?: string } | undefined;
      const lwId = lwRef?.id ?? `unknown-labware-${seq}`;
      const lwLabel = lwRef?.label ?? lw.roleId;

      lines.push({
        requirementId: `REQ-${String(seq).padStart(4, '0')}`,
        category: 'labware',
        description: lwLabel || `Labware for role ${lw.roleId}`,
        quantityHint: 1,
        unit: 'pcs',
        provenance: 'explicit',
        provenanceSummary: `planned-run.bindings.labware[${lw.roleId}]`,
        coverageStatus: lwId.startsWith('unknown-') ? 'uncovered' : 'covered',
        sourceRef: lwId,
      });
      seq++;
    }

    // 3. Inferred consumable requirements from event-graph
    if (eventGraphSummary?.events) {
      const inferred = this._inferConsumables(eventGraphSummary.events);
      lines.push(...inferred);
      seq += inferred.length;
    }

    // 4. Unresolved requirements: roles that have no binding at all
    //    We check for roles in bindings that reference unknown materials/labware
    for (const line of lines) {
      if (line.coverageStatus === 'uncovered' && line.provenance === 'explicit') {
        // Upgrade to unresolved since we can't resolve the reference
        line.provenance = 'unresolved';
        line.coverageStatus = 'uncovered';
      }
    }

    return {
      lines,
      derivedAt: new Date().toISOString(),
      sourcePlannedRunId: plannedRunEnvelope.recordId,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _inferCategory(type: string): RequirementCategory {
    const t = type.toLowerCase();
    if (t.includes('cell') || t.includes('line')) return 'cell-line';
    if (t.includes('labware') || t.includes('plate')) return 'labware';
    if (t.includes('tip') || t.includes('consumable')) return 'consumable';
    if (t.includes('instrument') || t.includes('supply')) return 'instrument-supply';
    return 'reagent';
  }

  private _extractQuantity(binding: Record<string, unknown>): number | null {
    const qty = binding.quantity;
    if (typeof qty === 'number' && qty > 0) return qty;
    const qtyObj = binding.quantity as { value?: number } | undefined;
    if (qtyObj && typeof qtyObj.value === 'number' && qtyObj.value > 0) return qtyObj.value;
    return null;
  }

  private _extractUnit(binding: Record<string, unknown>): string | null {
    const unit = binding.unit;
    if (typeof unit === 'string' && unit.length > 0) return unit;
    const qtyObj = binding.quantity as { unit?: string } | undefined;
    if (qtyObj && typeof qtyObj.unit === 'string' && qtyObj.unit.length > 0) return qtyObj.unit;
    return null;
  }

  /**
   * Infer consumable requirements from event-graph transfer events.
   *
   * Heuristic: each transfer event that specifies a volume and pipette channel
   * count implies tip usage. We sum up the total transfers and emit a single
   * consumable line for tips.
   */
  private _inferConsumables(events: Array<{
    eventType?: string;
    volume?: number;
    volumeUnit?: string;
    pipetteChannelCount?: number;
  }>): RequirementLine[] {
    const lines: RequirementLine[] = [];

    // Count transfer events
    const transferEvents = events.filter(
      (e) => e.eventType === 'transfer' || e.eventType === 'aspirate-dispense',
    );

    if (transferEvents.length === 0) return lines;

    // Sum total transfers
    const totalTransfers = transferEvents.length;

    // Estimate tip usage: each transfer typically uses one tip per channel
    // (unless reusing tips, which we conservatively don't assume)
    const totalTips = transferEvents.reduce((sum, e) => {
      const channels = e.pipetteChannelCount ?? 8; // default 8-channel
      return sum + channels;
    }, 0);

    lines.push({
      requirementId: `REQ-INF-TIPS`,
      category: 'consumable',
      description: `Transfer tips (estimated from ${totalTransfers} transfer events)`,
      quantityHint: totalTips,
      unit: 'pcs',
      provenance: 'inferred',
      provenanceSummary: `event-graph: ${totalTransfers} transfer events, ~${totalTips} tips estimated`,
      coverageStatus: 'partial',
    });

    // If volumes are specified, also infer reservoir/waste consumables
    const volumeEvents = transferEvents.filter((e) => e.volume && e.volume > 0);
    if (volumeEvents.length > 0) {
      const totalVolume = volumeEvents.reduce((sum, e) => sum + (e.volume ?? 0), 0);
      const volumeUnit = volumeEvents[0]?.volumeUnit ?? 'µL';
      lines.push({
        requirementId: `REQ-INF-RESERVOIR`,
        category: 'consumable',
        description: `Reservoir/waste consumables for ${totalVolume} ${volumeUnit} total transfer volume`,
        quantityHint: Math.ceil(totalVolume / 1000) || 1,
        unit: 'pcs',
        provenance: 'inferred',
        provenanceSummary: `event-graph: ${volumeEvents.length} volume-specified transfers, ${totalVolume} ${volumeUnit} total`,
        coverageStatus: 'partial',
      });
    }

    return lines;
  }
}
