/**
 * Deterministic record-id minting for lab-sync records.
 *
 * IDs are sequential and derived from the existing record set (no random,
 * no clock-dependent identity beyond an explicit date part passed by the
 * caller). Scanning-then-increment is correct at lab scale; the scan is by
 * idPrefix, which RecordStore filters natively.
 */

import type { RecordStore } from '../store/types.js'

/**
 * Next id after the highest existing one for a prefix.
 *
 * prefix "CUST-"        -> "CUST-00019"   (width preserved from existing max)
 * prefix "ORD-" + year  -> "ORD-2026-00428"
 *
 * @param store        Record store to scan (list by idPrefix).
 * @param prefix       Id prefix including trailing dash, e.g. "ORD-".
 * @param opts.datePart Optional middle segment, e.g. "2026-" (include trailing dash).
 */
export async function nextSequentialRecordId(
  store: Pick<RecordStore, 'list'>,
  prefix: string,
  opts: { datePart?: string } = {},
): Promise<string> {
  const fullPrefix = `${prefix}${opts.datePart ?? ''}`
  const records = await store.list({ idPrefix: fullPrefix })

  let max = 0
  let width = 5 // default zero-pad width
  for (const rec of records) {
    if (!rec.recordId.startsWith(fullPrefix)) continue
    const tail = rec.recordId.slice(fullPrefix.length)
    if (!/^\d+$/.test(tail)) continue
    const n = Number.parseInt(tail, 10)
    if (n > max) {
      max = n
      width = Math.max(tail.length, 4)
    }
  }

  const next = max + 1
  return `${fullPrefix}${String(next).padStart(width, '0')}`
}

/**
 * Next numeric id across a set of publisher-minted event ids.
 *
 * existing ["evt_CL_000041", ...] + prefix "evt_CL_" -> "evt_CL_000042"
 * Non-matching ids are ignored. Width preserved from the existing max.
 */
export function nextSequentialEventId(existingIds: Iterable<string>, prefix: string, width = 6): string {
  let max = 0
  let w = width
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue
    const tail = id.slice(prefix.length)
    if (!/^\d+$/.test(tail)) continue
    const n = Number.parseInt(tail, 10)
    if (n > max) {
      max = n
      w = Math.max(tail.length, 4)
    }
  }
  return `${prefix}${String(max + 1).padStart(w, '0')}`
}
