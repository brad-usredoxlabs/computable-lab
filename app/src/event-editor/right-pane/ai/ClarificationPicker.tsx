/**
 * ClarificationPicker — inline material/labware chooser for an AI clarification.
 *
 * When the agent asks "which material/labware did you mean?" (a `/m` or `/l`
 * clarification), the static option buttons aren't enough: the agent often has
 * few or no candidates (e.g. it couldn't ground "CHO cells"). This control lets
 * the user search the workspace + ontologies and **mint a local proposed term**,
 * reusing the exact slash-menu resolvers (`resolveMaterial` / `resolveLabware`)
 * and list UI the TapTab editor uses — so grounding behaves identically here.
 *
 * The picked suggestion is converted to an `AiClarificationAnswer` (mention
 * token + structured ref) and handed back via `onPick`; the panel's existing
 * `handleClarificationAnswer` round-trips it into the next agent turn.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../../types/ai'
import { resolveMaterial, resolveLabware, resolveEquipment } from '../../../shared/taptab/slashMenu/resolvers'
import { SlashSuggestionList } from '../../../shared/taptab/slashMenu/SlashSuggestionList'
import type {
  SlashMention,
  SlashResolver,
  SlashSuggestion,
} from '../../../shared/taptab/slashMenu/types'
import { groundMaterialRef } from '../../lib/groundMaterialRef'
import { apiClient } from '../../../shared/api/client'
import { mintLocalTermLabel } from '../../../shared/taptab/slashMenu/resolvers'
import { badgeStyles, VOCABULARY_BADGE } from '../../../shared/taptab/slashMenu/tokens'

/** CURIE-shaped id (e.g. "CHEBI:17790") — an ontology ref, not a local record. */
const CURIE_RE = /^[A-Za-z][\w.-]*:\S+$/

function resolverFor(request: AiClarificationRequest): SlashResolver | null {
  if (request.menuProvider === '/l' || request.kind === 'labware') return resolveLabware
  if (request.menuProvider === '/e') return resolveEquipment
  if (request.menuProvider === '/m') return resolveMaterial
  return null
}

/**
 * Does this question have anything to PICK? A parameter question ("what volume?")
 * has no menu on purpose — it is answered by typing — so the panel must render
 * the free-text box instead of this picker. Without this distinction the card
 * showed the question and no way to answer it (reported 2026-09-20).
 */
export function requestHasPicker(request: AiClarificationRequest): boolean {
  return resolverFor(request) !== null
}

/**
 * L2-SUITE-A-uifix2 [C] — the single-open picker store. The re-gate (DEFECT 3,
 * the prior-gate D7 class): EVERY clarification card auto-opened its picker and
 * the pickers STACKED over the transcript (10 → 13 → 15 → 16 open
 * [role=listbox] across P4–P6, still open after a full page load).
 *
 * The fix is open-on-request with a single open picker. The open key is module
 * state (not a React context): the pickers live in DIFFERENT components across
 * the transcript (ChatLog's typed-clarification arm, the QuestionsPanel,
 * ClarificationPanel) and there is no shared provider above them — a module
 * store + useSyncExternalStore is the one mechanism that coordinates them.
 * At most ONE picker is open; opening one closes the previously-open one; a
 * fresh mount (page load) starts CLOSED (no open key), so a reload restores no
 * open pickers. The key is the QUESTION's identity (request.id) — stable
 * across the card's renders.
 */
const pickerOpenState: { key: string | null } = { key: null }
const pickerListeners = new Set<() => void>()
function notifyPickers(): void {
  for (const l of pickerListeners) l()
}

/**
 * Open one picker programmatically (the "Change" affordance on an ANSWERED
 * card re-opens its picker). The store key is the single source of truth, so
 * this moves the key to `id` — opening it and closing every other picker
 * (single-open). Exported (not a React API) so QuestionsPanel's Change button
 * can reopen a card's picker without reaching into its internals.
 */
export function openClarificationPicker(id: string): void {
  pickerOpenState.key = id
  notifyPickers()
}

/**
 * Open state for one picker. The input renders ALWAYS (the answer affordance);
 * only the popover/listbox is gated on `open`. TWO resolver passes exist:
 * (1) the popover pass runs only when open (no auto-search on mount); and
 * (2) L2-CLARIFY-PICKER-1 (P3, OQ3 ruling) a BOUNDED, popover-closed, non-UI
 * pass on the seeded noun at card mount — it fetches candidates for the
 * top-three inline buttons ONLY. It must NOT open the picker: the single-open
 * store and the open-on-request semantics are exactly as pinned (uifix2 [C]).
 * `open` is the single-open store key === this picker's question id: opening
 * this one moves the key (closing every sibling); dismissal — picking a row
 * (onPick), an outside mousedown, or Escape — clears it; a fresh mount (page
 * load) sees storeKey=null, so reloads restore NO open pickers.
 */
function useClarificationPickerOpen(key: string) {
  const storeKey = useSyncExternalStore(
    (callback) => {
      pickerListeners.add(callback)
      return () => pickerListeners.delete(callback)
    },
    () => pickerOpenState.key,
  )
  const openPicker = () => {
    pickerOpenState.key = key
    notifyPickers()
  }
  const closePicker = () => {
    if (pickerOpenState.key === key) {
      pickerOpenState.key = null
      notifyPickers()
    }
  }
  return { open: storeKey === key, openPicker, closePicker }
}

/**
 * How each material layer is said out loud. The biologist should never have to
 * infer, from a list of mixed records, that "formulation" means "the prepared
 * solution" — the placeholder states what this question is asking for.
 */
const LAYER_PLACEHOLDER: Record<
  NonNullable<AiClarificationRequest['materialLayer']>,
  string
> = {
  material: 'Search compounds, reagents, cell lines…',
  'material-spec': 'Search prepared solutions and saved stocks…',
  'material-instance': 'Search preparations in the lab…',
  aliquot: 'Search aliquots in the lab…',
  'vendor-product': 'Search vendor catalog items…',
}

function safeMentionPart(value: string): string {
  return value.replace(/[\]\n\r]/g, '').trim()
}

