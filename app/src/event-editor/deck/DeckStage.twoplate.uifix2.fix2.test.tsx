/**
 * L2-SUITE-A-uifix2 FIX2 [D3] RED — a deck variant with a committed lawn
 * placement must render that placement's tile (the gate: editorLayout
 * .placements grew to 2 while tileCount stayed 1 on the manual_single_plate
 * deck, because the variant declared NO overflow surface and DeckStage only
 * renders <LawnSurface> when `variant.surface` is declared).
 *
 * The committed lawn placement (the two-plate evidence deck f91e095f) carries
 * NO surfaceId — the event-graph schema (event-graph.schema.yaml:269-273) says
 * lawn `surfaceId` "Absent = 'primary' (legacy records)" — so it belongs to
 * the PRIMARY overflow bench. EVERY other slot-capable platform variant
 * declares an overflow surface (integra_assist ×2, ot2/ot3 sideLawn,
 * manual_freeform surface+sideLawn); manual_single_plate was the only slot
 * variant with none.
 *
 * THE FIX (data, not TS): declare the overflow bench on manual_single_plate
 * in config/platforms/manual.yaml — a `surface` (primary; 340×280mm compact
 * spare bench), NOT a sideLawn (sideLawn placements are stamped
 * surfaceId 'side' on drop and never carry the committed default 'primary').
 * ts-x --watch does NOT reload YAML → the lane stack needs a restart to pick
 * the declaration up (orchestrator-owned).
 *
 * RED (before the YAML change): the manifest has no `surface` → DeckStage
 * renders ONE tile (the slot plate) and no primary lawn section.
 * GREEN (after): TWO tiles (slot plate + lawn plate on the primary bench).
 *
 * The manifest is loaded from the REAL config/platforms/manual.yaml (the data
 * under test — a hand-built fixture would not flip RED→GREEN with the YAML
 * edit).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeckStage } from './DeckStage'
import { createLabware } from '../../types/labware'
import type { EventEditorState } from '../EventEditorContext'

const mocks = vi.hoisted(() => ({
  state: null as unknown as EventEditorState,
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: {
      movePlacement: vi.fn(),
      placeNewLabware: vi.fn(),
      removePlacement: vi.fn(),
      setFocus: vi.fn(),
      setPreview: vi.fn(),
      clearPreview: vi.fn(),
      commitPreview: vi.fn(),
    },
  }),
}))

// The pick dialog pulls the vendor/lab-db search stack — out of scope for a
// tile-count lock (the same mock family DeckSurfaceChat.ghost uses).
vi.mock('./AddToDeckDialog', () => ({
  AddToDeckDialog: () => null,
}))

// Nothing is staged (preview is null) — the bar is inert; stub it to keep the
// mount from pulling the chat/apply stack into the tree.
vi.mock('./PreviewActionBar', () => ({
  PreviewActionBar: () => null,
}))

/** The REAL platform manifest — the data under test. */
function loadManualPlatform(): { id: string; variants: Array<Record<string, unknown>> } {
  // <worktree>/config/platforms/manual.yaml — resolved against the vitest
  // cwd (app/, per the lane's run discipline): one level up is the worktree.
  const yamlPath = path.resolve(process.cwd(), '../config/platforms/manual.yaml')
  const doc = parse(fs.readFileSync(yamlPath, 'utf8')) as { id?: string; variants?: Array<Record<string, unknown>> }
  if (!doc.id || !Array.isArray(doc.variants)) throw new Error('manual.yaml: no id/variants')
  return doc as { id: string; variants: Array<Record<string, unknown>> }
}

const plate1 = {
  ...createLabware('plate_96', 'Plate 1'),
  labwareId: 'lbw-seed-plate-96-flat',
  physicalFootprintMm: { length: 127, width: 85 },
}
const plateB = {
  ...createLabware('plate_96', 'Plate B'),
  labwareId: 'LAB-w211-golden-beadplate-a',
  physicalFootprintMm: { length: 127, width: 85 },
}

/** The committed placements exactly as the evidence record holds them:
 *  (1) the plate in the PLATE slot; (2) the second plate on the lawn at
 *  (16,117) with NO surfaceId — the committed default is 'primary'. */
const placements = [
  {
    placementId: 'pl-1',
    labwareId: 'lbw-seed-plate-96-flat',
    location: { kind: 'slot', slotId: 'PLATE' },
    orientation: 'landscape',
  },
  {
    placementId: 'pl-2',
    labwareId: 'LAB-w211-golden-beadplate-a',
    location: { kind: 'lawn', xMm: 16, yMm: 117 },
    orientation: 'landscape',
  },
]

afterEach(() => {
  cleanup()
})

describe('DeckStage — L2-SUITE-A-uifix2 FIX2 [D3]: the manual_single_plate overflow bench renders the committed lawn placement', () => {
  it('renders TWO tiles (slot plate + lawn plate) on manual_single_plate with two committed placements', () => {
    const platform = loadManualPlatform()
    const variant = platform.variants.find((v) => v.id === 'manual_single_plate')
    expect(variant, 'manual.yaml must declare the manual_single_plate variant').toBeTruthy()

    // Data guard: the overflow bench this lock exists to protect — declared,
    // primary-scoped (committed lawn placements default to surfaceId
    // 'primary'), sized 340×280mm.
    expect(variant!.surface, 'manual_single_plate must declare an overflow `surface` (primary) in config/platforms/manual.yaml').toMatchObject({
      kind: 'lawn',
      widthMm: 340,
      heightMm: 280,
    })

    mocks.state = {
      platforms: [platform],
      platformId: 'manual',
      variantId: 'manual_single_plate',
      labwares: {
        'lbw-seed-plate-96-flat': plate1,
        'LAB-w211-golden-beadplate-a': plateB,
      },
      equipments: {},
      placements,
      events: [],
      preview: null,
      committedOfferByEvent: {},
      focusPlacementId: null,
      selection: null,
    } as unknown as EventEditorState

    const { container } = render(<DeckStage />)

    // The primary overflow bench is present at its declared size.
    const lawn = container.querySelector<HTMLElement>('.lawn--primary')
    expect(lawn, 'DeckStage must render the primary LawnSurface when the variant declares a surface').toBeTruthy()

    // BOTH placements render a tile: the slot plate (data-occupied slot) and
    // the lawn plate (lawn tile anchor on the primary surface).
    const occupiedSlots = container.querySelectorAll('.slot[data-occupied="true"]')
    expect(occupiedSlots.length).toBe(1)
    const lawnTiles = container.querySelectorAll('.lawn--primary .lawn__tile-anchor')
    expect(lawnTiles.length).toBe(1)
    expect(container.querySelectorAll('.tile').length).toBe(2)
  })
})
