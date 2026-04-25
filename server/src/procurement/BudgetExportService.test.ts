/**
 * Unit tests for BudgetExportService
 * Covers resolved and unresolved rows, CSV and HTML exports.
 */

import { describe, it, expect } from 'vitest';
import { BudgetExportService } from './BudgetExportService';

const service = new BudgetExportService();

describe('BudgetExportService', () => {
  describe('toExportLines', () => {
    it('converts a budget payload with resolved lines', () => {
      const payload: Record<string, unknown> = {
        kind: 'budget',
        recordId: 'BUD-TEST-001',
        title: 'Test Budget',
        lines: [
          {
            lineId: 'BUD-LINE-001',
            description: 'Fisher Scientific pipette tips',
            suggestedPackageCount: 96,
            unit: 'pcs',
            unitPrice: 25.0,
            totalPrice: 25.0,
            selectedOfferRef: 'fisher:FB12345',
            provenance: 'explicit' as const,
            approved: true,
          },
          {
            lineId: 'BUD-LINE-002',
            description: 'Cayman Chemical reagent',
            suggestedPackageCount: 1,
            unit: 'ea',
            unitPrice: null,
            totalPrice: null,
            selectedOfferRef: null,
            provenance: 'inferred' as const,
            approved: false,
          },
        ],
        summary: { lineCount: 2, approvedLineCount: 1, grandTotal: 25.0 },
      };

      const result = service.toExportLines(payload);

      expect(result.lineCount).toBe(2);
      expect(result.unresolvedCount).toBe(1);
      expect(result.grandTotal).toBe(25.0);

      expect(result.lines[0]).toMatchObject({
        lineId: 'BUD-LINE-001',
        description: 'Fisher Scientific pipette tips',
        quantity: 96,
        unit: 'pcs',
        unitPrice: 25.0,
        totalPrice: 25.0,
        vendorName: 'fisher',
        unresolved: false,
      });

      expect(result.lines[1]).toMatchObject({
        lineId: 'BUD-LINE-002',
        description: 'Cayman Chemical reagent',
        quantity: 1,
        unit: 'ea',
        unitPrice: null,
        totalPrice: null,
        vendorName: null,
        unresolved: true,
      });
    });

    it('handles empty lines', () => {
      const payload: Record<string, unknown> = {
        kind: 'budget',
        recordId: 'BUD-EMPTY',
        title: 'Empty Budget',
        lines: [],
        summary: { lineCount: 0, approvedLineCount: 0, grandTotal: 0 },
      };

      const result = service.toExportLines(payload);

      expect(result.lineCount).toBe(0);
      expect(result.unresolvedCount).toBe(0);
      expect(result.grandTotal).toBe(0);
      expect(result.lines).toHaveLength(0);
    });

    it('handles lines with no selected offer as unresolved', () => {
      const payload: Record<string, unknown> = {
        kind: 'budget',
        recordId: 'BUD-UNRESOLVED',
        title: 'Unresolved Budget',
        lines: [
          {
            lineId: 'BUD-LINE-001',
            description: 'Unresolved item',
            suggestedPackageCount: 10,
            unit: 'ea',
            unitPrice: null,
            totalPrice: null,
            selectedOfferRef: null,
            provenance: 'unresolved' as const,
            approved: false,
          },
        ],
        summary: { lineCount: 1, approvedLineCount: 0, grandTotal: 0 },
      };

      const result = service.toExportLines(payload);

      expect(result.unresolvedCount).toBe(1);
      expect(result.lines[0].unresolved).toBe(true);
    });
  });

  describe('toCsv', () => {
    it('generates CSV with header and resolved/unresolved rows', () => {
      const payload: Record<string, unknown> = {
        kind: 'budget',
        recordId: 'BUD-CSV-001',
        title: 'CSV Test Budget',
        lines: [
          {
            lineId: 'BUD-LINE-001',
            description: 'Fisher tips',
            suggestedPackageCount: 96,
            unit: 'pcs',
            unitPrice: 25.0,
            totalPrice: 25.0,
            selectedOfferRef: 'fisher:FB12345',
            provenance: 'explicit' as const,
            approved: true,
          },
          {
            lineId: 'BUD-LINE-002',
            description: 'Unresolved item',
            suggestedPackageCount: 5,
            unit: 'ea',
            unitPrice: null,
            totalPrice: null,
            selectedOfferRef: null,
            provenance: 'unresolved' as const,
            approved: false,
          },
        ],
        summary: { lineCount: 2, approvedLineCount: 1, grandTotal: 25.0 },
      };

      const csv = service.toCsv(payload);
      const lines = csv.split('\n');

      // Header
      expect(lines[0]).toContain('Line ID');
      expect(lines[0]).toContain('Description');
      expect(lines[0]).toContain('Unresolved');

      // First data row (resolved)
      expect(lines[1]).toContain('BUD-LINE-001');
      expect(lines[1]).toContain('Fisher tips');
      expect(lines[1]).toContain('25.00');
      expect(lines[1]).not.toContain('Yes');

      // Second data row (unresolved)
      expect(lines[2]).toContain('BUD-LINE-002');
      expect(lines[2]).toContain('Unresolved item');
      expect(lines[2]).toContain('Yes');

      // Footer
      expect(lines[lines.length - 1]).toContain('25.00');
    });

    it('escapes commas in description', () => {
      const payload: Record<string, unknown> = {
        kind: 'budget',
        recordId: 'BUD-ESCAPE',
        title: 'Escape Test',
        lines: [
          {
            lineId: 'BUD-LINE-001',
            description: 'Item with, comma',
            suggestedPackageCount: 1,
            unit: 'ea',
            unitPrice: 10.0,
            totalPrice: 10.0,
            selectedOfferRef: 'vendor:ABC',
            provenance: 'explicit' as const,
            approved: true,
          },
        ],
        summary: { lineCount: 1, approvedLineCount: 1, grandTotal: 10.0 },
      };

      const csv = service.toCsv(payload);
      expect(csv).toContain('"Item with, comma"');
    });
  });

  describe('toHtml', () => {
    it('generates valid HTML with resolved and unresolved rows', () => {
      const payload: Record<string, unknown> = {
        kind: 'budget',
        recordId: 'BUD-HTML-001',
        title: 'HTML Test Budget',
        lines: [
          {
            lineId: 'BUD-LINE-001',
            description: 'Resolved item',
            suggestedPackageCount: 10,
            unit: 'ea',
            unitPrice: 5.0,
            totalPrice: 50.0,
            selectedOfferRef: 'cayman:CAY123',
            provenance: 'explicit' as const,
            approved: true,
          },
          {
            lineId: 'BUD-LINE-002',
            description: 'Unresolved item',
            suggestedPackageCount: 3,
            unit: 'ea',
            unitPrice: null,
            totalPrice: null,
            selectedOfferRef: null,
            provenance: 'unresolved' as const,
            approved: false,
          },
        ],
        summary: { lineCount: 2, approvedLineCount: 1, grandTotal: 50.0 },
      };

      const html = service.toHtml(payload);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('HTML Test Budget');
      expect(html).toContain('BUD-LINE-001');
      expect(html).toContain('Resolved item');
      expect(html).toContain('$50.00');
      expect(html).toContain('BUD-LINE-002');
      expect(html).toContain('Unresolved item');
      expect(html).toContain('Unresolved');
      expect(html).toContain('Grand Total:');
      expect(html).toContain('$50.00');
    });

    it('escapes HTML in descriptions', () => {
      const payload: Record<string, unknown> = {
        kind: 'budget',
        recordId: 'BUD-XSS',
        title: 'XSS Test',
        lines: [
          {
            lineId: 'BUD-LINE-001',
            description: '<script>alert("xss")</script>',
            suggestedPackageCount: 1,
            unit: 'ea',
            unitPrice: 1.0,
            totalPrice: 1.0,
            selectedOfferRef: 'vendor:TEST',
            provenance: 'explicit' as const,
            approved: true,
          },
        ],
        summary: { lineCount: 1, approvedLineCount: 1, grandTotal: 1.0 },
      };

      const html = service.toHtml(payload);
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>');
    });
  });
});