/**
 * L2-CLARIFY-CARD-1 (W14/P5) — the mint label is the PROMPT's noun, not the
 * live filter box. `request.query` (the noun the fact names; the server sets it
 * at the bar, shorthandChat.ts:902) is the seed; the user's typed text is used
 * ONLY when the fact named no noun (the empty-seed "of what?" fact). This is
 * the W14 root cause in one expression: the label never tracks the filter.
 *
 * L2-CLARIFY-CARD-1 (browser-gate fix2, D-2 — mint honesty): `request.query`
 * can arrive as the model's MINT-INTENT shape rather than a bare noun —
 * `{mint:{label,domain}}` (the grounding DSL the drafting contract tells the
 * model to emit, AgentOrchestrator.ts:570). Observed live (gate
 * 2026-11-02_1530-tier1, shots/02-draw-02.png): the card seeded the mint
 * LABEL from that blob verbatim, so `[data-testid="clarification-mint-label"]`
 * and the honest preview read the raw JSON (`Create material record
 * "{mint:{…}}" in the lab (new record)`) and the Create button offered to
 * write a durable material record named after raw JSON. The unwrap below is
 * the ONE seeding point that recovers the prompt's noun from that shape (the
 * `mint.label` the DSL carries), generic over the value's type — it handles
 * the structured `{mint:{label}}` object AND the JSON-string form the wire
 * actually delivered (a `value` attribute cannot hold an object), and is
 * shape-driven (never a free-text / substring sniff). A bare noun passes
 * through byte-unchanged, so every existing pin is untouched.
 */
/**
 * The prompt's noun out of a `request.query` value, whatever shape it arrived
 * in. A bare string is the prompt's noun verbatim (byte-unchanged). The
 * mint-intent DSL — a structured `{mint:{label|name,…}}` object, or its
 * serialized text — carries the noun under `mint.label` (or `mint.name`);
 * that is what the row must name and what the Create button must mint.
 *
 * What counts as a noun is deliberately NARROW (advc-c3 D3):
 *  - a bare (non-bracketed) string — the noun verbatim;
 *  - the structured `{mint:{label|name}}` object (the drafting shape);
 *  - WELL-FORMED JSON of that same shape (the `value` attribute can carry an
 *    object only as text);
 *  - the JS-OBJECT-LITERAL form the live wire actually delivered (unquoted
 *    keys — receipt dom/draw-02.json), parsed by the quote/escape-aware
 *    scanner below.
 * Everything else — a JSON array (`["frobnicate","zymosolve"]`, the plausible
 * array-typed-slot wire shape), a quoted scalar (`"frobnicate"`), a number,
 * null, a bracketed string that is not the DSL shape — returns ''. That is
 * the empty-seed "of what?" fact: the row's predicate (mintAvailable) keeps
 * the mint affordance HIDDEN rather than minting a truncated or bracketed
 * label (the pre-fix `[^"']*` regex stopped at an inner apostrophe —
 * `{mint:{label:"O'Brien extract"}}` minted a record named "O").
 */
function mintNounFromQuery(query: unknown): string {
  // (1) The structured mint-intent object (the shape the drafting contract emits).
  if (query && typeof query === 'object' && !Array.isArray(query)) {
    const q = query as Record<string, unknown>
    const mint = q.mint
    if (mint && typeof mint === 'object' && !Array.isArray(mint)) {
      const m = mint as Record<string, unknown>
      if (typeof m.label === 'string' && m.label.trim()) return m.label.trim()
      if (typeof m.name === 'string' && m.name.trim()) return m.name.trim()
    }
    // A plain (non-mint) object has no mintable noun — the row must not mint
    // a serialized object.
    return ''
  }
  if (typeof query !== 'string') return ''
  const trimmed = query.trim()
  // A quoted SCALAR (`"frobnicate"`) is a serialized value, not a bare noun —
  // the reviewer's pin: a quoted string is NOT a mintable noun (the pre-fix
  // `startsWith('{')` gate let it through verbatim, label = `"frobnicate"`
  // with the quotes). A bare noun never LEADS with a quote.
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return ''
  // A bare noun — byte-unchanged (never a bracketed serialized value).
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed
  // (2) Bracketed: only WELL-FORMED JSON of the {mint:{label|name}} shape is a
  // noun. A JSON ARRAY parses fine but is not the mint-intent shape — the same
  // for a quoted scalar or a number: all return '' (the affordance stays
  // hidden). The pre-fix code returned any non-`{` string verbatim, so
  // `["frobnicate","zymosolve"]` reached the mint row as a "label".
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    parsed = undefined
  }
  if (parsed !== undefined) {
    if (Array.isArray(parsed) || !parsed || typeof parsed !== 'object') return ''
    const mint = (parsed as Record<string, unknown>).mint
    if (mint && typeof mint === 'object' && !Array.isArray(mint)) {
      const m = mint as Record<string, unknown>
      if (typeof m.label === 'string' && m.label.trim()) return m.label.trim()
      if (typeof m.name === 'string' && m.name.trim()) return m.name.trim()
    }
    return ''
  }
  // (3) Not JSON — the wire delivered the DSL as a JS-OBJECT-LITERAL string
  // (unquoted keys, e.g. {mint:{label:"frobnicate",domain:"chemical"}}; the
  // LIVE wire form — receipt dom/draw-02.json). Parse the DECLARED DSL shape
  // with a tolerant, QUOTE/ESCAPE-AWARE scanner (never the pre-fix
  // /label\s*:\s*["']([^"']*)["']/ regex — it stopped at an inner apostrophe
  // and truncated the noun). Shape-driven: anchored on the DSL's own property
  // names (`mint`, then `label`/`name`), never a free-text / prompt substring
  // sniff. A `{...}` that is not that shape — or any other non-object literal —
  // is NOT a noun.
  if (!trimmed.startsWith('{')) return ''
  // The literal must span the WHOLE value — trailing junk
  // (`{mint:{label:"a"}}extra`) is not the DSL shape (a bare noun's byte
  // range would include it; a mintable noun does not carry it).
  const outerClose = matchBrace(trimmed, 0)
  if (outerClose === -1 || trimmed[outerClose + 1] !== undefined) return ''
  const mintBlock = objectLiteralField(trimmed, 'mint', 'object')
  if (mintBlock === null) return ''
  const label = objectLiteralField(mintBlock, 'label', 'string')
  if (label !== null && label.trim()) return label.trim()
  const name = objectLiteralField(mintBlock, 'name', 'string')
  if (name !== null && name.trim()) return name.trim()
  return ''
}

