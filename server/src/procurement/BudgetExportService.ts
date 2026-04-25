/**
 * BudgetExportService
 *
 * Generates CSV and HTML exports from persisted budget data.
 * Exports include vendor names, links, quantities, prices, totals,
 * and unresolved markers.
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface BudgetExportLine {
  lineId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  totalPrice: number | null;
  vendorName: string | null;
  vendorLink: string | null;
  selectedOfferRef: string | null;
  provenance: 'explicit' | 'inferred' | 'unresolved';
  notes: string | null;
  unresolved: boolean;
}

export interface BudgetExportResult {
  lines: BudgetExportLine[];
  grandTotal: number;
  lineCount: number;
  unresolvedCount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BudgetExportService {
  /**
   * Convert a budget payload into export-ready line items.
   *
   * @param payload - The budget record payload
   * @returns Export result with computed lines and totals
   */
  toExportLines(payload: Record<string, unknown>): BudgetExportResult {
    const lines = (payload.lines as Array<Record<string, unknown>>) ?? [];
    const exportLines: BudgetExportLine[] = [];
    let grandTotal = 0;
    let unresolvedCount = 0;

    for (const line of lines) {
      const lineId = (line.lineId as string) ?? '';
      const description = (line.description as string) ?? '';
      const quantity = (line.suggestedPackageCount as number) ?? 0;
      const unit = (line.unit as string) ?? '';
      const unitPrice = (line.unitPrice as number | null) ?? null;
      const totalPrice = (line.totalPrice as number | null) ?? null;
      const selectedOfferRef = (line.selectedOfferRef as string | null) ?? null;
      const provenance = (line.provenance as 'explicit' | 'inferred' | 'unresolved') ?? 'unresolved';
      const notes = (line.notes as string | null) ?? null;

      // Extract vendor info from selected offer ref if available
      let vendorName: string | null = null;
      let vendorLink: string | null = null;

      if (selectedOfferRef) {
        // Parse vendor info from the offer ref (format: "vendor:catalogNumber" or similar)
        const parts = selectedOfferRef.split(':');
        if (parts.length >= 2) {
          vendorName = parts[0];
          vendorLink = `https://example.com/vendor/${parts[0]}/product/${parts[1]}`;
        }
      }

      const unresolved = !selectedOfferRef || totalPrice === null;
      if (unresolved) unresolvedCount++;

      if (typeof totalPrice === 'number') {
        grandTotal += totalPrice;
      }

      exportLines.push({
        lineId,
        description,
        quantity,
        unit,
        unitPrice,
        totalPrice,
        vendorName,
        vendorLink,
        selectedOfferRef,
        provenance,
        notes,
        unresolved,
      });
    }

    return {
      lines: exportLines,
      grandTotal,
      lineCount: exportLines.length,
      unresolvedCount,
    };
  }

  /**
   * Generate a CSV export string from budget data.
   *
   * @param payload - The budget record payload
   * @returns CSV string
   */
  toCsv(payload: Record<string, unknown>): string {
    const { lines, grandTotal, lineCount, unresolvedCount } = this.toExportLines(payload);

    const header = 'Line ID,Description,Quantity,Unit,Unit Price,Total Price,Vendor,Vendor Link,Provenance,Unresolved,Notes';
    const rows = lines.map(
      (line) =>
        [
          csvEscape(line.lineId),
          csvEscape(line.description),
          line.quantity,
          csvEscape(line.unit),
          line.unitPrice != null ? line.unitPrice.toFixed(2) : '',
          line.totalPrice != null ? line.totalPrice.toFixed(2) : '',
          csvEscape(line.vendorName ?? ''),
          csvEscape(line.vendorLink ?? ''),
          line.provenance,
          line.unresolved ? 'Yes' : 'No',
          csvEscape(line.notes ?? ''),
        ].join(','),
    );

    const footer = [
      '',
      `Total,${lineCount} lines,${unresolvedCount} unresolved,$${grandTotal.toFixed(2)}`,
    ].join(',');

    return [header, ...rows, footer].join('\n');
  }

  /**
   * Generate an HTML export string from budget data.
   *
   * @param payload - The budget record payload
   * @returns HTML string
   */
  toHtml(payload: Record<string, unknown>): string {
    const { lines, grandTotal, lineCount, unresolvedCount } = this.toExportLines(payload);

    const title = (payload.title as string) ?? 'Budget Export';
    const recordId = (payload.recordId as string) ?? '';

    const rows = lines
      .map(
        (line) => `
      <tr class="${line.unresolved ? 'unresolved' : ''}">
        <td>${escapeHtml(line.lineId)}</td>
        <td>${escapeHtml(line.description)}</td>
        <td>${line.quantity}</td>
        <td>${escapeHtml(line.unit)}</td>
        <td>${line.unitPrice != null ? `$${line.unitPrice.toFixed(2)}` : '—'}</td>
        <td>${line.totalPrice != null ? `$${line.totalPrice.toFixed(2)}` : '—'}</td>
        <td>${line.vendorName ? `<a href="${escapeHtml(line.vendorLink ?? '#')}">${escapeHtml(line.vendorName)}</a>` : '—'}</td>
        <td>${line.provenance}</td>
        <td>${line.unresolved ? '<span class="unresolved">Unresolved</span>' : '✓'}</td>
        <td>${escapeHtml(line.notes ?? '')}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2rem; color: #0f172a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    .unresolved { background: #fef2f2; color: #dc2626; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .summary { margin-top: 1.5rem; padding: 1rem; background: #f1f5f9; border-radius: 8px; }
    .summary-row { display: flex; justify-content: space-between; gap: 2rem; }
    .summary-label { font-weight: 600; color: #64748b; }
    .summary-value { font-weight: 700; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Record ID: ${escapeHtml(recordId)} | Generated: ${new Date().toISOString()}</p>

  <table>
    <thead>
      <tr>
        <th>Line ID</th>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit</th>
        <th>Unit Price</th>
        <th>Total</th>
        <th>Vendor</th>
        <th>Provenance</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span class="summary-label">Total Lines:</span>
      <span class="summary-value">${lineCount}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Unresolved:</span>
      <span class="summary-value">${unresolvedCount}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Grand Total:</span>
      <span class="summary-value">$${grandTotal.toFixed(2)}</span>
    </div>
  </div>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
