/**
 * proposalRowFacts — L2-CLARIFY-TARGET-1 (Change 5, P7): the DECLARATIVE row-fact
 * formatter for the proposed-changes rows.
 *
 * The existing rows are UNREADABLE for the deck: four identical
 * `Add material (A2, A3, B2, B3)` rows — the `eventLabel` verb line is the same
 * string on all four, and `eventDetailLine` (the details field-descriptor) does
 * not render the well/volume/material the fact needs. P7 makes each row a
 * checkable fact from the event's OWN `details`:
 *
 *     A2 ← 100 uL DMEM (MAT-dmem-ykg0)
 *
 *   - well(s): `details.well` (string) else `details.wells` (array) → `A2` /
 *     `A2, A3, B2, B3`;
 *   - volume: `details.volumeUl` else `details.volume` (number ⇒ `n uL`;
 *     `{value, unit}` verbatim — the same unit honesty as `eventDetailLine`);
 *   - material: `details.material` when a string;
 *   - record id: `recordIds.get(materialLabel)` — ONLY when present, ABSENT
 *     otherwise, never invented;
 *   - no recognised field ⇒ `null` (the caller keeps today's `eventLabel` +
 *     `eventDetailLine` line — dead chrome is not added).
 *
 * `recordIds` is built by the CALLER (ChatPreviewCard) from the LAST user
 * message via the existing `parsePromptMentions` (no new grammar, no server
 * field, no re-search) — a `label → id` map for the material mentions that
 * carry an `id`. A label mismatch (the answer said `DMEM` but the bound row is
 * `DMEM + FBS`) yields no id — correct.
 *
 * The format is pure display — the event, the record id, and the map are the
 * data; nothing here decides what to write. D1 guardrail: this is the EXISTING
 * proposed-changes list; it does not become a second approval surface.
 */
import type { ChatMessage } from '../types/ai'
import { parsePromptMentions } from '../shared/lib/aiPromptMentions'

/** The P7 row fact: `A2 ← 100 uL DMEM (MAT-dmem-ykg0)` (record id optional). */
export function proposalRowFact(
  event: { eventId: string; event_type?: string; stepId?: string; details?: unknown },
  recordIds?: ReadonlyMap<string, string>,
): string | null {
  const details = event.details as Record<string, unknown> | undefined
  if (!details || typeof details !== 'object') return null

  const parts: string[] = []

  // well(s): details.well (string) else details.wells (array).
  const well = details.well
  const wells = details.wells
  if (typeof well === 'string' && well.trim().length > 0) {
    parts.push(well.trim())
  } else if (Array.isArray(wells)) {
    const wellList = wells
      .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      .map((w) => w.trim())
    if (wellList.length > 0) parts.push(wellList.join(', '))
  }

  // volume: details.volumeUl else details.volume (number ⇒ `n uL`;
  // {value, unit} verbatim — the eventDetailLine unit-honour arm).
  const volumeUl = details.volumeUl
  const volume = details.volume
  if (typeof volumeUl === 'number' && Number.isFinite(volumeUl)) {
    parts.push(`${volumeUl} uL`)
  } else if (typeof volume === 'number' && Number.isFinite(volume)) {
    parts.push(`${volume} uL`)
  } else if (
    (volume && typeof volume === 'object') ||
    (volumeUl && typeof volumeUl === 'object')
  ) {
    const obj = (typeof volumeUl === 'object' ? volumeUl : volume) as { value?: unknown; unit?: unknown }
    if (typeof obj.value === 'number' && Number.isFinite(obj.value)) {
      const unit = typeof obj.unit === 'string' && obj.unit.trim().length > 0 ? obj.unit.trim() : 'uL'
      parts.push(`${obj.value} ${unit}`)
    }
  }

  // material: details.material when a string.
  const material = details.material
  let materialLabel: string | null = null
  if (typeof material === 'string' && material.trim().length > 0) {
    materialLabel = material.trim()
    parts.push(materialLabel)
  }

  // No recognised field ⇒ null (the caller keeps the eventLabel +
  // eventDetailLine line).
  if (parts.length === 0) return null

  // record id: recordIds.get(materialLabel) — only when present, absent
  // otherwise, never invented.
  if (recordIds && materialLabel) {
    const recordId = recordIds.get(materialLabel)
    if (recordId) {
      return `${parts.join(' ← ')} (${recordId})`
    }
  }
  return parts.join(' ← ')
}

/**
 * `label → record id` map from the LAST user message's material mentions that
 * carry an `id` (via the existing parsePromptMentions). `messages` is the
 * caller's `useMemo` input (chat.messages); returns null when there is no
 * last user message (the caller then passes no map → no record ids, the rows
 * still render well ← volume ← material).
 */
export function recordIdsFromLastUserMessage(
  messages: readonly ChatMessage[],
): Map<string, string> | null {
  let lastUser: ChatMessage | undefined
  for (const message of messages) {
    if (message.role === 'user' && typeof message.content === 'string' && message.content.length > 0) {
      lastUser = message
    }
  }
  if (!lastUser) return null
  const mentions = parsePromptMentions(lastUser.content)
  const map = new Map<string, string>()
  for (const mention of mentions) {
    const { type, id, label } = mention
    if (type === 'material' && id && label && !map.has(label)) {
      map.set(label, id)
    }
  }
  return map.size > 0 ? map : null
}
