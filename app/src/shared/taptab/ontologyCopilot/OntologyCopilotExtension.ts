/**
 * OntologyCopilotExtension — inline, Copilot-style ontology grounding for
 * TapTab.
 *
 * Typing `@` then a noun opens a ranked list of ontology-grounded candidates
 * from the resolve() spine (POST /resolve, the same path the slash menu, the
 * compiler, and the agent use). Accepting one inserts a CURIE-bearing mention
 * node — so a protocol authored in TapTab becomes a document of grounded
 * terms rather than free text.
 *
 * This is a separate `@tiptap/suggestion` plugin from the slash menu (which
 * triggers on `/` and resolves workspace records). It reuses the slash menu's
 * `SlashSuggestionList` renderer and the `insertMention` command from
 * `MentionNode`, so it adds no new rendering surface.
 *
 * Opt-in: mount it in an editor's extension list to enable. The result list
 * exposes the same five-tier funnel as the backend spine: local records, OAK,
 * OLS4, vendor, then mint-local as the deliberate last resort.
 */

import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion'

// Distinct plugin key so this Suggestion plugin can coexist with the slash
// menu's Suggestion (both use @tiptap/suggestion, which defaults to the same
// key — adding two would throw "different instances of a keyed plugin").
const ONTOLOGY_COPILOT_PLUGIN_KEY = new PluginKey('ontologyCopilotSuggestion')
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { SlashSuggestionList, type SlashSuggestionListHandle } from '../slashMenu/SlashSuggestionList'
import type { SlashMention, SlashSuggestion } from '../slashMenu/types'
import { candidateDetail } from '../slashMenu/resolvers'
import { apiClient, type ResolveCandidate } from '../../api/client'

const LIMIT = 8

/** Resolve-spine kinds the copilot can ground against, and the mention
 *  type each inserts. Per creation-entry-points spec §7 — hosts pick the
 *  kinds that fit their surface (a labware-heavy editor passes 'labware'). */
export type CopilotKind = 'material' | 'labware' | 'protocol'

function mentionFor(kind: CopilotKind, curie: string, label: string): SlashMention {
  switch (kind) {
    case 'labware':
      return { type: 'labware', id: curie, label }
    case 'protocol':
      return { type: 'protocol', entityKind: 'protocol', id: curie, label }
    case 'material':
      return { type: 'material', entityKind: 'material', id: curie, label }
  }
}

async function resolveOntologyItems(
  query: string,
  kinds: CopilotKind[],
): Promise<SlashSuggestion[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const { candidates } = await apiClient.resolve({ term: q, kinds, limit: LIMIT })
    // Mention type follows the requested kind set; with several kinds the
    // first one wins as the pill type.
    const primaryKind = kinds[0] ?? 'material'
    return candidates.map((candidate) => suggestionForCandidate(candidate, primaryKind, q))
  } catch {
    // Spine unavailable (older backend / offline) — degrade silently.
    return []
  }
}

function suggestionForCandidate(
  candidate: ResolveCandidate,
  primaryKind: CopilotKind,
  query: string,
): SlashSuggestion {
  if (candidate.source === 'mint') {
    const label = candidate.mint?.label || query
    return {
      key: `mint:${label}`,
      label: `Create local term "${label}"`,
      badge: 'New',
      subtitle: 'Mint in this lab namespace',
      detail: candidateDetail(candidate),
      mention: mentionFor(primaryKind, `local:${label}`, label),
      pinBottom: true,
      resolveMention: async () => {
        const minted = await apiClient.mintLocalTerm('material', label, query)
        return mentionFor(primaryKind, `local:${minted.recordId}`, minted.label)
      },
    }
  }

  return {
    key: `${candidate.source}:${candidate.curie}`,
    label: candidate.label,
    badge: badgeForCandidate(candidate),
    subtitle: candidate.curie,
    detail: candidateDetail(candidate),
    mention: mentionFor(primaryKind, candidate.curie, candidate.label),
  }
}

function badgeForCandidate(candidate: ResolveCandidate): string {
  if (candidate.source === 'local-record') return 'Local'
  if (candidate.source === 'oak') return candidate.namespace ? `${candidate.namespace} local` : 'OAK'
  if (candidate.source === 'ols4') return candidate.namespace || 'OLS'
  if (candidate.source === 'vendor') return 'Vendor'
  return candidate.namespace || 'Ontology'
}

