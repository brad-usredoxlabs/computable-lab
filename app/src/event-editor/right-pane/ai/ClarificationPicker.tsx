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
import { resolveMaterial, resolveLabware } from '../../../shared/taptab/slashMenu/resolvers'
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
  if (request.menuProvider === '/m') return resolveMaterial
  return null
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

  useEffect(() => {
    if (!resolver) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    // Debounce so each keystroke doesn't fire a fresh resolver/abort storm.
    const timer = setTimeout(() => {
      resolver(query, {
        selection: null,
        signal: controller.signal,
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
  }, [query, resolver])

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

  const placeholder = resolver === resolveLabware ? 'Search labware…' : 'Search materials or mint a local term…'

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
        emptyLabel={query ? 'No matches — keep typing to mint a local term' : 'Type to search'}
        command={command}
      />
    </div>
  )
}