const IDENT_CHARS = /[A-Za-z0-9_$]/
const WS_CHARS = /[\t\r\n ]/

/**
 * The index just past the closing quote of the string that opens at `i`
 * (`s[i]` is `"` or `'`), or -1 when the string is unterminated. A backslash
 * escapes the NEXT character (an escaped quote is not the terminator), so a
 * value like `"O'Brien extract"` is read WHOLE — the opening quote governs,
 * and a quote of the OTHER kind inside the value is part of the value.
 */
function skipQuoted(s: string, i: number): number {
  const quote = s[i]
  let k = i + 1
  while (k < s.length) {
    const c = s[k]
    if (c === '\\') {
      k += 2
      continue
    }
    if (c === quote) return k + 1
    k++
  }
  return -1
}

/**
 * The index of the `}` matching the `{` at `open` (brace-matching that
 * respects quote/escape state — braces inside string values never count), or
 * -1 when unbalanced.
 */
function matchBrace(s: string, open: number): number {
  let depth = 0
  let i = open
  while (i < s.length) {
    const c = s[i]
    if (c === '"' || c === "'") {
      const close = skipQuoted(s, i)
      if (close === -1) return -1
      i = close
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

/** Decode the backslash escapes of a quoted literal's inner text. */
function decodeQuoted(raw: string): string {
  let out = ''
  for (let k = 0; k < raw.length; k++) {
    const c = raw[k]
    if (c !== '\\') {
      out += c
      continue
    }
    k++
    const e = raw[k]
    if (e === undefined) break
    if (e === 'u') {
      const hex = raw.slice(k + 1, k + 5)
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16))
        k += 4
        continue
      }
      out += e
      continue
    }
    const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' }
    out += simple[e] ?? e
  }
  return out
}

/**
 * A top-level field of an object-literal body (`body` INCLUDES the outer
 * braces) by property NAME — the quote/escape-aware replacement for the
 * pre-fix regex arms. Returns the field's value: `kind: 'object'` -> the
 * field's raw `{...}` text; `kind: 'string'` -> the UNESCAPED string value.
 * `null` when the key is absent, the value has the wrong kind, or the body is
 * malformed (never throws). Only depth-1 (top-level) keys are read, and a
 * key match must be a STANDALONE identifier (not a prefix/suffix of a longer
 * name, not inside a string value), so e.g. `mints` / `xmint` / a `mint`
 * inside a label value can never be mistaken for the DSL's `mint` block.
 */
function objectLiteralField(body: string, key: string, kind: 'object' | 'string' | 'scalar'): string | null {
  const n = body.length
  if (n < 2 || body[0] !== '{') return null
  let depth = 0
  for (let i = 0; i < n; i++) {
    const c = body[i]
    if (c === '"' || c === "'") {
      const close = skipQuoted(body, i)
      if (close === -1) return null
      i = close - 1
      continue
    }
    if (c === '{') {
      depth++
      continue
    }
    if (c === '}') {
      depth--
      continue
    }
    if (depth !== 1) continue
    if (!body.startsWith(key, i)) continue
    const before = body[i - 1]
    const after = body[i + key.length]
    if ((before !== undefined && IDENT_CHARS.test(before)) || (after !== undefined && IDENT_CHARS.test(after))) continue
    let j = i + key.length
    while (j < n && WS_CHARS.test(body[j])) j++
    if (body[j] !== ':') continue
    j++
    while (j < n && WS_CHARS.test(body[j])) j++
    if (kind === 'object') {
      if (body[j] !== '{') return null
      const close = matchBrace(body, j)
      if (close === -1) return null
      return body.slice(j, close + 1)
    }
    if (body[j] === '"' || body[j] === "'") {
      const close = skipQuoted(body, j)
      if (close === -1) return null
      return decodeQuoted(body.slice(j + 1, close - 1))
    }
    if (kind === 'scalar') {
      // Unquoted scalar value: read until ',' or '}' at depth 1 (respecting quotes).
      // Terminated by comma or closing brace — handles {mint:{label:nile red stain,domain:chemical}}
      let start = j
      let k = j
      while (k < n) {
        const ch = body[k]
        if (ch === '"' || ch === "'") {
          const sc = skipQuoted(body, k)
          if (sc === -1) return null
          k = sc
          continue
        }
        if (ch === '{') {
          const mc = matchBrace(body, k)
          if (mc === -1) return null
          k = mc + 1
          continue
        }
        if (ch === ',' || ch === '}') break
        k++
      }
      const val = body.slice(start, k).trim()
      if (val) return val
      return null
    }
    return null
  }
  return null
}

/**
 * Unwrap a mint blob from a raw label string.
 * A mint blob is a serialized DSL: {mint:{label:…}} (unquoted) or
 * {mint:{label:"…"}} (quoted). Returns the inner human label or null.
 * Non-mint objects ({foo:1}) and bare strings return null.
 */
