/**
 * plateMapping — join return-data rows to a plate layout by WELL IDENTITY.
 *
 * The core rule (spec §6 + locked decision #5): joins are resolved by
 * well/sample ID, NEVER by filename similarity. This module maps the wells that
 * appear in an instrument output file (from a data-reference) onto the well set
 * of a plate layout (event graph / plate snapshot), and detects when identity
 * is NOT unambiguous — in which case the user must map manually.
 *
 * The join is a pure function so it is exhaustively unit-testable without any
 * storage or app plumbing.
 */

/** Normalize a well id for matching ("a1" → "A1"). */
export function normalizeWell(well: string): string {
  return well.trim().toUpperCase();
}

export interface PlateMappingResult {
  /** Wells present in BOTH the file and the plate layout. */
  matched: string[];
  /** Wells in the file that are NOT in the plate layout → identity unclear. */
  unmatchedInFile: string[];
  /** Plate wells absent from the file (partial reads are normal, informational). */
  missingInFile: string[];
  /**
   * True when the join cannot be trusted: duplicate well content in the file,
   * or file wells that don't exist in the plate layout. Requires user mapping.
   */
  ambiguous: boolean;
  /** Human-readable reason when ambiguous ('' when not). */
  reason: string;
}

/** Collapse an input to its unique, normalized wells preserving first order. */
function uniqueWells(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of raw) {
    const n = normalizeWell(w);
    if (!n) continue;
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Detect duplicate (non-unique) well ids in the input, in order. */
function duplicateWells(raw: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const w of raw) {
    const n = normalizeWell(w);
    if (!n) continue;
    if (seen.has(n)) dups.add(n);
    seen.add(n);
  }
  return [...dups].sort();
}

/**
 * Map file row wells onto a plate layout's well set by identity.
 *
 * @param fileWells  Raw well ids as they appear in the instrument output file.
 * @param plateWells Raw well ids in the plate layout (snapshot / event graph).
 */
export function mapRowsToPlate(fileWells: string[], plateWells: string[]): PlateMappingResult {
  const plateSet = new Set(uniqueWells(plateWells));
  const fileSet = new Set(uniqueWells(fileWells));
  const dups = duplicateWells(fileWells);

  const matched = [...fileSet].filter((w) => plateSet.has(w)).sort();
  const unmatchedInFile = [...fileSet].filter((w) => !plateSet.has(w)).sort();
  const missingInFile = [...plateSet].filter((w) => !fileSet.has(w)).sort();

  // Ambiguity: duplicate content in the file, or wells outside the plate.
  if (dups.length > 0) {
    return {
      matched,
      unmatchedInFile,
      missingInFile,
      ambiguous: true,
      reason: `Duplicate well content in file: ${dups.join(', ')}`,
    };
  }
  if (unmatchedInFile.length > 0) {
    return {
      matched,
      unmatchedInFile,
      missingInFile,
      ambiguous: true,
      reason: `Wells in file not on the plate: ${unmatchedInFile.join(', ')}`,
    };
  }
  return { matched, unmatchedInFile, missingInFile, ambiguous: false, reason: '' };
}