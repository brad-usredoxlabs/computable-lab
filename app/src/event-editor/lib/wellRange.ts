/**
 * wellRange — expand compact rectangular well ranges into individual well ids.
 *
 * The AI emits events whose `wells` arrays can list 96+ ids ("A1","A2",…),
 * which burns a lot of tokens. With this, the model can instead emit a
 * rectangular range ("A1:H12") and we expand it on ingest, so the stored event
 * graph keeps its existing literal-wells format and nothing downstream has to
 * understand ranges.
 *
 * Supported token forms (case-insensitive on the row letters):
 *   "A1:H12"  rectangular block, rows A–H × cols 1–12 (96 wells)
 *   "A1..H12" same, double-dot separator (matches our wellNaming hints)
 *   "A5"      a plain well id — passed through unchanged
 * Corners may be given in any order ("H12:A1" == "A1:H12").
 */

import type { WellId } from '../../types/plate'

// START..END or START:END, where each endpoint is row-letters + column-number.
const RANGE_RE = /^([A-Za-z]+)(\d+)(?::|\.\.)([A-Za-z]+)(\d+)$/

/**
 * L2-CLARIFY-TARGET-1 (fix1/D4, adversarial l2t0230) — the app's ONE
 * well-address shape predicate, parity-pinned BYTE-FOR-BYTE to the server's
 * canonical compiler WELL_RE (server/src/compiler/pipeline/passes/
 * ChatbotCompilePasses.ts:3031 and its parity mirror
 * normalizeScientistIntent.ts:73 `WELL_ADDRESS_SHAPE_RE`):
 * a physical plate-address fact (rows A–P, columns 1–24), NOT domain policy.
 *
 * The ClarifyWellTargetSlot (app/src/agent) previously carried a SECOND
 * `WELL_RE = /^([A-P])(\d+)$/i` + a hand-rolled `rangeBetween` — a different
 * second vocabulary that accepted any column (`A99`, `P99`) while the
 * server's own shape test rejects it, and the answer travelled as an array
 * no server-side shape gate inspects (AgentOrchestrator.ts:269 only
 * JSON.stringify's the ref into the prompt). ONE grammar: the slot now
 * validates through this single bounds set + the ONE `expandWellTokens`
 * parser above, so a non-address the server would bar is rejected here too —
 * no parallel validation, no duplicated range expansion.
 */
export const WELL_ADDRESS_SHAPE_RE = /^[A-P](?:[1-9]|1[0-9]|2[0-4])$/

/**
 * The app's ONE address-literal test (parity mirror of the server's
 * `isWellAddressLiteral`, normalizeScientistIntent.ts:88): a trimmed scalar is
 * an address literal iff the ONE parser (`expandWellTokens`) resolves it to one
 * or more tokens AND every token is plate-address-shaped under
 * `WELL_ADDRESS_SHAPE_RE`. "A1:H12" -> 96 shaped tokens => literal;
 * "control_well" / "bogus_role" / "A1:ZZ99" (ZZ99 not shaped) -> NOT literal.
 * Returns null (not shaped) so the caller can disable the affordance.
 */
export function expandWellAddressLiteral(value: string): string[] | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const tokens = expandWellTokens([trimmed])
  if (tokens.length === 0) return null
  return tokens.every((token) => WELL_ADDRESS_SHAPE_RE.test(token)) ? tokens : null
}

/** Bijective base-26 row letters → 0-based index (A→0, Z→25, AA→26). */
export function rowLabelToIndex(label: string): number {
  let n = 0
  for (const ch of label.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64) // 'A' → 1
  }
  return n - 1
}

/** Inverse of rowLabelToIndex (0 → "A", 26 → "AA"). */
export function indexToRowLabel(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * Expand a list of well tokens (a mix of ranges and singletons) into the full
 * row-major list of well ids, de-duplicated and order-preserving. Tokens that
 * aren't ranges pass through verbatim.
 */
export function expandWellTokens(tokens: readonly string[]): WellId[] {
  const out: WellId[] = []
  const seen = new Set<string>()
  const push = (well: string) => {
    if (!seen.has(well)) {
      seen.add(well)
      out.push(well)
    }
  }

  for (const token of tokens) {
    const match = RANGE_RE.exec(token.trim())
    if (!match) {
      push(token)
      continue
    }
    const rowA = rowLabelToIndex(match[1])
    const rowB = rowLabelToIndex(match[3])
    const colA = Number(match[2])
    const colB = Number(match[4])
    const rowLo = Math.min(rowA, rowB)
    const rowHi = Math.max(rowA, rowB)
    const colLo = Math.min(colA, colB)
    const colHi = Math.max(colA, colB)
    for (let r = rowLo; r <= rowHi; r += 1) {
      const rowLabel = indexToRowLabel(r)
      for (let c = colLo; c <= colHi; c += 1) {
        push(`${rowLabel}${c}`)
      }
    }
  }
  return out
}

function expandArrayField(obj: Record<string, unknown>, key: string): boolean {
  const value = obj[key]
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return false
  const expanded = expandWellTokens(value as string[])
  if (expanded.length === value.length && expanded.every((w, i) => w === value[i])) return false
  obj[key] = expanded
  return true
}

/**
 * Return a copy of an event with any range tokens in its well arrays expanded.
 * Covers the well-array fields used across event types: `wells`, transfer's
 * `source_wells`/`dest_wells`, and the canonical `source.wells`/`target.wells`.
 * Returns the original reference unchanged when there's nothing to expand.
 */
export function expandEventWells<E extends { details: unknown }>(event: E): E {
  const details = event.details as Record<string, unknown> | undefined
  if (!details || typeof details !== 'object') return event
  const next: Record<string, unknown> = { ...details }
  let changed = expandArrayField(next, 'wells')
  changed = expandArrayField(next, 'source_wells') || changed
  changed = expandArrayField(next, 'dest_wells') || changed
  for (const endpoint of ['source', 'target'] as const) {
    const node = next[endpoint]
    if (node && typeof node === 'object') {
      const copy = { ...(node as Record<string, unknown>) }
      if (expandArrayField(copy, 'wells')) {
        next[endpoint] = copy
        changed = true
      }
    }
  }
  return changed ? { ...event, details: next } : event
}
