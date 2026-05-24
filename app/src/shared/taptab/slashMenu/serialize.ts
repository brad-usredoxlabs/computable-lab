/**
 * TipTap → wire format serialization.
 *
 * `editorToText` walks a TipTap editor's current document and produces a
 * single string where:
 * - text nodes contribute their text,
 * - hard breaks contribute `\n`,
 * - paragraphs are joined by `\n\n`,
 * - slashMention nodes contribute their `[[kind:id|label]]` token.
 *
 * This is the exact wire format the server-side prompt parser already reads,
 * so swapping the textarea for a TipTap editor is invisible to the backend.
 */

import type { Editor, JSONContent } from '@tiptap/core'
import { mentionToToken } from './tokens'
import type { SlashMention } from './types'

export function editorToText(editor: Editor): string {
  return editorContentToText(editor.getJSON())
}

export function editorContentToText(content: JSONContent): string {
  return renderNode(content).trim()
}

function renderNode(node: JSONContent): string {
  switch (node.type) {
    case 'doc': {
      return joinChildren(node.content, '\n\n')
    }
    case 'paragraph': {
      return joinChildren(node.content, '')
    }
    case 'text': {
      return node.text ?? ''
    }
    case 'hardBreak': {
      return '\n'
    }
    case 'slashMention': {
      const mention = node.attrs?.mention as SlashMention | undefined
      return mention ? mentionToToken(mention) : ''
    }
    default: {
      // Fall through to children rendering so any custom inline nodes
      // contribute their text body if they have one.
      return joinChildren(node.content, '')
    }
  }
}

function joinChildren(
  children: JSONContent[] | undefined,
  sep: string,
): string {
  if (!children) return ''
  return children
    .map(renderNode)
    .filter((s) => s.length > 0)
    .join(sep)
}
