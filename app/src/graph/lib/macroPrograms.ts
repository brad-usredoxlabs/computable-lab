import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import type {
  MacroProgram,
  QuadrantReplicateMacroProgram,
  SpacingTransitionTransferMacroProgram,
  SerialDilutionMacroProgram,
  TransferVignetteMacroProgram,
} from '../../types/macroProgram'
import {
  expandSerialDilutionToPlateEvents,
  isSerialDilutionParamsLegacy,
  isSerialDilutionV2CurrentlyCompilable,
  normalizeSerialDilutionParams,
  resolveSerialPath,
} from '../../editor/lib/serialDilutionPlan'
import type { WellId } from '../../types/plate'

export interface MacroCompileContext {
  event: PlateEvent
  program: MacroProgram
  labwares: Map<string, Labware>
}

export interface MacroProgramCompiler<TProgram extends MacroProgram = MacroProgram> {
  kind: TProgram['kind']
  compile: (ctx: MacroCompileContext & { program: TProgram }) => PlateEvent[]
}

function makeEventId(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}-${Math.random().toString(36).slice(2, 6)}`
}

const serialDilutionCompiler: MacroProgramCompiler<SerialDilutionMacroProgram> = {
  kind: 'serial_dilution',
  compile: ({ event, program, labwares }) => {
    const normalized = normalizeSerialDilutionParams(program.params, {
      fallbackLabwareId: isSerialDilutionParamsLegacy(program.params)
        ? program.params.pathSpec.containerId
        : undefined,
      resolvePath: (legacy) => {
        const labwareId = legacy.pathSpec.containerId
        const labware = labwareId ? labwares.get(labwareId) : undefined
        return resolveSerialPath(legacy.pathSpec, labware)
      },
    })
    if (!isSerialDilutionV2CurrentlyCompilable(normalized)) return []
    const lane = normalized.lanes[0]
    const labware = lane?.targetLabwareId ? labwares.get(lane.targetLabwareId) : undefined
    return expandSerialDilutionToPlateEvents(event, normalized, labware)
  },
}

function parseGridWell(address: string): { row: string; col: number } | null {
  const match = address.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return { row: match[1], col: parseInt(match[2], 10) }
}

function isWellInRegion(
  wellId: WellId,
  region: QuadrantReplicateMacroProgram['params']['targetRegion']
): boolean {
  if (!region) return true
  const parsed = parseGridWell(wellId)
  if (!parsed) return false
  if (region.rowStart && parsed.row < region.rowStart) return false
  if (region.rowEnd && parsed.row > region.rowEnd) return false
  if (typeof region.colStart === 'number' && parsed.col < region.colStart) return false
  if (typeof region.colEnd === 'number' && parsed.col > region.colEnd) return false
  return true
}

function buildQuadrantTargets(
  sourceWell: WellId,
  sourceRows: string[],
  sourceCols: string[],
  targetRows: string[],
  targetCols: string[],
  rowOffset: number,
  colOffset: number,
  sourceOrientation: 'portrait' | 'landscape',
  targetOrientation: 'portrait' | 'landscape'
): WellId[] {
  const sourceParsed = parseGridWell(sourceWell)
  if (!sourceParsed) return []
  const sourceRowIndex = sourceRows.indexOf(sourceParsed.row)
  const sourceColIndex = sourceCols.indexOf(String(sourceParsed.col))
  if (sourceRowIndex < 0 || sourceColIndex < 0) return []

  const sourceDisplayRow = sourceOrientation === 'portrait' ? sourceColIndex : sourceRowIndex
  const sourceDisplayCol = sourceOrientation === 'portrait' ? sourceRowIndex : sourceColIndex
  const baseTargetRow = sourceDisplayRow * 2 + rowOffset
  const baseTargetCol = sourceDisplayCol * 2 + colOffset
  const out: WellId[] = []
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const displayRow = baseTargetRow + dr
      const displayCol = baseTargetCol + dc
      const tr = targetOrientation === 'portrait' ? displayCol : displayRow
      const tc = targetOrientation === 'portrait' ? displayRow : displayCol
      if (tr < 0 || tc < 0 || tr >= targetRows.length || tc >= targetCols.length) continue
      out.push(`${targetRows[tr]}${targetCols[tc]}` as WellId)
    }
  }
  return out
}

const quadrantReplicateCompiler: MacroProgramCompiler<QuadrantReplicateMacroProgram> = {
  kind: 'quadrant_replicate',
  compile: ({ event, program, labwares }) => {
    const { params } = program
    const sourceLabware = labwares.get(params.sourceLabwareId)
    const targetLabware = labwares.get(params.targetLabwareId)
    if (!sourceLabware || !targetLabware) return []
    if (sourceLabware.addressing.type !== 'grid' || targetLabware.addressing.type !== 'grid') return []

    const sourceRows = sourceLabware.addressing.rowLabels || []
    const sourceCols = sourceLabware.addressing.columnLabels || []
    const targetRows = targetLabware.addressing.rowLabels || []
    const targetCols = targetLabware.addressing.columnLabels || []

    const rowOffset = params.targetRowOffset ?? 0
    const colOffset = params.targetColOffset ?? 0
    const sourceOrientation = program.source_pose?.orientation || 'landscape'
    const targetOrientation = program.target_pose?.orientation || 'landscape'
    const usableTargets = new Set(program.constraints?.usable_target_wells || [])
    const blockedTargets = new Set(program.constraints?.blocked_target_wells || [])

    const events: PlateEvent[] = []
    let idx = 0

    for (const sourceWell of params.sourceWells) {
      const rawTargets = buildQuadrantTargets(
        sourceWell,
        sourceRows,
        sourceCols,
        targetRows,
        targetCols,
        rowOffset,
        colOffset,
        sourceOrientation,
        targetOrientation
      )
      const targetWells = rawTargets.filter((w) => {
        if (!isWellInRegion(w, params.targetRegion)) return false
        if (blockedTargets.has(w)) return false
        if (usableTargets.size > 0 && !usableTargets.has(w)) return false
        return true
      })
      if (targetWells.length === 0) continue

      events.push({
        eventId: makeEventId(event.eventId, `quad-xfer-${idx++}`),
        event_type: 'transfer',
        t_offset: event.t_offset,
        notes: `macro:${event.eventId} quadrant replicate`,
        details: {
          source_labwareId: params.sourceLabwareId,
          dest_labwareId: params.targetLabwareId,
          source_wells: [sourceWell],
          dest_wells: targetWells,
          source: { labwareInstanceId: params.sourceLabwareId, wells: [sourceWell] },
          target: { labwareInstanceId: params.targetLabwareId, wells: targetWells },
          volume: { value: params.volume_uL, unit: 'uL' },
          ...(params.extraVolume_uL && params.extraVolume_uL > 0
            ? { dead_volume: { value: params.extraVolume_uL, unit: 'uL' as const } }
            : {}),
        },
      })

    }

    return events
  },
}

const spacingTransitionTransferCompiler: MacroProgramCompiler<SpacingTransitionTransferMacroProgram> = {
  kind: 'spacing_transition_transfer',
  compile: ({ event, program }) => {
    const { params } = program
    if (!params.sourceLabwareId || !params.targetLabwareId) return []
    if (params.sourceWells.length === 0 || params.targetWells.length === 0 || params.volume_uL <= 0) return []

    const sourceWells = [...params.sourceWells]
    const targetWells = [...params.targetWells]
    const active = params.activeChannelIndices || []
    const hasActiveSubset = active.length > 0

    const filteredSources = hasActiveSubset
      ? active.map((i) => sourceWells[i]).filter((w): w is WellId => Boolean(w))
      : sourceWells
    const filteredTargets = hasActiveSubset
      ? active.map((i) => targetWells[i]).filter((w): w is WellId => Boolean(w))
      : targetWells

    const pairCount = Math.min(filteredSources.length, filteredTargets.length)
    if (pairCount <= 0) return []
    const pairedSources = filteredSources.slice(0, pairCount)
    const pairedTargets = filteredTargets.slice(0, pairCount)

    const events: PlateEvent[] = []
    const noteParts = [
      `macro:${event.eventId} spacing transfer`,
      typeof params.spacingAtAspirate_mm === 'number' ? `asp:${params.spacingAtAspirate_mm}mm` : null,
      typeof params.spacingAtDispense_mm === 'number' ? `disp:${params.spacingAtDispense_mm}mm` : null,
      hasActiveSubset ? `channels:${active.join(',')}` : null,
    ].filter(Boolean)

    events.push({
      eventId: makeEventId(event.eventId, 'spacing-xfer-0'),
      event_type: 'transfer',
      t_offset: event.t_offset,
      notes: noteParts.join(' | '),
      details: {
        source_labwareId: params.sourceLabwareId,
        dest_labwareId: params.targetLabwareId,
        source_wells: pairedSources,
        dest_wells: pairedTargets,
        source: { labwareInstanceId: params.sourceLabwareId, wells: pairedSources },
        target: { labwareInstanceId: params.targetLabwareId, wells: pairedTargets },
        volume: { value: params.volume_uL, unit: 'uL' },
        mapping: pairedSources.map((sourceWell, idx) => ({
          source_well: sourceWell,
          target_well: pairedTargets[idx],
          volume_uL: params.volume_uL,
        })),
      },
    })

    if (params.mixAfterDispense && params.mixAfterDispense.cycles > 0 && params.mixAfterDispense.volume_uL > 0) {
      events.push({
        eventId: makeEventId(event.eventId, 'spacing-mix-1'),
        event_type: 'mix',
        t_offset: event.t_offset,
        notes: `macro:${event.eventId} spacing transfer mix`,
        details: {
          labwareId: params.targetLabwareId,
          wells: pairedTargets,
          mix_count: params.mixAfterDispense.cycles,
          speed: `${params.mixAfterDispense.volume_uL}uL`,
        },
      })
    }

    return events
  },
}

const transferVignetteCompiler: MacroProgramCompiler<TransferVignetteMacroProgram> = {
  kind: 'transfer_vignette',
  compile: ({ event, program }) => {
    const { params } = program
    const sourceWells = params.sourceWells || []
    const targetWells = params.targetWells || []
    const transferMode = params.transferMode === 'multi_dispense' ? 'multi_dispense' : 'transfer'
    if (!params.sourceLabwareId && !params.targetLabwareId) return []
    if (!params.volume || typeof params.volume.value !== 'number' || params.volume.value <= 0) return []
    if (sourceWells.length === 0) return []
    if (!params.discardToWaste && targetWells.length === 0) return []

    return [{
      eventId: makeEventId(event.eventId, 'template-xfer-0'),
      event_type: transferMode,
      t_offset: event.t_offset,
      notes: [
        `macro:${event.eventId} transfer vignette`,
        program.template_ref?.label || program.template_ref?.id || null,
      ].filter(Boolean).join(' | '),
      details: {
        source_labwareId: params.sourceLabwareId,
        dest_labwareId: params.targetLabwareId,
        source_wells: sourceWells,
        dest_wells: targetWells,
        source: params.sourceLabwareId ? { labwareInstanceId: params.sourceLabwareId, wells: sourceWells } : undefined,
        target: params.targetLabwareId ? { labwareInstanceId: params.targetLabwareId, wells: targetWells } : undefined,
        volume: params.volume,
        ...(params.deadVolume ? { dead_volume: params.deadVolume } : {}),
        ...(params.discardToWaste ? { discard_to_waste: true } : {}),
        ...(params.inputs?.length ? { inputs: params.inputs } : {}),
        ...(program.execution_hints ? { execution_hints: program.execution_hints } : {}),
      },
    }]
  },
}

const compilerRegistry = {
  serial_dilution: serialDilutionCompiler,
  quadrant_replicate: quadrantReplicateCompiler,
  spacing_transition_transfer: spacingTransitionTransferCompiler,
  transfer_vignette: transferVignetteCompiler,
} satisfies {
  [K in MacroProgram['kind']]: MacroProgramCompiler<Extract<MacroProgram, { kind: K }>>
}

export function compileMacroProgram(event: PlateEvent, labwares: Map<string, Labware>): PlateEvent[] {
  const details = event.details as Record<string, unknown>
  const program = details.program as MacroProgram | undefined
  if (!program || !program.kind) return []
  const compiler = compilerRegistry[program.kind] as MacroProgramCompiler<MacroProgram> | undefined
  if (!compiler) return []
  return compiler.compile({ event, program, labwares })
}
