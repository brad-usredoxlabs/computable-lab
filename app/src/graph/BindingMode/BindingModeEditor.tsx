import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import type { Labware } from '../../types/labware'
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
  roles?: {
    labwareRoles?: Array<{ roleId: string }>
    materialRoles?: Array<{ roleId: string }>
  }
  inherits_from?: { id?: string }
  notes?: string
}

interface LabContextFromNotes {
  labwareKind?: string
  plateCount?: number
  sampleCount?: number
  equipmentOverrides?: unknown[]
}

/**
 * Collapse a planned-run title that already begins with its own "Plan:" label.
 *
 * The bindings heading renders `Plan: {title}`; when the stored title is itself
 * `Plan: 2026-09-06 Run template` the page stutters. This strips only an
 * anchored `plan:` prefix (case/space-insensitive) at render time — the record
 * title is never written, renamed or trimmed in storage. A title that merely
 * contains the word Plan is left verbatim, and an empty remainder falls back to
 * the original so the heading never loses its title.
 */
export function planHeadingTitle(title: string): string {
  const stripped = title.replace(/^\s*plan\s*:\s*/i, '')
  return stripped.trim() ? stripped : title
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
  const id = (plannedRunId || routeId)!

  const [plannedRun, setPlannedRun] = useState<RecordEnvelope | null>(null)
  const [localProtocol, setLocalProtocol] = useState<RecordEnvelope | null>(null)
  const [labwareUniverse, setLabwareUniverse] = useState<RecordEnvelope[]>([])
  const [materialUniverse, setMaterialUniverse] = useState<RecordEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const { platforms, loading: platformsLoading } = usePlatformRegistry()
  const [currentPlatformId, setCurrentPlatformId] = useState<string>('manual')

  // Compile state
  const [compileResult, setCompileResult] = useState<RunPlanCompileResult | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [_compileError, setCompileError] = useState<string | null>(null)
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
        const prResp = await apiClient.getRecordWithUI(id)
        if (!active) return
        const pr = prResp.record
        if (!pr) throw new Error(`planned-run not found: ${id}`)
        setPlannedRun(pr)

        const prPayload = pr.payload as unknown as PlannedRunPayload
        if (prPayload.deckPlatformId) {
          setCurrentPlatformId(prPayload.deckPlatformId)
        }

        if (prPayload.localProtocolRef?.id) {
          try {
            const lp = (await apiClient.getRecordWithUI(prPayload.localProtocolRef.id)).record
            if (active && lp) setLocalProtocol(lp)
          } catch {
            // local-protocol not found — continue without it
          }
        }

        try {
          // Seam candidate universe: `labware` / `material` records — the kinds
          // the role-binding proposals endpoint names. The pickers are fed from
          // here; the `*-instance` kinds serve no records and are no longer fetched.
          const lwResp = await apiClient.listRecordsByKind('labware', 500)
          if (active) setLabwareUniverse(lwResp.records)
        } catch {
          // No labware records
        }

        try {
          const matResp = await apiClient.listRecordsByKind('material', 500)
          if (active) setMaterialUniverse(matResp.records)
        } catch {
          // No material records
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
    const prPayload = plannedRun.payload as unknown as PlannedRunPayload
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

  // Roles resolved from local protocol (prefers local roles, falls back to universal via inherits_from)
  const [labwareRoles, setLabwareRoles] = useState<Array<{ roleId: string; roleType: string }>>([])
  const [materialRoles, setMaterialRoles] = useState<Array<{ roleId: string; roleType: string }>>([])

  // Resolve roles: local payload.roles first, else fetch universal via inherits_from.id
  useEffect(() => {
    if (!localProtocol) {
      setLabwareRoles([])
      setMaterialRoles([])
      return
    }
    let active = true

    const resolveRoles = async () => {
      const lpPayload = localProtocol.payload as unknown as LocalProtocolPayload
      const localRoles = lpPayload.roles

      if (localRoles && ((localRoles.labwareRoles ?? []).length > 0 || (localRoles.materialRoles ?? []).length > 0)) {
        if (active) {
          setLabwareRoles((localRoles.labwareRoles ?? []).map(r => ({ roleId: r.roleId, roleType: 'labware' })))
          setMaterialRoles((localRoles.materialRoles ?? []).map(r => ({ roleId: r.roleId, roleType: 'material' })))
        }
        return
      }

      // No local roles — fetch universal protocol via inherits_from
      const universalId = lpPayload.inherits_from?.id
      if (!universalId) {
        if (active) {
          setLabwareRoles([])
          setMaterialRoles([])
        }
        return
      }

      try {
        const universalResp = await apiClient.getRecordWithUI(universalId)
        if (!active) return
        const universalPayload = universalResp.record?.payload as Record<string, unknown> | undefined
        const universalRoles = universalPayload?.roles as Record<string, unknown> | undefined

        if (active) {
          const uLabwareRoles = Array.isArray(universalRoles?.labwareRoles) ? universalRoles.labwareRoles : []
          const uMaterialRoles = Array.isArray(universalRoles?.materialRoles) ? universalRoles.materialRoles : []
          setLabwareRoles(uLabwareRoles.map((r: Record<string, unknown>) => ({ roleId: String(r.roleId), roleType: 'labware' })))
          setMaterialRoles(uMaterialRoles.map((r: Record<string, unknown>) => ({ roleId: String(r.roleId), roleType: 'material' })))
        }
      } catch {
        // Universal protocol not found — degrade to empty roles
        if (active) {
          setLabwareRoles([])
          setMaterialRoles([])
        }
      }
    }

    void resolveRoles()
    return () => { active = false }
  }, [localProtocol])

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
        setCompileResult(result as RunPlanCompileResult)
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

  const prPayload = plannedRun.payload as unknown as PlannedRunPayload
  const title = prPayload.title || 'Untitled Plan'

  // Extract labContext from local-protocol notes
  const localProtocolPayload = localProtocol?.payload as unknown as LocalProtocolPayload | undefined
  const labContext = extractLabContextFromNotes(localProtocolPayload?.notes)

  return (
    <div className="binding-mode-editor">
      {/* Compile status banner */}
      <CompileStatusBanner result={compileResult} isCompiling={isCompiling} />

      {/* Header */}
      <div className="binding-mode-editor__header">
        <h2 className="binding-mode-editor__title">Plan: {planHeadingTitle(title)}</h2>
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
            labwareRoles={labwareRoles.map(r => ({ ...r, roleType: r.roleType ?? '' }))}
            materialRoles={materialRoles.map(r => ({ ...r, roleType: r.roleType ?? '' }))}
            currentBindings={currentBindings}
            labwareUniverse={labwareUniverse}
            materialUniverse={materialUniverse}
            onBindingChange={handleBindingChange}
            diagnostics={compileResult?.diagnostics ?? []}
          />
          <SampleBindingPanel
            plannedRunId={id}
            sampleCount={Number(labContext?.sampleCount ?? 96)}
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
              labwares={deckLabwares as Labware[]}
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
