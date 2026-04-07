import { useEffect, useMemo, useRef, useState } from 'react'
import type { WellId } from '../../../types/plate'
import type { QuadrantReplicateParams } from '../../../types/macroProgram'

export interface QuadrantReplicateFormProps {
  sourceWells: WellId[]
  sourceLabwareId?: string
  sourceRows?: number
  sourceCols?: number
  targetLabwareId?: string
  targetRows?: number
  targetCols?: number
  initialParams?: QuadrantReplicateParams
  onChange: (params: QuadrantReplicateParams | null) => void
  compact?: boolean
}

function buildGridLabels(count: number, start = 'A'.charCodeAt(0)): string[] {
  return Array.from({ length: count }, (_, idx) => String.fromCharCode(start + idx))
}

function parseWell(wellId: WellId): { row: string; col: number } | null {
  const match = wellId.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return { row: match[1], col: parseInt(match[2], 10) }
}

function buildTargetPreview(
  sourceWells: WellId[],
  sourceRows: number,
  sourceCols: number,
  targetRows: number,
  targetCols: number,
  rowOffset: number,
  colOffset: number
): Array<{ source: WellId; targets: WellId[] }> {
  const srcRows = buildGridLabels(sourceRows)
  const srcCols = Array.from({ length: sourceCols }, (_, i) => String(i + 1))
  const tgtRows = buildGridLabels(targetRows)
  const tgtCols = Array.from({ length: targetCols }, (_, i) => String(i + 1))

  return sourceWells.map((source) => {
    const parsed = parseWell(source)
    if (!parsed) return { source, targets: [] }
    const srcRowIdx = srcRows.indexOf(parsed.row)
    const srcColIdx = srcCols.indexOf(String(parsed.col))
    if (srcRowIdx < 0 || srcColIdx < 0) return { source, targets: [] }

    const baseRow = srcRowIdx * 2 + rowOffset
    const baseCol = srcColIdx * 2 + colOffset
    const targets: WellId[] = []
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        const tr = baseRow + dr
        const tc = baseCol + dc
        if (tr < 0 || tc < 0 || tr >= tgtRows.length || tc >= tgtCols.length) continue
        targets.push(`${tgtRows[tr]}${tgtCols[tc]}` as WellId)
      }
    }
    return { source, targets }
  })
}

