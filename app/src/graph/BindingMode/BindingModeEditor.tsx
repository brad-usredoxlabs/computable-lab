import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import type { PlatformManifest } from '../../types/platformRegistry'
import { usePlatformRegistry } from '../../shared/hooks/usePlatformRegistry'
import { DeckVisualizationPanel, type DeckPlacement } from '../labware/DeckVisualizationPanel'
import { DeckPickerSelect } from './DeckPickerSelect'
import { RoleBindingPanel } from './RoleBindingPanel'
import { SampleBindingPanel } from './SampleBindingPanel'
import { CompileStatusBanner } from './CompileStatusBanner'
import type { RunPlanCompileResult } from './types'
import './BindingModeEditor.css'

interface BindingModeEditorProps {
  plannedRunId: string
}

interface PlannedRunPayload {
  kind: 'planned-run'
  state: string
  title: string
  bindings?: {
    labware?: Array<{ roleId: string; labwareInstanceRef?: { id: string } }>
    materials?: Array<{ roleId: string; materialRef?: { id: string } }>
  }
  deckPlatformId?: string
  localProtocolRef?: { id: string }
  sampleMap?: {
    mode: string
    entries?: Array<{ wellId: string; sampleLabel: string }>
  }
}

interface LocalProtocolPayload {
  kind: 'local-protocol'
  labwareRoles?: Array<{ roleId: string; roleType?: string }>
  materialRoles?: Array<{ roleId: string; roleType?: string }>
  notes?: string
}

interface LabContextFromNotes {
  labwareKind?: string
  plateCount?: number
  sampleCount?: number
  equipmentOverrides?: unknown[]
}

/**
 * Extract labContext from local-protocol notes JSON string.
 */
function extractLabContextFromNotes(notes: string | undefined): LabContextFromNotes | undefined {
  if (!notes) return undefined
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>
    const lc = parsed.labContext as Record<string, unknown> | undefined
    if (!lc) return undefined
    return {
      labwareKind: lc.labwareKind as string | undefined,
      plateCount: lc.plateCount as number | undefined,
      sampleCount: lc.sampleCount as number | undefined,
      equipmentOverrides: lc.equipmentOverrides as unknown[] | undefined,
    }
  } catch {
    return undefined
  }
}

interface BindingChange {
  labware?: Array<{ roleId: string; labwareInstanceRef: string }>
  materials?: Array<{ roleId: string; materialInstanceRef: string }>
  deckPlatformId?: string
}

