/**
 * SlashMenuExtension — the TipTap extension that wires the slash trigger,
 * the resolver registry, and the popover UI together.
 *
 * Usage:
 *   useEditor({
 *     extensions: [
 *       Document, Paragraph, Text, MentionNode,
 *       buildSlashMenuExtension({ getSelection: () => selectionCtx }),
 *     ],
 *   })
 *
 * The extension is built around `@tiptap/suggestion`. We trigger on `/` and
 * capture everything up to the next whitespace as the query. The first token
 * inside the query is the command alias (`m` / `material` / etc.); the rest
 * is forwarded to the matching resolver.
 *
 * The popover is rendered into a portal-like DOM node positioned relative
 * to the editor view; React owns rendering via the `SlashSuggestionList`
 * component. The suggestion plugin forwards arrow/enter/escape keystrokes
 * to the list before TipTap consumes them.
 */

import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { SlashSuggestionList, type SlashSuggestionListHandle } from './SlashSuggestionList'
import {
  resolveLabware,
  resolveMaterial,
  resolveProtocol,
  resolveSource,
  resolveTarget,
} from './resolvers'
import type {
  SlashCommandKind,
  SlashCommandSpec,
  SlashResolverContext,
  SlashSuggestion,
} from './types'
import type { SelectionContextValue } from '../../context/SelectionContext'

const DEFAULT_COMMANDS: SlashCommandSpec[] = [
  { kind: 'material', aliases: ['m', 'material'], resolve: resolveMaterial },
  { kind: 'labware', aliases: ['l', 'labware'], resolve: resolveLabware },
  { kind: 'protocol', aliases: ['p', 'protocol'], resolve: resolveProtocol },
  { kind: 'source', aliases: ['s', 'source', 'src'], resolve: resolveSource },
  { kind: 'target', aliases: ['t', 'target', 'tar'], resolve: resolveTarget },
]

export interface SlashMenuOptions {
  /** Custom command list — defaults to material/labware/protocol/source/target. */
  commands?: SlashCommandSpec[]
  /**
   * Snapshot getter for the cross-endpoint selection. We accept a getter
   * (rather than a value) so the extension can be configured once at editor
   * construction time but always read the latest selection state at trigger
   * time.
   */
  getSelection?: () => SelectionContextValue | null
}

/**
 * Look up a command by the first whitespace-delimited token in `query`.
 * Returns `null` when the alias is unknown — the popover stays closed.
 */
function matchCommand(commands: SlashCommandSpec[], query: string): {
  command: SlashCommandSpec
  innerQuery: string
} | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  const firstSpace = trimmed.search(/\s/)
  const alias = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase()
  const innerQuery = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1)
  const command = commands.find((c) => c.aliases.includes(alias))
  if (!command) return null
  return { command, innerQuery }
}

export function buildSlashMenuExtension(options: SlashMenuOptions = {}): Extension {
  const commands = options.commands ?? DEFAULT_COMMANDS
  const getSelection = options.getSelection ?? (() => null)

  return Extension.create({
    name: 'slashMenu',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          allowSpaces: true,
          // Don't trigger when `/` follows alphanumerics — avoids matching
          // mid-word slashes such as URLs.
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
          // Only forward queries that match a known command. This avoids
          // popping the menu on a stray `/` that the user did not mean as
          // a command (e.g. inside a path).
          command: ({ editor, range, props }) => {
            const item = props as SlashSuggestion
            if (item.disabled) return
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertMention(item.mention)
              .run()
          },
          items: async ({ query }) => {
            const match = matchCommand(commands, query)
            if (!match) return []
            const controller = new AbortController()
            const ctx: SlashResolverContext = {
              selection: getSelection(),
              signal: controller.signal,
            }
            try {
              return await match.command.resolve(match.innerQuery, ctx)
            } catch (err) {
              if ((err as Error).name === 'AbortError') return []
              console.warn(`Slash resolver for /${match.command.kind} failed:`, err)
              return []
            }
          },
          render: () => createRenderer(commands),
        } as SuggestionOptions<SlashSuggestion>),
      ]
    },
  })
}

/**
 * Manages the React root that hosts `SlashSuggestionList`. The plugin's
 * `render()` returns lifecycle hooks; this factory keeps the heavy mounting
 * logic in one place.
 */
function createRenderer(commands: SlashCommandSpec[]) {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let listHandle: SlashSuggestionListHandle | null = null
  const setListRef = (handle: SlashSuggestionListHandle | null) => {
    listHandle = handle
  }

  function paint(props: SuggestionProps<SlashSuggestion>) {
    if (!container || !root) return
    const match = matchCommand(commands, props.query)
    root.render(
      createElement(SlashSuggestionList, {
        ref: setListRef,
        items: props.items,
        loading: Boolean(match && props.items.length === 0),
        emptyLabel: match ? `No /${match.command.kind} matches` : 'No command',
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
    // Anchor above the trigger so the popover doesn't cover what the user
    // is typing. Fallback to below when there's not enough room above.
    const popoverHeight = container.firstElementChild?.clientHeight ?? 220
    const room = rect.top
    if (room > popoverHeight + 12) {
      container.style.top = `${rect.top - popoverHeight - 8}px`
    } else {
      container.style.top = `${rect.bottom + 8}px`
    }
    container.style.left = `${rect.left}px`
  }

  return {
    onStart(props: SuggestionProps<SlashSuggestion>) {
      container = document.createElement('div')
      container.dataset.slashMenuRoot = 'true'
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

export type { SlashCommandKind }
