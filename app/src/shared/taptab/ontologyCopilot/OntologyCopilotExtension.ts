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
 * Opt-in: mount it in an editor's extension list to enable. Local-record
 * matches and the tier-5 mint affordance are intentionally excluded here —
 * those flow through `/m` and the material picker respectively.
 */

import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { SlashSuggestionList, type SlashSuggestionListHandle } from '../slashMenu/SlashSuggestionList'
import type { SlashSuggestion } from '../slashMenu/types'
import { apiClient } from '../../api/client'

const LIMIT = 8

async function resolveOntologyItems(query: string): Promise<SlashSuggestion[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const { candidates } = await apiClient.resolve({ term: q, kinds: ['material'], limit: LIMIT })
    return candidates
      .filter((c) => (c.source === 'oak' || c.source === 'ols4') && c.curie)
      .map((c) => ({
        key: `ontology:${c.curie}`,
        label: c.label,
        badge: c.namespace ? c.namespace.toUpperCase() : 'Ontology',
        subtitle: c.curie,
        mention: { type: 'material', entityKind: 'material', id: c.curie, label: c.label },
      }))
  } catch {
    // Spine unavailable (older backend / offline) — degrade silently.
    return []
  }
}

export function buildOntologyCopilotExtension(): Extension {
  return Extension.create({
    name: 'ontologyCopilot',

    addProseMirrorPlugins() {
      return [
        Suggestion({
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
            editor.chain().focus().deleteRange(range).insertMention(item.mention).run()
          },
          items: ({ query }) => resolveOntologyItems(query),
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
    const popoverHeight = container.firstElementChild?.clientHeight ?? 220
    if (rect.top > popoverHeight + 12) {
      container.style.top = `${rect.top - popoverHeight - 8}px`
    } else {
      container.style.top = `${rect.bottom + 8}px`
    }
    container.style.left = `${rect.left}px`
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
