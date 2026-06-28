import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import type { SlashMention } from '../../../shared/taptab/slashMenu'
import {
  buildMentionRolePatch,
  collectMentions,
  editorContentToReadableText,
} from './ProtocolAuthoringWidgets'

describe('protocol mention role sync', () => {
  it('adds material mentions to material roles and dedupes by id', () => {
    const mentions: SlashMention[] = [
      { type: 'material', entityKind: 'material', id: 'CL:0000182', label: 'Hep G2 cells' },
      { type: 'material', entityKind: 'material', id: 'CL:0000182', label: 'Hep G2 cells' },
    ]

    const patch = buildMentionRolePatch(mentions, () => [])
    expect(patch['$.roles.materialRoles']).toEqual([
      {
        roleId: 'hep_g2_cells',
        description: 'Hep G2 cells',
        allowedMaterialIds: ['CL:0000182'],
      },
    ])
  })

  it('merges labware and tube mentions into labware roles without duplicates', () => {
    const existing = [
      {
        roleId: 'culture_plate',
        description: 'Culture plate',
        expectedLabwareKinds: ['lbw-def-generic-96-well-plate'],
      },
    ]
    const mentions: SlashMention[] = [
      { type: 'labware', id: 'lbw-def-generic-96-well-plate', label: 'Culture plate' },
      { type: 'tube', sizeLabel: '15 mL', maxVolume_uL: 15000, label: '15 mL tube' },
      { type: 'tube', sizeLabel: '15 mL', maxVolume_uL: 15000, label: '15 mL tube' },
    ]

    const patch = buildMentionRolePatch(mentions, (path) => path === '$.roles.labwareRoles' ? existing : [])
    expect(patch['$.roles.labwareRoles']).toEqual([
      existing[0],
      {
        roleId: '15_ml_tube',
        description: '15 mL tube',
        expectedLabwareKinds: ['15 mL'],
      },
    ])
  })

  it('extracts mentions and renders step prose with readable labels', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Seed ' },
          {
            type: 'slashMention',
            attrs: {
              mention: { type: 'material', entityKind: 'material', id: 'CL:0000182', label: 'Hep G2 cells' },
            },
          },
          { type: 'text', text: ' into ' },
          {
            type: 'slashMention',
            attrs: {
              mention: { type: 'labware', id: 'lbw-def-generic-96-well-plate', label: '96 well plate' },
            },
          },
        ],
      }],
    }

    expect(collectMentions(doc).map((mention) => mention.type)).toEqual(['material', 'labware'])
    expect(editorContentToReadableText(doc)).toBe('Seed Hep G2 cells into 96 well plate')
  })
})
