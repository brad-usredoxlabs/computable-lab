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

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../../types/ai'
import { resolveMaterial, resolveLabware, resolveEquipment } from '../../../shared/taptab/slashMenu/resolvers'
import { SlashSuggestionList } from '../../../shared/taptab/slashMenu/SlashSuggestionList'
import type {
  SlashMention,
  SlashResolver,
  SlashSuggestion,
} from '../../../shared/taptab/slashMenu/types'
import { groundMaterialRef } from '../../lib/groundMaterialRef'

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
 * only the popover/listbox is gated on `open`, and the resolver runs only when
 * open (no auto-search on mount). `open` is the single-open store key === this
 * picker's question id: opening this one moves the key (closing every sibling);
 * dismissal — picking a row (onPick), an outside mousedown, or Escape — clears
 * it; a fresh mount (page load) sees storeKey=null, so reloads restore NO open
 * pickers.
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
  const [query, setQuery] = useState(request.query ?? '')

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
  // The suggestion popover is anchored under the field; near the bottom of a
  // phone viewport it must flip ABOVE the field instead of hanging off-screen.
  const [listAbove, setListAbove] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<SlashSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<{ onKeyDown(e: KeyboardEvent): boolean } | null>(null)

  const resolver = resolverFor(request)

  /**
   * A NEW question must never inherit the previous one's search. The questions
   * panel reuses this component across clarifications (the id is the question's
   * identity), so without this the rows shown for a new material were the
   * previous material's — observed 2026-09-20: "add 1 million HepG2 cells"
   * answered with clofibrate options.
   */
  useEffect(() => {
    setQuery(request.query ?? '')
    setItems([])
  }, [request.id, request.query])

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
    setLoading(true)
    // Debounce so each keystroke doesn't fire a fresh resolver/abort storm.
    const timer = setTimeout(() => {
      resolver(query, {
        selection: null,
        signal: controller.signal,
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
  // user opens another card's picker.)
  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      const node = containerRef.current
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        closePicker()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, closePicker])

  if (!resolver) return null

  const command = (item: SlashSuggestion) => {
    if (item.disabled || busy) return
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
      } finally {
        setBusy(false)
      }
    })()
  }


  // Keep the popover inside the viewport: flip above the field when there is
  // not enough room below (a 390x844 phone put the rows ~360px below the fold).
  useEffect(() => {
    const el = anchorRef.current
    if (!el || items.length === 0) {
      setListAbove(false)
      return
    }
    const rect = el.getBoundingClientRect()
    const listHeight = Math.min(280, window.innerHeight * 0.4)
    setListAbove(rect.bottom + 6 + listHeight > window.innerHeight && rect.top > listHeight + 6)
  }, [items.length, query])

  // The question's own layer decides the wording; only an unscoped menu (or a
  // concept question) invites minting, because a mint creates a concept — which
  // is never a valid answer to "which aliquot?".
  const layerPlaceholder = request.materialLayer ? LAYER_PLACEHOLDER[request.materialLayer] : undefined
  const placeholder = layerPlaceholder
    ?? (resolver === resolveLabware
      ? 'Search labware…'
      : resolver === resolveEquipment
        ? 'Search equipment…'
        : 'Search materials or mint a local term…')
  // Minting is only ever offered by the MATERIAL resolver: the `mint:<q>` floor
  // row (resolvers.ts:67-92) is emitted inside resolveMaterial and nowhere else
  // (resolveLabware/resolveEquipment emit none). So the copy must key on the
  // resolver, not just the layer — otherwise a '/l' or '/e' card with no hits
  // tells the scientist to "keep typing to mint" on a card with no mint floor
  // (advc-ANSWERSURFACE1-c1 D1: dead-end affordance copy).
  const canMint = resolver === resolveMaterial
    && (!request.materialLayer || request.materialLayer === 'material')

  return (
    <div className="message-log__clarification-picker" ref={containerRef}>
      <input
        type="text"
        className="message-log__clarification-search"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => openPicker()}
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
      {open ? (
        <div
          ref={anchorRef}
          className={
            listAbove
              ? 'message-log__clarification-popover message-log__clarification-popover--above'
              : 'message-log__clarification-popover'
          }
          data-testid="clarification-popover"
        >
          <SlashSuggestionList
            ref={listRef}
            items={items}
            loading={loading}
            emptyLabel={query ? (canMint ? 'No matches — keep typing to mint a local term' : 'No matches') : 'Type to search'}
            command={command}
          />
        </div>
      ) : null}
    </div>
  )
}
