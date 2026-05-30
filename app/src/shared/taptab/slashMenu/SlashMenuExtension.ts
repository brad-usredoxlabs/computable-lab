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
      // Shared state for the *currently-open* slash menu. items() fills it
      // when the resolver returns; the renderer reads from it for late
      // updates (so a resolver's ctx.onUpdate callback can append more
      // suggestions after the initial Promise resolves — used by /m to
      // overlay OLS4 hits on top of the fast local results). One Suggestion
      // plugin instance per editor → one session is enough.
      const session: ProgressiveSession = {
        query: null,
        controller: null,
        items: [],
        repaint: null,
      }

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
            // New query: cancel any in-flight late updates from the previous
            // one (so a slow OLS4 tail can't bleed into a fresh search).
            session.controller?.abort()
            const controller = new AbortController()
            session.query = query
            session.controller = controller
            session.items = []

            const match = matchCommand(commands, query)
            if (!match) return []
            const ctx: SlashResolverContext = {
              selection: getSelection(),
              signal: controller.signal,
              onUpdate: (more) => {
                // Drop late updates after the query moved on or the menu
                // closed (both null out session.query).
                if (session.query !== query) return
                if (!more || more.length === 0) return
                const seen = new Set(session.items.map((s) => s.key))
                const additions = more.filter((s) => !seen.has(s.key))
                if (additions.length === 0) return
                session.items = [...session.items, ...additions]
                session.repaint?.(session.items)
              },
            }
            try {
              const initial = await match.command.resolve(match.innerQuery, ctx)
              session.items = initial
              return initial
            } catch (err) {
              if ((err as Error).name === 'AbortError') return []
              console.warn(`Slash resolver for /${match.command.kind} failed:`, err)
              return []
            }
          },
          render: () => createRenderer(commands, session),
        } as SuggestionOptions<SlashSuggestion>),
      ]
    },
  })
}

/**
 * State the items() handler shares with the renderer so a resolver's
 * `ctx.onUpdate(more)` can repaint the open menu with appended results
 * after its initial Promise resolves. See the /m progressive flow.
 */
interface ProgressiveSession {
  /** The exact query string the open menu was built for; null when closed. */
  query: string | null
  /** Aborter for the in-flight resolver (and late tasks it spawned). */
  controller: AbortController | null
  /** Current materialized items shown in the menu (initial + late additions). */
  items: SlashSuggestion[]
  /** Renderer-provided callback to redraw the open menu with new items. */
  repaint: ((items: SlashSuggestion[]) => void) | null
}

/**
 * Manages the React root that hosts `SlashSuggestionList`. The plugin's
 * `render()` returns lifecycle hooks; this factory keeps the heavy mounting
 * logic in one place. The shared `session` lets the items() handler push
 * late updates back into the menu via `session.repaint`.
 */
function createRenderer(commands: SlashCommandSpec[], session: ProgressiveSession) {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let listHandle: SlashSuggestionListHandle | null = null
  /** Last props the suggestion plugin handed us — needed so late repaints
   *  can preserve the click handler and query/empty-state context. */
  let lastProps: SuggestionProps<SlashSuggestion> | null = null
  const setListRef = (handle: SlashSuggestionListHandle | null) => {
    listHandle = handle
  }

  function paint(props: SuggestionProps<SlashSuggestion>) {
    if (!container || !root) return
    lastProps = props
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

  /**
   * Re-paint with a new items array but the same query/command/click
   * handler. Used by `session.repaint` for progressive resolver updates.
   */
  function repaintItems(items: SlashSuggestion[]) {
    if (!lastProps) return
    paint({ ...lastProps, items })
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

    // Anchor so the popover always fits in the viewport regardless of how
    // many items it has. Measuring container.firstElementChild?.clientHeight
    // is unreliable because the React render is async — a longer query that
    // fetches more items renders a taller popover *after* position() has
    // already chosen a placement, and the bottom runs off-screen. Anchor by
    // viewport edges (top / bottom on the container, max-height on the inner
    // popover) so it grows inside the available space, not past it.
    const MARGIN = 8
    const popoverEl = container.firstElementChild as HTMLElement | null
    const spaceAbove = rect.top - MARGIN
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN
    // Prefer above (so the popover doesn't cover what the user is typing),
    // but fall through to below when above is genuinely tighter.
    const placeAbove = spaceAbove >= 140 || spaceAbove >= spaceBelow

    if (placeAbove) {
      // Pin the bottom near rect.top; clear `top` so the popover can grow
      // upward within spaceAbove without ever overshooting the viewport.
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
      container.dataset.slashMenuRoot = 'true'
      document.body.appendChild(container)
      root = createRoot(container)
      session.repaint = repaintItems
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
      session.query = null
      session.repaint = null
      session.controller?.abort()
      session.controller = null
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
