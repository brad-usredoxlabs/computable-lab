import type { Labware } from '../../types/labware'
import { parseGridWellId } from '../../types/labware'
import { getToolType } from '../../graph/tools/types'
import { getAssistPipetteModelById } from '../../graph/lib/assistPipetteRegistry'
import type { WellId } from '../../types/plate'
import type { LabwareOrientation } from '../types'

export interface ActivePipetteSpec {
  channels: number
  // Fixed spacing: minMm === maxMm. Adjustable: minMm < maxMm.
  spacingMinMm: number
  spacingMaxMm: number
  spacingMode: 'fixed' | 'adjustable'
  // Display label for tooltips/warnings.
  label: string
}

export interface PipetteExpansion {
  wells: WellId[]
  // Plate-pitch multiplier between adjacent tips (1 = contiguous, 2 = every-other).
  stepInPitchUnits: number
  // Diagnostic: which axis we walked on in plate coordinates.
  axis: 'row' | 'col' | 'linear-x' | 'linear-y' | 'single'
  warning: string | null
}

/**
 * Resolve the active pipette from the editor's tool selection. Returns null
 * for non-pipette tools (plate reader, washer) or when nothing is selected —
 * callers should fall through to single-well selection in that case.
 */
export function resolveActivePipette(
  toolTypeId: string | null,
  assistPipetteId: string | null,
): ActivePipetteSpec | null {
  if (assistPipetteId) {
    const model = getAssistPipetteModelById(assistPipetteId)
    if (model) {
      if (model.spacingMode === 'adjustable' && model.spacingRangeMm) {
        return {
          channels: model.channels,
          spacingMinMm: model.spacingRangeMm.min,
          spacingMaxMm: model.spacingRangeMm.max,
          spacingMode: 'adjustable',
          label: model.displayName,
        }
      }
      const fixed = model.spacingMode === 'fixed_4_5mm' ? 4.5 : 9
      return {
        channels: model.channels,
        spacingMinMm: fixed,
        spacingMaxMm: fixed,
        spacingMode: 'fixed',
        label: model.displayName,
      }
    }
  }
  if (toolTypeId) {
    const tool = getToolType(toolTypeId)
    if (tool && tool.channelCount && tool.channelCount > 1) {
      // Non-assist multichannel pipettes — assume fixed 9 mm SBS pitch.
      return {
        channels: tool.channelCount,
        spacingMinMm: 9,
        spacingMaxMm: 9,
        spacingMode: 'fixed',
        label: tool.displayName,
      }
    }
  }
  return null
}

/**
 * Expand a click on `anchorWellId` to the full pipette pattern.
 *
 * Invariant: multichannel pipettes always run along deck-y. In landscape, that
 * maps to the plate's row axis (we walk A→H within the clicked column). In
 * portrait the plate is rotated 90°, so deck-y maps to the column axis (we
 * walk 1→12 within the clicked row).
 *
 * When the pipette's tip spacing is a clean integer multiple of the plate
 * pitch, tips land on every Nth well (e.g. 8-channel at 9 mm on a 384-well
 * plate with 4.5 mm pitch → step=2, every other well: A, C, E, G).
 */