export function BindingModeEditor({ plannedRunId }: BindingModeEditorProps) {
  const { runId: routeId } = useParams<{ runId: string }>()
  const id = plannedRunId || routeId

  const [plannedRun, setPlannedRun] = useState<RecordEnvelope | null>(null)
  const [localProtocol, setLocalProtocol] = useState<RecordEnvelope | null>(null)
  const [labwareInstances, setLabwareInstances] = useState<RecordEnvelope[]>([])
  const [materialInstances, setMaterialInstances] = useState<RecordEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const { platforms, loading: platformsLoading } = usePlatformRegistry()
  const [currentPlatformId, setCurrentPlatformId] = useState<string>('manual')

  // Compile state
  const [compileResult, setCompileResult] = useState<RunPlanCompileResult | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [lastEditAt, setLastEditAt] = useState<number | null>(null)

  // Debounced binding changes
  const pendingChangesRef = useRef<BindingChange | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load planned-run and local-protocol
  useEffect(() => {
    if (!id) return
    let active = true

    const loadData = async () => {
      try {
        const pr = await apiClient.getRecord(id)
        if (!active) return
        setPlannedRun(pr)

        const prPayload = pr.payload as PlannedRunPayload
        if (prPayload.deckPlatformId) {
          setCurrentPlatformId(prPayload.deckPlatformId)
        }

        if (prPayload.localProtocolRef?.id) {
          try {
            const lp = await apiClient.getRecord(prPayload.localProtocolRef.id)
            if (active) setLocalProtocol(lp)
          } catch {
            // local-protocol not found — continue without it
          }
        }

        try {
          const lwResp = await apiClient.listRecordsByKind('labware-instance', 500)
          if (active) setLabwareInstances(lwResp.records)
        } catch {
          // No labware instances
        }

        try {
          const matResp = await apiClient.listRecordsByKind('material-instance', 500)
          if (active) setMaterialInstances(matResp.records)
        } catch {
          // No material instances
        }
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load planned-run')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadData()
    return () => { void 0 }
  }, [id])

  // Build current bindings from planned-run
  const currentBindings = useMemo<Record<string, { instanceRef: string }>>(() => {
    if (!plannedRun) return {}
    const prPayload = plannedRun.payload as PlannedRunPayload
    const bindings: Record<string, { instanceRef: string }> = {}
    const lwBindings = prPayload.bindings?.labware ?? []
    for (const b of lwBindings) {
      if (b.labwareInstanceRef?.id) {
        bindings[b.roleId] = { instanceRef: b.labwareInstanceRef.id }
      }
    }
    const matBindings = prPayload.bindings?.materials ?? []
    for (const b of matBindings) {
      if (b.materialRef?.id) {
        bindings[b.roleId] = { instanceRef: b.materialRef.id }
      }
    }
    return bindings
  }, [plannedRun])

  // Roles from local-protocol
  const labwareRoles = useMemo(
    () => ((localProtocol?.payload as LocalProtocolPayload)?.labwareRoles ?? []),
    [localProtocol],
  )
  const materialRoles = useMemo(
    () => ((localProtocol?.payload as LocalProtocolPayload)?.materialRoles ?? []),
    [localProtocol],
  )

  // Debounced save
  const flushBindings = useCallback(
    async (changes: BindingChange) => {
      if (!id) return
      setSaveState('saving')
      setSaveError(null)
      try {
        await apiClient.updatePlannedRunBindings(id, changes)
        setSaveState('success')
        setTimeout(() => setSaveState('idle'), 2000)
      } catch (err) {
        setSaveState('error')
        setSaveError(err instanceof Error ? err.message : 'Save failed')
      }
    },
    [id],
  )

  const scheduleSave = useCallback(
    (changes: BindingChange) => {
      pendingChangesRef.current = changes
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        const pending = pendingChangesRef.current
        pendingChangesRef.current = null
        if (pending) {
          void flushBindings(pending)
        }
      }, 500)
    },
    [flushBindings],
  )

  // Handle binding change — also trigger compile debounce
  const handleBindingChange = useCallback(
    (roleId: string, instanceRef: string) => {
      if (!id) return
      const changes: BindingChange = {}
      const isLabwareRole = labwareRoles.some((r) => r.roleId === roleId)
      if (isLabwareRole) {
        changes.labware = [{ roleId, labwareInstanceRef: instanceRef }]
      } else {
        changes.materials = [{ roleId, materialInstanceRef: instanceRef }]
      }
      scheduleSave(changes)
      setLastEditAt(Date.now())
    },
    [id, labwareRoles, scheduleSave],
  )

  // Handle platform change — also trigger compile debounce
  const handlePlatformChange = useCallback(
    (platformId: string) => {
      setCurrentPlatformId(platformId)
      if (!id) return
      scheduleSave({ deckPlatformId: platformId })
      setLastEditAt(Date.now())
    },
    [id, scheduleSave],
  )

  // Debounced compile: 1 second after last edit
  useEffect(() => {
    if (!lastEditAt) return
    const handle = setTimeout(async () => {
      if (!id) return
      setIsCompiling(true)
      try {
        const result = await apiClient.compileRunPlan(id)
        setCompileResult(result)
        setCompileError(null)
      } catch (err) {
        setCompileError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsCompiling(false)
      }
    }, 1000)
    return () => clearTimeout(handle)
  }, [lastEditAt, id])

  // Build deck placements from current bindings
  const deckPlacements = useMemo<DeckPlacement[]>(() => {
    const placements: DeckPlacement[] = []
    for (const [roleId, binding] of Object.entries(currentBindings)) {
      placements.push({ slotId: `role:${roleId}`, labwareId: binding.instanceRef })
    }
    return placements
  }, [currentBindings])

  // Build labware list for DeckVisualizationPanel
  const deckLabwares = useMemo(() => {
    const labwares: Array<{ labwareId: string; name: string }> = []
    for (const [roleId, binding] of Object.entries(currentBindings)) {
      labwares.push({ labwareId: binding.instanceRef, name: roleId })
    }
    return labwares
  }, [currentBindings])

  if (loading) return <div className="binding-mode-editor">Loading planned-run...</div>
  if (error) return <div className="binding-mode-editor binding-mode-editor--error">{error}</div>
  if (!plannedRun) return <div className="binding-mode-editor">Planned-run not found</div>

  const prPayload = plannedRun.payload as PlannedRunPayload
  const title = prPayload.title || 'Untitled Plan'

  // Extract labContext from local-protocol notes
  const localProtocolPayload = localProtocol?.payload as LocalProtocolPayload | undefined
  const labContext = extractLabContextFromNotes(localProtocolPayload?.notes)

  return (
    <div className="binding-mode-editor">
      {/* Compile status banner */}
      <CompileStatusBanner result={compileResult} isCompiling={isCompiling} />

      {/* Header */}
      <div className="binding-mode-editor__header">
        <h2 className="binding-mode-editor__title">Plan: {title}</h2>
        <div className="binding-mode-editor__controls">
          <DeckPickerSelect
            platforms={platforms}
            currentPlatformId={currentPlatformId}
            onPlatformChange={handlePlatformChange}
          />
          {saveState === 'saving' && <span className="binding-mode-editor__saving">Saving...</span>}
          {saveState === 'success' && <span className="binding-mode-editor__success">Saved</span>}
          {saveState === 'error' && saveError && (
            <span className="binding-mode-editor__error">{saveError}</span>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="binding-mode-editor__body">
        {/* Left: Role bindings */}
        <div className="binding-mode-editor__sidebar">
          <RoleBindingPanel
            labwareRoles={labwareRoles}
            materialRoles={materialRoles}
            currentBindings={currentBindings}
            labwareInstances={labwareInstances}
            materialInstances={materialInstances}
            onBindingChange={handleBindingChange}
            diagnostics={compileResult?.diagnostics ?? []}
          />
          <SampleBindingPanel
            plannedRunId={id}
            sampleCount={labContext?.sampleCount ?? 96}
            currentSampleMap={prPayload.sampleMap?.entries}
            onChange={() => setLastEditAt(Date.now())}
          />
        </div>

        {/* Center: Deck visualization */}
        <div className="binding-mode-editor__deck">
          {platforms.length > 0 && !platformsLoading ? (
            <DeckVisualizationPanel
              platform={currentPlatformId}
              variant=""
              platforms={platforms}
              labwares={deckLabwares}
              placements={deckPlacements}
              onPlatformChange={handlePlatformChange}
              onVariantChange={() => {}}
              onChangePlacement={() => {}}
              selectedTool={null}
              onToolChange={() => {}}
              onAddLabware={() => ({ labwareId: '', labwareType: 'plate_96' as any, name: '', addressing: { type: 'grid' }, geometry: { maxVolume_uL: 300, minVolume_uL: 10, wellShape: 'round' } })}
              hidePlatformSelector
              hideDeckVariantSelector
            />
          ) : (
            <div className="binding-mode-editor__deck-loading">Loading deck...</div>
          )}
        </div>
      </div>
    </div>
  )
}