function unwrapMintBlob(label: string): string | null {
  const trimmed = label.trim()
  if (!trimmed.startsWith('{')) return null
  // Try JSON.parse first — handles quoted-key JSON blobs like {"mint":{"label":"..."}}
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown> | undefined
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const mint = parsed.mint
      if (mint && typeof mint === 'object' && !Array.isArray(mint)) {
        const m = mint as Record<string, unknown>
        if (typeof m.label === 'string' && m.label.trim()) return m.label.trim()
        if (typeof m.name === 'string' && m.name.trim()) return m.name.trim()
      }
      return null // valid JSON without a mint block: not a mint blob
    }
  } catch {
    // not JSON — fall through to the unquoted DSL scan below
  }
  // Check for the mint block at the top level
  const mintBlock = objectLiteralField(trimmed, 'mint', 'object')
  if (mintBlock === null) return null
  // Read the label value: try quoted first, then unquoted scalar
  let val = objectLiteralField(mintBlock, 'label', 'string')
  if (val !== null && val.trim()) return val.trim()
  val = objectLiteralField(mintBlock, 'label', 'scalar')
  if (val !== null && val.trim()) return val.trim()
  // Also try 'name' as fallback
  val = objectLiteralField(mintBlock, 'name', 'string')
  if (val !== null && val.trim()) return val.trim()
  val = objectLiteralField(mintBlock, 'name', 'scalar')
  if (val !== null && val.trim()) return val.trim()
  return null
}

export function mintLabelFor(request: AiClarificationRequest, query: string): string {
  // L2-CLARIFY-CARD-1 (defect 5, ruling l2t1951 Q1): the MINT SEED reads the
  // RAW provenance label FIRST (request.unresolvedFact.label — the server's
  // verbatim ScientistIntentUnresolvedFact, human case), NOT request.query
  // (the canonical DISPLAY form the D3 fold produced). Feeding the fold back
  // as the durable title is what ruling §2 rule 3 forbids. The rendered
  // identity row (the search input's seedNoun) and the preview keep
  // request.query; only this mint input seeds from the raw label. The client
  // SELECTS the raw field — it never transforms case. Type-guarded (the wire
  // declares unresolvedFact? OPTIONAL — types.ts:621), never assumed.
  //
  // M2 (browser regate #4 finding): the raw label can be a SERIALIZED mint
  // blob {mint:{label:…}} — unquoted form from the live receipt. Unwrap it
  // to the inner human label. A non-mint object ({foo:1}) passes through
  // as '' so the fallback chain uses the query-derived noun. A bare label
  // passes through byte-unchanged.
  //
  // The fallback is NOT a casing hole: the only OTHER mint-capable request
  // family is the gap request (forceMaterialClarifications.ts:521-523/:537-539,
  // request.query = gap.label — RAW provenance; that path never rides the D3
  // canonical fold), so on every mint-capable shape the chain ends at a
  // raw-case string, never at a fold.
  if (request.unresolvedFact && typeof request.unresolvedFact.label === 'string') {
    const rawLabel = request.unresolvedFact.label.trim()
    if (rawLabel) {
      // M2: try to unwrap a mint blob first
      const unwrapped = unwrapMintBlob(rawLabel)
      if (unwrapped) return unwrapped
      // Non-mint object literal ({foo:1}): do NOT use as durable name —
      // fall through to the query-derived noun. A serialized object should
      // never become a record's name. Skip the raw label and let the
      // fallback chain handle it.
      if (!rawLabel.startsWith('{')) return rawLabel
    }
  }
  return mintNounFromQuery(request.query) || query.trim()
}

/** Append `more` to `base`, dedupe by key, keep `pinBottom` rows last. */
function merge(base: SlashSuggestion[], more: SlashSuggestion[]): SlashSuggestion[] {
  const seen = new Set(base.map((s) => s.key))
  const all = [...base]
  for (const s of more) {
    if (seen.has(s.key)) continue
    seen.add(s.key)
    all.push(s)
  }
  const pinned = all.filter((s) => s.pinBottom)
  const rest = all.filter((s) => !s.pinBottom)
  return [...rest, ...pinned]
}

/**
 * Turn a chosen slash mention into a clarification answer, grounding ontology
 * picks to a local record first.
 *
 * A bare ontology CURIE (e.g. `XCO:0000988`) sent back to the agent isn't in
 * `<resolved_context>`, so the forced-draft "clarify any un-grounded material"
 * rule re-fires and the clarification loops. Grounding it to a local proposed
 * record (the same `groundOntologyMaterial` path the rest of the app uses) makes
 * the mention resolvable, so the agent accepts it. Grounding failure falls back
 * to the ontology answer — accept-time normalization stays the net.
 */
export async function groundedAnswerFromMention(
  request: AiClarificationRequest,
  mention: SlashMention,
): Promise<AiClarificationAnswer | null> {
  if (mention.type === 'material' && mention.entityKind === 'material' && CURIE_RE.test(mention.id)) {
    const grounded = await groundMaterialRef({
      kind: 'ontology',
      id: mention.id,
      namespace: mention.id.split(':')[0] ?? '',
      label: mention.label,
    })
    if (grounded.kind === 'record') {
      const recordType = grounded.type ?? 'material'
      const label = grounded.label ?? mention.label
      return {
        requestId: request.id,
        label,
        mentionToken: `[[${recordType}:${safeMentionPart(grounded.id)}|${safeMentionPart(label)}]]`,
        ref: { kind: 'record', id: grounded.id, type: recordType, label },
      }
    }
  }
  return answerFromMention(request, mention)
}

/** Turn a chosen slash mention into the structured clarification answer. */
export function answerFromMention(
  request: AiClarificationRequest,
  mention: SlashMention,
): AiClarificationAnswer | null {
  if (mention.type === 'labware') {
    const id = safeMentionPart(mention.id)
    if (!id) return null
    return {
      requestId: request.id,
      label: mention.label,
      mentionToken: `[[labware:${id}|${safeMentionPart(mention.label)}]]`,
      ref: { kind: 'labware', id, label: mention.label },
    }
  }
  if (mention.type === 'equipment') {
    const id = safeMentionPart(mention.id)
    if (!id) return null
    return {
      requestId: request.id,
      label: mention.label,
      mentionToken: `[[equipment:${id}|${safeMentionPart(mention.label)}]]`,
      ref: { kind: 'record', id, type: 'equipment', label: mention.label },
    }
  }
  if (mention.type === 'material') {
    const id = safeMentionPart(mention.id)
    if (!id) return null
    const isOntology = mention.entityKind === 'material' && CURIE_RE.test(id)
    return {
      requestId: request.id,
      label: mention.label,
      mentionToken: `[[${mention.entityKind}:${id}|${safeMentionPart(mention.label)}]]`,
      ref: isOntology
        ? { kind: 'ontology', id, label: mention.label }
        : { kind: 'record', id, type: mention.entityKind, label: mention.label },
    }
  }
  return null
}