export function expandMultichannelSelection(
  pipette: ActivePipetteSpec,
  labware: Labware,
  orientation: LabwareOrientation,
  anchorWellId: WellId,
): PipetteExpansion {
  const addressing = labware.addressing

  if (addressing.type === 'single') {
    return { wells: ['1'], stepInPitchUnits: 1, axis: 'single', warning: null }
  }

  if (addressing.type === 'linear') {
    // Linear labware (reservoirs, troughs): pipette walks along the labware's
    // linearAxis. Spacing checks against well_pitch_mm if defined.
    const labels = addressing.linearLabels ?? []
    if (labels.length === 0) {
      return { wells: [anchorWellId], stepInPitchUnits: 1, axis: 'linear-x', warning: null }
    }
    const anchorIdx = labels.indexOf(anchorWellId)
    if (anchorIdx < 0) {
      return { wells: [anchorWellId], stepInPitchUnits: 1, axis: 'linear-x', warning: null }
    }
    const pitch = labware.wellPitch_mm ?? 9
    const step = resolveStep(pipette, pitch)
    if (step.error) {
      return { wells: [anchorWellId], stepInPitchUnits: 1, axis: 'linear-x', warning: step.error }
    }
    const wells: WellId[] = []
    let cursor = anchorIdx
    for (let i = 0; i < pipette.channels; i += 1) {
      if (cursor < 0 || cursor >= labels.length) break
      const label = labels[cursor]
      if (label) wells.push(label)
      cursor += step.value
    }
    // If we hit the end early, shift the anchor backwards to fit the whole pipette.
    if (wells.length < pipette.channels) {
      const overshoot = pipette.channels - wells.length
      const shiftedStart = Math.max(0, anchorIdx - overshoot * step.value)
      const shifted: WellId[] = []
      for (let i = 0; i < pipette.channels; i += 1) {
        const idx = shiftedStart + i * step.value
        const label = labels[idx]
        if (label) shifted.push(label)
      }
      return {
        wells: shifted.length > 0 ? shifted : [anchorWellId],
        stepInPitchUnits: step.value,
        axis: (labware.linearAxis ?? 'x') === 'y' ? 'linear-y' : 'linear-x',
        warning: shifted.length < pipette.channels ? 'Pipette extends past labware bounds.' : null,
      }
    }
    return {
      wells,
      stepInPitchUnits: step.value,
      axis: (labware.linearAxis ?? 'x') === 'y' ? 'linear-y' : 'linear-x',
      warning: null,
    }
  }

  // Grid (plates).
  const anchorRC = parseGridWellId(anchorWellId, labware)
  if (!anchorRC) {
    return { wells: [anchorWellId], stepInPitchUnits: 1, axis: 'row', warning: null }
  }
  const rowLabels = addressing.rowLabels ?? []
  const colLabels = addressing.columnLabels ?? []
  const pitch = labware.wellPitch_mm ?? 9
  const step = resolveStep(pipette, pitch)
  if (step.error) {
    return { wells: [anchorWellId], stepInPitchUnits: 1, axis: 'row', warning: step.error }
  }

  // Pipette runs along deck-y. In landscape this is the plate's row axis;
  // in portrait, the column axis.
  const walkAxis: 'row' | 'col' = orientation === 'portrait' ? 'col' : 'row'

  if (walkAxis === 'row') {
    const wells = walkAlongRows(anchorRC, step.value, pipette.channels, rowLabels, colLabels)
    return {
      wells: wells.length > 0 ? wells : [anchorWellId],
      stepInPitchUnits: step.value,
      axis: 'row',
      warning: wells.length < pipette.channels ? 'Pipette extends past plate bounds.' : null,
    }
  }
  const wells = walkAlongCols(anchorRC, step.value, pipette.channels, rowLabels, colLabels)
  return {
    wells: wells.length > 0 ? wells : [anchorWellId],
    stepInPitchUnits: step.value,
    axis: 'col',
    warning: wells.length < pipette.channels ? 'Pipette extends past plate bounds.' : null,
  }
}

