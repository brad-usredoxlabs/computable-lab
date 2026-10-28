/**
 * L2-SUITE-A-uifix3 [D2] RED (regate-5 gate defect 2, MAJOR) — committed well
 * footprints must be PAINTED on the deck tile AT REST (at accept AND after a
 * reload), data-driven from the REAL committed record shape.
 *
 * Gate evidence (receipts gate-l2t1520-regate5-tier2):
 *  - run-legs 19-02: T1 accepted add_material wells ["A1"]; the trail's own
 *    DOM probe reads `markedWells ["A1"]` AFTER accept (the
 *    data-affected-well attribute IS present) yet the pixel diff shows only
 *    the tile rectangle (the data-affected OUTLINE) changed — the well
 *    interior is UNPAINTED. A tile-level outline does not count as the mark.
 *  - run-probe10 19-04: after the second commit, both tiles report
 *    affected=false / marked [].
 *  - reload n=4/n=5: post-reload (2 tiles) both tiles marked [].
 *
 * Root cause found (this file pins the fix): the attribution chain
 * buildEventWellIndex → LabwareTile.affectedWells → LabwareGlyph
 * data-affected-well works AT REST for the real committed shape
 * (details.wells, no labwareId, no offer binding → single-placed-vessel
 * fallback; see eventWellIndex.uifix2.fix2.test.ts for the index pins), and
 * the DOM attribute lands — but NO CSS RULE PAINTS [data-affected-well]:
 * eventEditor.css only styles `.tile[data-affected='true']` (the outline).
 * The mark is therefore invisible at accept and after reload alike.
 *
 * The REAL committed shape (orch-verified live at :3093, record
 * EVG-cellrox-…-e5bb716f, event evt-add_material-016ryhz4): details.wells
 * ["A1"], details.well "A1", NO labwareId at event or details level; the
 * plate's placement sits in the PLATE slot (editorLayout). The three
 * spec arms:
 *  (a) committed add_material {wells:[A1], no labwareId} + NO offer binding
 *      (the post-reload shape) + exactly one placed plate → the index
 *      attributes A1 to that plate AND the tile paints A1
 *      (data-affected-well) — AND the stylesheet actually PAINTS the
 *      attribute (the missing rule is the defect);
 *  (b) same with an offer recordId binding → paints;
 *  (c) two placed plates + no binding → the index paints NOTHING
 *      (the never-guess rule is preserved).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEventWellIndex } from '../lib/eventWellIndex'
import { LabwareTile } from './LabwareTile'
import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import type { EventEditorPlacement } from '../types'

/**
 * The REAL plate (the legs deck's plate1 — the record's labwares[] entry,
 * values copied from the live :3093 read): grid 8×12, round wells.
 */
const plate1: Labware = {
  labwareId: 'lbw-seed-plate-96-flat',
  labwareType: 'plate_96',
  name: 'plate1',
  addressing: {
    type: 'grid',
    rows: 8,
    columns: 12,
    rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  },
  geometry: { maxVolume_uL: 200, minVolume_uL: 1, wellShape: 'round' },
  layoutFamily: 'sbs_plate',
  wellPitch_mm: 9,
  orientationPolicy: 'rotatable',
  definitionId: 'opentrons/nest_96_wellplate_200ul_flat@v1',
  definitionSource: 'registry',
  renderProfile: 'plate',
  linearAxis: 'x',
  sourceRecordId: 'lbw-seed-plate-96-flat',
  color: '#7aa2f7',
} as unknown as Labware

const beadPlate: Labware = {
  labwareId: 'LAB-w211-golden-beadplate-a',
  labwareType: 'plate_96',
  name: 'Bead Beating Plate A',
  addressing: {
    type: 'grid',
    rows: 8,
    columns: 12,
    rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  },
  geometry: { maxVolume_uL: 200, minVolume_uL: 1, wellShape: 'round' },
  layoutFamily: 'sbs_plate',
  wellPitch_mm: 9,
  orientationPolicy: 'rotatable',
  definitionId: 'opentrons/nest_96_wellplate_200ul_flat@v1',
  definitionSource: 'registry',
  renderProfile: 'plate',
  linearAxis: 'x',
  sourceRecordId: 'LAB-w211-golden-beadplate-a',
  color: '#7aa2f7',
} as unknown as Labware

/**
 * The REAL committed add_material (evt-add_material-016ryhz4 as stored):
 * details.wells ["A1"] + details.well "A1", NO labwareId at event or details
 * level, composition snapshot + unresolved material requirement riding along
 * (the full real shape, not a stripped-down one).
 */
const committedAddMaterialA1: PlateEvent = {
  eventId: 'evt-add_material-016ryhz4',
  event_type: 'add_material',
  verb: 'add_material',
  vocabPackId: 'general',
  details: {
    well: 'A1',
    volumeUl: 100,
    volume: { value: 100, unit: 'uL' },
    composition_snapshot: [
      { component_ref: { kind: 'record', id: 'MAT-dmem-ykg0', type: 'material', label: 'DMEM' }, role: 'buffer_component' },
      { component_ref: { kind: 'record', id: 'MAT-fbs-3776', type: 'material', label: 'FBS' }, role: 'additive', source: '10% of the mixture' },
    ],
    formulation_kind: 'complex_composition',
    material_ref: { kind: 'record', id: 'MAT-dmem-fbs-1c0r', type: 'material', label: 'DMEM + FBS' },
    wells: ['A1'],
    material_spec_ref: { kind: 'record', id: 'MSP-DRAFT-…', type: 'material-spec', label: 'DMEM + FBS' },
    material_source_requirement: {
      status: 'unresolved',
      requirementId: 'REQE-…',
      reason: 'No explicit material instance, aliquot, or source lot selected during drafting.',
    },
  },
  provenance: { actor: 'ai-agent', timestamp: '2026-10-28T19:50:52.117Z', method: 'compiler', actionGroupId: 'compiler-draft' },
} as unknown as PlateEvent

