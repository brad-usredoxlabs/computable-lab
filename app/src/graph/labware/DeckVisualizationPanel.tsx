import { useEffect, useMemo, useState } from 'react'
import type { Labware, LabwareType, LabwareRecordPayload } from '../../types/labware'
import { isTipRackType, LABWARE_TYPE_LABELS, pickEditorLabwareType, getLabwareAllowedOrientations } from '../../types/labware'
import { getLabwareDefinitionByLegacyType } from '../../types/labwareDefinition'
import { ToolSelector, type SelectedTool } from '../tools'
import type { AssistPipetteModel } from '../lib/assistPipetteRegistry'
import type { PlatformManifest } from '../../types/platformRegistry'
import { defaultVariantForPlatform, getDeckSlotLockedOrientation, getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { LabwarePicker } from './LabwarePicker'

export interface DeckPlacement {
  slotId: string
  labwareId?: string
  moduleId?: string
}

interface DeckVisualizationPanelProps {
  platform: string
  variant: string
  platforms: PlatformManifest[]
  labwares: Labware[]
  placements: DeckPlacement[]
  onPlatformChange: (platform: string) => void
  onVariantChange: (variant: string) => void
  onChangePlacement: (slotId: string, patch: { labwareId?: string; moduleId?: string }) => void
  onSetSourceLabware?: (labwareId: string | null) => void
  onSetTargetLabware?: (labwareId: string | null) => void
  currentSourceLabwareId?: string | null
  currentTargetLabwareId?: string | null
  selectedTool: SelectedTool | null
  onToolChange: (tool: SelectedTool | null) => void
  allowedToolTypeIds?: string[]
  assistPipetteModels?: AssistPipetteModel[]
  onAddLabware: (labwareType: LabwareType, name?: string) => Labware
  onAddLabwareFromRecord?: (record: LabwareRecordPayload) => Labware
  onRemoveLabware?: (labwareId: string) => void
  getLabwareOrientation?: (labwareId: string) => 'portrait' | 'landscape'
  setLabwareOrientation?: (labwareId: string, orientation: 'portrait' | 'landscape') => void
  onDownloadXml?: () => void
  downloadXmlDisabled?: boolean
  downloadXmlBusy?: boolean
  lastXmlLabel?: string
  lastXmlUrl?: string
  hidePlatformSelector?: boolean
  hideDeckVariantSelector?: boolean
  allowedPlatformIds?: string[]
}

// All labware SVGs draw into a fixed landscape frame (124×64). Portrait is
// achieved by swapping the viewBox to 64×124 and transposing the visual grid:
// the long axis (cols in landscape) becomes the vertical axis (rows in
// portrait). Wells/lanes/tubes get plotted on the swapped axes, so an A1 in
// the top-left corner of a landscape plate ends up in the top-right corner of
// the portrait rendering — matching how a physical plate flips on the deck.

type Orientation = 'portrait' | 'landscape'

const FRAME_LONG = 124
const FRAME_SHORT = 64
const PADDING = 8
const INNER_LONG = FRAME_LONG - PADDING * 2
const INNER_SHORT = FRAME_SHORT - PADDING * 2

function frameDims(orientation: Orientation) {
  return orientation === 'portrait'
    ? { w: FRAME_SHORT, h: FRAME_LONG }
    : { w: FRAME_LONG, h: FRAME_SHORT }
}

function WellsSvg({
  rows,
  cols,
  isTipRack = false,
  orientation = 'landscape',
}: {
  rows: number
  cols: number
  isTipRack?: boolean
  orientation?: Orientation
}) {
  const isPortrait = orientation === 'portrait'
  const { w, h } = frameDims(orientation)
  // In portrait, transpose: original cols become visual rows, original rows
  // become visual cols (the long edge of the plate is now vertical).
  const visualRows = isPortrait ? cols : rows
  const visualCols = isPortrait ? rows : cols
  const cellW = (isPortrait ? INNER_SHORT : INNER_LONG) / visualCols
  const cellH = (isPortrait ? INNER_LONG : INNER_SHORT) / visualRows
  const points = []
  for (let r = 0; r < visualRows; r += 1) {
    for (let c = 0; c < visualCols; c += 1) {
      const x = PADDING + c * cellW + cellW / 2
      const y = PADDING + r * cellH + cellH / 2
      points.push({ x, y })
    }
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lw-svg" data-orientation={orientation} aria-hidden>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" className="lw-svg__frame" />
      {points.map((p, i) => (
        isTipRack ? (
          <path
            key={`tip-${i}`}
            d={`M ${p.x - 1.8} ${p.y - 2.2} L ${p.x + 1.8} ${p.y - 2.2} L ${p.x} ${p.y + 2.2} Z`}
            className="lw-svg__tip"
          />
        ) : (
          <circle key={`well-${i}`} cx={p.x} cy={p.y} r={Math.max(0.9, Math.min(cellW, cellH) / 4.2)} className="lw-svg__well" />
        )
      ))}
    </svg>
  )
}

function ReservoirSvg({
  lanes = 8,
  orientation = 'landscape',
}: { lanes?: number; orientation?: Orientation }) {
  const isPortrait = orientation === 'portrait'
  const { w, h } = frameDims(orientation)
  // Lay `lanes` troughs along the long axis. In portrait that long axis is
  // vertical, so the troughs become horizontal strips.
  const inner = isPortrait ? INNER_LONG : INNER_LONG
  const cross = isPortrait ? INNER_SHORT : INNER_SHORT
  const gap = inner / lanes
  const laneCross = Math.max(2, gap * 0.72)
  const laneFill = isPortrait ? cross : INNER_SHORT
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lw-svg" data-orientation={orientation} aria-hidden>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" className="lw-svg__frame" />
      {Array.from({ length: lanes }).map((_, i) => {
        if (isPortrait) {
          // Lanes stack vertically: rect at y=PADDING + i*gap, full width across.
          const y = PADDING + i * gap + (gap - laneCross) / 2
          return (
            <rect
              key={i}
              x={PADDING + (cross - laneFill) / 2 + 4}
              y={y}
              width={laneFill - 8}
              height={laneCross}
              rx={Math.min(3, laneCross / 2)}
              className="lw-svg__lane"
            />
          )
        }
        const x = PADDING + i * gap + (gap - laneCross) / 2
        return (
          <rect
            key={i}
            x={x}
            y={PADDING + 4}
            width={laneCross}
            height={cross - 8}
            rx={Math.min(3, laneCross / 2)}
            className="lw-svg__lane"
          />
        )
      })}
    </svg>
  )
}

