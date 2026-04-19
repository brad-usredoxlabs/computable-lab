import { findMatchingSpec } from '../ingestion/extractorLibrary.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from './ExtractorAdapter.js';

/**
 * Arguments for finding a matching library extractor.
 */
export interface FindMatchingLibraryExtractorArgs {
  fileName: string;
  contentPreview: string;
  libraryDir?: string;
}

/**
 * Find a matching library spec and wrap it in an ExtractorAdapter.
 * 
 * @param args - Arguments including file name, content preview, and optional library directory
 * @returns An ExtractorAdapter if a matching spec is found, null otherwise
 */
export async function findMatchingLibraryExtractor(
  args: FindMatchingLibraryExtractorArgs,
): Promise<ExtractorAdapter | null> {
  const dir = args.libraryDir ?? `${process.cwd()}/specs/extractors`;
  const match = await findMatchingSpec(args.fileName, args.contentPreview, dir);
  if (!match) return null;
  return buildAdapterFromLibrarySpec(match.spec, match.specFile);
}

/**
 * Build an ExtractorAdapter from a matched library spec.
 * 
 * For v1, this returns a stub adapter that produces a diagnostic indicating
 * the actual conversion logic is pending (to be implemented in spec 022).
 * 
 * @param spec - The matched extraction spec
 * @param specFile - The file path of the matched spec
 * @returns An ExtractorAdapter instance
 */
async function buildAdapterFromLibrarySpec(_spec: Record<string, unknown>, specFile: string): Promise<ExtractorAdapter> {
  // Cayman plate-map PDF adapter - specialized handler for Cayman Chemical screening library
  if (specFile.endsWith('cayman-plate-map-pdf.yaml')) {
    const { createCaymanPlateMapAdapter } = await import('./adapters/CaymanPlateMapAdapter.js');
    return await createCaymanPlateMapAdapter();
  }

  // Vendor formulation adapter - handles vendor product pages with reagent tables
  if (/^vendor-formulation.*\.yaml$/i.test(specFile)) {
    const { createVendorFormulationAdapter } = await import('./adapters/VendorFormulationAdapter.js');
    return await createVendorFormulationAdapter();
  }

  // Fallback stub for other library specs
  return {
    async extract(_req: ExtractionRequest): Promise<ExtractionResult> {
      // Delegate to the existing spec-driven runner and convert its
      // output into ExtractionCandidate[] shape.
      // See spec 022 for the conversion details. For v1, return an empty
      // result with an info diagnostic pointing at the spec file.
      return {
        candidates: [],
        diagnostics: [{
          severity: 'info' as const,
          code: 'LIBRARY_SPEC_STUB',
          message: `Matched library spec ${specFile}; conversion to ExtractionCandidate[] pending (spec 022)`,
          details: { specFile },
        }],
      };
    },
  };
}