export interface ClarificationPickerProps {
  request: AiClarificationRequest
  onPick: (answer: AiClarificationAnswer, request: AiClarificationRequest) => void
}

export function ClarificationPicker({ request, onPick }: ClarificationPickerProps) {
  // L2-SUITE-A-uifix2 [C]: open-on-request + single-open. The input (the answer
  // affordance) renders always; the popover/listbox + the resolver run only
  // when open (no auto-open on mount, no stacking, no open pickers on reload).
  const { open, openPicker, closePicker } = useClarificationPickerOpen(request.id)
  const containerRef = useRef<HTMLDivElement>(null)
  // L2-CLARIFY-CARD-1 (browser-gate fix2, D-2): the SEED noun for this fact —
  // one unwrap (mintNounFromQuery) that recovers the prompt's noun from a
  // bare string OR the model's mint-intent `{mint:{label,domain}}` shape (the
  // live wire delivered it as a JSON string). Every seeded surface below —
  // the search box, the mint label, the bounded mount-pass resolver — reads
  // the SAME value, so a mint-intent fact seeds the noun ("frobnicate"),
  // never the raw blob.
  const seedNoun = mintNounFromQuery(request.query)
  const [query, setQuery] = useState(seedNoun)
  // L2-CLARIFY-CARD-1 (P5): the mint row's OWN label — seeded from the
  // prompt's noun (mintLabelFor), NOT the live filter box. It is the ONLY
  // edit surface: typing in the SEARCH box no longer changes what is minted;
  // editing THIS input does, and the preview (the one-source sentence)
  // follows before the click.
  const [mintLabel, setMintLabel] = useState(() => mintLabelFor(request, seedNoun))

  // L2-SUITE-A-uifix2 [C]: release the single-open key on unmount. If THIS
  // picker is the open one and its card is removed (collapse, re-bar, page
  // unmount), the open key must not leak — a fresh mount (a page load, or the
  // next card) must never inherit an open state. This is also what makes
  // "page load restores NO open pickers" hold: every unmounted picker clears
  // the key, so a reload starts closed.
  useEffect(() => {
    return () => {
      if (pickerOpenState.key === request.id) {
        pickerOpenState.key = null
        notifyPickers()
      }
    }
  }, [request.id])
  // L2-CLARIFY-PICKER-1 (Change 4, W3 geometry — amendment (b)): the in-flow
  // `--above` FLIP is GONE. Upward overflow of an absolutely-positioned
  // descendant is NOT scroll-recoverable (ChatLog.css:153-167 — the re-override
  // exists for a documented reason and STAYS); the flip put the listbox at
  // y=198 against a scrollport top of 255 and clipped the first row forever.
  // The popover now renders via createPortal to document.body anchored at the
  // field (fixed positioning: the field's rect, measured on open + on scroll),
  // with max-height = distance to the viewport bottom and its OWN overflow-y
  // scrollbar — every row is reachable via the list's own scroll, nothing is
  // clipped, and the `--above` modifier is never re-enabled. The portal keeps
  // the dismissal listeners (outside-mousedown / Escape, below) working: the
  // picker root is no longer the popover's DOM ancestor, so the outside test
  // also ignores the portal node.
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  // L2-SUITE-A-uifix3 D5 (regate-5): the seeded search field — see the
  // onFocus select() on the input below. Change 4 (W3, portal): the field is
  // also the portal ANCHOR (its rect positions the document.body popover);
  // declared here (not after the `!resolver` early return) — hook order.
  const searchAnchorRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<SlashSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<{ onKeyDown(e: KeyboardEvent): boolean } | null>(null)

  const resolver = resolverFor(request)

  // L2-CLARIFY-PICKER-1 (P3): the top THREE ranked candidates as inline buttons
  // (one click answers the card). Filled by the bounded, popover-closed mount
  // pass below (OQ3) AND by the open popover's own results (they are the same
  // ranked list — the escape hatch re-runs the same resolver pass). Mint/
  // floor rows (resolveMention) and disabled rows are NOT inlined: only
  // concrete candidates. A card with zero candidates behaves exactly as today
  // (bait 8: mint/preconditions path untouched) — the buttons + hatch simply
  // do not render.
  const [topCandidates, setTopCandidates] = useState<SlashSuggestion[]>([])
  const topRef = useRef<SlashSuggestion[]>([])
  topRef.current = topCandidates
  const busyRef = useRef(false)

  /**
   * A NEW question must never inherit the previous one's search. The questions
   * panel reuses this component across clarifications (the id is the question's
   * identity), so without this the rows shown for a new material were the
   * previous material's — observed 2026-09-20: "add 1 million HepG2 cells"
   * answered with clofibrate options.
   */
  useEffect(() => {
    setQuery(seedNoun)
    setItems([])
    setTopCandidates([])
    // L2-CLARIFY-CARD-1 (P5): a NEW question re-seeds the mint label from the
    // prompt's noun (the SAME request.id reset law as the query) — a new fact
    // must never inherit the previous one's minted name.
    setMintLabel(mintLabelFor(request, seedNoun))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.query])

  const command = useCallback(
    (item: SlashSuggestion) => {
      if (item.disabled || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      void (async () => {
        try {
          // Mint affordance produces its mention async; everything else is inline.
          const mention = item.resolveMention ? await item.resolveMention() : item.mention
          if (!mention) return
          const answer = await groundedAnswerFromMention(request, mention)
          if (answer) {
            onPick(answer, request)
            // Dismiss-on-select: a pick answers the question, so the picker
            // closes (no open picker lingering beside the answered card).
            closePicker()
          }
        } catch {
          // groundedAnswerFromMention can reject (e.g. groundMaterialRef
          // /api call fails). Fall back to answerFromMention so the slot
          // still records and the grouped submit gate can pass.
          const fallback = answerFromMention(request, item.mention)
          if (fallback) {
            onPick(fallback, request)
            closePicker()
          }
        } finally {
          busyRef.current = false
          setBusy(false)
        }
      })()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request, onPick],
  )

  // L2-CLARIFY-PICKER-1 (P3, OQ3 ruling): the BOUNDED, popover-closed, non-UI
  // resolver pass on the seeded noun at card mount. It feeds the top-three
  // inline buttons ONLY — it must NOT open any picker (the single-open store
  // and the open-on-request semantics are untouched: the popover stays
  // open-on-request, the uifix2 [C] pins above). Bounds: MATERIAL_PAGE (the
  // same page the open popover's first paint shows) + the question's layer
  // scope; AbortSignal on unmount (a card that scrolls away mid-fetch drops
  // the pass). The popover pass below remains the open-path source of truth;
  // when it settles it refreshes the buttons from the SAME ranked list.
  useEffect(() => {
    // L2-CLARIFY-CARD-1 (browser-gate fix2, D-2): the mount pass resolves the
    // SEED noun (the unwrap), never a mint-intent blob — the blob is not a
    // material to search for.
    if (!resolver || seedNoun.length === 0) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const initial = await resolver(seedNoun, {
          selection: null,
          signal: controller.signal,
          // L2-CLARIFY-PICKER-1 P2 (advc-c1 DEFECT 8): PICKER-constructed pass —
          // the resolver attaches the per-row consequence + focus-default flag
          // (the doc-editor /m stays chrome-free; it never sets this).
          pickerRows: true,
          ...(request.materialLayer ? { materialLayer: request.materialLayer } : {}),
        })
        if (!active) return
        setTopCandidates(
          initial.filter((s) => !s.resolveMention && !s.disabled && !s.pinBottom).slice(0, 3),
        )
      } catch {
        // A mount-pass failure leaves the card honest: no buttons, the
        // popover path is untouched (never fabricate candidates).
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
    // `request.id` matters: a new question re-runs the pass with its own noun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.query, request.materialLayer])

  // The open popover's results are the SAME ranked list the buttons show —
  // refresh the buttons exactly ONCE when the popover pass SETTLES (the
  // initial results). A ref (not state): no extra render; `settled` flips in
  // the popover pass's .then and resets when the pass re-runs (query/open
  // change — the effect cleanup below), so streaming additions and a fresh
  // noun's pass each settle exactly once.
  const popoverSettled = useRef(false)
  useEffect(() => {
    if (!open || loading || !popoverSettled.current) return
    setTopCandidates(
      items.filter((s) => !s.resolveMention && !s.disabled && !s.pinBottom).slice(0, 3),
    )
  }, [items, open, loading])

  useEffect(() => {
    // L2-SUITE-A-uifix2 [C]: gated on `open` — the resolver runs only when the
    // picker is opened on request (the re-gate's auto-open-on-mount is the
    // stacking defect). Opening re-runs it with the seeded query; typing while
    // open re-runs it per keystroke (debounced). A closed picker never resolves.
    if (!resolver || !open) return
    // A MATERIAL search with no words shows nothing. Observed 2026-09-20: a card
    // whose question named no material ("Which material should be added to A2?")
    // ran the /m resolver with '', and the seeds came back looking like ANOTHER
    // material's options — read by the biologist as the agent being stuck on the
    // last thing they asked about (clofibrate). A materials question with no name
    // is asking them to SEARCH; it is not a catalog to browse.
    //
    // Deliberately NOT applied to /l and /e: "which plate?" with no words is a
    // legitimate browse of the lab's inventory, and listing it is the answer.
    if (query.trim().length === 0 && request.menuProvider === '/m') {
      setItems([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    let active = true
    popoverSettled.current = false
    setLoading(true)
    // Debounce so each keystroke doesn't fire a fresh resolver/abort storm.
    const timer = setTimeout(() => {
      resolver(query, {
        selection: null,
        signal: controller.signal,
        // L2-CLARIFY-PICKER-1 P2 (advc-c1 DEFECT 8): PICKER-constructed pass —
        // the open popover's rows carry the per-row consequence + focus-default
        // flag (the doc-editor /m never sets this; it stays chrome-free).
        pickerRows: true,
        // Scope the menu to the layer the QUESTION is about: a "which prepared
        // solution?" question must not offer a bare compound. Absent for the
        // general /m menu (there the biologist browses everything on purpose).
        ...(request.materialLayer ? { materialLayer: request.materialLayer } : {}),
        onUpdate: (more) => {
          if (active) setItems((prev) => merge(prev, more))
        },
      })
        .then((initial) => {
          if (!active) return
          setItems(merge([], initial))
          setLoading(false)
          popoverSettled.current = true
        })
        .catch(() => {
          if (active) setLoading(false)
        })
    }, 150)
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
    // `request.id` matters: with the same resolver (both are /m questions) a new
    // question would otherwise reuse the cached search result. `open` is the
    // new gate (the resolver no longer auto-runs on mount).
  }, [query, resolver, request.id, open])

  // L2-SUITE-A-uifix2 [C]: dismiss-on-outside-click — a mousedown outside the
  // picker (anywhere in the transcript) closes it. The gate's pickers stacked
  // because nothing ever dismissed them; the outside click is the standard
  // popover dismissal. (The single-open store also closes a sibling when the
  // user opens another card's picker.) Change 4 (portal): the popover lives
  // in document.body (a portal), so the "outside" test must also ignore the
  // portal node — a click INSIDE the open list is not an outside click.
  const popoverNodeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      const node = containerRef.current
      const portal = popoverNodeRef.current
      if (!(event.target instanceof Node)) return
      if (node && node.contains(event.target)) return
      if (portal && portal.contains(event.target)) return
      closePicker()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, closePicker])

  if (!resolver) return null

  // Keep the popover inside the viewport — Change 4 (W3, amendment (b)): no
  // `--above` flip. The popover portals to document.body at the field's
  // position (fixed); max-height = distance to the viewport bottom, so the
  // list never hangs off-screen and its OWN overflow-y scroll reaches every
  // row (scroll-recoverable by construction — there is no upward overflow).
  // Measured on open and on window scroll (the field moves under the portal).
  useEffect(() => {
    if (!open) {
      setPopoverRect(null)
      return
    }
    const measure = () => {
      const el = searchAnchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // Clamp the available height (jsdom reports 0x0 rects; a 48px+ listbox
      // keeps the portal renderable in tests, and the live value is the real
      // distance to the viewport bottom).
      const maxHeight = Math.max(48, window.innerHeight - (rect.bottom + 6))
      const next = { top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 0), maxHeight }
      // Re-render ONLY when the geometry actually changed (advc-c1 DEFECT 9):
      // a fresh object every tick re-renders the whole portal; identical
      // geometry keeps the prior state (no re-render).
      setPopoverRect((prev) => {
        if (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.maxHeight === next.maxHeight) return prev
        return next
      })
    }
    const onScroll = (event: Event) => {
      // Ignore scroll events originating INSIDE the portal node (advc-c1
      // DEFECT 9): scrolling the popover's OWN list moves the list, not the
      // field, so it must not trigger a re-measure. Only page/field scroll
      // (the field moves under the fixed portal) re-measures.
      const portal = popoverNodeRef.current
      const target = event.target
      if (portal && target instanceof Node && portal.contains(target)) return
      measure()
    }
    measure()
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  // Minting is only ever offered by the MATERIAL resolver: the `mint:<q>` floor
  // row (resolvers.ts:67-92) is emitted inside resolveMaterial and nowhere else
  // (resolveLabware/resolveEquipment emit none). So the copy must key on the
  // resolver, not just the layer — otherwise a '/l' or '/e' card with no hits
  // tells the scientist to "keep typing to mint" on a card with no mint floor
  // (advc-ANSWERSURFACE1-c1 D1: dead-end affordance copy).
  const canMint = resolver === resolveMaterial
    && (!request.materialLayer || request.materialLayer === 'material')

  // L2-CLARIFY-CARD-1 (W9): ONE predicate drives the row's existence AND the
  // search box's copy — they are one expression, so copy and affordance cannot
  // disagree again. The old `query.trim().length > 0` arm is GONE: the label
  // is seeded from the prompt's noun (mintLabelFor) and the row's label input
  // is the only edit surface — a second query-length check anywhere is the W9
  // bug returning.
  // advc-c1 D2 (fix1): existence follows the PROMPT NOUN only
  // (mintLabelFor(request, '') — the label STATE the row mints), NEVER the
  // live filter box. The label state is seeded from `request.query` and, per
  // W14, never tracks the filter — so a filter-derived existence would be the
  // D2 dead-end: an empty-seed card (request.query absent) with a typed filter
  // grew a mint row with an EMPTY label and a disabled Create while the
  // placeholder promised creation ("row exists" ⇒ "row is actionable" was
  // broken). With the noun-only predicate the empty-seed card shows NO row and
  // search-only copy regardless of what is typed; a seeded card's row exists
  // with the seed's label, so whenever the row exists the Create is enabled.
  const mintAvailable =
    canMint
    && request.allowCreateLocal === true
    && !open
    && (request.options?.length ?? 0) === 0
    && mintLabelFor(request, '').length > 0

  // The question's own layer decides the wording; only an unscoped menu (or a
  // concept question) invites minting, because a mint creates a concept — which
  // is never a valid answer to "which aliquot?".
  const layerPlaceholder = request.materialLayer ? LAYER_PLACEHOLDER[request.materialLayer] : undefined
  const placeholder = layerPlaceholder
    ?? (resolver === resolveLabware
      ? 'Search labware…'
      : resolver === resolveEquipment
        ? 'Search equipment…'
        // L2-CLARIFY-CARD-1 (W9): the material branch's copy derives from the
        // SAME mintAvailable boolean as the row's existence. The empty-seed
        // card (request.query absent — the "of what?" fact) therefore promises
        // search only, and shows no mint row — and (advc-c1 D2, fix1) that
        // holds for a TYPED filter too: the predicate reads the prompt noun
        // only, so typed text never flips copy or row existence.
        : mintAvailable ? 'Search materials or create a material record…' : 'Search materials…')

  // L2-SUITE-A-uifix2 FIX2 [D5]: the VISIBLE create-local (mint) row. The
  // gate's DMSO card (rows: [], allowCreateLocal: true) promised "or create
  // a local term" but the only mint affordance lived INSIDE the closed
  // popover — dead chrome (the card renders only the bare search input when
  // closed; the resolver's mint:<q> floor row is only reachable after
  // opening + searching). The spine's tier-5 mint-local (architecture §2) is
  // the declared affordance, so the card renders it visibly when the server
  // said minting is allowed (`allowCreateLocal`) and the question has a name
  // to mint (the seeded query — same precondition as the resolver floor's
  // `if (q)` gate). It mints through the SAME apiClient.mintLocalTerm path
  // the resolver's mint floor uses and routes the answer through onPick
  // (ref {kind:'record', type:'material'}). It shows only while the popover is
  // CLOSED: an OPEN popover with a query carries the resolver's own mint:<q>
  // floor row (one mint affordance per open state — no duplicate), and a
  // candidate row answers the question without one.
  // L2-SUITE-A-uifix2 FIX3 (advc1 defect 4): AND ONLY WHEN THE CARD CARRIES
  // NO CANDIDATE ROWS — the mandate's "rows empty" precondition. A card with
  // server options has rows that answer the question, so the mint row is
  // dead chrome on it (and the duplicate-mint temptation the criterion
  // exists to prevent); pre-fix the check was absent (allowCreateLocal +
  // seeded query + two options still rendered the row).
  // L2-CLARIFY-CARD-1 (W9): the row's existence is now the mintAvailable
  // predicate above (one expression with the placeholder copy) — the old
  // query-length showMintRow is gone; the row's label input is the only edit
  // surface (see mintLabel state + the row render below).

  // Badge colours are per-badge semantics (tokens.ts badgeStyles) — the SAME
  // inline mechanism the popover's mint floor row uses.
  const mintBadge = badgeStyles(VOCABULARY_BADGE.mint)

  const handleMintRow = () => {
    if (busy || !mintAvailable) return
    // L2-CLARIFY-CARD-1 (W7): mint EXACTLY the previewed label — the row's OWN
    // label state (seeded from the prompt's noun, editable only in the row's
    // label input). The filter box no longer feeds the mint: it is never joined
    // to the seed (the W7 red case — `${seed}${query}` / `${query}${seed}`) and
    // it is never passed as the label. The row's rendered preview
    // (mintLocalTermLabel(label)) is the SAME string this call mints.
    const label = mintLabel.trim()
    if (!label) return
    setBusy(true)
    void (async () => {
      try {
        // The resolver's mint floor (resolvers.ts `mint:<q>`) does exactly
        // this: mint a draft material record server-side, then answer with
        // the minted record's mention (ref {kind:'record', type:'material'}).
        const res = await apiClient.mintLocalTerm('material', label)
        const mention: SlashMention = {
          type: 'material',
          entityKind: 'material',
          id: res.recordId,
          label: res.label,
        }
        const answer = await groundedAnswerFromMention(request, mention)
        if (answer) {
          onPick(answer, request)
          // Dismiss-on-select (same as the popover rows): a pick answers
          // the question.
          closePicker()
        }
      } catch {
        // A mint failure (offline, server error) leaves the card honest:
        // the row stays available, nothing is fabricated.
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <>
      <div className="message-log__clarification-picker" ref={containerRef}>
        <input
          type="text"
          className="message-log__clarification-search"
          ref={searchAnchorRef}
          data-testid="clarification-identity-search"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => openPicker()}
        onFocus={() => {
          // L2-SUITE-A-uifix3 D5 (regate-5): the field is pre-seeded with the
          // unresolved noun (query is initialized to it — opening the card
          // filters to the noun, preserved). A controlled value APPENDS on a
          // keystroke, so the gate's "golden bead plate" + typed "bead"
          // dead-ended at "golden bead platebead" → No matches. Selecting the
          // whole seed on focus makes the first keystroke REPLACE the seed.
          searchAnchorRef.current?.select()
        }}
        onChange={(e) => {
          // Typing into a closed field opens it (open-on-request); typing
          // while open re-runs the (debounced) resolver.
          if (!open) openPicker()
          setQuery(e.target.value)
        }}
        onKeyDown={(e) => {
          // Escape collapses the open picker (dismiss-on-key).
          if (e.key === 'Escape') {
            if (open) closePicker()
            return
          }
          // Forward arrow/enter to the list so the card is keyboard-usable.
          if (listRef.current?.onKeyDown(e.nativeEvent)) e.preventDefault()
        }}
      />
      {mintAvailable ? (
        <div
          className="message-log__clarification-mint"
          data-testid="clarification-mint-row"
        >
          <span
            className="message-log__clarification-mint__badge"
            style={{
              color: mintBadge.color,
              background: mintBadge.background,
              border: `1px solid ${mintBadge.border}`,
            }}
          >
            {VOCABULARY_BADGE.mint}
          </span>
          {/* L2-CLARIFY-CARD-1 (P5/W14): the row PREVIEWs the exact label and
              states the write — the inline label input (the ONLY edit surface;
              typing in the SEARCH box no longer changes what is minted) + the
              one-source sentence (mintLocalTermLabel(label)) that is the SAME
              string the create button mints. */}
          <input
            type="text"
            className="message-log__clarification-mint__label"
            data-testid="clarification-mint-label"
            value={mintLabel}
            disabled={busy}
            onChange={(e) => setMintLabel(e.target.value)}
            aria-label="Material record name"
          />
          <span className="message-log__clarification-mint__preview">{mintLocalTermLabel(mintLabel.trim())}</span>
          <button
            type="button"
            className="message-log__clarification-mint__create"
            data-testid="clarification-mint-create"
            disabled={busy || mintLabel.trim().length === 0}
            onClick={handleMintRow}
          >
            Create
          </button>
        </div>
      ) : null}
      {/* L2-CLARIFY-PICKER-1 (P3): the top THREE ranked candidates, one click
          each (they are the same ranked list Change 1 produces — composition
          rows may appear in the three but can never be the focused default).
          The `None of these — search…` escape hatch opens the EXISTING
          popover (open-on-request, single-open store untouched). Rendered
          only when the bounded mount pass found candidates (bait 8: a
          zero-candidate card behaves exactly as today — mint/preconditions
          path untouched). */}
      {topCandidates.length > 0 ? (
        <div className="message-log__clarification-top3" data-testid="clarification-top3">
          {topCandidates.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              className="message-log__clarification-top3__row"
              data-testid="clarification-top3-row"
              disabled={busy}
              onClick={() => command(candidate)}
            >
              <span
                className="message-log__clarification-top3__badge"
                style={{
                  color: badgeStyles(candidate.badge).color,
                  background: badgeStyles(candidate.badge).background,
                  border: `1px solid ${badgeStyles(candidate.badge).border}`,
                }}
              >
                {candidate.badge}
              </span>
              <span className="message-log__clarification-top3__label">{candidate.label}</span>
            </button>
          ))}
          <button
            type="button"
            className="message-log__clarification-top3__search"
            data-testid="clarification-top3-search"
            disabled={busy}
            onClick={() => {
              openPicker()
              searchAnchorRef.current?.focus()
            }}
          >
            None of these — search…
          </button>
        </div>
      ) : null}
      </div>
      {open &&
        popoverRect &&
        createPortal(
          <div
            ref={popoverNodeRef}
            data-testid="clarification-popover"
            className="message-log__clarification-popover message-log__clarification-popover--portal"
            style={{
              top: popoverRect.top,
              left: popoverRect.left,
              width: popoverRect.width,
              maxHeight: popoverRect.maxHeight,
            }}
          >
            <SlashSuggestionList
              ref={listRef}
              items={items}
              loading={loading}
              emptyLabel={query ? (canMint ? 'No matches — keep typing to mint a local term' : 'No matches') : 'Type to search'}
              command={command}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