function Reservoir8RowsSvg({ orientation = 'landscape' }: { orientation?: Orientation }) {
  // Reservoir-8 channels: 8 strips that run along the LONG axis and stack
  // along the SHORT axis. In landscape that's horizontal strips stacked top
  // to bottom; in portrait the labware rotates 90°, so the same physical
  // channels become vertical strips stacked left to right.
  const isPortrait = orientation === 'portrait'
  const { w, h } = frameDims(orientation)
  const lanes = 8
  const gap = INNER_SHORT / lanes
  const laneThick = Math.max(1.5, gap * 0.7)
  const channelLong = INNER_LONG - 4
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lw-svg" data-orientation={orientation} aria-hidden>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" className="lw-svg__frame" />
      {Array.from({ length: lanes }).map((_, i) => {
        if (isPortrait) {
          // Stack along x (horizontal), each channel runs vertically.
          const x = PADDING + i * gap + (gap - laneThick) / 2
          return (
            <rect
              key={i}
              x={x}
              y={PADDING + 2}
              width={laneThick}
              height={channelLong}
              rx={laneThick / 2}
              className="lw-svg__lane"
            />
          )
        }
        // Landscape: stack along y (vertical), each channel runs horizontally.
        const y = PADDING + i * gap + (gap - laneThick) / 2
        return (
          <rect
            key={i}
            x={PADDING + 2}
            y={y}
            width={channelLong}
            height={laneThick}
            rx={laneThick / 2}
            className="lw-svg__lane"
          />
        )
      })}
    </svg>
  )
}

function SingleReservoirSvg({ orientation = 'landscape' }: { orientation?: Orientation }) {
  const { w, h } = frameDims(orientation)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lw-svg" data-orientation={orientation} aria-hidden>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" className="lw-svg__frame" />
      <rect x={PADDING + 2} y={PADDING + 4} width={w - PADDING * 2 - 4} height={h - PADDING * 2 - 8} rx={6} className="lw-svg__lane" />
    </svg>
  )
}

function TubesSvg({
  rows,
  cols,
  orientation = 'landscape',
}: { rows?: number; cols?: number; orientation?: Orientation }) {
  const r = rows ?? 2
  const c = cols ?? 6
  const isPortrait = orientation === 'portrait'
  const { w, h } = frameDims(orientation)
  const visualRows = isPortrait ? c : r
  const visualCols = isPortrait ? r : c
  const cellW = (isPortrait ? INNER_SHORT : INNER_LONG) / visualCols
  const cellH = (isPortrait ? INNER_LONG : INNER_SHORT) / visualRows
  const radius = Math.max(2, Math.min(cellW, cellH) / 2.6)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lw-svg" data-orientation={orientation} aria-hidden>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" className="lw-svg__frame" />
      {Array.from({ length: visualRows }).flatMap((_, ri) =>
        Array.from({ length: visualCols }).map((_, ci) => (
          <circle
            key={`${ri}-${ci}`}
            cx={PADDING + ci * cellW + cellW / 2}
            cy={PADDING + ri * cellH + cellH / 2}
            r={radius}
            className="lw-svg__tube"
          />
        ))
      )}
    </svg>
  )
}

function SingleTubeSvg({ orientation = 'landscape' }: { orientation?: Orientation }) {
  const { w, h } = frameDims(orientation)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lw-svg" data-orientation={orientation} aria-hidden>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" className="lw-svg__frame" />
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 4} className="lw-svg__tube" />
    </svg>
  )
}

function GenericLabwareVisual({
  labware,
  orientation = 'landscape',
}: { labware?: Labware; orientation?: Orientation }) {
  if (!labware) return <div className="lw-empty">Empty</div>

  if (labware.addressing.type === 'grid') {
    const rows = labware.addressing.rows || 8
    const cols = labware.addressing.columns || 12
    if (labware.layoutFamily === 'tube' || labware.renderProfile === 'tubeset' || labware.renderProfile === 'tube') {
      return <TubesSvg rows={rows} cols={cols} orientation={orientation} />
    }
    return <WellsSvg rows={rows} cols={cols} isTipRack={isTipRackType(labware.labwareType)} orientation={orientation} />
  }

  if (labware.addressing.type === 'linear') {
    // 8-channel reservoirs use a horizontal-strips look; everything else uses
    // vertical troughs sized to the actual lane count.
    if (labware.linearWellStyle === 'channels') {
      return <Reservoir8RowsSvg orientation={orientation} />
    }
    const lanes = labware.addressing.linearLabels?.length ?? 8
    return <ReservoirSvg lanes={lanes} orientation={orientation} />
  }

  if (labware.addressing.type === 'single') {
    if (labware.layoutFamily === 'tube' || labware.renderProfile === 'tube') {
      return <SingleTubeSvg orientation={orientation} />
    }
    return <SingleReservoirSvg orientation={orientation} />
  }

  if (isTipRackType(labware.labwareType)) {
    return <WellsSvg rows={8} cols={12} isTipRack orientation={orientation} />
  }

  if (labware.renderProfile === 'reservoir') return <ReservoirSvg orientation={orientation} />
  if (labware.renderProfile === 'tube' || labware.renderProfile === 'tubeset') return <TubesSvg orientation={orientation} />

  return <WellsSvg rows={8} cols={12} orientation={orientation} />
}