export interface OntologyCopilotOptions {
  /** Resolve-spine kinds to ground against. Defaults to ['material']. */
  kinds?: CopilotKind[]
}

export function buildOntologyCopilotExtension(
  options?: OntologyCopilotOptions,
): Extension {
  const kinds: CopilotKind[] =
    options?.kinds && options.kinds.length > 0 ? options.kinds : ['material']
  return Extension.create({
    name: 'ontologyCopilot',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: ONTOLOGY_COPILOT_PLUGIN_KEY,
          editor: this.editor,
          char: '@',
          startOfLine: false,
          allowSpaces: true,
          // Don't trigger mid-word (e.g. email addresses) — only after
          // whitespace or at the start of a block.
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from)
            const beforeChar = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 1),
              $from.parentOffset,
              undefined,
              '￼',
            )
            return beforeChar === '' || /\s/.test(beforeChar)
          },
          command: ({ editor, range, props }) => {
            const item = props as SlashSuggestion
            if (item.disabled) return
            if (item.resolveMention) {
              editor.chain().focus().deleteRange(range).run()
              void item
                .resolveMention()
                .then((mention) => {
                  if (mention) editor.chain().focus().insertMention(mention).run()
                })
                .catch((err) => {
                  console.warn('Ontology mention resolution failed:', err)
                })
              return
            }
            editor.chain().focus().deleteRange(range).insertMention(item.mention).run()
          },
          items: ({ query }) => resolveOntologyItems(query, kinds),
          render: () => createRenderer(),
        } as SuggestionOptions<SlashSuggestion>),
      ]
    },
  })
}

/** React root host for the suggestion list — mirrors the slash menu renderer. */
function createRenderer() {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let listHandle: SlashSuggestionListHandle | null = null
  const setListRef = (handle: SlashSuggestionListHandle | null) => {
    listHandle = handle
  }

  function paint(props: SuggestionProps<SlashSuggestion>) {
    if (!container || !root) return
    const hasQuery = props.query.trim().length > 0
    root.render(
      createElement(SlashSuggestionList, {
        ref: setListRef,
        items: props.items,
        loading: hasQuery && props.items.length === 0,
        emptyLabel: hasQuery ? 'No ontology matches' : 'Type a term…',
        command: (item) => props.command(item),
      }),
    )
  }

  function position(props: SuggestionProps<SlashSuggestion>) {
    if (!container) return
    const rect = props.clientRect?.()
    if (!rect) {
      container.style.display = 'none'
      return
    }
    container.style.display = 'block'
    container.style.position = 'fixed'
    container.style.zIndex = '1000'
    container.style.left = `${rect.left}px`

    // Same viewport-aware anchoring as the slash menu — pin to a viewport
    // edge and cap maxHeight so a longer query (more items, taller popover)
    // never overflows off-screen.
    const MARGIN = 8
    const popoverEl = container.firstElementChild as HTMLElement | null
    const spaceAbove = rect.top - MARGIN
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN
    const placeAbove = spaceAbove >= 140 || spaceAbove >= spaceBelow
    if (placeAbove) {
      container.style.top = ''
      container.style.bottom = `${window.innerHeight - rect.top + MARGIN}px`
      if (popoverEl) popoverEl.style.maxHeight = `${Math.max(120, spaceAbove)}px`
    } else {
      container.style.bottom = ''
      container.style.top = `${rect.bottom + MARGIN}px`
      if (popoverEl) popoverEl.style.maxHeight = `${Math.max(120, spaceBelow)}px`
    }
  }

  return {
    onStart(props: SuggestionProps<SlashSuggestion>) {
      container = document.createElement('div')
      container.dataset.ontologyCopilotRoot = 'true'
      document.body.appendChild(container)
      root = createRoot(container)
      paint(props)
      position(props)
    },
    onUpdate(props: SuggestionProps<SlashSuggestion>) {
      paint(props)
      position(props)
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === 'Escape') return true
      return listHandle?.onKeyDown(props.event) ?? false
    },
    onExit() {
      if (root) {
        root.unmount()
        root = null
      }
      if (container) {
        container.remove()
        container = null
      }
      listHandle = null
    },
  }
}
