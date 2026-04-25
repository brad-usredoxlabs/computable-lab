/**
 * BudgetDraftService
 *
 * Creates or updates a draft `budget` record seeded from a procurement
 * manifest. Each line item preserves the requirementId, suggested quantity
 * or package count, unresolved/manual placeholders, and starts with an
 * empty selected-offer state.
 *
 * No vendor-offer auto-selection happens in this spec.
 */

import type { RequirementLine, ProcurementManifest } from './ProcurementManifestService.js';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface BudgetLineItem {
  /** Stable line identifier within the budget. */
  lineId: string;
  /** The requirement this line addresses. */
  requirementId: string;
  /** High-level category inherited from the manifest line. */
  category: RequirementCategory;
  /** Suggested package count (may differ from quantityHint). */
  suggestedPackageCount: number;
  /** Unit of measure. */
  unit: string;
  /** Description inherited from the manifest line. */
  description: string;
  /** Provenance from the manifest. */
  provenance: 'explicit' | 'inferred' | 'unresolved';
  /** Empty selected-offer state by default. */
  selectedOfferRef: null;
  /** Unit price is unknown until a vendor offer is selected. */
  unitPrice: null;
  /** Total price is unknown until unit price is known. */
  totalPrice: null;
  /** Whether this line is approved for procurement. */
  approved: boolean;
  /** Optional notes. */
  notes?: string;
}

export interface DraftBudget {
  /** The budget record payload. */
  payload: Record<string, unknown>;
  /** The budget line items derived from the manifest. */
  lines: BudgetLineItem[];
  /** Timestamp of creation. */
  createdAt: string;
  /** Source manifest record ID. */
  sourceManifestId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BudgetDraftService {
  /**
   * Create a draft budget record seeded from a procurement manifest.
   *
   * @param manifest – the procurement manifest to seed from
   * @param budgetRecordId – optional record ID for the budget (auto-generated if omitted)
   * @returns the draft budget with payload and line items
   */
  createFromManifest(
    manifest: ProcurementManifest,
    budgetRecordId?: string,
  ): DraftBudget {
    const lines: BudgetLineItem[] = [];

    for (const reqLine of manifest.lines) {
      const suggestedPackageCount = this._suggestPackageCount(reqLine);
      const lineId = `BUD-${reqLine.requirementId.replace('REQ-', '')}`;

      lines.push({
        lineId,
        requirementId: reqLine.requirementId,
        category: reqLine.category,
        suggestedPackageCount,
        unit: reqLine.unit,
        description: reqLine.description,
        provenance: reqLine.provenance,
        selectedOfferRef: null,
        unitPrice: null,
        totalPrice: null,
        approved: false,
        notes: reqLine.provenance === 'unresolved'
          ? 'Unresolved requirement — no vendor offer available yet'
          : reqLine.provenance === 'inferred'
            ? 'Inferred consumable — quantity is approximate'
            : undefined,
      });
    }

    const now = new Date().toISOString();
    const recordId = budgetRecordId ?? `BUD-${String(Date.now()).slice(-6)}`;

    const payload: Record<string, unknown> = {
      kind: 'budget',
      recordId,
      title: `Budget for ${manifest.sourcePlannedRunId}`,
      sourceType: 'procurement-manifest',
      sourceRef: {
        kind: 'record',
        id: manifest.sourcePlannedRunId,
        type: 'procurement-manifest',
      },
      state: 'draft',
      currency: 'USD',
      lines: lines.map((l) => ({
        lineId: l.lineId,
        requirementId: l.requirementId,
        category: l.category,
        suggestedPackageCount: l.suggestedPackageCount,
        unit: l.unit,
        description: l.description,
        provenance: l.provenance,
        selectedOfferRef: l.selectedOfferRef,
        unitPrice: l.unitPrice,
        totalPrice: l.totalPrice,
        approved: l.approved,
        ...(l.notes ? { notes: l.notes } : {}),
      })),
      summary: {
        lineCount: lines.length,
        approvedLineCount: 0,
        grandTotal: 0,
      },
      createdAt: now,
    };

    return {
      payload,
      lines,
      createdAt: now,
      sourceManifestId: manifest.sourcePlannedRunId,
    };
  }

  /**
   * Update an existing draft budget with new manifest lines.
   * Replaces all lines but preserves the budget record ID.
   * Title is updated from the manifest source.
   */
  updateFromManifest(
    existingPayload: Record<string, unknown>,
    manifest: ProcurementManifest,
  ): DraftBudget {
    const draft = this.createFromManifest(manifest);

    // Preserve existing recordId but update title from manifest
    const existingRecordId = (existingPayload.recordId as string) ?? draft.payload.recordId;

    const updatedPayload = {
      ...existingPayload,
      ...draft.payload,
      recordId: existingRecordId,
      lines: draft.lines.map((l) => ({
        lineId: l.lineId,
        requirementId: l.requirementId,
        category: l.category,
        suggestedPackageCount: l.suggestedPackageCount,
        unit: l.unit,
        description: l.description,
        provenance: l.provenance,
        selectedOfferRef: l.selectedOfferRef,
        unitPrice: l.unitPrice,
        totalPrice: l.totalPrice,
        approved: l.approved,
        ...(l.notes ? { notes: l.notes } : {}),
      })),
      summary: {
        lineCount: draft.lines.length,
        approvedLineCount: 0,
        grandTotal: 0,
      },
    };

    return {
      ...draft,
      payload: updatedPayload,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Suggest a package count based on the quantity hint.
   *
   * Heuristic: for consumables, round up to the nearest standard package size.
   * For reagents, use the quantity hint directly.
   */
  private _suggestPackageCount(reqLine: RequirementLine): number {
    if (reqLine.category === 'consumable') {
      // Tips come in boxes of 96 or 384; round up to nearest 96
      if (reqLine.unit === 'pcs') {
        return Math.ceil(reqLine.quantityHint / 96) * 96;
      }
      return reqLine.quantityHint;
    }
    if (reqLine.category === 'reagent') {
      // Reagents often come in standard sizes; use quantity hint
      return Math.max(1, Math.ceil(reqLine.quantityHint));
    }
    // Default: use quantity hint as package count
    return Math.max(1, Math.ceil(reqLine.quantityHint));
  }
}