function moduleEmoji(moduleId?: string): string {
  if (!moduleId) return ''
  if (moduleId.includes('heater')) return '♨'
  if (moduleId.includes('mag')) return '🧲'
  if (moduleId.includes('temperature')) return '🌡'
  if (moduleId.includes('chute')) return '🗑'
  if (moduleId.includes('staging')) return '📦'
  return '⚙'
}

function tipVolumeBadge(labware?: Labware): { label: string; color: string } | null {
  if (!labware || !isTipRackType(labware.labwareType)) return null
  const volume = labware.geometry.maxVolume_uL
  const rows = labware.addressing.rows || 8
  const cols = labware.addressing.columns || 12
  const wells = rows * cols
  if (volume <= 12.5) return { label: '12.5uL', color: '#fde68a' }
  if (volume <= 20) return { label: '20uL', color: '#fef08a' }
  if (volume <= 50) return { label: '50uL', color: '#bfdbfe' }
  if (volume <= 125 && wells >= 384) return { label: '125uL/384', color: '#fecdd3' }
  if (volume <= 125) return { label: '125uL', color: '#fbcfe8' }
  if (volume <= 200) return { label: '200uL', color: '#a7f3d0' }
  if (volume <= 300) return { label: '300uL', color: '#fdba74' }
  if (volume <= 1000) return { label: '1000uL', color: '#fca5a5' }
  if (volume <= 1250) return { label: '1250uL', color: '#fda4af' }
  return { label: 'TIP', color: '#cbd5e1' }
}

