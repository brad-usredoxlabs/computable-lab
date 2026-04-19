/**
 * Cayman plate-map PDF extraction adapter.
 * 
 * Parses Cayman Chemical screening library plate-map PDFs into material-spec candidates.
 * Uses extractPdfLayoutText() to get columnar text, then parses the layout using
 * a regex matching the plate-map format (well ID, compound name, catalog ID, concentration).
 * 
 * Per spec-022: Adapter NEVER throws - all errors surface as diagnostics.
 */

import type { ExtractorAdapter, ExtractionRequest, ExtractionResult, ExtractionCandidate, ExtractionDiagnostic } from '../ExtractorAdapter.js';
import { extractPdfLayoutText } from '../PdfTextAdapter.js';

/**
 * Diagnostic codes for Cayman plate-map extraction.
 */
export const CAYMAN_DIAGNOSTIC_CODES = {
  CAYMAN_NO_ROWS_MATCHED: 'CAYMAN_NO_ROWS_MATCHED',
} as const;

/**
 * Factory function that creates a Cayman plate-map adapter.
 * 
 * @returns Promise resolving to an ExtractorAdapter configured for Cayman plate-maps
 */
export async function createCaymanPlateMapAdapter(): Promise<ExtractorAdapter> {
  return {
    async extract(req: ExtractionRequest): Promise<ExtractionResult> {
      try {
        const text = await resolveLayoutText(req);
        const lines = text.split('\n');
        const candidates: ExtractionCandidate[] = [];

        // Expected row shape: "A1  Compound Name  12345-678   10 µM"
        // Well ID: A-H followed by 1-12
        // Compound name: any characters
        // Catalog ID: digits-digits format (e.g., 12345-678)
        // Concentration: number with unit (µM, uM, nM, mM, mg/mL)
        const rowRegex = /^\s*([A-H](?:0?[1-9]|1[0-2]))\s+(.+?)\s{2,}(\d{2,}-\d{2,})\s{2,}([\d.]+\s*(?:µM|uM|nM|mM|mg\/mL))\s*$/;

        for (const line of lines) {
          const m = rowRegex.exec(line);
          if (!m) continue;

          const [, well, name, catalogId, concentration] = m;

          candidates.push({
            target_kind: 'material-spec',
            confidence: 0.85,
            draft: {
              display_name: (name ?? '').trim(),
              catalog_id: (catalogId ?? '').trim(),
              concentration: (concentration ?? '').trim(),
              well: well,
              vendor: 'Cayman Chemical',
            },
            ambiguity_spans: [],
            evidence_span: line.trim().slice(0, 140),
            uncertainty: 'low',
          });
        }

        const diagnostics: ExtractionDiagnostic[] = candidates.length === 0 ? [{
          severity: 'warning',
          code: CAYMAN_DIAGNOSTIC_CODES.CAYMAN_NO_ROWS_MATCHED,
          message: 'Cayman plate-map adapter found no recognizable plate rows',
        }] : [];

        return {
          candidates,
          diagnostics,
        };
      } catch (err) {
        // Adapter MUST NEVER throw - all errors become diagnostics
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return {
          candidates: [],
          diagnostics: [{
            severity: 'error',
            code: 'CAYMAN_EXTRACTION_ERROR',
            message: `Cayman adapter failed: ${errorMessage}`,
          }],
        };
      }
    },
  };
}

/**
 * Resolves the layout text from the extraction request.
 * 
 * If caller passes raw pdf buffer via hint.pdfBuffer, runs layout extraction.
 * Otherwise assumes caller pre-extracted text and passed it in req.text.
 * 
 * @param req - The extraction request
 * @returns Promise resolving to the layout text
 */
async function resolveLayoutText(req: ExtractionRequest): Promise<string> {
  const buf = (req.hint as Record<string, unknown> | undefined)?.pdfBuffer;
  if (buf instanceof Buffer || buf instanceof Uint8Array) {
    const r = await extractPdfLayoutText(buf as Buffer);
    return r.text;
  }
  // Else assume caller pre-extracted text and passed it in req.text.
  return req.text ?? '';
}
