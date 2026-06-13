/**
 * wellRange (server) — expand compact rectangular well ranges emitted by the
 * AI into individual well ids, so any dock that goes through the orchestrator
 * gets literal wells regardless of client.
 *
 * Mirrors app/src/event-editor/lib/wellRange.ts (the server can't import app
 * code in the production build). Keep the two in sync.
 *
 * Token forms (row letters case-insensitive):
 *   "A1:H12" / "A1..H12"  rectangular block (corners in any order)
 *   "A5"                  plain well id — passed through unchanged
 */

const RANGE_RE = /^([A-Za-z]+)(\d+)(?::|\.\.)([A-Za-z]+)(\d+)$/;

/** Bijective base-26 row letters → 0-based index (A→0, Z→25, AA→26). */
export function rowLabelToIndex(label: string): number {
  let n = 0;
  for (const ch of label.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Inverse of rowLabelToIndex (0 → "A", 26 → "AA"). */
export function indexToRowLabel(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Expand a mix of range tokens and singletons into literal wells (row-major, deduped). */
export function expandWellTokens(tokens: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (well: string) => {
    if (!seen.has(well)) {
      seen.add(well);
      out.push(well);
    }
  };

  for (const token of tokens) {
    const match = RANGE_RE.exec(token.trim());
    if (!match) {
      push(token);
      continue;
    }
    const rowA = rowLabelToIndex(match[1]!);
    const rowB = rowLabelToIndex(match[3]!);
    const colA = Number(match[2]);
    const colB = Number(match[4]);
    const rowLo = Math.min(rowA, rowB);
    const rowHi = Math.max(rowA, rowB);
    const colLo = Math.min(colA, colB);
    const colHi = Math.max(colA, colB);
    for (let r = rowLo; r <= rowHi; r += 1) {
      const rowLabel = indexToRowLabel(r);
      for (let c = colLo; c <= colHi; c += 1) {
        push(`${rowLabel}${c}`);
      }
    }
  }
  return out;
}

function expandArrayField(obj: Record<string, unknown>, key: string): boolean {
  const value = obj[key];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return false;
  const expanded = expandWellTokens(value as string[]);
  if (expanded.length === value.length && expanded.every((w, i) => w === value[i])) return false;
  obj[key] = expanded;
  return true;
}

/**
 * Return a copy of an emitted event with any range tokens in its well arrays
 * expanded: `details.wells`, transfer `details.source_wells`/`dest_wells`, and
 * the canonical `details.source.wells`/`target.wells`. Unchanged events are
 * returned as-is.
 */
export function expandEventWells<E extends { details?: unknown }>(event: E): E {
  const details = event.details;
  if (!details || typeof details !== 'object') return event;
  const next: Record<string, unknown> = { ...(details as Record<string, unknown>) };
  let changed = expandArrayField(next, 'wells');
  changed = expandArrayField(next, 'source_wells') || changed;
  changed = expandArrayField(next, 'dest_wells') || changed;
  for (const endpoint of ['source', 'target'] as const) {
    const node = next[endpoint];
    if (node && typeof node === 'object') {
      const copy = { ...(node as Record<string, unknown>) };
      if (expandArrayField(copy, 'wells')) {
        next[endpoint] = copy;
        changed = true;
      }
    }
  }
  return changed ? ({ ...event, details: next } as E) : event;
}
