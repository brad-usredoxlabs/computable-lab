/**
 * SerialDilutionForm - v2 semantic authoring for serial dilutions.
 *
 * Phase 2 goals:
 * - Author a serial dilution semantic object directly.
 * - Use a real material ref for diluent selection.
 * - Support explicit lanes or simple repeated lane patterns.
 * - Keep preview math aligned with the current in-place planner subset.
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import type { WellId } from '../../../types/plate'
import type {
  SerialDilutionParams,
  SerialDilutionParamsV2,
  SerialDilutionMode,
  SerialEndPolicyV2,
  SerialReplicateMode,
  SerialTipPolicy,
} from '../../../types/macroProgram'
import {
  buildLegacyPathSpecFromLane,
  deriveSerialDilutionVolumesV2,
  isSerialDilutionParamsLegacy,
  normalizeSerialDilutionParams,
} from '../../../editor/lib/serialDilutionPlan'

export type { SerialDilutionParams } from '../../../types/macroProgram'

export interface SerialDilutionFormProps {
  sourceSelectedWells: WellId[]
  targetSelectedWells?: WellId[]
  sourceLabwareId: string
  sourceLabwareRows?: number
  sourceLabwareCols?: number
  targetLabwareId?: string
  targetLabwareRows?: number
  targetLabwareCols?: number
  initialParams?: SerialDilutionParams
  onChange: (params: SerialDilutionParamsV2 | null) => void
  showPreview?: boolean
  compact?: boolean
}

type Direction = 'right' | 'left' | 'down' | 'up'
type WellOneMode = 'already_in_first_well'

function buildPath(
  start: WellId,
  direction: Direction,
  pointCount: number,
  rows: number,
  cols: number,
): WellId[] {
  const out: WellId[] = []
  const linear = start.match(/^(\d+)$/)
  if (linear) {
    let idx = parseInt(linear[1], 10)
    for (let i = 0; i < pointCount; i++) {
      if (idx < 1 || idx > cols) break
      out.push(String(idx) as WellId)
      switch (direction) {
        case 'right':
        case 'down':
          idx++
          break
        case 'left':
        case 'up':
          idx--
          break
      }
    }
    return out
  }
  const m = start.match(/^([A-Z]+)(\d+)$/)
  if (!m) return out
  let row = m[1].charCodeAt(0) - 'A'.charCodeAt(0)
  let col = parseInt(m[2], 10) - 1
  for (let i = 0; i < pointCount; i++) {
    if (row < 0 || row >= rows || col < 0 || col >= cols) break
    out.push(`${String.fromCharCode('A'.charCodeAt(0) + row)}${col + 1}` as WellId)
    switch (direction) {
      case 'right': col++; break
      case 'left': col--; break
      case 'down': row++; break
      case 'up': row--; break
    }
  }
  return out
}

function offsetStartWell(start: WellId, axis: 'row' | 'column', delta: number): WellId | null {
  const match = start.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  const baseRow = match[1].charCodeAt(0) - 'A'.charCodeAt(0)
  const baseCol = parseInt(match[2], 10) - 1
  const nextRow = axis === 'row' ? baseRow + delta : baseRow
  const nextCol = axis === 'column' ? baseCol + delta : baseCol
  if (nextRow < 0 || nextCol < 0) return null
  return `${String.fromCharCode('A'.charCodeAt(0) + nextRow)}${nextCol + 1}` as WellId
}

function toTextList(value: WellId[]): string {
  return value.join(', ')
}

function parseWellList(value: string): WellId[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is WellId => entry.length > 0)
}

function projectParamsToInitialState(
  params: SerialDilutionParams | undefined,
  sourceLabwareId: string,
): {
  mode: SerialDilutionMode
  direction: Direction
  points: string
  transferVolume: string
  mixCycles: string
  mixVolume: string
  tipPolicy: SerialTipPolicy
  endPolicy: SerialEndPolicyV2
  replicateMode: SerialReplicateMode
  replicateAxis: 'row' | 'column'
  replicateCount: string
  replicateSpacing: string
  startWellsText: string
} {
  if (!params) {
    return {
      mode: 'in_place',
      direction: 'down',
      points: '8',
      transferVolume: '100',
      mixCycles: '3',
      mixVolume: '80',
      tipPolicy: 'change_each_step',
      endPolicy: 'discard_excess',
      replicateMode: 'explicit_lanes',
      replicateAxis: 'row',
      replicateCount: '1',
      replicateSpacing: '1',
      startWellsText: '',
    }
  }

  const normalized = normalizeSerialDilutionParams(params, {
    fallbackLabwareId: sourceLabwareId,
  })
  const lane = normalized.lanes[0]
  const legacy = isSerialDilutionParamsLegacy(params) ? params : undefined
  const pathSpec = legacy?.pathSpec || buildLegacyPathSpecFromLane(lane)

  return {
    mode: normalized.mode === 'prepare_then_transfer' ? 'source_to_target' : normalized.mode,
    direction: (pathSpec.direction || 'down') as Direction,
    points: String(Math.max(2, lane?.path.length || pathSpec.stepCount || 2)),
    transferVolume: String(normalized.dilution.resolvedTransferVolume_uL || 100),
    mixCycles: String(normalized.mix.cycles || 3),
    mixVolume: String(normalized.mix.volume_uL || 80),
    tipPolicy: normalized.tipPolicy,
    endPolicy: normalized.endPolicy,
    replicateMode: normalized.replicates?.mode || (normalized.lanes.length > 1 ? 'pattern' : 'explicit_lanes'),
    replicateAxis: normalized.replicates?.axis || 'row',
    replicateCount: String(normalized.replicates?.count || normalized.lanes.length || 1),
    replicateSpacing: String(normalized.replicates?.spacing || 1),
    startWellsText: toTextList(
      normalized.lanes.length > 1
        ? normalized.lanes.map((item) => item.path[0]).filter((well): well is WellId => Boolean(well))
        : (lane?.path?.[0] ? [lane.path[0]] : []),
    ),
  }
}

export function SerialDilutionForm({
  sourceSelectedWells,
  targetSelectedWells = [],
  sourceLabwareId,
  sourceLabwareRows = 8,
  sourceLabwareCols = 12,
  targetLabwareId,
  targetLabwareRows = 8,
  targetLabwareCols = 12,
  initialParams,
  onChange,
  showPreview = true,
  compact = false,
}: SerialDilutionFormProps) {
  const initialState = useMemo(
    () => projectParamsToInitialState(initialParams, sourceLabwareId),
    [initialParams, sourceLabwareId],
  )

  const [mode, setMode] = useState<SerialDilutionMode>(initialState.mode)
  const [direction, setDirection] = useState<Direction>(initialState.direction)
  const [pointCountText, setPointCountText] = useState<string>(initialState.points)
  const [transferVolumeText, setTransferVolumeText] = useState<string>(initialState.transferVolume)
  const [mixCyclesText, setMixCyclesText] = useState<string>(initialState.mixCycles)
  const [mixVolumeText, setMixVolumeText] = useState<string>(initialState.mixVolume)
  const [tipPolicy, setTipPolicy] = useState<SerialTipPolicy>(initialState.tipPolicy)
  const [endPolicy, setEndPolicy] = useState<SerialEndPolicyV2>(initialState.endPolicy)
  const [replicateMode, setReplicateMode] = useState<SerialReplicateMode>(initialState.replicateMode)
  const [replicateAxis, setReplicateAxis] = useState<'row' | 'column'>(initialState.replicateAxis)
  const [replicateCountText, setReplicateCountText] = useState<string>(initialState.replicateCount)
  const [replicateSpacingText, setReplicateSpacingText] = useState<string>(initialState.replicateSpacing)
  const [startWellsText, setStartWellsText] = useState<string>(initialState.startWellsText)

  useEffect(() => {
    const next = projectParamsToInitialState(initialParams, sourceLabwareId)
    setMode(next.mode)
    setDirection(next.direction)
    setPointCountText(next.points)
    setTransferVolumeText(next.transferVolume)
    setMixCyclesText(next.mixCycles)
    setMixVolumeText(next.mixVolume)
    setTipPolicy(next.tipPolicy)
    setEndPolicy(next.endPolicy)
    setReplicateMode(next.replicateMode)
    setReplicateAxis(next.replicateAxis)
    setReplicateCountText(next.replicateCount)
    setReplicateSpacingText(next.replicateSpacing)
    setStartWellsText(next.startWellsText)
  }, [initialParams, sourceLabwareId])

  const pointCount = useMemo(() => {
    const parsed = Number.parseInt(pointCountText, 10)
    return Number.isFinite(parsed) ? Math.max(2, parsed) : 2
  }, [pointCountText])

  const transferVolume = useMemo(() => {
    const parsed = Number.parseFloat(transferVolumeText)
    return Number.isFinite(parsed) ? Math.max(1, parsed) : 100
  }, [transferVolumeText])

  const mixCycles = useMemo(() => {
    const parsed = Number.parseInt(mixCyclesText, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [mixCyclesText])

  const mixVolume = useMemo(() => {
    const parsed = Number.parseFloat(mixVolumeText)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [mixVolumeText])

  const replicateCount = useMemo(() => {
    const parsed = Number.parseInt(replicateCountText, 10)
    return Number.isFinite(parsed) ? Math.max(1, parsed) : 1
  }, [replicateCountText])

  const replicateSpacing = useMemo(() => {
    const parsed = Number.parseInt(replicateSpacingText, 10)
    return Number.isFinite(parsed) ? Math.max(1, parsed) : 1
  }, [replicateSpacingText])

  const pathLabwareId = mode === 'source_to_target' ? (targetLabwareId || sourceLabwareId) : sourceLabwareId
  const pathRows = mode === 'source_to_target' ? targetLabwareRows : sourceLabwareRows
  const pathCols = mode === 'source_to_target' ? targetLabwareCols : sourceLabwareCols
  const selectedPathStarts = mode === 'source_to_target'
    ? (targetSelectedWells.length > 0 ? targetSelectedWells : sourceSelectedWells)
    : sourceSelectedWells
  const explicitPathStarts = useMemo(() => parseWellList(startWellsText), [startWellsText])

  function expandSeedStarts(starts: WellId[]): WellId[] {
    if (starts.length === 0) return []
    const seedStarts = replicateMode === 'pattern' ? starts.slice(0, 1) : starts
    return seedStarts.flatMap((seed) => {
      if (replicateMode !== 'pattern') return [seed]
      return Array.from({ length: replicateCount }, (_, index) => (
        offsetStartWell(seed, replicateAxis, index * replicateSpacing)
      )).filter((well): well is WellId => Boolean(well))
    })
  }

  const candidatePathStarts = explicitPathStarts.length > 0 ? explicitPathStarts : selectedPathStarts

  const generatedLanes = useMemo(() => {
    const expandedPathStarts = expandSeedStarts(candidatePathStarts)
    if (expandedPathStarts.length === 0) return []

    return expandedPathStarts.map((startWell, index) => {
      const path = buildPath(startWell, direction, pointCount, pathRows, pathCols)
      return {
        laneId: `lane-${index + 1}`,
        targetLabwareId: pathLabwareId,
        ...(mode === 'source_to_target' ? { sourceLabwareId } : {}),
        startSource: {
          kind: 'existing_well' as const,
          labwareId: pathLabwareId,
          wellId: startWell,
        },
        path,
      }
    })
  }, [
    candidatePathStarts,
    direction,
    mode,
    pointCount,
    replicateAxis,
    replicateCount,
    replicateMode,
    replicateSpacing,
    sourceLabwareId,
    pathLabwareId,
    pathCols,
    pathRows,
  ])

  const dilution = useMemo(
    () => deriveSerialDilutionVolumesV2({
      factor: 2,
      volumeModel: 'from_transfer',
      transferVolume_uL: transferVolume,
    }),
    [transferVolume],
  )

  const params = useMemo((): SerialDilutionParamsV2 | null => {
    if (generatedLanes.length === 0 || generatedLanes.some((lane) => lane.path.length < 2)) return null
    return {
      version: 2,
      mode,
      lanes: generatedLanes,
      ...(generatedLanes.length > 1
        ? {
            replicates: {
              mode: replicateMode,
              ...(replicateMode === 'pattern' ? { axis: replicateAxis, count: replicateCount, spacing: replicateSpacing } : {}),
            },
          }
        : {}),
      dilution,
      diluent: {
        mode: 'material_ref',
      },
      preparation: {
        topWellMode: 'external',
        receivingWellMode: 'external',
        manualSetup: true,
      },
      mix: {
        cycles: mixCycles,
        volume_uL: mixVolume,
      },
      tipPolicy,
      endPolicy,
    }
  }, [
    dilution,
    endPolicy,
    generatedLanes,
    mixCycles,
    mixVolume,
    mode,
    replicateAxis,
    replicateCount,
    replicateMode,
    replicateSpacing,
    tipPolicy,
  ])

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const prev = useRef('')
  useEffect(() => {
    const next = JSON.stringify(params)
    if (next !== prev.current) {
      prev.current = next
      onChangeRef.current(params)
    }
  }, [params])

  const canUsePathSelection = selectedPathStarts.length > 0
  const pathSelectionLabel = mode === 'source_to_target' ? 'Use selected target wells' : 'Use selected wells'
  const wellOneMode: WellOneMode = 'already_in_first_well'

  return (
    <div className={`serial-dilution-form ${compact ? 'compact' : ''}`}>
      <div className="sd-row">
        <label>Series is built in</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as SerialDilutionMode)}>
          <option value="in_place">Selected/source plate</option>
          <option value="source_to_target">Target plate</option>
        </select>
      </div>

      <div className="sd-row">
        <label>Series wells</label>
        <div className="sd-field-stack">
          <input
            type="text"
            value={startWellsText}
            onChange={(e) => setStartWellsText(e.target.value)}
            placeholder="Start wells like A1 or A1, B1 for multiple lanes"
          />
          {canUsePathSelection && (
            <button type="button" className="btn btn-secondary" onClick={() => setStartWellsText(toTextList(selectedPathStarts))}>
              {pathSelectionLabel}
            </button>
          )}
        </div>
      </div>

      <div className="sd-row">
        <label>Direction</label>
        <div className="sd-dir">
          {(['right', 'left', 'down', 'up'] as Direction[]).map((value) => (
            <button key={value} type="button" className={direction === value ? 'active' : ''} onClick={() => setDirection(value)}>
              {value === 'right' ? '→' : value === 'left' ? '←' : value === 'down' ? '↓' : '↑'}
            </button>
          ))}
        </div>
      </div>

      <div className="sd-row">
        <label>Number of wells</label>
        <input type="number" min={2} max={24} value={pointCountText} onChange={(e) => setPointCountText(e.target.value)} />
      </div>

      <div className="sd-row">
        <label>Transfer volume (uL)</label>
        <input type="number" min={1} step="1" value={transferVolumeText} onChange={(e) => setTransferVolumeText(e.target.value)} />
      </div>

      <div className="sd-row">
        <label>Well 1 setup</label>
        <select value={wellOneMode} disabled>
          <option value="already_in_first_well">Already prepared in well 1</option>
        </select>
      </div>

      <div className="sd-row sd-computed">
        <label>Generated steps</label>
        <div>
          Transfer {dilution.resolvedTransferVolume_uL.toFixed(2)} uL from each well into the next, pipette mix, then aspirate {dilution.resolvedTransferVolume_uL.toFixed(2)} uL from the last well before disposing tips.
        </div>
      </div>

      <div className="sd-row">
        <label>Last well</label>
        <select value={endPolicy} onChange={(e) => setEndPolicy(e.target.value as SerialEndPolicyV2)}>
          <option value="discard_excess">Discard excess so all wells match</option>
          <option value="keep_last">Keep last well as-is</option>
          <option value="transfer_all_no_discard">Transfer all, no discard</option>
        </select>
      </div>

      <details className="sd-advanced">
        <summary>Advanced options</summary>

        <div className="sd-row">
          <label>Replicates</label>
          <select value={replicateMode} onChange={(e) => setReplicateMode(e.target.value as SerialReplicateMode)}>
            <option value="explicit_lanes">Explicit start wells</option>
            <option value="pattern">Repeat pattern</option>
          </select>
        </div>

        {replicateMode === 'pattern' && (
          <>
            <div className="sd-row">
              <label>Repeat axis</label>
              <select value={replicateAxis} onChange={(e) => setReplicateAxis(e.target.value as 'row' | 'column')}>
                <option value="row">Rows</option>
                <option value="column">Columns</option>
              </select>
            </div>
            <div className="sd-row">
              <label>Count</label>
              <input type="number" min={1} max={12} value={replicateCountText} onChange={(e) => setReplicateCountText(e.target.value)} />
            </div>
            <div className="sd-row">
              <label>Spacing</label>
              <input type="number" min={1} max={12} value={replicateSpacingText} onChange={(e) => setReplicateSpacingText(e.target.value)} />
            </div>
          </>
        )}

        {!compact && (
          <>
            <div className="sd-row">
              <label>Mix cycles</label>
              <input type="number" min={0} max={20} value={mixCyclesText} onChange={(e) => setMixCyclesText(e.target.value)} />
            </div>
            <div className="sd-row">
              <label>Mix vol (uL)</label>
              <input type="number" min={0} step="1" value={mixVolumeText} onChange={(e) => setMixVolumeText(e.target.value)} />
            </div>
            <div className="sd-row">
              <label>Tips</label>
              <select value={tipPolicy} onChange={(e) => setTipPolicy(e.target.value as SerialTipPolicy)}>
                <option value="reuse">Reuse tips</option>
                <option value="change_each_step">Change each step</option>
                <option value="change_each_row">Change each lane</option>
              </select>
            </div>
          </>
        )}
      </details>

      {showPreview && params && (
        <div className="sd-preview">
          <div className="path">
            {params.lanes.map((lane) => {
              const pathText = lane.path.join(' → ')
              const finalText = lane.finalTargets?.length ? ` => ${lane.finalTargets.join(' → ')}` : ''
              return `${lane.laneId}: ${pathText}${finalText}`
            }).join(' | ')}
          </div>
        </div>
      )}

      {!params && (
        <div className="serial-dilution-form--empty">
          Select or enter valid starting wells to build a serial dilution path.
        </div>
      )}
    </div>
  )
}
