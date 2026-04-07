import { useEffect, useMemo, useRef, useState } from 'react'
import type { WellId } from '../../../types/plate'
import type { SpacingTransitionTransferParams } from '../../../types/macroProgram'

export interface SpacingTransitionTransferFormProps {
  sourceWells: WellId[]
  targetWells: WellId[]
  sourceLabwareId?: string
  targetLabwareId?: string
  initialParams?: SpacingTransitionTransferParams
  onChange: (params: SpacingTransitionTransferParams | null) => void
  compact?: boolean
}

function parseIndices(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
}

export function SpacingTransitionTransferForm({
  sourceWells,
  targetWells,
  sourceLabwareId,
  targetLabwareId,
  initialParams,
  onChange,
  compact = false,
}: SpacingTransitionTransferFormProps) {
  const [volumeULText, setVolumeULText] = useState(String(initialParams?.volume_uL ?? 10))
  const [aspMmText, setAspMmText] = useState(String(initialParams?.spacingAtAspirate_mm ?? 13.5))
  const [dispMmText, setDispMmText] = useState(String(initialParams?.spacingAtDispense_mm ?? 9))
  const [activeIndices, setActiveIndices] = useState((initialParams?.activeChannelIndices || []).join(','))
  const [mixCyclesText, setMixCyclesText] = useState(String(initialParams?.mixAfterDispense?.cycles ?? 0))
  const [mixVolumeULText, setMixVolumeULText] = useState(String(initialParams?.mixAfterDispense?.volume_uL ?? 5))

  const selectedSource = useMemo(() => [...new Set(sourceWells)], [sourceWells])
  const selectedTarget = useMemo(() => [...new Set(targetWells)], [targetWells])
  const parsedIndices = useMemo(() => parseIndices(activeIndices), [activeIndices])
  const volumeUL = useMemo(() => {
    const parsed = Number.parseFloat(volumeULText)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [volumeULText])
  const aspMm = useMemo(() => {
    const parsed = Number.parseFloat(aspMmText)
    return Number.isFinite(parsed) ? parsed : 0
  }, [aspMmText])
  const dispMm = useMemo(() => {
    const parsed = Number.parseFloat(dispMmText)
    return Number.isFinite(parsed) ? parsed : 0
  }, [dispMmText])
  const mixCycles = useMemo(() => {
    const parsed = Number.parseInt(mixCyclesText, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [mixCyclesText])
  const mixVolumeUL = useMemo(() => {
    const parsed = Number.parseFloat(mixVolumeULText)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }, [mixVolumeULText])

  const params = useMemo((): SpacingTransitionTransferParams | null => {
    if (!sourceLabwareId || !targetLabwareId) return null
    if (selectedSource.length === 0 || selectedTarget.length === 0) return null
    return {
      sourceLabwareId,
      targetLabwareId,
      sourceWells: selectedSource,
      targetWells: selectedTarget,
      volume_uL: Math.max(0, volumeUL),
      ...(parsedIndices.length > 0 ? { activeChannelIndices: parsedIndices } : {}),
      spacingAtAspirate_mm: aspMm,
      spacingAtDispense_mm: dispMm,
      ...(mixCycles > 0 && mixVolumeUL > 0
        ? { mixAfterDispense: { cycles: mixCycles, volume_uL: mixVolumeUL } }
        : {}),
    }
  }, [
    sourceLabwareId,
    targetLabwareId,
    selectedSource,
    selectedTarget,
    volumeUL,
    parsedIndices,
    aspMm,
    dispMm,
    mixCycles,
    mixVolumeUL,
  ])

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

  const pairCount = Math.min(selectedSource.length, selectedTarget.length)
  const previewPairs = useMemo(() => {
    const rows: Array<{ s: WellId; t: WellId }> = []
    for (let i = 0; i < pairCount; i++) rows.push({ s: selectedSource[i], t: selectedTarget[i] })
    return rows
  }, [pairCount, selectedSource, selectedTarget])

  if (!sourceLabwareId || !targetLabwareId) {
    return <div className="spacing-form--empty">Select source and target labware.</div>
  }
  if (selectedSource.length === 0 || selectedTarget.length === 0) {
    return <div className="spacing-form--empty">Select source wells and target wells to map channels.</div>
  }

  return (
    <div className={`spacing-form ${compact ? 'compact' : ''}`}>
      <div className="s-row s-row--two">
        <div>
          <label>Vol (uL)</label>
          <input type="number" min={0} step="0.1" value={volumeULText} onChange={(e) => setVolumeULText(e.target.value)} />
        </div>
        <div>
          <label>Active channels</label>
          <input value={activeIndices} onChange={(e) => setActiveIndices(e.target.value)} placeholder="0,1,2" />
        </div>
      </div>
      <div className="s-row s-row--two">
        <div>
          <label>Aspirate mm</label>
          <input type="number" step="0.1" value={aspMmText} onChange={(e) => setAspMmText(e.target.value)} />
        </div>
        <div>
          <label>Dispense mm</label>
          <input type="number" step="0.1" value={dispMmText} onChange={(e) => setDispMmText(e.target.value)} />
        </div>
      </div>
      <div className="s-row s-row--two">
        <div>
          <label>Mix cycles</label>
          <input type="number" min={0} max={20} value={mixCyclesText} onChange={(e) => setMixCyclesText(e.target.value)} />
        </div>
        <div>
          <label>Mix vol (uL)</label>
          <input type="number" min={0} step="0.1" value={mixVolumeULText} onChange={(e) => setMixVolumeULText(e.target.value)} />
        </div>
      </div>
      <div className="s-preview">
        <div className="s-preview__meta">
          {selectedSource.length} source / {selectedTarget.length} target (paired: {pairCount})
        </div>
        <div className="s-preview__rows">
          {previewPairs.slice(0, 6).map((row) => (
            <div key={`${row.s}-${row.t}`}>
              <strong>{row.s}</strong> {'->'} {row.t}
            </div>
          ))}
          {previewPairs.length > 6 && <div>...</div>}
        </div>
      </div>
      <style>{`
        .spacing-form { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.35rem; }
        .spacing-form--empty { padding: 0.6rem; color: #6c757d; font-size: 0.8rem; }
        .s-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
        .s-row > div { display: flex; align-items: center; gap: 0.45rem; }
        .s-row label { min-width: 78px; font-size: 0.76rem; color: #495057; }
        .s-row input { flex: 1; height: 26px; border: 1px solid #dee2e6; border-radius: 4px; padding: 0 6px; font-size: 0.78rem; }
        .s-preview { border: 1px solid #e9ecef; border-radius: 6px; background: #f8f9fa; padding: 0.35rem; }
        .s-preview__meta { font-size: 0.74rem; color: #495057; margin-bottom: 0.25rem; }
        .s-preview__rows { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.73rem; color: #343a40; }
      `}</style>
    </div>
  )
}
