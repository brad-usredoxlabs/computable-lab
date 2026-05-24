/**
 * Mention — inline TipTap node representing a resolved slash-menu pick.
 *
 * The node renders as an inline pill in the editor (a `<span data-mention>`).
 * Its `mention` attribute carries the full `SlashMention` payload so on
 * serialize the editor can emit the existing `[[kind:id|label]]` token
 * unchanged.
 *
 * On Backspace immediately after a mention, the entire pill deletes —
 * matching the user expectation that mentions are atomic, not text.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import type { SlashMention } from './types'
import { mentionBadge, badgeStyles, mentionToToken } from './tokens'

export interface MentionAttrs {
  mention: SlashMention
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    slashMention: {
      insertMention: (mention: SlashMention) => ReturnType
    }
  }
}

export const MentionNode = Node.create({
  name: 'slashMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      mention: {
        default: null as SlashMention | null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-mention')
          if (!raw) return null
          try {
            return JSON.parse(raw) as SlashMention
          } catch {
            return null
          }
        },
        renderHTML: (attrs) => {
          if (!attrs.mention) return {}
          return { 'data-mention': JSON.stringify(attrs.mention) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const mention = node.attrs.mention as SlashMention | null
    const label = mention?.label ?? ''
    const badge = mention ? mentionBadge(mention) : ''
    const colors = badgeStyles(badge)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention-badge': badge,
        style: [
          'display: inline-flex',
          'align-items: center',
          'gap: 4px',
          'padding: 1px 8px 1px 6px',
          'margin: 0 1px',
          'border-radius: 999px',
          `background: ${colors.background}`,
          `color: ${colors.color}`,
          `border: 1px solid ${colors.border}`,
          'font-size: 0.85em',
          'font-weight: 600',
          'line-height: 1.4',
          'white-space: nowrap',
          'user-select: none',
        ].join(';'),
      }),
      ['span', { style: 'font-size: 0.75em; opacity: 0.75' }, badge],
      ['span', {}, label],
    ]
  },

  renderText({ node }) {
    const mention = node.attrs.mention as SlashMention | null
    if (!mention) return ''
    return mentionToToken(mention)
  },

  addCommands() {
    return {
      insertMention:
        (mention) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs: { mention } },
              { type: 'text', text: ' ' },
            ])
            .run(),
    }
  },
})
