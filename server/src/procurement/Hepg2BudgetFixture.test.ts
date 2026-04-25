/**
 * HepG2 Viability Budget Fixture — End-to-End Procurement Flow
 *
 * This integration-style test exercises the full procurement pipeline for a
 * concrete HepG2 viability-screen scenario:
 *
 *   1. A planned-run with bindings for compounds, consumables, labware,
 *      viability reagent, and a HepG2 cell line.
 *   2. Derivation of a procurement manifest from the planned-run + event graph.
 *   3. Creation of a draft budget seeded from the manifest.
 *   4. Attachment of deterministic vendor-offer candidates (Cayman for
 *      compounds; Fisher / VWR / Thomas for consumables and labware).
 *   5. Projection-backed budget-authoring input state (selected-offer
 *      resolution, price computation).
 *   6. CSV and HTML export of the selected budget.
 *
 * Determinism: all vendor offers are seeded locally — no live web calls.
 * Unresolved rows (e.g. HepG2 cell line) remain visible through export.
 */

import { describe, it, expect } from 'vitest';
import { ProcurementManifestService } from './ProcurementManifestService.js';
import { BudgetDraftService } from './BudgetDraftService.js';
import { BudgetExportService } from './BudgetExportService.js';
import type { RecordEnvelope } from '../store/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlannedRunEnvelope(
  recordId: string,
  bindings: Record<string, unknown>,
): RecordEnvelope {
  return {
    recordId,
    schemaId:
      'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
    payload: {
      kind: 'planned-run',
      recordId,
      title: 'HepG2 Viability Screen — Weekend Project',
      state: 'draft',
      bindings,
    },
  };
}

/**
 * Seeded vendor-offer candidates keyed by a simple lookup string.
 * Format: "category:label" → vendor-offer payload.
 *
 * Expanded vendor set:
 *   - Cayman Chemical for compounds
 *   - Fisher Scientific for consumables / labware
 *   - VWR for consumables
 *   - Thomas Scientific for labware
 */
const SEEDED_OFFERS: Record<string, Record<string, unknown>> = {
  // Compounds → Cayman Chemical
  'reagent:AhR-activator-CIT-001': {
    vendor: 'cayman-chemical',
    vendorLabel: 'Cayman Chemical',
    catalogNumber: '24440',
    price: 185.0,
    currency: 'USD',
    packageSize: '10 mg',
    url: 'https://www.caymanchem.com/product/24440',
    availability: 'in_stock' as const,
    leadTimeDays: 5,
    capturedAt: '2026-04-25T00:00:00Z',
  },
  'reagent:PPARa-activator-GW-002': {
    vendor: 'cayman-chemical',
    vendorLabel: 'Cayman Chemical',
    catalogNumber: '12345',
    price: 210.0,
    currency: 'USD',
    packageSize: '5 mg',
    url: 'https://www.caymanchem.com/product/12345',
    availability: 'in_stock' as const,
    leadTimeDays: 7,
    capturedAt: '2026-04-25T00:00:00Z',
  },
  // Consumables → Fisher Scientific
  'consumable:pipette-tips-96': {
    vendor: 'fisher-scientific',
    vendorLabel: 'Fisher Scientific',
    catalogNumber: 'FB-2001234',
    price: 25.0,
    currency: 'USD',
    packageSize: '96 tips/box',
    url: 'https://www.fisherscientific.com/product/2001234',
    availability: 'in_stock' as const,
    leadTimeDays: 2,
    capturedAt: '2026-04-25T00:00:00Z',
  },
  'consumable:reservoir-12well': {
    vendor: 'vwr',
    vendorLabel: 'VWR',
    catalogNumber: 'VWR-55555',
    price: 18.5,
    currency: 'USD',
    packageSize: '12-well reservoir',
    url: 'https://www.vwr.com/product/55555',
    availability: 'in_stock' as const,
    leadTimeDays: 3,
    capturedAt: '2026-04-25T00:00:00Z',
  },
  // Labware → Thomas Scientific
  'labware:96well-plate-sterile': {
    vendor: 'thomas-scientific',
    vendorLabel: 'Thomas Scientific',
    catalogNumber: 'TS-4300123',
    price: 42.0,
    currency: 'USD',
    packageSize: '50 plates/box',
    url: 'https://www.thomassci.com/product/4300123',
    availability: 'in_stock' as const,
    leadTimeDays: 4,
    capturedAt: '2026-04-25T00:00:00Z',
  },
  // Viability reagent → Fisher Scientific
  'reagent:MTT-reagent': {
    vendor: 'fisher-scientific',
    vendorLabel: 'Fisher Scientific',
    catalogNumber: 'FB-MTT100',
    price: 95.0,
    currency: 'USD',
    packageSize: '100 mg',
    url: 'https://www.fisherscientific.com/product/MTT100',
    availability: 'in_stock' as const,
    leadTimeDays: 3,
    capturedAt: '2026-04-25T00:00:00Z',
  },
};

