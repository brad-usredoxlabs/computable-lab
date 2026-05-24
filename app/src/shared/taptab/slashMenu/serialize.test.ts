import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { editorContentToText } from './serialize'
import type { SlashMention } from './types'

function paragraph(...children: JSONContent[]): JSONContent {
  return { type: 'paragraph', content: children }
}
function text(s: string): JSONContent {
  return { type: 'text', text: s }
}
function mention(m: SlashMention): JSONContent {
  return { type: 'slashMention', attrs: { mention: m } }
}

describe('editorContentToText', () => {
  it('plain text round-trips', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [paragraph(text('Hello world'))],
    }
    expect(editorContentToText(doc)).toBe('Hello world')
  })

  it('joins paragraphs with blank lines', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [paragraph(text('First')), paragraph(text('Second'))],
    }
    expect(editorContentToText(doc)).toBe('First\n\nSecond')
  })

  it('hard breaks become newlines', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [paragraph(text('a'), { type: 'hardBreak' }, text('b'))],
    }
    expect(editorContentToText(doc)).toBe('a\nb')
  })

  it('mention nodes serialize to wire tokens', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        paragraph(
          text('Add '),
          mention({
            type: 'material',
            entityKind: 'material',
            id: 'MAT-7',
            label: 'Tris',
          }),
          text(' to '),
          mention({
            type: 'selection',
            selectionKind: 'target',
            labwareId: 'lbw-2',
            wells: ['A1', 'A2'],
            label: 'plate A1-A2',
          }),
        ),
      ],
    }
    expect(editorContentToText(doc)).toBe(
      'Add [[material:MAT-7|Tris]] to [[selection:target|lbw-2|A1,A2|plate A1-A2]]',
    )
  })

  it('trims surrounding whitespace', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [paragraph(text('   spaced   '))],
    }
    expect(editorContentToText(doc)).toBe('spaced')
  })
})