export function DeckVisualizationPanel({
  platform,
  variant,
  platforms,
  labwares,
  placements,
  onPlatformChange,
  onVariantChange,
  onChangePlacement,
  onSetSourceLabware,
  onSetTargetLabware,
  currentSourceLabwareId = null,
  currentTargetLabwareId = null,
  selectedTool,
  onToolChange,
  allowedToolTypeIds,
  assistPipetteModels,
  onAddLabware,
  onAddLabwareFromRecord,
  onRemoveLabware,
  getLabwareOrientation,
  setLabwareOrientation,
  onDownloadXml,
  downloadXmlDisabled = false,
  downloadXmlBusy = false,
  lastXmlLabel,
  lastXmlUrl,
  hidePlatformSelector = false,
  hideDeckVariantSelector = false,
  allowedPlatformIds,
}: DeckVisualizationPanelProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [draggingLabwareId, setDraggingLabwareId] = useState<string | null>(null)
  const [pendingType, setPendingType] = useState<LabwareType | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [pendingRecord, setPendingRecord] = useState<LabwareRecordPayload | null>(null)
  const [showLabwarePicker, setShowLabwarePicker] = useState(false)
  const availablePlatforms = useMemo(
    () => (allowedPlatformIds?.length ? platforms.filter((entry) => allowedPlatformIds.includes(entry.id)) : platforms),
    [allowedPlatformIds, platforms]
  )
  const platformManifest = useMemo(
    () => getPlatformManifest(platforms, platform) ?? availablePlatforms[0] ?? null,
    [availablePlatforms, platform, platforms]
  )
  const resolvedVariant = platformManifest
    ? (getVariantManifest(platforms, platformManifest.id, variant)?.id ?? defaultVariantForPlatform(platforms, platformManifest.id))
    : variant
  const profile = useMemo(
    () => (platformManifest ? getVariantManifest(platforms, platformManifest.id, resolvedVariant) : null),
    [platformManifest, platforms, resolvedVariant]
  )
  const placementsBySlot = useMemo(() => new Map(placements.map((item) => [item.slotId, item])), [placements])
  const slotByLabware = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of placements) {
      if (p.labwareId) map.set(p.labwareId, p.slotId)
    }
    return map
  }, [placements])
  const modules = platformManifest?.modules || []
  const isManual = platform === 'manual'
  const gridCols = Math.max(1, ...((profile?.slots || []).map((slot) => slot.col || 1)))
  const slotMinWidth = platform === 'integra_assist' ? 168 : 140
  const deckSlotIds = new Set((profile?.slots || []).map((slot) => slot.id))
  const unplacedLabwares = labwares.filter((lw) => {
    const slot = slotByLabware.get(lw.labwareId)
    return !slot || !deckSlotIds.has(slot)
  })
  const benchEntries = useMemo(() => {
    const explicitBench = placements
      .filter((p) => p.slotId.startsWith('bench:') && p.labwareId)
      .map((p) => ({ slotId: p.slotId, labwareId: p.labwareId as string }))
    const inBench = new Set(explicitBench.map((b) => b.labwareId))
    for (const lw of unplacedLabwares) {
      if (inBench.has(lw.labwareId)) continue
      explicitBench.push({ slotId: `bench:${lw.labwareId}`, labwareId: lw.labwareId })
    }
    return explicitBench.sort((a, b) => a.slotId.localeCompare(b.slotId))
  }, [placements, unplacedLabwares])

  const placeLabwareInSlot = (slotId: string, labwareId: string) => {
    const currentSlot = slotByLabware.get(labwareId)
    const targetOccupant = placementsBySlot.get(slotId)?.labwareId
    if (currentSlot === slotId) return
    if (targetOccupant && targetOccupant !== labwareId) {
      if (currentSlot) {
        onChangePlacement(currentSlot, { labwareId: targetOccupant })
      } else {
        onChangePlacement(`bench:${targetOccupant}`, { labwareId: targetOccupant })
      }
      onChangePlacement(slotId, { labwareId })
      return
    }
    onChangePlacement(slotId, { labwareId })
    if (currentSlot && currentSlot !== slotId) {
      onChangePlacement(currentSlot, { labwareId: undefined })
    }
  }

  const moveToBench = (labwareId: string) => {
    const currentSlot = slotByLabware.get(labwareId)
    if (currentSlot && deckSlotIds.has(currentSlot)) {
      onChangePlacement(currentSlot, { labwareId: undefined })
    }
    const existingBench = placements.find((p) => p.slotId.startsWith('bench:') && p.labwareId === labwareId)?.slotId
    onChangePlacement(existingBench || `bench:${labwareId}`, { labwareId })
  }

  const handleSlotClick = (slotId: string) => setSelectedSlotId(slotId)
  const renderRoleBadges = (labwareId?: string | null) => {
    if (!labwareId) return null
    const isSource = currentSourceLabwareId === labwareId
    const isTarget = currentTargetLabwareId === labwareId
    if (!isSource && !isTarget) return null
    return (
      <div className="slot-role-badges">
        {isSource ? <span className="tray-chip__role tray-chip__role--source">Src</span> : null}
        {isTarget ? <span className="tray-chip__role tray-chip__role--target">Trgt</span> : null}
      </div>
    )
  }
  const handleTrayClick = (labwareId: string) => {
    if (selectedSlotId) {
      placeLabwareInSlot(selectedSlotId, labwareId)
    }
  }
  const removeLabwareEverywhere = (labwareId: string) => {
    const currentSlot = slotByLabware.get(labwareId)
    if (currentSlot) onChangePlacement(currentSlot, { labwareId: undefined })
    const benchSlotId = placements.find((p) => p.slotId.startsWith('bench:') && p.labwareId === labwareId)?.slotId
    if (benchSlotId) onChangePlacement(benchSlotId, { labwareId: undefined })
    onRemoveLabware?.(labwareId)
  }
  const handlePickLabwareFromPicker = (record: LabwareRecordPayload) => {
    setPendingRecord(record)
    setNameInput(record.name ?? '')
    setShowLabwarePicker(false)
  }

  const submitNamedAdd = () => {
    const trimmed = nameInput.trim()
    if (pendingType) {
      const created = onAddLabware(pendingType, trimmed || undefined)
      if (selectedSlotId) placeLabwareInSlot(selectedSlotId, created.labwareId)
      setPendingType(null)
      setNameInput('')
      return
    }
    if (pendingRecord) {
      // Renaming the record must NOT lose the original name's classification
      // hints (e.g. "12 Well Reservoir") that pickEditorLabwareType reads. Keep
      // the original name as an alias so the haystack still contains it.
      const recordWithName: LabwareRecordPayload = trimmed && trimmed !== pendingRecord.name
        ? {
            ...pendingRecord,
            name: trimmed,
            aliases: [pendingRecord.name, ...(pendingRecord.aliases ?? [])],
          }
        : pendingRecord
      const created = onAddLabwareFromRecord
        ? onAddLabwareFromRecord(recordWithName)
        : onAddLabware(pickEditorLabwareType(recordWithName), recordWithName.name)
      if (selectedSlotId) placeLabwareInSlot(selectedSlotId, created.labwareId)
      setPendingRecord(null)
      setNameInput('')
    }
  }
  const skipName = () => {
    if (pendingType) {
      const created = onAddLabware(pendingType)
      if (selectedSlotId) placeLabwareInSlot(selectedSlotId, created.labwareId)
      setPendingType(null)
      setNameInput('')
      return
    }
    if (pendingRecord) {
      const created = onAddLabwareFromRecord
        ? onAddLabwareFromRecord(pendingRecord)
        : onAddLabware(pickEditorLabwareType(pendingRecord), pendingRecord.name)
      if (selectedSlotId) placeLabwareInSlot(selectedSlotId, created.labwareId)
      setPendingRecord(null)
      setNameInput('')
    }
  }
  const canRotateLabware = (labware?: Labware, slotId?: string): boolean => {
    if (!labware) return false
    if (labware.orientationPolicy === 'fixed_columns') return false
    if (!getLabwareOrientation || !setLabwareOrientation) return false
    const allowed = getLabwareAllowedOrientations(labware)
    if (allowed.length < 2) return false
    const slot = slotId ? profile?.slots.find((candidate) => candidate.id === slotId) : undefined
    if (slot && getDeckSlotLockedOrientation(slot)) return false
    return platform === 'manual' || platform === 'integra_assist'
  }
  const currentOrientation = (labwareId: string): 'portrait' | 'landscape' => (
    getLabwareOrientation ? getLabwareOrientation(labwareId) : 'landscape'
  )
  const rotateLabware = (labware: Labware) => {
    if (!setLabwareOrientation) return
    const current = currentOrientation(labware.labwareId)
    setLabwareOrientation(labware.labwareId, current === 'portrait' ? 'landscape' : 'portrait')
  }

  useEffect(() => {
    if (!setLabwareOrientation || !getLabwareOrientation) return
    for (const placement of placements) {
      if (!placement.labwareId) continue
      const slot = profile?.slots.find((candidate) => candidate.id === placement.slotId)
      const locked = slot ? getDeckSlotLockedOrientation(slot) : null
      if (!locked) continue
      if (getLabwareOrientation(placement.labwareId) !== locked) {
        setLabwareOrientation(placement.labwareId, locked)
      }
    }
  }, [placements, profile, setLabwareOrientation, getLabwareOrientation])

  if (!platformManifest || !profile) {
    const isPlatformsLoading = platforms.length === 0
    return (
      <div className="deck-panel">
        <div className="deck-panel__header">
          <div className="deck-panel__title-wrap">
            <strong>Deck Visualization</strong>
            <span className="deck-panel__sub">
              {isPlatformsLoading
                ? 'Loading platform registry…'
                : !platformManifest
                  ? `Unknown platform '${platform}' (registry has ${platforms.length} platform${platforms.length === 1 ? '' : 's'})`
                  : `Unknown deck variant '${variant}' for platform '${platformManifest.id}'`}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="deck-panel">
      <div className="deck-panel__header">
        <div className="deck-panel__title-wrap">
          <strong>Deck Visualization</strong>
          <span className="deck-panel__sub">{profile.title}</span>
        </div>
        <div className="deck-panel__selectors">
          <label>
            Tool
            <ToolSelector
              value={selectedTool}
              onChange={onToolChange}
              allowedToolTypeIds={allowedToolTypeIds}
              assistPipetteModels={assistPipetteModels}
              className="deck-tool-picker"
            />
          </label>
          {!hidePlatformSelector && (
            <label>
              Robot
              <select value={platformManifest.id} onChange={(e) => onPlatformChange(e.target.value)}>
                {availablePlatforms.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </label>
          )}
          {platformManifest.variants.length > 1 && !hideDeckVariantSelector && (
            <label>
              Deck
              <select value={resolvedVariant} onChange={(e) => onVariantChange(e.target.value)}>
                {platformManifest.variants.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.title}</option>
                ))}
              </select>
            </label>
          )}
          {platform === 'integra_assist' && onDownloadXml && (
            <button
              className="deck-download-btn"
              onClick={onDownloadXml}
              disabled={downloadXmlDisabled || downloadXmlBusy}
              title="Compile and download Assist Plus XML"
            >
              {downloadXmlBusy ? 'Preparing...' : 'Download XML'}
            </button>
          )}
          {platform === 'integra_assist' && lastXmlLabel && lastXmlUrl && (
            <a
              className="deck-last-xml-badge"
              href={lastXmlUrl}
              target="_blank"
              rel="noreferrer"
              title="Download most recently generated XML"
            >
              {lastXmlLabel}
            </a>
          )}
        </div>
      </div>

      <div className="deck-panel__tray">
        <span className="tray-label">Labware Tray</span>
        <div className="tray-actions">
          <button className="tray-add" onClick={() => setShowLabwarePicker(true)}>+ Add</button>
        </div>
        {labwares.map((labware) => (
          <div key={labware.labwareId} className="tray-chip-wrap">
            <button
              className={`tray-chip ${currentSourceLabwareId === labware.labwareId ? 'tray-chip--source' : ''} ${currentTargetLabwareId === labware.labwareId ? 'tray-chip--target' : ''}`}
              onClick={() => handleTrayClick(labware.labwareId)}
              title={selectedSlotId
                ? `Place ${labware.name} in ${selectedSlotId}`
                : `Select a deck slot to place ${labware.name}. Source and target are assigned on placed deck slots.`}
            >
              <span className="tray-chip__name">{labware.name}</span>
              {currentSourceLabwareId === labware.labwareId ? <span className="tray-chip__role tray-chip__role--source">Src</span> : null}
              {currentTargetLabwareId === labware.labwareId ? <span className="tray-chip__role tray-chip__role--target">Trgt</span> : null}
            </button>
            <button
              className="tray-chip-remove"
              onClick={(e) => {
                e.stopPropagation()
                removeLabwareEverywhere(labware.labwareId)
              }}
              title={`Remove ${labware.name} from experiment`}
            >
              X
            </button>
          </div>
        ))}
      </div>
      {showLabwarePicker && (
        <LabwarePicker
          open={showLabwarePicker}
          onClose={() => setShowLabwarePicker(false)}
          onPick={handlePickLabwareFromPicker}
        />
      )}

      {(pendingType || pendingRecord) && (
        <div
          className="name-modal-backdrop"
          onClick={() => {
            setPendingType(null)
            setPendingRecord(null)
            setNameInput('')
          }}
        >
          <div className="name-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Name this labware (optional)</h4>
            <p>You can skip to keep the {pendingRecord ? 'record' : 'default'} name.</p>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={
                pendingType
                  ? (getLabwareDefinitionByLegacyType(pendingType)?.display_name || LABWARE_TYPE_LABELS[pendingType])
                  : (pendingRecord?.name ?? 'New labware')
              }
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNamedAdd()
                if (e.key === 'Escape') {
                  setPendingType(null)
                  setPendingRecord(null)
                  setNameInput('')
                }
              }}
            />
            <div className="name-modal-actions">
              <button className="btn-skip" onClick={skipName}>Skip</button>
              <button className="btn-save" onClick={submitNamedAdd}>Add Labware</button>
            </div>
          </div>
        </div>
      )}

      {isManual ? (
        <div className="deck-panel__manual">
          <strong>Manual workflow selected.</strong>
          <span>Virtual bench (unlabelled slots):</span>
          <div className="virtual-bench">
            {benchEntries.map((entry) => {
              const benchSlotId = entry.slotId
              const labware = labwares.find((lw) => lw.labwareId === entry.labwareId)
              if (!labware) return null
              const benchPlacement = placementsBySlot.get(benchSlotId)
              const benchModule = modules.find((m) => m.id === benchPlacement?.moduleId)
              const badge = tipVolumeBadge(labware)
              return (
                <div
                  className="virtual-card"
                  key={benchSlotId}
                  draggable
                  onDragStart={() => setDraggingLabwareId(labware.labwareId)}
                  onDragEnd={() => setDraggingLabwareId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!draggingLabwareId) return
                    const sourceSlot = slotByLabware.get(draggingLabwareId)
                    if (sourceSlot && sourceSlot.startsWith('bench:')) {
                      const targetLabwareId = benchPlacement?.labwareId
                      onChangePlacement(sourceSlot, { labwareId: targetLabwareId || undefined })
                      onChangePlacement(benchSlotId, { labwareId: draggingLabwareId })
                    } else {
                      moveToBench(draggingLabwareId)
                    }
                    setDraggingLabwareId(null)
                  }}
                >
                  <div className="virtual-card__top">
                    <span className="virtual-card__name">{labware.name}</span>
                    {badge && <span className="tip-badge" style={{ background: badge.color }}>{badge.label}</span>}
                    <div className="slot-quick">
                      {canRotateLabware(labware, benchSlotId) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            rotateLabware(labware)
                          }}
                          title={`Rotate to ${currentOrientation(labware.labwareId) === 'portrait' ? 'landscape' : 'portrait'}`}
                        >
                          {currentOrientation(labware.labwareId) === 'portrait' ? 'Pt' : 'Ls'}
                        </button>
                      )}
                      <button
                        className={currentSourceLabwareId === labware.labwareId ? 'slot-quick__role slot-quick__role--source is-active' : 'slot-quick__role slot-quick__role--source'}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSetSourceLabware?.(currentSourceLabwareId === labware.labwareId ? null : labware.labwareId)
                        }}
                        title={currentSourceLabwareId === labware.labwareId ? `Unset ${labware.name} as source` : `Set ${labware.name} as source`}
                      >
                        Src
                      </button>
                      <button
                        className={currentTargetLabwareId === labware.labwareId ? 'slot-quick__role slot-quick__role--target is-active' : 'slot-quick__role slot-quick__role--target'}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSetTargetLabware?.(currentTargetLabwareId === labware.labwareId ? null : labware.labwareId)
                        }}
                        title={currentTargetLabwareId === labware.labwareId ? `Unset ${labware.name} as target` : `Set ${labware.name} as target`}
                      >
                        Trgt
                      </button>
                    </div>
                  </div>
                  {renderRoleBadges(labware.labwareId)}
                  <GenericLabwareVisual labware={labware} orientation={currentOrientation(labware.labwareId)} />
                  <div className="virtual-card__module">
                    <span>{benchModule ? `${moduleEmoji(benchModule.id)} ${benchModule.label}` : 'No module'}</span>
                    <select
                      value={benchPlacement?.moduleId || ''}
                      onChange={(e) => onChangePlacement(benchSlotId, { moduleId: e.target.value || undefined, labwareId: labware.labwareId })}
                    >
                      <option value="">No module</option>
                      {modules.map((module) => (
                        <option key={module.id} value={module.id}>{module.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="deck-panel__grid" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(${slotMinWidth}px, 1fr))` }}>
          {profile.slots.map((slot) => {
            const placement = placementsBySlot.get(slot.id)
            const placedLabware = placement?.labwareId ? labwares.find((lw) => lw.labwareId === placement.labwareId) : undefined
            const placedModule = placement?.moduleId ? modules.find((m) => m.id === placement.moduleId) : undefined
            return (
              <div
                className={`deck-slot deck-slot--${slot.kind} ${selectedSlotId === slot.id ? 'deck-slot--selected' : ''}`}
                key={slot.id}
                style={{ gridRow: slot.row || 1, gridColumn: slot.col || 1 }}
                onClick={() => handleSlotClick(slot.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggingLabwareId) return
                  placeLabwareInSlot(slot.id, draggingLabwareId)
                  setDraggingLabwareId(null)
                }}
              >
                <div className="deck-slot__header">
                  <span className="deck-slot__id">{slot.id}</span>
                  <div className="slot-quick">
                    {placedLabware && canRotateLabware(placedLabware, slot.id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          rotateLabware(placedLabware)
                        }}
                        title={`Rotate to ${currentOrientation(placedLabware.labwareId) === 'portrait' ? 'landscape' : 'portrait'}`}
                        >
                          {currentOrientation(placedLabware.labwareId) === 'portrait' ? 'Pt' : 'Ls'}
                        </button>
                    )}
                    <button
                      disabled={!placedLabware}
                      className={placedLabware && currentSourceLabwareId === placedLabware.labwareId ? 'slot-quick__role slot-quick__role--source is-active' : 'slot-quick__role slot-quick__role--source'}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSetSourceLabware?.(placedLabware && currentSourceLabwareId === placedLabware.labwareId ? null : placedLabware?.labwareId || null)
                      }}
                      title="Set as source"
                    >
                      Src
                    </button>
                    <button
                      disabled={!placedLabware}
                      className={placedLabware && currentTargetLabwareId === placedLabware.labwareId ? 'slot-quick__role slot-quick__role--target is-active' : 'slot-quick__role slot-quick__role--target'}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSetTargetLabware?.(placedLabware && currentTargetLabwareId === placedLabware.labwareId ? null : placedLabware?.labwareId || null)
                      }}
                      title="Set as target"
                    >
                      Trgt
                    </button>
                  </div>
                  <select
                    className="slot-module"
                    value={placement?.moduleId || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onChangePlacement(slot.id, { moduleId: e.target.value || undefined })}
                  >
                    <option value="">No module</option>
                    {modules.map((module) => (
                      <option key={module.id} value={module.id}>{module.label}</option>
                    ))}
                  </select>
                </div>
                <div
                  className={`deck-slot__canvas ${slot.kind === 'trash' ? 'visual-trash-slot' : ''}`}
                  draggable={Boolean(placedLabware)}
                  onDragStart={() => {
                    if (placedLabware) setDraggingLabwareId(placedLabware.labwareId)
                  }}
                  onDragEnd={() => setDraggingLabwareId(null)}
                >
                  <div className="deck-slot__canvas-overlay">
                    <GenericLabwareVisual labware={placedLabware} orientation={placedLabware ? currentOrientation(placedLabware.labwareId) : 'landscape'} />
                    <div className="deck-slot__canvas-name" title={placedLabware?.name || slot.label || 'Empty'}>
                      {placedLabware?.name || slot.label || 'Empty'}
                    </div>
                    {tipVolumeBadge(placedLabware) && (
                      <span className="tip-badge" style={{ background: tipVolumeBadge(placedLabware)?.color }}>
                        {tipVolumeBadge(placedLabware)?.label}
                      </span>
                    )}
                    {placedModule && (
                      <span className="deck-slot__canvas-module" title={placedModule.label}>
                        {moduleEmoji(placedModule.id)} {placedModule.label}
                      </span>
                    )}
                    {placedLabware && (
                      <button
                        className="deck-slot__remove-labware"
                        onClick={(e) => {
                          e.stopPropagation()
                          onChangePlacement(slot.id, { labwareId: undefined })
                        }}
                        title={`Remove ${placedLabware.name} from ${slot.id}`}
                      >
                        X
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {unplacedLabwares.length > 0 && (
            <div className="deck-panel__bench-drop" onDragOver={(e) => e.preventDefault()} onDrop={() => {
              if (!draggingLabwareId) return
              moveToBench(draggingLabwareId)
              setDraggingLabwareId(null)
            }}>
              Drop here to move to bench
            </div>
          )}
        </div>
      )}
      <style>{`
        .deck-panel {
          border: 1px solid #d0d7de;
          border-radius: 8px;
          background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
          padding: 0.7rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .deck-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .deck-panel__title-wrap { display: flex; flex-direction: column; gap: 0.15rem; }
        .deck-panel__sub { font-size: 0.8rem; color: #52616f; }
        .deck-panel__selectors { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .deck-panel__selectors label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: #495057; }
        .deck-panel__selectors select { height: 30px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 0.45rem; background: white; }
        .deck-download-btn {
          height: 30px;
          border: 1px solid #0f766e;
          border-radius: 6px;
          background: #0f766e;
          color: #ffffff;
          font-size: 0.76rem;
          font-weight: 700;
          padding: 0 0.65rem;
          cursor: pointer;
        }
        .deck-download-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .deck-last-xml-badge {
          height: 30px;
          display: inline-flex;
          align-items: center;
          border: 1px solid #1d4ed8;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 0.73rem;
          font-weight: 700;
          padding: 0 0.55rem;
          text-decoration: none;
          max-width: 280px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .deck-last-xml-badge:hover { background: #dbeafe; }
        .deck-panel__tray { display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem; padding: 0.35rem 0.45rem; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; }
        .tray-label { font-size: 0.75rem; font-weight: 700; color: #334155; margin-right: 0.35rem; }
        .tray-actions { position: relative; }
        .tray-add { height: 28px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: white; font-size: 0.76rem; font-weight: 700; padding: 0 0.6rem; cursor: pointer; }
        .tray-add-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          z-index: 20;
          width: 240px;
          max-height: 260px;
          overflow: auto;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: white;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
          padding: 0.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .tray-add-item {
          min-height: 40px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: #f8fafc;
          font-size: 0.74rem;
          color: #0f172a;
          display: flex;
          align-items: flex-start;
          gap: 0.35rem;
          padding: 0.3rem 0.45rem;
          cursor: pointer;
          text-align: left;
        }
        .tray-add-item span:nth-child(2) {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .tray-add-meta {
          font-size: 0.66rem;
          color: #64748b;
          font-weight: 500;
        }
        .tray-add-item:hover { border-color: #bfdbfe; background: #eff6ff; }
        .tray-add-hint {
          border: 1px solid #fde68a;
          background: #fffbeb;
          color: #92400e;
          border-radius: 6px;
          padding: 0.4rem;
          font-size: 0.7rem;
          line-height: 1.2;
        }
        .tray-chip-wrap { position: relative; display: inline-flex; align-items: center; gap: 0.3rem; }
        .tray-chip {
          height: 30px;
          border-radius: 999px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          font-size: 0.76rem;
          padding: 0 0.75rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .tray-chip--source {
          border-color: #60a5fa;
          background: #eff6ff;
          color: #1d4ed8;
        }
        .tray-chip--target {
          border-color: #86efac;
          background: #ecfdf5;
          color: #15803d;
        }
        .tray-chip__name {
          max-width: 10rem;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .tray-chip__role {
          border-radius: 999px;
          padding: 0.08rem 0.38rem;
          font-size: 0.62rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .tray-chip__role--source {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .tray-chip__role--target {
          background: #dcfce7;
          color: #15803d;
        }
        .tray-chip-remove {
          position: static;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid #bfdbfe;
          background: #ffffff;
          color: #dc2626;
          font-size: 0.6rem;
          line-height: 1;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
        }
        .tray-chip-remove:hover { border-color: #fca5a5; background: #fef2f2; }

        .deck-panel__grid { display: grid; gap: 0.55rem; align-items: stretch; }
        .deck-slot {
          background: white;
          border: 1px solid #d0d7de;
          border-radius: 8px;
          padding: 0.4rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          cursor: pointer;
        }
        .deck-slot--selected { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18); }
        .deck-slot--trash { border-color: #fecaca; background: #fff5f5; }
        .deck-slot--special { border-color: #fcd34d; background: #fffbeb; }
        .deck-slot__header { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 0.35rem; }
        .deck-slot__id { font-weight: 700; font-size: 0.82rem; color: #1f2937; min-width: 24px; }
        .slot-quick { display: inline-flex; gap: 0.25rem; justify-self: start; }
        .slot-quick button {
          height: 22px;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: #334155;
          font-size: 0.66rem;
          font-weight: 700;
          padding: 0 0.38rem;
          cursor: pointer;
        }
        .slot-quick button:disabled { opacity: 0.45; cursor: not-allowed; }
        .slot-quick__role.is-active.slot-quick__role--source {
          border-color: #60a5fa;
          background: #dbeafe;
          color: #1d4ed8;
        }
        .slot-quick__role.is-active.slot-quick__role--target {
          border-color: #86efac;
          background: #dcfce7;
          color: #15803d;
        }
        .slot-module {
          height: 24px;
          border: 1px solid #ced4da;
          border-radius: 6px;
          padding: 0 0.35rem;
          font-size: 0.7rem;
          background: white;
          width: 100%;
          min-width: 0;
          max-width: 120px;
          justify-self: end;
        }

        .deck-slot__canvas {
          position: relative;
          min-height: 124px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
          background: #f8fafc;
        }
        .deck-slot__canvas-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 0.32rem 0.38rem;
          gap: 0.2rem;
        }
        .deck-slot__canvas-name {
          font-size: 0.72rem;
          font-weight: 700;
          color: #1f2937;
          background: rgba(255, 255, 255, 0.86);
          border-radius: 4px;
          padding: 0.08rem 0.25rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .deck-slot__canvas-module {
          font-size: 0.66rem;
          color: #334155;
          background: rgba(254, 243, 199, 0.9);
          border: 1px solid #fcd34d;
          border-radius: 999px;
          padding: 0.04rem 0.35rem;
          align-self: flex-start;
          white-space: nowrap;
        }
        .deck-slot__remove-labware {
          position: absolute;
          right: 0.3rem;
          bottom: 0.3rem;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: 1px solid #fecaca;
          background: rgba(255, 255, 255, 0.95);
          color: #dc2626;
          font-size: 0.65rem;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }
        .deck-slot__remove-labware:hover { background: #fff1f2; border-color: #fca5a5; }
        .tip-badge {
          font-size: 0.62rem;
          color: #111827;
          border: 1px solid rgba(15, 23, 42, 0.15);
          border-radius: 999px;
          padding: 0.02rem 0.35rem;
          align-self: flex-start;
          font-weight: 700;
          white-space: nowrap;
        }
        .lw-svg { width: 100%; height: 62px; display: block; }
        /* Portrait labware: render tall + narrow so a rotated plate visually
           reads as portrait. Width scales from the height by the swapped
           aspect ratio (64:124). */
        .lw-svg[data-orientation="portrait"] {
          width: auto;
          height: 100px;
          max-width: 100%;
          display: block;
          margin: 0 auto;
        }
        .lw-svg__frame { fill: #dbeafe; stroke: #1e40af; stroke-width: 1.2; }
        .lw-svg__well { fill: #1e3a8a; opacity: 0.78; }
        .lw-svg__tip { fill: #7f1d1d; opacity: 0.9; }
        .lw-svg__lane { fill: #0284c7; opacity: 0.75; }
        .lw-svg__tube { fill: #c2410c; opacity: 0.82; }
        .lw-empty {
          width: 100%;
          height: 62px;
          border-radius: 6px;
          border: 1px dashed #cbd5e1;
          color: #94a3b8;
          font-size: 0.78rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
        }
        .visual-trash-slot { background: repeating-linear-gradient(135deg, #fee2e2 0 8px, #fecaca 8px 16px); }

        .deck-panel__bench-drop {
          border: 1px dashed #93c5fd;
          border-radius: 8px;
          min-height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1d4ed8;
          font-size: 0.78rem;
          font-weight: 600;
          background: #eff6ff;
          grid-column: 1 / -1;
        }

        .deck-panel__manual {
          border: 1px dashed #93c5fd;
          border-radius: 8px;
          background: #eff6ff;
          padding: 0.6rem 0.7rem;
          font-size: 0.82rem;
          color: #1e3a8a;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .virtual-bench {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.55rem;
        }
        .virtual-card {
          background: white;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 0.45rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .virtual-card__top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.4rem;
        }
        .virtual-card__name {
          font-size: 0.76rem;
          font-weight: 700;
          color: #1e3a8a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .virtual-card__module {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.4rem;
          font-size: 0.7rem;
        }
        .virtual-card__module select {
          height: 24px;
          border: 1px solid #ced4da;
          border-radius: 6px;
          padding: 0 0.35rem;
          font-size: 0.7rem;
          background: white;
          max-width: 115px;
        }
        .name-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2500;
        }
        .name-modal {
          width: min(420px, calc(100vw - 2rem));
          background: white;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .name-modal h4 { margin: 0; font-size: 0.95rem; color: #1e293b; }
        .name-modal p { margin: 0; font-size: 0.8rem; color: #64748b; }
        .name-modal input {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0.45rem 0.55rem;
          font-size: 0.84rem;
          font-family: inherit;
        }
        .name-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        .name-modal-actions button {
          height: 32px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: white;
          color: #334155;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0 0.8rem;
        }
        .name-modal-actions .btn-save {
          border-color: #1d4ed8;
          background: #1d4ed8;
          color: white;
        }
      `}</style>
    </div>
  )
}