function resolveStep(
  pipette: ActivePipetteSpec,
  pitchMm: number,
): { value: number; error: string | null } {
  if (pitchMm <= 0) return { value: 1, error: null }

  if (pipette.spacingMode === 'fixed') {
    const tipDistance = pipette.spacingMinMm
    const stepRaw = tipDistance / pitchMm
    const step = Math.round(stepRaw)
    if (step <= 0) {
      return {
        value: 1,
        error: `${pipette.label}: tip spacing ${tipDistance} mm is smaller than the plate's ${pitchMm} mm pitch.`,
      }
    }
    if (Math.abs(stepRaw - step) > 0.05) {
      return {
        value: step,
        error: `${pipette.label}: tip spacing ${tipDistance} mm doesn't align cleanly with the plate's ${pitchMm} mm pitch.`,
      }
    }
    return { value: step, error: null }
  }

  // Adjustable: prefer contiguous (step=1) if the plate pitch is within range,
  // otherwise pick the smallest step that fits.
  if (pitchMm >= pipette.spacingMinMm && pitchMm <= pipette.spacingMaxMm) {
    return { value: 1, error: null }
  }
  for (let step = 2; step <= 8; step += 1) {
    const d = step * pitchMm
    if (d >= pipette.spacingMinMm && d <= pipette.spacingMaxMm) {
      return { value: step, error: null }
    }
  }
  return {
    value: 1,
    error: `${pipette.label}: no spacing in range (${pipette.spacingMinMm}–${pipette.spacingMaxMm} mm) reaches the plate's ${pitchMm} mm pitch.`,
  }
}

function walkAlongRows(
  anchor: { row: number; col: number },
  step: number,
  channels: number,
  rowLabels: string[],
  colLabels: string[],
): WellId[] {
  // Try anchor forward first; if it doesn't fit, slide the anchor up so the
  // pipette pattern fits within the plate.
  const colLabel = colLabels[anchor.col]
  if (!colLabel) return []
  const maxStart = rowLabels.length - 1 - (channels - 1) * step
  const start = Math.max(0, Math.min(anchor.row, Math.max(0, maxStart)))
  const wells: WellId[] = []
  for (let i = 0; i < channels; i += 1) {
    const r = start + i * step
    if (r < 0 || r >= rowLabels.length) break
    const label = rowLabels[r]
    if (label) wells.push(`${label}${colLabel}`)
  }
  return wells
}

function walkAlongCols(
  anchor: { row: number; col: number },
  step: number,
  channels: number,
  rowLabels: string[],
  colLabels: string[],
): WellId[] {
  const rowLabel = rowLabels[anchor.row]
  if (!rowLabel) return []
  const maxStart = colLabels.length - 1 - (channels - 1) * step
  const start = Math.max(0, Math.min(anchor.col, Math.max(0, maxStart)))
  const wells: WellId[] = []
  for (let i = 0; i < channels; i += 1) {
    const c = start + i * step
    if (c < 0 || c >= colLabels.length) break
    const label = colLabels[c]
    if (label) wells.push(`${rowLabel}${label}`)
  }
  return wells
}

/**
 * Compute the contiguous range from anchor to target along the same axis they
 * share (same row → range across columns, same column → range across rows,
 * neither → rectangular bounding box).
 */
export function expandRangeSelection(
  labware: Labware,
  anchorWellId: WellId,
  targetWellId: WellId,
): WellId[] {
  const addressing = labware.addressing
  if (addressing.type === 'single') return [targetWellId]

  if (addressing.type === 'linear') {
    const labels = addressing.linearLabels ?? []
    const a = labels.indexOf(anchorWellId)
    const b = labels.indexOf(targetWellId)
    if (a < 0 || b < 0) return [targetWellId]
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    return labels.slice(lo, hi + 1)
  }

  const a = parseGridWellId(anchorWellId, labware)
  const b = parseGridWellId(targetWellId, labware)
  if (!a || !b) return [targetWellId]
  const rowLabels = addressing.rowLabels ?? []
  const colLabels = addressing.columnLabels ?? []
  const [r0, r1] = a.row <= b.row ? [a.row, b.row] : [b.row, a.row]
  const [c0, c1] = a.col <= b.col ? [a.col, b.col] : [b.col, a.col]
  const wells: WellId[] = []
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const rl = rowLabels[r]
      const cl = colLabels[c]
      if (rl && cl) wells.push(`${rl}${cl}`)
    }
  }
  return wells
}