const slotPlacement: EventEditorPlacement = {
  placementId: 'pl-preview-mvrthm30-1',
  labwareId: 'lbw-seed-plate-96-flat',
  location: { kind: 'slot', slotId: 'PLATE' },
  orientation: 'landscape',
}

const lawnPlacement: EventEditorPlacement = {
  placementId: 'pl-preview-mvsjekes-1',
  labwareId: 'LAB-w211-golden-beadplate-a',
  location: { kind: 'lawn', xMm: 16, yMm: 16 },
  orientation: 'landscape',
}

function markedIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[data-affected-well="true"]')).map(
    (el) => el.getAttribute('data-well-id') ?? '',
  )
}

afterEach(cleanup)

describe('LabwareTile — L2-SUITE-A-uifix3 D2: the committed well footprint is PAINTED at rest (real shapes)', () => {
  it('(a) the REAL post-reload shape — committed {wells:[A1], no labwareId}, NO offer binding, ONE placed plate — attributes A1 to that plate and the tile PAINTS A1', () => {
    // Post-reload client state: the committed event (real shape), no
    // committedOfferByEvent (the binding is not persisted — it is cleared on
    // load), the plate's single placement.
    const index = buildEventWellIndex([committedAddMaterialA1], null, {}, [slotPlacement.labwareId])
    // The index attributes A1 to the placed plate (fallback allowed when the
    // offer entry is ABSENT)…
    expect([...(index.get('lbw-seed-plate-96-flat') ?? [])]).toEqual(['A1'])
    // …and the tile at rest paints exactly A1.
    const { container } = render(
      <LabwareTile
        labware={plate1}
        placement={slotPlacement}
        orientation="landscape"
        variant="slot"
        affectedWells={index.get(slotPlacement.labwareId)}
      />,
    )
    const marked = markedIds(container)
    expect(marked).toEqual(['A1'])
    expect(container.querySelector('.tile')!.getAttribute('data-affected')).toBe('true')
  })

  it('(b) the same committed shape WITH an offer recordId binding paints through the same handoff', () => {
    // Same-session after accept: the per-batch binding carries the offer
    // recordId (the plate's labwareId — the single-vessel offer).
    const index = buildEventWellIndex(
      [committedAddMaterialA1],
      null,
      { [committedAddMaterialA1.eventId]: slotPlacement.labwareId },
      [slotPlacement.labwareId],
    )
    expect([...(index.get('lbw-seed-plate-96-flat') ?? [])]).toEqual(['A1'])
    const { container } = render(
      <LabwareTile
        labware={plate1}
        placement={slotPlacement}
        orientation="landscape"
        variant="slot"
        affectedWells={index.get(slotPlacement.labwareId)}
      />,
    )
    expect(markedIds(container)).toEqual(['A1'])
  })

  it('(c) TWO placed plates + no binding → the index attributes NOTHING (never guess; the rule is preserved)', () => {
    const index = buildEventWellIndex(
      [committedAddMaterialA1],
      null,
      {},
      [slotPlacement.labwareId, lawnPlacement.labwareId],
    )
    // The never-guess rule: genuinely ambiguous → the well set belongs to no tile.
    expect(index.size).toBe(0)
    const { container } = render(
      <>
        <LabwareTile
          labware={plate1}
          placement={slotPlacement}
          orientation="landscape"
          variant="slot"
          affectedWells={index.get(slotPlacement.labwareId)}
        />
        <LabwareTile
          labware={beadPlate}
          placement={lawnPlacement}
          orientation="landscape"
          variant="lawn"
          affectedWells={index.get(lawnPlacement.labwareId)}
        />
      </>,
    )
    expect(container.querySelectorAll('[data-affected-well="true"]').length).toBe(0)
  })

  it('the stylesheet PAINTS [data-affected-well] — the gate saw the attribute in the DOM but an unpainted well (only the tile outline changed in the pixel diff)', () => {
    // THE DEFECT: the data-affected-well attribute lands on the glyph cells
    // (the gate trail's markedWells ["A1"]) but eventEditor.css carries NO
    // rule for it — only `.tile[data-affected='true']` (the outline) is
    // styled, so the painted well is invisible at accept AND after reload.
    // Pin the paint rule (the tile-level outline does not count as the mark).
    const css = readFileSync(
      resolve(process.cwd(), 'src/event-editor/styles/eventEditor.css'),
      'utf8',
    )
    // A rule that targets the per-well attribute itself…
    expect(css).toMatch(/\[data-affected-well="true"\]/)
    // …with a visible fill (the well cell's interior, not just a stroke
    // outline on the tile) — fill is what the pixel diff showed missing.
    const ruleBody = css.match(/\[data-affected-well="true"\][^{]*\{([^}]*)\}/)?.[1] ?? ''
    expect(ruleBody).toMatch(/fill\s*:/i)
    expect(ruleBody).not.toMatch(/fill:\s*none/i)
  })
})