export function QuadrantReplicateForm({
  sourceWells,
  sourceLabwareId,
  sourceRows = 8,
  sourceCols = 12,
  targetLabwareId,
  targetRows = 16,
  targetCols = 24,
  initialParams,
  onChange,
  compact = false,
}: QuadrantReplicateFormProps) {
  const [volumeULText, setVolumeULText] = useState(String(initialParams?.volume_uL ?? 5))
  const [extraVolumeULText, setExtraVolumeULText] = useState(String(initialParams?.extraVolume_uL ?? 0))
  const [rowOffsetText, setRowOffsetText] = useState(String(initialParams?.targetRowOffset ?? 0))
  const [colOffsetText, setColOffsetText] = useState(String(initialParams?.targetColOffset ?? 0))
  const [useInnerRegion, setUseInnerRegion] = useState(Boolean(initialParams?.targetRegion))

  const selected = useMemo(() => [...new Set(sourceWells)].sort(), [sourceWells])
  const volumeUL = useMemo(() => {
    const parsed = Number.parseFloat(volumeULText)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [volumeULText])
  const extraVolumeUL = useMemo(() => {
    const parsed = Number.parseFloat(extraVolumeULText)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [extraVolumeULText])
  const rowOffset = useMemo(() => {
    const parsed = Number.parseInt(rowOffsetText, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [rowOffsetText])
  const colOffset = useMemo(() => {
    const parsed = Number.parseInt(colOffsetText, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [colOffsetText])
  const preview = useMemo(
    () => buildTargetPreview(selected, sourceRows, sourceCols, targetRows, targetCols, rowOffset, colOffset),
    [selected, sourceRows, sourceCols, targetRows, targetCols, rowOffset, colOffset]
  )

  const params = useMemo((): QuadrantReplicateParams | null => {
    if (!sourceLabwareId || !targetLabwareId || selected.length === 0) return null
    return {
      sourceLabwareId,
      targetLabwareId,
      sourceWells: selected,
      volume_uL: Math.max(0, volumeUL),
      ...(extraVolumeUL > 0 ? { extraVolume_uL: Math.max(0, extraVolumeUL) } : {}),
      targetRowOffset: rowOffset,
      targetColOffset: colOffset,
      ...(useInnerRegion
        ? { targetRegion: { rowStart: 'C', rowEnd: 'N', colStart: 3, colEnd: 22 } }
        : {}),
    }
  }, [sourceLabwareId, targetLabwareId, selected, volumeUL, extraVolumeUL, rowOffset, colOffset, useInnerRegion])

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const prevJson = useRef('')
  useEffect(() => {
    const next = JSON.stringify(params)
    if (next !== prevJson.current) {
      prevJson.current = next
      onChangeRef.current(params)
    }
  }, [params])

  if (!sourceLabwareId || !targetLabwareId) {
    return <div className="quadrant-form--empty">Select source and target labware to configure quadrant replication.</div>
  }
  if (selected.length === 0) {
    return <div className="quadrant-form--empty">Select source well(s) to map into 2x2 quadrants.</div>
  }

  const targetCount = preview.reduce((sum, row) => sum + row.targets.length, 0)

  return (
    <div className={`quadrant-form ${compact ? 'compact' : ''}`}>
      <div className="q-row">
        <label>Vol (uL)</label>
        <input type="number" min={0} step="0.1" value={volumeULText} onChange={(e) => setVolumeULText(e.target.value)} />
      </div>
      <div className="q-row">
        <label>Extra vol (uL)</label>
        <input type="number" min={0} step="0.1" value={extraVolumeULText} onChange={(e) => setExtraVolumeULText(e.target.value)} />
      </div>
      <div className="q-row q-row--two">
        <div>
          <label>Row offset</label>
          <input type="number" min={0} max={12} value={rowOffsetText} onChange={(e) => setRowOffsetText(e.target.value)} />
        </div>
        <div>
          <label>Col offset</label>
          <input type="number" min={0} max={20} value={colOffsetText} onChange={(e) => setColOffsetText(e.target.value)} />
        </div>
      </div>
      <div className="q-row q-row--checkbox">
        <label>Restrict to inner (C..N, 3..22)</label>
        <input type="checkbox" checked={useInnerRegion} onChange={(e) => setUseInnerRegion(e.target.checked)} />
      </div>
      <div className="q-preview">
        <div className="q-preview__meta">
          {selected.length} source well(s) {'->'} {targetCount} target well(s)
        </div>
        <div className="q-preview__rows">
          {preview.slice(0, 5).map((row) => (
            <div key={row.source}>
              <strong>{row.source}</strong>: {row.targets.join(', ') || 'none'}
            </div>
          ))}
          {preview.length > 5 && <div>...</div>}
        </div>
      </div>
      <style>{`
        .quadrant-form { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.35rem; }
        .quadrant-form--empty { padding: 0.6rem; color: #6c757d; font-size: 0.8rem; }
        .q-row { display: flex; align-items: center; gap: 0.5rem; }
        .q-row > label { flex: 0 0 130px; font-size: 0.78rem; color: #495057; }
        .q-row input { flex: 1; height: 26px; border: 1px solid #dee2e6; border-radius: 4px; padding: 0 6px; font-size: 0.78rem; }
        .q-row--two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
        .q-row--two > div { display: flex; align-items: center; gap: 0.45rem; }
        .q-row--two label { font-size: 0.76rem; color: #495057; min-width: 68px; }
        .q-row--checkbox { justify-content: space-between; }
        .q-row--checkbox label { flex: 1; }
        .q-row--checkbox input { flex: 0 0 auto; width: auto; height: auto; }
        .q-preview { border: 1px solid #e9ecef; border-radius: 6px; background: #f8f9fa; padding: 0.35rem; }
        .q-preview__meta { font-size: 0.74rem; color: #495057; margin-bottom: 0.25rem; }
        .q-preview__rows { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.73rem; color: #343a40; }
      `}</style>
    </div>
  )
}
