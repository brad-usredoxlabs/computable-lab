import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import type { SlashMention } from '../../../shared/taptab/slashMenu'
import { serializeDocument } from '../recordSerializer'
import {
  buildMentionRolePatch,
  collectMentions,
  editorContentToReadableText,
  protocolTextToDoc,
  stripPrimedSlashCommandText,
} from './ProtocolAuthoringWidgets'

describe('protocol mention role sync', () => {

  it('strips primed controlled-field slash commands from draft text', () => {
    expect(stripPrimedSlashCommandText('/m ', 'm')).toBe('')
    expect(stripPrimedSlashCommandText('/m', 'm')).toBe('')
    expect(stripPrimedSlashCommandText('/m hep g2 cells', 'm')).toBe('hep g2 cells')
    expect(stripPrimedSlashCommandText('  /l 96 well plate', 'l')).toBe('96 well plate')
    expect(stripPrimedSlashCommandText('/e plate reader', 'e')).toBe('plate reader')
    expect(stripPrimedSlashCommandText('/m hep g2 cells', undefined)).toBe('/m hep g2 cells')
    expect(stripPrimedSlashCommandText('Seed /m hep g2 cells', 'm')).toBe('Seed /m hep g2 cells')
  })

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


  it('adds equipment mentions to instrument roles and dedupes by id', () => {
    const mentions: SlashMention[] = [
      { type: 'equipment', id: 'EQP-CENTRIFUGE', label: 'Benchtop centrifuge' },
      { type: 'equipment', id: 'EQP-CENTRIFUGE', label: 'Benchtop centrifuge' },
    ]

    const patch = buildMentionRolePatch(mentions, () => [])
    expect(patch['$.roles.instrumentRoles']).toEqual([
      {
        roleId: 'benchtop_centrifuge',
        description: 'Benchtop centrifuge',
        allowedInstrumentIds: ['EQP-CENTRIFUGE'],
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

  it('rehydrates saved protocol prose tokens into mention nodes on reload', () => {
    const doc = protocolTextToDoc(
      'Seed [[material:CL:0000182|Hep G2 cells]] into [[labware:lbw-def-generic-96-well-plate|96 well plate]], use [[tube:15 mL|15 mL tube]], and spin in [[equipment:EQP-CENTRIFUGE|Benchtop centrifuge]].',
    )

    const mentions = collectMentions(doc)
    expect(mentions).toEqual([
      { type: 'material', entityKind: 'material', id: 'CL:0000182', label: 'Hep G2 cells' },
      { type: 'labware', id: 'lbw-def-generic-96-well-plate', label: '96 well plate' },
      { type: 'tube', sizeLabel: '15 mL', maxVolume_uL: 0, label: '15 mL tube' },
      { type: 'equipment', id: 'EQP-CENTRIFUGE', label: 'Benchtop centrifuge' },
    ])
    expect(editorContentToReadableText(doc)).toBe('Seed Hep G2 cells into 96 well plate, use 15 mL tube, and spin in Benchtop centrifuge.')
  })

  it('serializes structured protocol fields so roles and readable steps survive reload', () => {
    const baseRecord = {
      kind: 'protocol',
      recordId: 'PRT-test',
      title: 'Cell seeding',
      description: '',
      roles: { materialRoles: [], labwareRoles: [], instrumentRoles: [] },
      steps: [],
    }
    const savedDescription = 'Seed [[material:CL:0000182|Hep G2 cells]] into [[labware:lbw-def-generic-96-well-plate|96 well plate]].'
    const doc: JSONContent = {
      type: 'doc',
      content: [{
        type: 'section',
        content: [
          { type: 'fieldRow', attrs: { path: '$.description', widget: 'protocol-prose-authoring', value: savedDescription } },
          {
            type: 'fieldRow',
            attrs: {
              path: '$.roles.materialRoles',
              widget: 'protocol-material-roles',
              value: [{ roleId: 'hep_g2_cells', description: 'Hep G2 cells', allowedMaterialIds: ['CL:0000182'] }],
            },
          },
          {
            type: 'fieldRow',
            attrs: {
              path: '$.roles.labwareRoles',
              widget: 'protocol-labware-roles',
              value: [
                { roleId: '96_well_plate', description: '96 well plate', expectedLabwareKinds: ['lbw-def-generic-96-well-plate'] },
                { roleId: '15_ml_tube', description: '15 mL tube', expectedLabwareKinds: ['15 mL'] },
              ],
            },
          },
          {
            type: 'fieldRow',
            attrs: {
              path: '$.roles.instrumentRoles',
              widget: 'protocol-equipment-roles',
              value: [{ roleId: 'benchtop_centrifuge', description: 'Benchtop centrifuge', allowedInstrumentIds: ['EQP-CENTRIFUGE'] }],
            },
          },
          {
            type: 'fieldRow',
            attrs: {
              path: '$.steps',
              widget: 'protocol-step-roles',
              value: [{ stepId: 'step_1', kind: 'other', description: 'Seed Hep G2 cells into 96 well plate', label: 'Seed Hep G2 cells into 96 well plate' }],
            },
          },
        ],
      }],
    }

    const serialized = serializeDocument(doc, baseRecord)
    expect(serialized.roles).toEqual({
      materialRoles: [{ roleId: 'hep_g2_cells', description: 'Hep G2 cells', allowedMaterialIds: ['CL:0000182'] }],
      labwareRoles: [
        { roleId: '96_well_plate', description: '96 well plate', expectedLabwareKinds: ['lbw-def-generic-96-well-plate'] },
        { roleId: '15_ml_tube', description: '15 mL tube', expectedLabwareKinds: ['15 mL'] },
      ],
      instrumentRoles: [{ roleId: 'benchtop_centrifuge', description: 'Benchtop centrifuge', allowedInstrumentIds: ['EQP-CENTRIFUGE'] }],
    })
    expect(serialized.steps).toEqual([
      { stepId: 'step_1', kind: 'other', description: 'Seed Hep G2 cells into 96 well plate', label: 'Seed Hep G2 cells into 96 well plate' },
    ])
    expect(collectMentions(protocolTextToDoc(String(serialized.description))).map((mention) => mention.type)).toEqual(['material', 'labware'])
  })

})
