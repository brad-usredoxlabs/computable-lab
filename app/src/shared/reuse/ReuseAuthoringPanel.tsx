import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api/client'
import { computeLabwareStates, getWellState } from '../../graph/lib/eventGraph'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { LibraryAssetEntry } from '../../types/reuse'
import type { RecordEnvelope } from '../../types/kernel'
import type { SelectedWell } from '../../graph/wellcontext/WellContextPanelV2'
import { RefPicker, type Ref } from '../ref'

interface ReuseAuthoringPanelProps {
  events: PlateEvent[]
  labwares: Map<string, Labware>
  selectedWells: SelectedWell[]
  sourceLabwareId?: string
  sourceSelectedWells?: string[]
  eventGraphId?: string | null
  runId?: string | null
  onAddEvent?: (event: PlateEvent) => void
}

type ReuseTab = 'promote' | 'layout' | 'library' | 'components'
type OutputKind = 'material-lot' | 'plate-snapshot' | 'material-output'
type WholePlateAction = 'incubate' | 'sonicate' | 'hypoxic_incubation'

interface LibraryEntryDraft {
  entry_id: string
  ref: Ref | null
  position_hint?: string
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function toRecordRef(id: string, type: string, label?: string): Ref {
  return { kind: 'record', id, type, ...(label ? { label } : {}) }
}

function inferRoleFromMaterial(material: string): string | undefined {
  const lower = material.toLowerCase()
  if (lower.includes('control') && lower.includes('positive')) return 'positive_control'
  if (lower.includes('control') && lower.includes('negative')) return 'negative_control'
  if (lower.includes('blank')) return 'blank'
  if (lower.includes('vehicle')) return 'vehicle_control'
  return undefined
}

function buildLaneGroups(wells: string[]): Array<{ lane_id: string; label: string; wells: string[] }> {
  const byColumn = new Map<string, string[]>()
  for (const well of wells) {
    const col = well.match(/(\d+)$/)?.[1] || 'unknown'
    const existing = byColumn.get(col) || []
    existing.push(well)
    byColumn.set(col, existing)
  }
  return Array.from(byColumn.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([col, ws]) => ({ lane_id: `col_${col}`, label: `Column ${col}`, wells: ws.sort() }))
}

export function ReuseAuthoringPanel({
  events,
  labwares,
  selectedWells,
  sourceLabwareId,
  sourceSelectedWells = [],
  eventGraphId,
  runId,
  onAddEvent,
}: ReuseAuthoringPanelProps) {
  const [tab, setTab] = useState<ReuseTab>('promote')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [promoteKind, setPromoteKind] = useState<OutputKind>('material-lot')
  const [materialOutputMode, setMaterialOutputMode] = useState<'prepared-material' | 'biological-material' | 'derived-material'>('derived-material')
  const [promoteTitle, setPromoteTitle] = useState('')
  const [promoteMaterialRef, setPromoteMaterialRef] = useState<Ref | null>(null)

  const [layoutTitle, setLayoutTitle] = useState('')
  const [layoutRecordId, setLayoutRecordId] = useState('')
  const [layoutVersion, setLayoutVersion] = useState('1.0.0')
  const [layoutRole, setLayoutRole] = useState('sample')
  const [layoutInputSource, setLayoutInputSource] = useState<'material_ref' | 'context_ref' | 'binding_slot'>('material_ref')
  const [layoutMaterialRef, setLayoutMaterialRef] = useState<Ref | null>(null)
  const [layoutContextId, setLayoutContextId] = useState('')
  const [layoutBindingSlot, setLayoutBindingSlot] = useState('compound_slot')

  const [libraryTitle, setLibraryTitle] = useState('')
  const [libraryRecordId, setLibraryRecordId] = useState('')
  const [libraryVersion, setLibraryVersion] = useState('1.0.0')
  const [libraryVendor, setLibraryVendor] = useState('')
  const [libraryCatalog, setLibraryCatalog] = useState('')
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntryDraft[]>([])

  const [savedLayouts, setSavedLayouts] = useState<LibraryAssetEntry[]>([])
  const [savedLibraries, setSavedLibraries] = useState<LibraryAssetEntry[]>([])
  const [savedSnapshots, setSavedSnapshots] = useState<LibraryAssetEntry[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [boundLayoutRef, setBoundLayoutRef] = useState<Ref | null>(null)
  const [boundLibraryRef, setBoundLibraryRef] = useState<Ref | null>(null)
  const [bindingTitle, setBindingTitle] = useState('')
  const [savedComponents, setSavedComponents] = useState<RecordEnvelope[]>([])
  const [savedProtocols, setSavedProtocols] = useState<RecordEnvelope[]>([])
  const [componentTitle, setComponentTitle] = useState('')
  const [componentDescription, setComponentDescription] = useState('')
  const [componentRecordId, setComponentRecordId] = useState('')
  const [selectedComponentId, setSelectedComponentId] = useState('')
  const [selectedProtocolId, setSelectedProtocolId] = useState('')
  const [instantiateRenderMode, setInstantiateRenderMode] = useState<'collapsed' | 'expanded'>('collapsed')
  const [instanceLabwareRole, setInstanceLabwareRole] = useState('plate')
  const [instanceLabwareRefId, setInstanceLabwareRefId] = useState('')
  const [instanceMaterialRole, setInstanceMaterialRole] = useState('sample')
  const [instanceMaterialRefId, setInstanceMaterialRefId] = useState('')
  const [instanceInstrumentRole, setInstanceInstrumentRole] = useState('instrument_primary')
  const [instanceInstrumentRefId, setInstanceInstrumentRefId] = useState('')
  const [instanceParamName, setInstanceParamName] = useState('')
  const [instanceParamValue, setInstanceParamValue] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState('')
  const [instanceStale, setInstanceStale] = useState<boolean | null>(null)
  const [instanceLatestVersion, setInstanceLatestVersion] = useState('')
  const [componentSuggestions, setComponentSuggestions] = useState<Array<{
    signature: string
    count: number
    eventType: string
    eventIds: string[]
    labwareIds: string[]
  }>>([])
  const [wholePlateAction, setWholePlateAction] = useState<WholePlateAction>('incubate')
  const [wholePlateDurationMin, setWholePlateDurationMin] = useState('60')
  const [wholePlateTemperatureC, setWholePlateTemperatureC] = useState('37')
  const [hypoxiaO2Pct, setHypoxiaO2Pct] = useState('2')

  const states = useMemo(() => computeLabwareStates(events, labwares), [events, labwares])

  useEffect(() => {
    let mounted = true
    async function loadAssets() {
      setAssetsLoading(true)
      try {
        const [layouts, libraries, snapshots] = await Promise.all([
          apiClient.getLibraryAssets('plate_layout_template', 200),
          apiClient.getLibraryAssets('library_bundle', 200),
          apiClient.getLibraryAssets('plate_snapshot', 200),
        ])
        const [components, protocols] = await Promise.all([
          apiClient.listComponents(undefined, 200),
          apiClient.listProtocols(200),
        ])
        if (!mounted) return
        setSavedLayouts(layouts.items || [])
        setSavedLibraries(libraries.items || [])
        setSavedSnapshots(snapshots.items || [])
        setSavedComponents(components.components || [])
        setSavedProtocols(protocols || [])
      } catch {
        if (!mounted) return
      } finally {
        if (mounted) setAssetsLoading(false)
      }
    }
    loadAssets()
    return () => { mounted = false }
  }, [success])

  const clearNotices = () => {
    setError(null)
    setSuccess(null)
  }

  async function createContextRecordsFromSelection(): Promise<Array<{ contextId: string; labwareId: string; wellId: string }>> {
    const results: Array<{ contextId: string; labwareId: string; wellId: string }> = []

    for (const selected of selectedWells) {
      const state = getWellState(states, selected.labwareId, selected.wellId)
      const contextId = newId('CTX')

      const contents = state.materials.map((material) => ({
        material_ref: toRecordRef(material.materialRef, 'material', material.materialRef),
        volume: { value: Number(material.volume_uL.toFixed(3)), unit: 'uL' },
        ...(material.concentration ? { concentration: material.concentration } : {}),
      }))

      const contextPayload: Record<string, unknown> = {
        id: contextId,
        subject_ref: toRecordRef(`${selected.labwareId}:${selected.wellId}`, 'well', `${selected.labwareId} ${selected.wellId}`),
        ...(eventGraphId ? { event_graph_ref: toRecordRef(eventGraphId, 'event_graph', eventGraphId) } : {}),
        ...(contents.length > 0 ? { contents } : {}),
        total_volume: { value: Number(state.volume_uL.toFixed(3)), unit: 'uL' },
        properties: {
          harvested: state.harvested,
          incubation_count: state.incubations.length,
          source_event_count: state.eventHistory.length,
        },
        notes: `Derived from ${selected.labwareId} ${selected.wellId}`,
        tags: ['derived', 'well_context', `labware:${selected.labwareId}`],
      }

      await apiClient.createRecord('computable-lab/context', contextPayload)
      results.push({ contextId, labwareId: selected.labwareId, wellId: selected.wellId })
    }

    return results
  }

  async function handlePromoteContext() {
    clearNotices()
    if (selectedWells.length === 0) {
      setError('Select at least one well before promoting contexts.')
      return
    }

    if ((promoteKind === 'material-lot' || promoteKind === 'material-output') && !promoteMaterialRef) {
      setError('Select a material term/ref for material-lot promotion.')
      return
    }

    if (promoteKind === 'plate-snapshot') {
      const labwareIds = new Set(selectedWells.map(w => w.labwareId))
      if (labwareIds.size !== 1) {
        setError('Plate snapshot promotion requires wells from exactly one labware.')
        return
      }
    }

    setBusy(true)
    try {
      const createdContexts = await createContextRecordsFromSelection()

      if (promoteKind === 'material-lot') {
        const response = await apiClient.promoteContext({
          sourceContextIds: createdContexts.map(c => c.contextId),
          outputKind: 'material-lot',
          title: promoteTitle || `Promoted lot from ${createdContexts.length} context(s)`,
          ...(eventGraphId ? { sourceEventGraphRef: toRecordRef(eventGraphId, 'event_graph', eventGraphId) } : {}),
          ...(promoteMaterialRef ? { materialRef: promoteMaterialRef } : {}),
        })
        if (!response.success) {
          throw new Error(response.error || 'Context promotion failed')
        }
        setSuccess(`Created material lot ${response.outputRecordId} with provenance ${response.promotionRecordId}.`)
      } else if (promoteKind === 'material-output') {
        const response = await apiClient.promoteMaterialFromContext({
          sourceContextIds: createdContexts.map(c => c.contextId),
          outputMode: materialOutputMode,
          name: promoteTitle || `Promoted material from ${createdContexts.length} context(s)`,
          ...(promoteMaterialRef ? { materialRef: promoteMaterialRef } : {}),
        })
        setSuccess(`Created reusable material ${response.materialInstanceId}${response.derivationId ? ` via ${response.derivationId}` : ''}.`)
      } else {
        const labwareId = createdContexts[0].labwareId
        const response = await apiClient.promoteContext({
          sourceContextIds: createdContexts.map(c => c.contextId),
          outputKind: 'plate-snapshot',
          title: promoteTitle || `Snapshot ${labwareId}`,
          ...(eventGraphId ? { sourceEventGraphRef: toRecordRef(eventGraphId, 'event_graph', eventGraphId) } : {}),
          labwareRef: toRecordRef(labwareId, 'labware', labwareId),
          wellMappings: createdContexts.map(c => ({
            well: c.wellId,
            contextId: c.contextId,
            role: inferRoleFromMaterial(getWellState(states, c.labwareId, c.wellId).materials.map(m => m.materialRef).join(' ')),
          })),
        })
        if (!response.success) {
          throw new Error(response.error || 'Context promotion failed')
        }
        setSuccess(`Created plate snapshot ${response.outputRecordId} with provenance ${response.promotionRecordId}.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote contexts')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateLayoutTemplate() {
    clearNotices()
    if (!sourceLabwareId) {
      setError('A source labware must be selected to create a layout template.')
      return
    }
    if (sourceSelectedWells.length === 0) {
      setError('Select source wells to create a layout template.')
      return
    }
    if (!layoutTitle.trim()) {
      setError('Template title is required.')
      return
    }

    if (layoutInputSource === 'material_ref' && !layoutMaterialRef) {
      setError('Select a material ref for material-based template input.')
      return
    }
    if (layoutInputSource === 'context_ref' && !layoutContextId.trim()) {
      setError('Enter a context record ID for context-based template input.')
      return
    }
    if (layoutInputSource === 'binding_slot' && !layoutBindingSlot.trim()) {
      setError('Enter a binding slot identifier.')
      return
    }

    const recordId = layoutRecordId.trim() || newId('PLT')

    const input: Record<string, unknown> = {
      source: layoutInputSource,
      role: layoutRole,
    }
    if (layoutInputSource === 'material_ref') {
      input.material_ref = layoutMaterialRef
    } else if (layoutInputSource === 'context_ref') {
      input.context_ref = toRecordRef(layoutContextId.trim(), 'context', layoutContextId.trim())
    } else {
      input.binding_slot = layoutBindingSlot.trim()
    }

    const wells = [...sourceSelectedWells].sort()
    const payload: Record<string, unknown> = {
      kind: 'plate-layout-template',
      recordId,
      title: layoutTitle.trim(),
      version: layoutVersion.trim() || undefined,
      labware_ref: toRecordRef(sourceLabwareId, 'labware', sourceLabwareId),
      assignment_mode: 'explicit',
      assignments: [{ selector: { kind: 'explicit', wells }, inputs: [input] }],
      lane_groups: buildLaneGroups(wells),
      tags: ['layout_template', 'authored_in_editor'],
    }

    setBusy(true)
    try {
      await apiClient.createRecord('https://computable-lab.com/schema/computable-lab/plate-layout-template.schema.yaml', payload)
      setSuccess(`Created layout template ${recordId}.`)
      if (!layoutRecordId) setLayoutRecordId(recordId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create layout template')
    } finally {
      setBusy(false)
    }
  }

  function seedLibraryEntriesFromSelection() {
    const seen = new Set<string>()
    const seeded: LibraryEntryDraft[] = []

    for (const selected of selectedWells) {
      const state = getWellState(states, selected.labwareId, selected.wellId)
      for (const material of state.materials) {
        if (seen.has(material.materialRef)) continue
        seen.add(material.materialRef)
        seeded.push({ entry_id: `entry_${seeded.length + 1}`, ref: toRecordRef(material.materialRef, 'material', material.materialRef), position_hint: selected.wellId })
      }
    }

    setLibraryEntries(seeded)
    clearNotices()
    if (seeded.length === 0) {
      setError('No materials found in selected well contexts to seed library entries.')
    } else {
      setSuccess(`Seeded ${seeded.length} library entries from selected wells.`)
    }
  }

  async function handleCreateLibraryBundle() {
    clearNotices()
    if (!libraryTitle.trim()) {
      setError('Library title is required.')
      return
    }

    const validEntries = libraryEntries.filter(e => e.entry_id.trim() && e.ref)
    if (validEntries.length === 0) {
      setError('Add at least one valid entry with a reference.')
      return
    }

    const recordId = libraryRecordId.trim() || newId('LIB')
    const payload: Record<string, unknown> = {
      kind: 'library-bundle',
      recordId,
      title: libraryTitle.trim(),
      version: libraryVersion.trim() || undefined,
      source: {
        ...(libraryVendor.trim() ? { vendor: libraryVendor.trim() } : {}),
        ...(libraryCatalog.trim() ? { catalog_number: libraryCatalog.trim() } : {}),
      },
      entries: validEntries.map((entry) => ({
        entry_id: entry.entry_id.trim(),
        ref: entry.ref,
        ...(entry.position_hint?.trim() ? { position_hint: entry.position_hint.trim() } : {}),
      })),
      tags: ['library_bundle', 'authored_in_editor'],
    }

    setBusy(true)
    try {
      await apiClient.createRecord('https://computable-lab.com/schema/computable-lab/library-bundle.schema.yaml', payload)
      setSuccess(`Created library bundle ${recordId}.`)
      if (!libraryRecordId) setLibraryRecordId(recordId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create library bundle')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateBindingPlan() {
    clearNotices()
    if (!eventGraphId) {
      setError('Save this event graph first so bindings can target a concrete source.')
      return
    }
    if (!boundLayoutRef && !boundLibraryRef) {
      setError('Select at least one saved layout or library to bind.')
      return
    }

    const recordId = newId('PLR')
    const payload: Record<string, unknown> = {
      kind: 'planned-run',
      recordId,
      title: bindingTitle.trim() || `Binding plan for ${eventGraphId}`,
      sourceType: 'event-graph',
      sourceRef: toRecordRef(eventGraphId, 'event_graph', eventGraphId),
      state: 'draft',
      bindings: {
        ...(boundLayoutRef ? { layoutTemplates: [{ roleId: 'layout_template', templateRef: boundLayoutRef }] } : {}),
        ...(boundLibraryRef ? { libraries: [{ roleId: 'compound_library', libraryRef: boundLibraryRef }] } : {}),
      },
      notes: runId ? `Bound from active run ${runId}` : undefined,
      tags: ['binding_plan', 'authored_in_editor'],
    }

    setBusy(true)
    try {
      await apiClient.createRecord('https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml', payload)
      setSuccess(`Created planned-run binding ${recordId}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create planned-run binding')
    } finally {
      setBusy(false)
    }
  }

  function eventTouchesSelection(event: PlateEvent): boolean {
    const details = event.details as Record<string, unknown>
    const selectedLabwareIds = new Set(selectedWells.map((s) => s.labwareId))
    const selectedWellKeys = new Set(selectedWells.map((s) => `${s.labwareId}:${s.wellId}`))
    const directLabware = typeof details.labwareId === 'string' ? details.labwareId : undefined
    const sourceLabware = typeof details.source_labwareId === 'string' ? details.source_labwareId : undefined
    const destLabware = typeof details.dest_labwareId === 'string' ? details.dest_labwareId : undefined
    if (directLabware && selectedLabwareIds.has(directLabware)) return true
    if (sourceLabware && selectedLabwareIds.has(sourceLabware)) return true
    if (destLabware && selectedLabwareIds.has(destLabware)) return true
    const wells = (details.wells as string[] | undefined) || []
    const sourceWells = (details.source_wells as string[] | undefined) || []
    const destWells = (details.dest_wells as string[] | undefined) || []
    for (const well of wells) {
      if (directLabware && selectedWellKeys.has(`${directLabware}:${well}`)) return true
    }
    for (const well of sourceWells) {
      if (sourceLabware && selectedWellKeys.has(`${sourceLabware}:${well}`)) return true
    }
    for (const well of destWells) {
      if (destLabware && selectedWellKeys.has(`${destLabware}:${well}`)) return true
    }
    return false
  }

  async function handleCreateComponentFromSelection() {
    clearNotices()
    if (!eventGraphId) {
      setError('Save the event graph before creating reusable components.')
      return
    }
    if (!componentTitle.trim()) {
      setError('Component title is required.')
      return
    }
    const selectedEventIds = events.filter((event) => eventTouchesSelection(event)).map((event) => event.eventId)
    const selectedLabwareIds = Array.from(new Set(selectedWells.map((s) => s.labwareId)))
    if (selectedLabwareIds.length === 0) {
      setError('Select at least one well/labware to create a component.')
      return
    }

    setBusy(true)
    try {
      const response = await apiClient.createComponent({
        ...(componentRecordId.trim() ? { recordId: componentRecordId.trim() } : {}),
        title: componentTitle.trim(),
        ...(componentDescription.trim() ? { description: componentDescription.trim() } : {}),
        template: {
          source: {
            kind: 'event-graph-ref',
            eventGraphId,
            eventIds: selectedEventIds,
            labwareIds: selectedLabwareIds,
          },
          insertionHints: {
            selectedWells: selectedWells.map((s) => ({ labwareId: s.labwareId, wellId: s.wellId })),
          },
        },
        tags: ['graph_component', 'from_event_editor'],
      })
      setSuccess(`Created component ${response.component.recordId}.`)
      setSelectedComponentId(response.component.recordId)
      setComponentRecordId(response.component.recordId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create component')
    } finally {
      setBusy(false)
    }
  }

  async function handlePublishSelectedComponent() {
    clearNotices()
    if (!selectedComponentId) {
      setError('Select a component to publish.')
      return
    }
    setBusy(true)
    try {
      const published = await apiClient.publishComponent(selectedComponentId)
      setSuccess(`Published ${published.component.recordId} -> ${published.version.recordId}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish component')
    } finally {
      setBusy(false)
    }
  }

  async function handleInstantiateSelectedComponent(insertIntoTimeline: boolean) {
    clearNotices()
    if (!selectedComponentId) {
      setError('Select a component to instantiate.')
      return
    }
    setBusy(true)
    try {
      const bindings: Record<string, unknown> = {}
      if (instanceLabwareRole.trim() && instanceLabwareRefId.trim()) {
        bindings.labware = [{
          roleId: instanceLabwareRole.trim(),
          labwareInstanceRef: toRecordRef(instanceLabwareRefId.trim(), 'labware', instanceLabwareRefId.trim()),
        }]
      }
      if (instanceMaterialRole.trim() && instanceMaterialRefId.trim()) {
        bindings.materials = [{
          roleId: instanceMaterialRole.trim(),
          materialRef: toRecordRef(instanceMaterialRefId.trim(), 'material', instanceMaterialRefId.trim()),
        }]
      }
      if (instanceInstrumentRole.trim() && instanceInstrumentRefId.trim()) {
        bindings.instruments = [{
          roleId: instanceInstrumentRole.trim(),
          instrumentRef: toRecordRef(instanceInstrumentRefId.trim(), 'instrument', instanceInstrumentRefId.trim()),
        }]
      }
      if (instanceParamName.trim()) {
        bindings.parameters = [{
          name: instanceParamName.trim(),
          value: instanceParamValue,
        }]
      }

      const instance = await apiClient.instantiateComponent(selectedComponentId, {
        ...(eventGraphId ? { sourceRef: { kind: 'record', id: eventGraphId, type: 'event_graph' } } : {}),
        ...(Object.keys(bindings).length > 0 ? { bindings } : {}),
        renderMode: instantiateRenderMode,
      })
      setSuccess(`Created component instance ${instance.instance.recordId}.`)
      setSelectedInstanceId(instance.instance.recordId)
      setInstanceStale(null)
      setInstanceLatestVersion('')
      if (insertIntoTimeline && onAddEvent) {
        onAddEvent({
          eventId: newId('evt'),
          event_type: 'other',
          t_offset: 'PT0M',
          notes: `component-instance:${instance.instance.recordId}`,
          details: {
            labwareId: sourceLabwareId,
            wells: sourceSelectedWells,
            description: `Component instance ${instance.instance.recordId} from ${selectedComponentId}`,
          },
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to instantiate component')
    } finally {
      setBusy(false)
    }
  }

  async function handleExtractProtocol() {
    clearNotices()
    if (!eventGraphId) {
      setError('Save this event graph before extracting protocol.')
      return
    }
    setBusy(true)
    try {
      const saved = await apiClient.saveProtocolFromEventGraph(eventGraphId)
      setSuccess(`Created protocol ${saved.recordId} from ${eventGraphId}.`)
      setSelectedProtocolId(saved.recordId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract protocol')
    } finally {
      setBusy(false)
    }
  }

  async function handleBindProtocol() {
    clearNotices()
    if (!selectedProtocolId) {
      setError('Select a protocol first.')
      return
    }
    setBusy(true)
    try {
      const bound = await apiClient.bindProtocol(selectedProtocolId)
      setSuccess(`Created planned-run ${bound.plannedRunId} from ${selectedProtocolId}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bind protocol')
    } finally {
      setBusy(false)
    }
  }

  async function refreshInstanceStatus() {
    clearNotices()
    if (!selectedInstanceId) {
      setError('Select an instance id first (or instantiate one).')
      return
    }
    setBusy(true)
    try {
      const status = await apiClient.getComponentInstanceStatus(selectedInstanceId)
      setInstanceStale(status.status.stale)
      setInstanceLatestVersion(status.status.latestVersionRef?.id || '')
      setSuccess(`Instance ${selectedInstanceId} status refreshed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check instance status')
    } finally {
      setBusy(false)
    }
  }

  async function upgradeInstanceToLatest() {
    clearNotices()
    if (!selectedInstanceId) {
      setError('Select an instance id first.')
      return
    }
    setBusy(true)
    try {
      const upgraded = await apiClient.upgradeComponentInstance(selectedInstanceId)
      setSuccess(`Upgraded instance ${upgraded.instance.recordId} to latest component version.`)
      await refreshInstanceStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade instance')
    } finally {
      setBusy(false)
    }
  }

  async function suggestPromotions() {
    clearNotices()
    if (!eventGraphId) {
      setError('Save this event graph first.')
      return
    }
    setBusy(true)
    try {
      const response = await apiClient.suggestComponentsFromEventGraph(eventGraphId, 2)
      const mapped = response.suggestions.suggestions.map((s) => ({
        signature: s.signature,
        count: s.count,
        eventType: s.eventType,
        eventIds: s.eventIds,
        labwareIds: s.labwareIds,
      }))
      setComponentSuggestions(mapped)
      setSuccess(mapped.length > 0 ? `Found ${mapped.length} promotion suggestion(s).` : 'No repeated patterns found.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest component promotions')
    } finally {
      setBusy(false)
    }
  }

  async function promoteSuggestionToComponent(suggestion: {
    signature: string
    count: number
    eventType: string
    eventIds: string[]
    labwareIds: string[]
  }) {
    clearNotices()
    if (!eventGraphId) {
      setError('Save this event graph first.')
      return
    }
    setBusy(true)
    try {
      const created = await apiClient.createComponent({
        title: `${suggestion.eventType} reusable block`,
        description: `Auto-promoted from repeated pattern ${suggestion.signature} (x${suggestion.count})`,
        template: {
          source: {
            kind: 'event-graph-ref',
            eventGraphId,
            eventIds: suggestion.eventIds,
            labwareIds: suggestion.labwareIds,
          },
        },
        tags: ['graph_component', 'auto_promoted', suggestion.eventType],
      })
      setSelectedComponentId(created.component.recordId)
      setSuccess(`Promoted suggestion to component ${created.component.recordId}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote suggestion to component')
    } finally {
      setBusy(false)
    }
  }

  function addWholePlateEvent() {
    clearNotices()
    if (!sourceLabwareId || !onAddEvent) {
      setError('Select a source labware to add whole-plate events.')
      return
    }
    const duration = Number.parseFloat(wholePlateDurationMin)
    const temperature = Number.parseFloat(wholePlateTemperatureC)
    const o2 = Number.parseFloat(hypoxiaO2Pct)
    if (!Number.isFinite(duration) || duration <= 0) {
      setError('Duration must be a positive number.')
      return
    }

    if (wholePlateAction === 'incubate') {
      onAddEvent({
        eventId: newId('evt'),
        event_type: 'incubate',
        t_offset: 'PT0M',
        details: {
          labwareId: sourceLabwareId,
          duration: `PT${Math.round(duration)}M`,
          ...(Number.isFinite(temperature) ? { temperature: { value: temperature, unit: 'C' } } : {}),
        },
        notes: 'Whole-plate incubation',
      })
      setSuccess('Added whole-plate incubation event.')
      return
    }
    if (wholePlateAction === 'sonicate') {
      onAddEvent({
        eventId: newId('evt'),
        event_type: 'other',
        t_offset: 'PT0M',
        details: {
          labwareId: sourceLabwareId,
          description: `Whole-plate sonication for ${Math.round(duration)} min`,
        },
        notes: 'Whole-plate sonication',
      })
      setSuccess('Added whole-plate sonication event.')
      return
    }
    onAddEvent({
      eventId: newId('evt'),
      event_type: 'incubate',
      t_offset: 'PT0M',
      details: {
        labwareId: sourceLabwareId,
        duration: `PT${Math.round(duration)}M`,
        ...(Number.isFinite(temperature) ? { temperature: { value: temperature, unit: 'C' } } : {}),
      },
      notes: `Hypoxic incubation (O2 ${Number.isFinite(o2) ? o2 : 2}%)`,
    })
    setSuccess('Added whole-plate hypoxic incubation event.')
  }

  return (
    <div className="reuse-authoring-panel">
      <div className="reuse-tabs">
        <button className={tab === 'promote' ? 'active' : ''} onClick={() => setTab('promote')}>Promote Context</button>
        <button className={tab === 'layout' ? 'active' : ''} onClick={() => setTab('layout')}>Layout Template</button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>Library Bundle</button>
        <button className={tab === 'components' ? 'active' : ''} onClick={() => setTab('components')}>Components + Protocols</button>
      </div>

      {tab === 'promote' && (
        <div className="reuse-section">
          <div className="row">
            <label>Output Kind</label>
            <select value={promoteKind} onChange={(e) => setPromoteKind(e.target.value as OutputKind)} disabled={busy}>
              <option value="material-lot">Material Lot</option>
              <option value="plate-snapshot">Plate Snapshot</option>
              <option value="material-output">Reusable Material Output</option>
            </select>
          </div>
          <div className="row">
            <label>Title (optional)</label>
            <input value={promoteTitle} onChange={(e) => setPromoteTitle(e.target.value)} disabled={busy} placeholder="Derived artifact title" />
          </div>
          {promoteKind === 'material-output' && (
            <div className="row">
              <label>Material Output Type</label>
              <select value={materialOutputMode} onChange={(e) => setMaterialOutputMode(e.target.value as 'prepared-material' | 'biological-material' | 'derived-material')} disabled={busy}>
                <option value="prepared-material">Prepared Material</option>
                <option value="biological-material">Biological Material</option>
                <option value="derived-material">Derived Material</option>
              </select>
            </div>
          )}
          {(promoteKind === 'material-lot' || promoteKind === 'material-output') && (
            <div className="row">
              <RefPicker value={promoteMaterialRef} onChange={setPromoteMaterialRef} olsOntologies={['chebi', 'cl', 'go']} label="Material Ref" placeholder="Search material ontology terms..." disabled={busy} />
            </div>
          )}
          <button onClick={handlePromoteContext} disabled={busy || selectedWells.length === 0}>
            {busy ? 'Working...' : `Create Contexts + Promote (${selectedWells.length} wells)`}
          </button>
        </div>
      )}

      {tab === 'layout' && (
        <div className="reuse-section">
          <div className="row"><label>Template Title</label><input value={layoutTitle} onChange={(e) => setLayoutTitle(e.target.value)} disabled={busy} placeholder="ROS positive controls layout" /></div>
          <div className="row two">
            <div><label>Record ID (optional)</label><input value={layoutRecordId} onChange={(e) => setLayoutRecordId(e.target.value)} disabled={busy} placeholder="PLT-..." /></div>
            <div><label>Version</label><input value={layoutVersion} onChange={(e) => setLayoutVersion(e.target.value)} disabled={busy} /></div>
          </div>
          <div className="row two">
            <div>
              <label>Input Source</label>
              <select value={layoutInputSource} onChange={(e) => setLayoutInputSource(e.target.value as 'material_ref' | 'context_ref' | 'binding_slot')} disabled={busy}>
                <option value="material_ref">Material Ref</option>
                <option value="context_ref">Context Ref</option>
                <option value="binding_slot">Binding Slot</option>
              </select>
            </div>
            <div>
              <label>Role</label>
              <select value={layoutRole} onChange={(e) => setLayoutRole(e.target.value)} disabled={busy}>
                <option value="sample">Sample</option>
                <option value="positive_control">Positive Control</option>
                <option value="negative_control">Negative Control</option>
                <option value="vehicle_control">Vehicle Control</option>
                <option value="blank">Blank</option>
                <option value="treatment">Treatment</option>
              </select>
            </div>
          </div>
          {layoutInputSource === 'material_ref' && <RefPicker value={layoutMaterialRef} onChange={setLayoutMaterialRef} olsOntologies={['chebi', 'cl', 'go']} label="Material Ref" placeholder="Search material ontology terms..." disabled={busy} />}
          {layoutInputSource === 'context_ref' && <div className="row"><label>Context ID</label><input value={layoutContextId} onChange={(e) => setLayoutContextId(e.target.value)} disabled={busy} placeholder="CTX-..." /></div>}
          {layoutInputSource === 'binding_slot' && <div className="row"><label>Binding Slot</label><input value={layoutBindingSlot} onChange={(e) => setLayoutBindingSlot(e.target.value)} disabled={busy} placeholder="compound_slot" /></div>}
          <button onClick={handleCreateLayoutTemplate} disabled={busy || !sourceLabwareId || sourceSelectedWells.length === 0}>{busy ? 'Working...' : `Create Template (${sourceSelectedWells.length} source wells)`}</button>
        </div>
      )}

      {tab === 'library' && (
        <div className="reuse-section">
          <div className="row"><label>Library Title</label><input value={libraryTitle} onChange={(e) => setLibraryTitle(e.target.value)} disabled={busy} placeholder="Vendor X cancer panel" /></div>
          <div className="row two">
            <div><label>Record ID (optional)</label><input value={libraryRecordId} onChange={(e) => setLibraryRecordId(e.target.value)} disabled={busy} placeholder="LIB-..." /></div>
            <div><label>Version</label><input value={libraryVersion} onChange={(e) => setLibraryVersion(e.target.value)} disabled={busy} /></div>
          </div>
          <div className="row two">
            <div><label>Vendor</label><input value={libraryVendor} onChange={(e) => setLibraryVendor(e.target.value)} disabled={busy} placeholder="Selleck" /></div>
            <div><label>Catalog #</label><input value={libraryCatalog} onChange={(e) => setLibraryCatalog(e.target.value)} disabled={busy} placeholder="L3000" /></div>
          </div>

          <div className="entry-actions">
            <button onClick={seedLibraryEntriesFromSelection} disabled={busy}>Seed From Selected Wells</button>
            <button onClick={() => setLibraryEntries(prev => [...prev, { entry_id: `entry_${prev.length + 1}`, ref: null }])} disabled={busy}>Add Entry</button>
          </div>

          <div className="entries">
            {libraryEntries.map((entry, idx) => (
              <div key={`${entry.entry_id}-${idx}`} className="entry-card">
                <div className="row two">
                  <div>
                    <label>Entry ID</label>
                    <input value={entry.entry_id} onChange={(e) => { const next = [...libraryEntries]; next[idx] = { ...next[idx], entry_id: e.target.value }; setLibraryEntries(next) }} disabled={busy} />
                  </div>
                  <div>
                    <label>Position Hint</label>
                    <input value={entry.position_hint || ''} onChange={(e) => { const next = [...libraryEntries]; next[idx] = { ...next[idx], position_hint: e.target.value }; setLibraryEntries(next) }} disabled={busy} placeholder="A1" />
                  </div>
                </div>
                <RefPicker value={entry.ref} onChange={(ref) => { const next = [...libraryEntries]; next[idx] = { ...next[idx], ref }; setLibraryEntries(next) }} olsOntologies={['chebi', 'cl', 'go']} label="Entry Ref" placeholder="Search ontology term or choose local ref" disabled={busy} />
              </div>
            ))}
          </div>

          <button onClick={handleCreateLibraryBundle} disabled={busy || libraryEntries.length === 0}>{busy ? 'Working...' : `Create Library Bundle (${libraryEntries.length} entries)`}</button>
        </div>
      )}

      {tab === 'components' && (
        <div className="reuse-section">
          <h5>Component Graph Authoring</h5>
          <div className="row"><label>Component Title</label><input value={componentTitle} onChange={(e) => setComponentTitle(e.target.value)} disabled={busy} placeholder="Whole plate hypoxia + readout" /></div>
          <div className="row"><label>Description</label><input value={componentDescription} onChange={(e) => setComponentDescription(e.target.value)} disabled={busy} placeholder="Reusable subgraph component" /></div>
          <div className="row"><label>Record ID (optional)</label><input value={componentRecordId} onChange={(e) => setComponentRecordId(e.target.value)} disabled={busy} placeholder="GCP-..." /></div>
          <button onClick={handleCreateComponentFromSelection} disabled={busy}>{busy ? 'Working...' : 'Create Component From Selection'}</button>

          <div className="row two">
            <div>
              <label>Select Component</label>
              <select value={selectedComponentId} onChange={(e) => setSelectedComponentId(e.target.value)} disabled={busy}>
                <option value="">-- choose component --</option>
                {savedComponents.map((comp) => <option key={comp.recordId} value={comp.recordId}>{comp.recordId} · {String((comp.payload as Record<string, unknown>).title || comp.recordId)}</option>)}
              </select>
            </div>
            <div>
              <label>Render Mode</label>
              <select value={instantiateRenderMode} onChange={(e) => setInstantiateRenderMode(e.target.value as 'collapsed' | 'expanded')} disabled={busy}>
                <option value="collapsed">Collapsed</option>
                <option value="expanded">Expanded</option>
              </select>
            </div>
          </div>
          <div className="row two">
            <div><label>Labware Role</label><input value={instanceLabwareRole} onChange={(e) => setInstanceLabwareRole(e.target.value)} disabled={busy} /></div>
            <div><label>Labware Ref ID</label><input value={instanceLabwareRefId} onChange={(e) => setInstanceLabwareRefId(e.target.value)} disabled={busy} placeholder="LWI-... or labware id" /></div>
          </div>
          <div className="row two">
            <div><label>Material Role</label><input value={instanceMaterialRole} onChange={(e) => setInstanceMaterialRole(e.target.value)} disabled={busy} /></div>
            <div><label>Material Ref ID</label><input value={instanceMaterialRefId} onChange={(e) => setInstanceMaterialRefId(e.target.value)} disabled={busy} placeholder="MAT-..." /></div>
          </div>
          <div className="row two">
            <div><label>Instrument Role</label><input value={instanceInstrumentRole} onChange={(e) => setInstanceInstrumentRole(e.target.value)} disabled={busy} /></div>
            <div><label>Instrument Ref ID</label><input value={instanceInstrumentRefId} onChange={(e) => setInstanceInstrumentRefId(e.target.value)} disabled={busy} placeholder="INS-..." /></div>
          </div>
          <div className="row two">
            <div><label>Parameter Name</label><input value={instanceParamName} onChange={(e) => setInstanceParamName(e.target.value)} disabled={busy} placeholder="incubation_min" /></div>
            <div><label>Parameter Value</label><input value={instanceParamValue} onChange={(e) => setInstanceParamValue(e.target.value)} disabled={busy} placeholder="60" /></div>
          </div>
          <div className="entry-actions">
            <button onClick={handlePublishSelectedComponent} disabled={busy || !selectedComponentId}>Publish Component</button>
            <button onClick={() => handleInstantiateSelectedComponent(false)} disabled={busy || !selectedComponentId}>Instantiate Only</button>
            <button onClick={() => handleInstantiateSelectedComponent(true)} disabled={busy || !selectedComponentId}>Instantiate + Insert Timeline Event</button>
          </div>
          <div className="row two">
            <div><label>Instance ID</label><input value={selectedInstanceId} onChange={(e) => setSelectedInstanceId(e.target.value)} disabled={busy} placeholder="GCI-..." /></div>
            <div><label>Latest Version</label><input value={instanceLatestVersion} readOnly placeholder="GCV-..." /></div>
          </div>
          <div className="entry-actions">
            <button onClick={refreshInstanceStatus} disabled={busy || !selectedInstanceId}>Refresh Instance Status</button>
            <button onClick={upgradeInstanceToLatest} disabled={busy || !selectedInstanceId}>Upgrade Instance</button>
          </div>
          {instanceStale !== null && (
            <div className={`notice ${instanceStale ? 'error' : 'success'}`}>
              Instance staleness: {instanceStale ? 'STALE (upgrade recommended)' : 'up to date'}
            </div>
          )}

          <h5>Protocol Library</h5>
          <div className="entry-actions">
            <button onClick={handleExtractProtocol} disabled={busy || !eventGraphId}>Extract Protocol From Event Graph</button>
            <button onClick={suggestPromotions} disabled={busy || !eventGraphId}>Suggest Repeated Patterns</button>
          </div>
          <div className="row">
            <label>Select Protocol</label>
            <select value={selectedProtocolId} onChange={(e) => setSelectedProtocolId(e.target.value)} disabled={busy}>
              <option value="">-- choose protocol --</option>
              {savedProtocols.map((protocol) => <option key={protocol.recordId} value={protocol.recordId}>{protocol.recordId} · {String((protocol.payload as Record<string, unknown>).title || protocol.recordId)}</option>)}
            </select>
          </div>
          <button onClick={handleBindProtocol} disabled={busy || !selectedProtocolId}>Create Planned-Run From Protocol</button>
          {componentSuggestions.length > 0 && (
            <div className="binding-refs">
              {componentSuggestions.map((s) => (
                <div key={s.signature}>
                  Suggest: {s.eventType} × {s.count} ({s.signature}){' '}
                  <button type="button" onClick={() => promoteSuggestionToComponent(s)} disabled={busy}>
                    Promote
                  </button>
                </div>
              ))}
            </div>
          )}

          <h5>Whole-Plate Event Macros</h5>
          <div className="row two">
            <div>
              <label>Action</label>
              <select value={wholePlateAction} onChange={(e) => setWholePlateAction(e.target.value as WholePlateAction)} disabled={busy}>
                <option value="incubate">Incubation</option>
                <option value="sonicate">Sonication</option>
                <option value="hypoxic_incubation">Hypoxic Incubation</option>
              </select>
            </div>
            <div>
              <label>Duration (min)</label>
              <input value={wholePlateDurationMin} onChange={(e) => setWholePlateDurationMin(e.target.value)} disabled={busy} />
            </div>
          </div>
          <div className="row two">
            <div><label>Temperature (C)</label><input value={wholePlateTemperatureC} onChange={(e) => setWholePlateTemperatureC(e.target.value)} disabled={busy} /></div>
            <div><label>Hypoxia O2 (%)</label><input value={hypoxiaO2Pct} onChange={(e) => setHypoxiaO2Pct(e.target.value)} disabled={busy || wholePlateAction !== 'hypoxic_incubation'} /></div>
          </div>
          <button onClick={addWholePlateEvent} disabled={busy || !onAddEvent}>Add Whole-Plate Event to Timeline</button>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      <div className="saved-assets">
        <div className="saved-assets__header">
          <h5>Saved Assets Browser</h5>
          <span>{assetsLoading ? 'Loading...' : `${savedLayouts.length} layouts, ${savedLibraries.length} libraries, ${savedSnapshots.length} snapshots`}</span>
        </div>

        <div className="saved-assets__grid">
          <div className="asset-col">
            <h6>Layout Templates</h6>
            <ul>
              {savedLayouts.map((item) => (
                <li key={item.id}><button type="button" onClick={() => setBoundLayoutRef(toRecordRef(item.id, 'plate-layout-template', item.label))}>{item.label}</button></li>
              ))}
            </ul>
          </div>
          <div className="asset-col">
            <h6>Library Bundles</h6>
            <ul>
              {savedLibraries.map((item) => (
                <li key={item.id}><button type="button" onClick={() => setBoundLibraryRef(toRecordRef(item.id, 'library-bundle', item.label))}>{item.label}</button></li>
              ))}
            </ul>
          </div>
          <div className="asset-col">
            <h6>Plate Snapshots</h6>
            <ul>
              {savedSnapshots.map((item) => (
                <li key={item.id}><span>{item.label}</span></li>
              ))}
            </ul>
          </div>
          <div className="asset-col">
            <h6>Graph Components</h6>
            <ul>
              {savedComponents.map((item) => (
                <li key={item.recordId}><button type="button" onClick={() => setSelectedComponentId(item.recordId)}>{String((item.payload as Record<string, unknown>).title || item.recordId)}</button></li>
              ))}
            </ul>
          </div>
          <div className="asset-col">
            <h6>Protocols</h6>
            <ul>
              {savedProtocols.map((item) => (
                <li key={item.recordId}><button type="button" onClick={() => setSelectedProtocolId(item.recordId)}>{String((item.payload as Record<string, unknown>).title || item.recordId)}</button></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="binding-box">
          <h6>Active Binding Draft</h6>
          <div className="row"><label>Binding Title (optional)</label><input value={bindingTitle} onChange={(e) => setBindingTitle(e.target.value)} placeholder="Run binding draft" disabled={busy} /></div>
          <div className="binding-refs">
            <div>Layout: {boundLayoutRef ? (boundLayoutRef.label || boundLayoutRef.id) : 'none selected'}</div>
            <div>Library: {boundLibraryRef ? (boundLibraryRef.label || boundLibraryRef.id) : 'none selected'}</div>
            <div>Source: {eventGraphId || 'save event graph first'}</div>
          </div>
          <button onClick={handleCreateBindingPlan} disabled={busy || !eventGraphId}>{busy ? 'Working...' : 'Create Planned-Run Binding'}</button>
        </div>
      </div>

      <style>{`
        .reuse-authoring-panel { display: flex; flex-direction: column; gap: 0.75rem; }
        .reuse-tabs { display: flex; gap: 0.35rem; flex-wrap: wrap; }
        .reuse-tabs button { border: 1px solid #ced4da; background: white; color: #495057; border-radius: 6px; padding: 0.35rem 0.6rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
        .reuse-tabs button.active { background: #1971c2; border-color: #1971c2; color: white; }
        .reuse-section { display: flex; flex-direction: column; gap: 0.65rem; }
        .row { display: flex; flex-direction: column; gap: 0.25rem; }
        .row.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
        .row label { font-size: 0.78rem; font-weight: 600; color: #495057; }
        .row input, .row select { border: 1px solid #ced4da; border-radius: 6px; padding: 0.42rem 0.55rem; font-size: 0.83rem; }
        .reuse-section > button, .entry-actions button, .binding-box button {
          border: 1px solid #1971c2;
          background: #1971c2;
          color: white;
          border-radius: 6px;
          padding: 0.45rem 0.7rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .reuse-section > button:disabled, .entry-actions button:disabled, .binding-box button:disabled { opacity: 0.6; cursor: not-allowed; }
        .entry-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .entry-actions button:last-child { background: #495057; border-color: #495057; }
        .entries { display: flex; flex-direction: column; gap: 0.55rem; }
        .entry-card { border: 1px solid #dee2e6; border-radius: 8px; padding: 0.55rem; background: #f8f9fa; }
        .notice { border-radius: 6px; padding: 0.45rem 0.6rem; font-size: 0.8rem; }
        .notice.error { background: #fff5f5; border: 1px solid #ffc9c9; color: #c92a2a; }
        .notice.success { background: #ebfbee; border: 1px solid #b2f2bb; color: #2b8a3e; }
        .saved-assets { border-top: 1px solid #dee2e6; padding-top: 0.65rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .saved-assets__header { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
        .saved-assets__header h5 { margin: 0; font-size: 0.83rem; color: #364fc7; }
        .saved-assets__header span { font-size: 0.73rem; color: #868e96; }
        .saved-assets__grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.55rem; }
        .asset-col { border: 1px solid #dee2e6; border-radius: 8px; background: white; padding: 0.45rem; min-height: 130px; }
        .asset-col h6 { margin: 0 0 0.3rem; font-size: 0.75rem; color: #495057; }
        .asset-col ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; max-height: 170px; overflow: auto; }
        .asset-col li { font-size: 0.74rem; color: #495057; }
        .asset-col li button { width: 100%; text-align: left; border: 1px solid #ced4da; background: #f8f9fa; border-radius: 6px; padding: 0.25rem 0.35rem; cursor: pointer; font-size: 0.74rem; }
        .asset-col li button:hover { background: #e7f5ff; border-color: #74c0fc; }
        .binding-box { border: 1px solid #dee2e6; background: #f8f9fa; border-radius: 8px; padding: 0.55rem; display: flex; flex-direction: column; gap: 0.45rem; }
        .binding-box h6 { margin: 0; font-size: 0.76rem; color: #495057; }
        .binding-refs { font-size: 0.75rem; color: #495057; display: flex; flex-direction: column; gap: 0.15rem; }
        @media (max-width: 900px) {
          .row.two { grid-template-columns: 1fr; }
          .saved-assets__grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
