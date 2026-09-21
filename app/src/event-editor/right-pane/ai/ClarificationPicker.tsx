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

import { useEffect, useRef, useState } from 'react'
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
  const [query, setQuery] = useState(request.query ?? '')
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
    if (!resolver) return
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
    // question would otherwise reuse the cached search result.
  }, [query, resolver, request.id])

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
        if (answer) onPick(answer, request)
      } finally {
        setBusy(false)
      }
    })()
  }

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
  const canMint = !request.materialLayer || request.materialLayer === 'material'

  return (
    <div className="message-log__clarification-picker">
      <input
        type="text"
        className="message-log__clarification-search"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Forward arrow/enter to the list so the card is keyboard-usable.
          if (listRef.current?.onKeyDown(e.nativeEvent)) e.preventDefault()
        }}
      />
      <SlashSuggestionList
        ref={listRef}
        items={items}
        loading={loading}
        emptyLabel={query ? (canMint ? 'No matches — keep typing to mint a local term' : 'No matches') : 'Type to search'}
        command={command}
      />
    </div>
  )
}