/**
 * Resolve a seeded vendor offer for a requirement line.
 * Returns null if no offer exists (simulating uncovered requirement).
 */
function resolveOffer(
  category: string,
  description: string,
): Record<string, unknown> | null {
  const key = `${category}:${description}`;
  return SEEDED_OFFERS[key] ?? null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('HepG2 Viability Budget Fixture', () => {
  const manifestService = new ProcurementManifestService();
  const budgetService = new BudgetDraftService();
  const exportService = new BudgetExportService();

  // -----------------------------------------------------------------------
  // Scenario: HepG2 viability screen with combination drug treatment
  // -----------------------------------------------------------------------

  it('derives a procurement manifest from a HepG2 viability planned-run', () => {
    const envelope = makePlannedRunEnvelope('PLR-HEPG2-001', {
      materials: [
        // Compound 1: AhR activator
        {
          roleId: 'compound-ahr-activator',
          materialRef: {
            id: 'MAT-AHR-ACT',
            type: 'reagent',
            label: 'AhR-activator-CIT-001',
          },
          quantity: 1,
          unit: 'ea',
        },
        // Compound 2: PPARα activator
        {
          roleId: 'compound-ppara-activator',
          materialRef: {
            id: 'MAT-PPAR-ACT',
            type: 'reagent',
            label: 'PPARa-activator-GW-002',
          },
          quantity: 1,
          unit: 'ea',
        },
        // Viability readout reagent
        {
          roleId: 'reagent-mtt',
          materialRef: {
            id: 'MAT-MTT',
            type: 'reagent',
            label: 'MTT-reagent',
          },
          quantity: 1,
          unit: 'ea',
        },
        // HepG2 cell line — intentionally unknown to test unresolved path
        {
          roleId: 'cell-line-hepg2',
          materialRef: {
            id: 'unknown-material-hepg2',
            type: 'cell-line',
            label: 'HepG2 cells',
          },
          quantity: 1,
          unit: 'vials',
        },
      ],
      labware: [
        {
          roleId: 'source-plate',
          labwareInstanceRef: {
            id: 'LW-96WELL',
            type: 'labware',
            label: '96well-plate-sterile',
          },
        },
      ],
    });

    const eventGraphSummary = {
      events: [
        { eventType: 'transfer', volume: 100, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 100, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 100, volumeUnit: 'µL', pipetteChannelCount: 1 },
      ],
    };

    const manifest = manifestService.derive(envelope, eventGraphSummary);

    // Expect: 4 materials + 1 labware + 2 inferred consumables = 7 lines
    expect(manifest.lines).toHaveLength(7);

    // Verify categories
    const categories = manifest.lines.map((l) => l.category);
    expect(categories).toContain('reagent');
    expect(categories).toContain('cell-line');
    expect(categories).toContain('labware');
    expect(categories).toContain('consumable');

    // Verify provenance mix:
    // 3 explicit materials (AhR, PPARa, MTT) + 1 explicit labware = 4 explicit
    // 1 unresolved (HepG2 cell line — unknown-material-*)
    // 2 inferred (tips + reservoir)
    const explicitLines = manifest.lines.filter((l) => l.provenance === 'explicit');
    const unresolvedLines = manifest.lines.filter((l) => l.provenance === 'unresolved');
    const inferredLines = manifest.lines.filter((l) => l.provenance === 'inferred');

    expect(explicitLines).toHaveLength(4); // 3 materials + 1 labware
    expect(unresolvedLines).toHaveLength(1); // HepG2 cell line
    expect(inferredLines).toHaveLength(2); // tips + reservoir

    // Verify the unresolved HepG2 line
    const hepg2Line = manifest.lines.find(
      (l) => l.category === 'cell-line',
    );
    expect(hepg2Line).toBeDefined();
    expect(hepg2Line!.provenance).toBe('unresolved');
    expect(hepg2Line!.coverageStatus).toBe('uncovered');
    expect(hepg2Line!.description).toBe('HepG2 cells');
  });

  // -----------------------------------------------------------------------
  // Draft budget creation from manifest
  // -----------------------------------------------------------------------

  it('creates a draft budget seeded from the HepG2 manifest', () => {
    const envelope = makePlannedRunEnvelope('PLR-HEPG2-002', {
      materials: [
        {
          roleId: 'compound-ahr',
          materialRef: {
            id: 'MAT-AHR-ACT',
            type: 'reagent',
            label: 'AhR-activator-CIT-001',
          },
          quantity: 1,
          unit: 'ea',
        },
        {
          roleId: 'cell-line-hepg2',
          materialRef: {
            id: 'unknown-material-hepg2',
            type: 'cell-line',
            label: 'HepG2 cells',
          },
          quantity: 1,
          unit: 'vials',
        },
      ],
      labware: [
        {
          roleId: 'plate',
          labwareInstanceRef: {
            id: 'LW-96WELL',
            type: 'labware',
            label: '96well-plate-sterile',
          },
        },
      ],
    });

    const manifest = manifestService.derive(envelope);
    const draft = budgetService.createFromManifest(manifest, 'BUD-HEPG2-001');

    expect(draft.lines).toHaveLength(3); // 2 materials + 1 labware

    // Verify budget payload structure
    expect(draft.payload.kind).toBe('budget');
    expect(draft.payload.recordId).toBe('BUD-HEPG2-001');
    expect(draft.payload.title).toBe('Budget for PLR-HEPG2-002');
    expect(draft.payload.state).toBe('draft');
    expect(draft.payload.currency).toBe('USD');

    // Verify summary
    const summary = draft.payload.summary as {
      lineCount: number;
      approvedLineCount: number;
      grandTotal: number;
    };
    expect(summary.lineCount).toBe(3);
    expect(summary.approvedLineCount).toBe(0);
    expect(summary.grandTotal).toBe(0);

    // Verify each line starts with no selected offer
    for (const line of draft.lines) {
      expect(line.selectedOfferRef).toBeNull();
      expect(line.unitPrice).toBeNull();
      expect(line.totalPrice).toBeNull();
      expect(line.approved).toBe(false);
    }

    // Verify unresolved line has notes
    const unresolvedLine = draft.lines.find(
      (l) => l.requirementId === 'REQ-0002',
    );
    expect(unresolvedLine).toBeDefined();
    expect(unresolvedLine!.provenance).toBe('unresolved');
    expect(unresolvedLine!.notes).toBe(
      'Unresolved requirement — no vendor offer available yet',
    );
  });

  // -----------------------------------------------------------------------
  // Seeded vendor-offer resolution
  // -----------------------------------------------------------------------

  it('resolves seeded vendor offers for known requirements', () => {
    // Compound → Cayman
    const ahrOffer = resolveOffer('reagent', 'AhR-activator-CIT-001');
    expect(ahrOffer).not.toBeNull();
    expect(ahrOffer!.vendor).toBe('cayman-chemical');
    expect(ahrOffer!.vendorLabel).toBe('Cayman Chemical');
    expect(ahrOffer!.price).toBe(185.0);
    expect(ahrOffer!.url).toBe('https://www.caymanchem.com/product/24440');

    // Consumable → Fisher
    const tipsOffer = resolveOffer('consumable', 'pipette-tips-96');
    expect(tipsOffer).not.toBeNull();
    expect(tipsOffer!.vendor).toBe('fisher-scientific');
    expect(tipsOffer!.price).toBe(25.0);

    // Labware → Thomas
    const plateOffer = resolveOffer('labware', '96well-plate-sterile');
    expect(plateOffer).not.toBeNull();
    expect(plateOffer!.vendor).toBe('thomas-scientific');
    expect(plateOffer!.price).toBe(42.0);

    // Viability reagent → Fisher
    const mttOffer = resolveOffer('reagent', 'MTT-reagent');
    expect(mttOffer).not.toBeNull();
    expect(mttOffer!.vendor).toBe('fisher-scientific');
    expect(mttOffer!.price).toBe(95.0);

    // Consumable → VWR
    const reservoirOffer = resolveOffer('consumable', 'reservoir-12well');
    expect(reservoirOffer).not.toBeNull();
    expect(reservoirOffer!.vendor).toBe('vwr');
    expect(reservoirOffer!.price).toBe(18.5);

    // Unresolved → null
    const hepg2Offer = resolveOffer('cell-line', 'HepG2 cells');
    expect(hepg2Offer).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Projection-backed budget authoring: select offers and compute prices
  // -----------------------------------------------------------------------

  it('projects resolved offers into budget lines and computes totals', () => {
    const envelope = makePlannedRunEnvelope('PLR-HEPG2-003', {
      materials: [
        {
          roleId: 'compound-ahr',
          materialRef: {
            id: 'MAT-AHR-ACT',
            type: 'reagent',
            label: 'AhR-activator-CIT-001',
          },
          quantity: 1,
          unit: 'ea',
        },
        {
          roleId: 'reagent-mtt',
          materialRef: {
            id: 'MAT-MTT',
            type: 'reagent',
            label: 'MTT-reagent',
          },
          quantity: 1,
          unit: 'ea',
        },
        {
          roleId: 'cell-line-hepg2',
          materialRef: {
            id: 'unknown-material-hepg2',
            type: 'cell-line',
            label: 'HepG2 cells',
          },
          quantity: 1,
          unit: 'vials',
        },
      ],
      labware: [
        {
          roleId: 'plate',
          labwareInstanceRef: {
            id: 'LW-96WELL',
            type: 'labware',
            label: '96well-plate-sterile',
          },
        },
      ],
    });

    const manifest = manifestService.derive(envelope);
    const draft = budgetService.createFromManifest(manifest, 'BUD-HEPG2-003');

    // Simulate projection-backed authoring: resolve offers for each line
    const resolvedLines = draft.lines.map((line) => {
      const offer = resolveOffer(line.category, line.description);
      if (offer) {
        const unitPrice = offer.price as number;
        const totalPrice = unitPrice * line.suggestedPackageCount;
        const vendorOfferRef = `${offer.vendor}:${offer.catalogNumber}`;

        return {
          ...line,
          selectedOfferRef: vendorOfferRef,
          unitPrice,
          totalPrice,
          approved: true,
        };
      }
      // Unresolved line stays as-is
      return line;
    });

    // Verify resolved lines have vendor, URL, pricing
    const resolved = resolvedLines.filter((l) => l.selectedOfferRef !== null);
    expect(resolved).toHaveLength(3); // AhR, MTT, plate

    const ahrLine = resolved.find((l) => l.description.includes('AhR'));
    expect(ahrLine).toBeDefined();
    expect(ahrLine!.selectedOfferRef).toContain('cayman-chemical');
    expect(ahrLine!.unitPrice).toBe(185.0);
    expect(ahrLine!.totalPrice).toBe(185.0);

    const mttLine = resolved.find((l) => l.description.includes('MTT'));
    expect(mttLine).toBeDefined();
    expect(mttLine!.selectedOfferRef).toContain('fisher-scientific');
    expect(mttLine!.unitPrice).toBe(95.0);
    expect(mttLine!.totalPrice).toBe(95.0);

    const plateLine = resolved.find((l) => l.description.includes('96well'));
    expect(plateLine).toBeDefined();
    expect(plateLine!.selectedOfferRef).toContain('thomas-scientific');
    expect(plateLine!.unitPrice).toBe(42.0);
    expect(plateLine!.totalPrice).toBe(42.0);

    // Verify unresolved line stays visible
    const unresolved = resolvedLines.find((l) => l.selectedOfferRef === null);
    expect(unresolved).toBeDefined();
    expect(unresolved!.description).toBe('HepG2 cells');
    expect(unresolved!.provenance).toBe('unresolved');
    expect(unresolved!.unitPrice).toBeNull();
    expect(unresolved!.totalPrice).toBeNull();

    // Compute grand total from resolved lines only
    const grandTotal = resolvedLines.reduce(
      (sum, l) => sum + (l.totalPrice ?? 0),
      0,
    );
    expect(grandTotal).toBe(185.0 + 95.0 + 42.0); // 322.0
  });

  // -----------------------------------------------------------------------
  // CSV export with resolved and unresolved rows
  // -----------------------------------------------------------------------

  it('exports CSV with resolved pricing and unresolved markers', () => {
    const payload: Record<string, unknown> = {
      kind: 'budget',
      recordId: 'BUD-HEPG2-EXPORT',
      title: 'HepG2 Viability Budget Export',
      state: 'draft',
      currency: 'USD',
      lines: [
        {
          lineId: 'BUD-REQ-0001',
          description: 'AhR-activator-CIT-001',
          suggestedPackageCount: 1,
          unit: 'ea',
          unitPrice: 185.0,
          totalPrice: 185.0,
          selectedOfferRef: 'cayman-chemical:24440',
          provenance: 'explicit' as const,
          approved: true,
        },
        {
          lineId: 'BUD-REQ-0002',
          description: 'MTT-reagent',
          suggestedPackageCount: 1,
          unit: 'ea',
          unitPrice: 95.0,
          totalPrice: 95.0,
          selectedOfferRef: 'fisher-scientific:FB-MTT100',
          provenance: 'explicit' as const,
          approved: true,
        },
        {
          lineId: 'BUD-REQ-0003',
          description: 'HepG2 cells',
          suggestedPackageCount: 1,
          unit: 'vials',
          unitPrice: null,
          totalPrice: null,
          selectedOfferRef: null,
          provenance: 'unresolved' as const,
          approved: false,
          notes: 'Unresolved requirement — no vendor offer available yet',
        },
        {
          lineId: 'BUD-REQ-0004',
          description: '96well-plate-sterile',
          suggestedPackageCount: 1,
          unit: 'ea',
          unitPrice: 42.0,
          totalPrice: 42.0,
          selectedOfferRef: 'thomas-scientific:TS-4300123',
          provenance: 'explicit' as const,
          approved: true,
        },
      ],
      summary: {
        lineCount: 4,
        approvedLineCount: 3,
        grandTotal: 322.0,
      },
    };

    const csv = exportService.toCsv(payload);
    const csvLines = csv.split('\n');

    // Header present
    expect(csvLines[0]).toContain('Line ID');
    expect(csvLines[0]).toContain('Unresolved');

    // Resolved rows have prices
    expect(csvLines[1]).toContain('185.00');
    expect(csvLines[1]).not.toContain('Yes'); // not unresolved

    expect(csvLines[2]).toContain('95.00');
    expect(csvLines[2]).not.toContain('Yes');

    // Unresolved row has "Yes" marker and no price
    expect(csvLines[3]).toContain('HepG2 cells');
    expect(csvLines[3]).toContain('Yes');
    expect(csvLines[3]).not.toContain('322.00'); // no total for unresolved

    // Footer with grand total
    const footer = csvLines[csvLines.length - 1];
    expect(footer).toContain('322.00');
    expect(footer).toContain('1 unresolved');
  });

  // -----------------------------------------------------------------------
  // HTML export with resolved and unresolved rows
  // -----------------------------------------------------------------------

  it('exports HTML with resolved pricing and unresolved markers', () => {
    const payload: Record<string, unknown> = {
      kind: 'budget',
      recordId: 'BUD-HEPG2-HTML',
      title: 'HepG2 Viability Budget',
      state: 'draft',
      currency: 'USD',
      lines: [
        {
          lineId: 'BUD-REQ-0001',
          description: 'AhR-activator-CIT-001',
          suggestedPackageCount: 1,
          unit: 'ea',
          unitPrice: 185.0,
          totalPrice: 185.0,
          selectedOfferRef: 'cayman-chemical:24440',
          provenance: 'explicit' as const,
          approved: true,
        },
        {
          lineId: 'BUD-REQ-0002',
          description: 'HepG2 cells',
          suggestedPackageCount: 1,
          unit: 'vials',
          unitPrice: null,
          totalPrice: null,
          selectedOfferRef: null,
          provenance: 'unresolved' as const,
          approved: false,
        },
      ],
      summary: {
        lineCount: 2,
        approvedLineCount: 1,
        grandTotal: 185.0,
      },
    };

    const html = exportService.toHtml(payload);

    // Valid HTML structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('HepG2 Viability Budget');

    // Resolved row has price and vendor link
    expect(html).toContain('$185.00');
    expect(html).toContain('cayman-chemical');
    expect(html).toContain('example.com/vendor/cayman-chemical/product/24440');

    // Unresolved row has marker
    expect(html).toContain('HepG2 cells');
    expect(html).toContain('Unresolved');
    expect(html).toContain('class="unresolved"');

    // Summary section
    expect(html).toContain('Grand Total:');
    expect(html).toContain('$185.00');
    expect(html).toContain('1'); // unresolved count
  });

  // -----------------------------------------------------------------------
  // Export result structure
  // -----------------------------------------------------------------------

  it('toExportLines returns correct structure with resolved and unresolved', () => {
    const payload: Record<string, unknown> = {
      kind: 'budget',
      recordId: 'BUD-HEPG2-STRUCT',
      title: 'HepG2 Budget Structure Test',
      lines: [
        {
          lineId: 'BUD-LINE-001',
          description: 'AhR-activator-CIT-001',
          suggestedPackageCount: 1,
          unit: 'ea',
          unitPrice: 185.0,
          totalPrice: 185.0,
          selectedOfferRef: 'cayman-chemical:24440',
          provenance: 'explicit' as const,
          approved: true,
        },
        {
          lineId: 'BUD-LINE-002',
          description: 'HepG2 cells',
          suggestedPackageCount: 1,
          unit: 'vials',
          unitPrice: null,
          totalPrice: null,
          selectedOfferRef: null,
          provenance: 'unresolved' as const,
          approved: false,
        },
      ],
      summary: { lineCount: 2, approvedLineCount: 1, grandTotal: 185.0 },
    };

    const result = exportService.toExportLines(payload);

    expect(result.lineCount).toBe(2);
    expect(result.unresolvedCount).toBe(1);
    expect(result.grandTotal).toBe(185.0);

    // Resolved line
    expect(result.lines[0]).toMatchObject({
      lineId: 'BUD-LINE-001',
      description: 'AhR-activator-CIT-001',
      quantity: 1,
      unit: 'ea',
      unitPrice: 185.0,
      totalPrice: 185.0,
      vendorName: 'cayman-chemical',
      unresolved: false,
    });

    // Unresolved line
    expect(result.lines[1]).toMatchObject({
      lineId: 'BUD-LINE-002',
      description: 'HepG2 cells',
      quantity: 1,
      unit: 'vials',
      unitPrice: null,
      totalPrice: null,
      vendorName: null,
      unresolved: true,
    });
  });

  // -----------------------------------------------------------------------
  // Expanded vendor set coverage
  // -----------------------------------------------------------------------

  it('exercises Cayman, Fisher, VWR, and Thomas vendors in seeded offers', () => {
    // Cayman Chemical
    const caymanOffer = resolveOffer('reagent', 'AhR-activator-CIT-001');
    expect(caymanOffer!.vendor).toBe('cayman-chemical');

    // Fisher Scientific
    const fisherOffer = resolveOffer('reagent', 'MTT-reagent');
    expect(fisherOffer!.vendor).toBe('fisher-scientific');

    // VWR
    const vwrOffer = resolveOffer('consumable', 'reservoir-12well');
    expect(vwrOffer!.vendor).toBe('vwr');

    // Thomas Scientific
    const thomasOffer = resolveOffer('labware', '96well-plate-sterile');
    expect(thomasOffer!.vendor).toBe('thomas-scientific');
  });

  // -----------------------------------------------------------------------
  // Full pipeline: manifest → draft → resolve → export
  // -----------------------------------------------------------------------

  it('runs the full procurement pipeline end-to-end', () => {
    // Step 1: Planned-run with HepG2 viability scenario
    const envelope = makePlannedRunEnvelope('PLR-HEPG2-FULL', {
      materials: [
        {
          roleId: 'compound-ahr',
          materialRef: {
            id: 'MAT-AHR-ACT',
            type: 'reagent',
            label: 'AhR-activator-CIT-001',
          },
          quantity: 1,
          unit: 'ea',
        },
        {
          roleId: 'compound-ppara',
          materialRef: {
            id: 'MAT-PPAR-ACT',
            type: 'reagent',
            label: 'PPARa-activator-GW-002',
          },
          quantity: 1,
          unit: 'ea',
        },
        {
          roleId: 'reagent-mtt',
          materialRef: {
            id: 'MAT-MTT',
            type: 'reagent',
            label: 'MTT-reagent',
          },
          quantity: 1,
          unit: 'ea',
        },
        {
          roleId: 'cell-line-hepg2',
          materialRef: {
            id: 'unknown-material-hepg2',
            type: 'cell-line',
            label: 'HepG2 cells',
          },
          quantity: 1,
          unit: 'vials',
        },
      ],
      labware: [
        {
          roleId: 'plate',
          labwareInstanceRef: {
            id: 'LW-96WELL',
            type: 'labware',
            label: '96well-plate-sterile',
          },
        },
      ],
    });

    // Step 2: Derive manifest
    const manifest = manifestService.derive(envelope);
    expect(manifest.lines.length).toBeGreaterThan(0);

    // Step 3: Create draft budget
    const draft = budgetService.createFromManifest(manifest, 'BUD-HEPG2-FULL');
    expect(draft.lines.length).toBeGreaterThan(0);

    // Step 4: Resolve offers (projection-backed authoring)
    const resolvedPayload = {
      ...draft.payload,
      lines: draft.lines.map((line) => {
        const offer = resolveOffer(line.category, line.description);
        if (offer) {
          const unitPrice = offer.price as number;
          const totalPrice = unitPrice * line.suggestedPackageCount;
          return {
            ...line,
            selectedOfferRef: `${offer.vendor}:${offer.catalogNumber}`,
            unitPrice,
            totalPrice,
            approved: true,
          };
        }
        return line;
      }),
    };

    // Step 5: Export CSV
    const csv = exportService.toCsv(resolvedPayload);
    expect(csv).toContain('Line ID');
    expect(csv).toContain('AhR-activator-CIT-001');
    expect(csv).toContain('HepG2 cells');
    expect(csv).toContain('Yes'); // unresolved marker

    // Step 6: Export HTML
    const html = exportService.toHtml(resolvedPayload);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('HepG2 cells');
    expect(html).toContain('Unresolved');

    // Step 7: Verify export result structure
    const exportResult = exportService.toExportLines(resolvedPayload);
    expect(exportResult.lineCount).toBeGreaterThan(0);
    expect(exportResult.unresolvedCount).toBeGreaterThanOrEqual(1);
    expect(exportResult.grandTotal).toBeGreaterThan(0);

    // Verify resolved lines have vendor info
    const resolvedExportLines = exportResult.lines.filter((l) => !l.unresolved);
    for (const line of resolvedExportLines) {
      expect(line.vendorName).not.toBeNull();
      expect(line.vendorLink).not.toBeNull();
      expect(line.unitPrice).not.toBeNull();
      expect(line.totalPrice).not.toBeNull();
    }

    // Verify unresolved lines are still present
    const unresolvedExportLines = exportResult.lines.filter((l) => l.unresolved);
    expect(unresolvedExportLines.length).toBeGreaterThanOrEqual(1);
    for (const line of unresolvedExportLines) {
      expect(line.description).toBe('HepG2 cells');
      expect(line.unresolved).toBe(true);
    }
  });
});
