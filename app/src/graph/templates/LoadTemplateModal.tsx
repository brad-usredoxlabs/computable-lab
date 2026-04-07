import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, type TemplateLabwareBinding, type TemplateSearchResult, type LibrarySearchResult } from '../../shared/api/client'
import { createRunFromTemplate, getStudyTree, type StudyTreeResponse, type TemplateInputResolution } from '../../shared/api/treeClient'
import { usePlatformRegistry } from '../../shared/hooks/usePlatformRegistry'
import { defaultVariantForPlatform } from '../../shared/lib/platformRegistry'

interface LoadTemplateModalProps {
  isOpen: boolean
  onClose: () => void
  onLoadTemplate: (templateId: string, bindings: TemplateLabwareBinding[]) => Promise<void>
}

type BindingDraft = {
  kind: 'none' | 'plate-snapshot' | 'protocol-template'
  snapshotId?: string
  templateId?: string
  outputId?: string
  resolvedSnapshotId?: string
}

function flattenExperiments(studies: StudyTreeResponse['studies']) {
  return studies.flatMap((study) =>
    study.experiments.map((experiment) => ({
      studyId: study.recordId,
      studyTitle: study.title,
      experimentId: experiment.recordId,
      experimentTitle: experiment.title,
    }))
  )
}

export function LoadTemplateModal({ isOpen, onClose, onLoadTemplate }: LoadTemplateModalProps) {
  const navigate = useNavigate()
  const { platforms } = usePlatformRegistry()
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [deckVariantFilter, setDeckVariantFilter] = useState('')
  const [experimentTypeFilter, setExperimentTypeFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [semanticFilter, setSemanticFilter] = useState('')
  const [templates, setTemplates] = useState<TemplateSearchResult[]>([])
  const [snapshots, setSnapshots] = useState<LibrarySearchResult[]>([])
  const [studies, setStudies] = useState<StudyTreeResponse['studies']>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [bindingDrafts, setBindingDrafts] = useState<Record<string, BindingDraft>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runTitle, setRunTitle] = useState('')
  const [selectedExperimentId, setSelectedExperimentId] = useState('')

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setBusy(true)
    setError(null)
    void Promise.all([
      apiClient.searchTemplates({
        q: query,
        ...(platformFilter ? { platform: platformFilter } : {}),
        ...(deckVariantFilter ? { deckVariant: deckVariantFilter } : {}),
        ...(experimentTypeFilter ? { experimentType: experimentTypeFilter } : {}),
        ...(materialFilter ? { material: materialFilter } : {}),
        ...(semanticFilter ? { semantic: semanticFilter } : {}),
        limit: 100,
      }),
      apiClient.searchLibrary({ types: ['plate_snapshot'], limit: 200 }),
      getStudyTree(),
    ]).then(([templateResponse, snapshotResponse, tree]) => {
      if (!active) return
      setTemplates(templateResponse.items || [])
      setSnapshots(snapshotResponse.results || [])
      setStudies(tree.studies || [])
      const nextSelected = templateResponse.items?.[0]?.templateId || ''
      setSelectedTemplateId((prev) => (prev && templateResponse.items.some((item) => item.templateId === prev) ? prev : nextSelected))
      if (!selectedExperimentId) {
        const firstExperiment = flattenExperiments(tree.studies || [])[0]
        if (firstExperiment?.experimentId) setSelectedExperimentId(firstExperiment.experimentId)
      }
    }).catch((err) => {
      if (!active) return
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    }).finally(() => {
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [deckVariantFilter, experimentTypeFilter, isOpen, materialFilter, platformFilter, query, semanticFilter])

  useEffect(() => {
    if (!isOpen) return
    setBindingDrafts({})
    setRunTitle('')
  }, [selectedTemplateId, isOpen])

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.templateId === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  )

  const experiments = useMemo(() => flattenExperiments(studies), [studies])
  const platformOptions = useMemo(
    () => Array.from(new Set(templates.map((item) => item.deck?.platform).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
    [templates]
  )
  const deckVariantOptions = useMemo(
    () => Array.from(new Set(templates.map((item) => item.deck?.variant).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
    [templates]
  )
  const experimentTypeOptions = useMemo(
    () => Array.from(new Set(templates.flatMap((item) => item.experimentTypes))).sort((a, b) => a.localeCompare(b)),
    [templates]
  )

  const bindings = useMemo(() => {
    if (!selectedTemplate) return [] as TemplateLabwareBinding[]
    const next: TemplateLabwareBinding[] = []
    for (const labware of selectedTemplate.bindableLabwares) {
      const draft = bindingDrafts[labware.labwareId]
      if (!draft || draft.kind === 'none') continue
      if (draft.kind === 'plate-snapshot' && draft.snapshotId) {
        next.push({ templateLabwareId: labware.labwareId, kind: 'plate-snapshot', snapshotId: draft.snapshotId })
        continue
      }
      if (draft.kind === 'protocol-template' && draft.templateId) {
        next.push({
          templateLabwareId: labware.labwareId,
          kind: 'protocol-template',
          templateId: draft.templateId,
          ...(draft.outputId ? { outputId: draft.outputId } : {}),
          ...(draft.resolvedSnapshotId ? { resolvedSnapshotId: draft.resolvedSnapshotId } : {}),
        })
      }
    }
    return next
  }, [bindingDrafts, selectedTemplate])

  const inputResolutions = useMemo(() => {
    if (!selectedTemplate) return [] as TemplateInputResolution[]
    return selectedTemplate.bindableLabwares.reduce<TemplateInputResolution[]>((acc, labware) => {
      const draft = bindingDrafts[labware.labwareId]
      if (!draft || draft.kind === 'none') return acc
      if (draft.kind === 'plate-snapshot' && draft.snapshotId) {
        acc.push({
          templateLabwareId: labware.labwareId,
          slotLabel: labware.name,
          kind: 'existing-snapshot' as const,
          status: 'resolved' as const,
          snapshotId: draft.snapshotId,
        })
        return acc
      }
      if (draft.kind === 'protocol-template' && draft.templateId) {
        acc.push({
          templateLabwareId: labware.labwareId,
          slotLabel: labware.name,
          kind: 'upstream-run' as const,
          status: draft.resolvedSnapshotId ? 'resolved' as const : 'planned' as const,
          upstreamTemplateId: draft.templateId,
          ...(draft.outputId ? { upstreamOutputId: draft.outputId } : {}),
          ...(draft.resolvedSnapshotId ? { producedSnapshotId: draft.resolvedSnapshotId } : {}),
        })
        return acc
      }
      return acc
    }, [])
  }, [bindingDrafts, selectedTemplate])

  const setBindingKind = (labwareId: string, kind: BindingDraft['kind']) => {
    setBindingDrafts((prev) => ({
      ...prev,
      [labwareId]: { kind },
    }))
  }

  const setBindingValue = (labwareId: string, updates: Partial<BindingDraft>) => {
    setBindingDrafts((prev) => ({
      ...prev,
      [labwareId]: {
        ...prev[labwareId],
        ...updates,
      },
    }))
  }

  const handleLoad = async () => {
    if (!selectedTemplate) return
    setBusy(true)
    setError(null)
    try {
      await onLoadTemplate(selectedTemplate.templateId, bindings)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateRun = async () => {
    if (!selectedTemplate) return
    const experiment = experiments.find((item) => item.experimentId === selectedExperimentId)
    if (!experiment) {
      setError('Select an experiment before creating the run.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const title = runTitle.trim() || `${selectedTemplate.title} Run`
      const platform = selectedTemplate.deck?.platform || 'manual'
      const deckVariant = selectedTemplate.deck?.variant || defaultVariantForPlatform(platforms, platform) || 'manual'
      const attached = await createRunFromTemplate({
        experimentId: experiment.experimentId,
        studyId: experiment.studyId,
        title,
        shortSlug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30),
        templateId: selectedTemplate.templateId,
        vocabId: 'liquid-handling/v1',
        platform,
        deckVariant,
        inputResolutions,
      })
      onClose()
      navigate(`/labware-editor?id=${encodeURIComponent(attached.methodEventGraphId)}&runId=${encodeURIComponent(attached.runId)}&planning=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run from template')
    } finally {
      setBusy(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="template-modal-backdrop" onClick={onClose}>
      <div className="template-modal template-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Load Template</h3>
        <p>Load a saved template into the editor, or instantiate it into a new run.</p>
        <label>
          Search
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates, materials, or semantic terms" autoFocus />
        </label>
        <div className="template-filter-row">
          <label>
            Platform
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
              <option value="">All platforms</option>
              {platformOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Deck Variant
            <select value={deckVariantFilter} onChange={(e) => setDeckVariantFilter(e.target.value)}>
              <option value="">All variants</option>
              {deckVariantOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Experiment Type
            <select value={experimentTypeFilter} onChange={(e) => setExperimentTypeFilter(e.target.value)}>
              <option value="">All experiment types</option>
              {experimentTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="template-filter-row">
          <label>
            Material
            <input value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} placeholder="e.g. rotenone" />
          </label>
          <label>
            Semantic
            <input value={semanticFilter} onChange={(e) => setSemanticFilter(e.target.value)} placeholder="e.g. positive control far red" />
          </label>
        </div>
        {error && <div className="template-modal-error">{error}</div>}
        <div className="template-picker-grid">
          <div className="template-picker-list">
            {busy && templates.length === 0 ? <div className="template-picker-empty">Loading templates...</div> : null}
            {!busy && templates.length === 0 ? <div className="template-picker-empty">No templates found.</div> : null}
            {templates.map((item) => (
              <button
                key={item.templateId}
                type="button"
                className={`template-picker-item ${selectedTemplateId === item.templateId ? 'active' : ''}`}
                onClick={() => setSelectedTemplateId(item.templateId)}
              >
                <div className="template-picker-item__title">{item.title}</div>
                <div className="template-picker-item__meta">
                  {item.deck?.platform || 'manual'}
                  {item.deck?.variant ? ` / ${item.deck.variant}` : ''}
                  {item.materials.length ? ` · ${item.materials.slice(0, 2).join(', ')}` : ''}
                </div>
              </button>
            ))}
          </div>
          <div className="template-picker-detail">
            {selectedTemplate ? (
              <>
                <div className="template-picker-detail__header">
                  <strong>{selectedTemplate.title}</strong>
                  <div className="template-picker-detail__meta">
                    {selectedTemplate.deck?.platform || 'manual'}
                    {selectedTemplate.deck?.variant ? ` / ${selectedTemplate.deck.variant}` : ''}
                    {selectedTemplate.version ? ` · ${selectedTemplate.version}` : ''}
                    {selectedTemplate.experimentTypes.length ? ` · ${selectedTemplate.experimentTypes.join(', ')}` : ''}
                  </div>
                  {selectedTemplate.description ? <p>{selectedTemplate.description}</p> : null}
                </div>
                {selectedTemplate.outputs.length > 0 && (
                  <div className="template-picker-detail__block">
                    <div className="template-picker-detail__label">Declared Outputs</div>
                    <div>{selectedTemplate.outputs.map((output) => output.label).join(', ')}</div>
                  </div>
                )}
                {selectedTemplate.materials.length > 0 && (
                  <div className="template-picker-detail__block">
                    <div className="template-picker-detail__label">Materials</div>
                    <div>{selectedTemplate.materials.join(', ')}</div>
                  </div>
                )}
                {selectedTemplate.semanticKeywords.length > 0 && (
                  <div className="template-picker-detail__block">
                    <div className="template-picker-detail__label">Semantic Context</div>
                    <div>{selectedTemplate.semanticKeywords.slice(0, 6).join(', ')}</div>
                  </div>
                )}
                {selectedTemplate.bindableLabwares.length > 0 && (
                  <div className="template-picker-detail__block">
                    <div className="template-picker-detail__label">Protocol Inputs</div>
                    <div className="template-binding-list">
                      {selectedTemplate.bindableLabwares.map((labware) => {
                        const draft = bindingDrafts[labware.labwareId] || { kind: 'none' as const }
                        const upstreamTemplate = draft.templateId
                          ? templates.find((item) => item.templateId === draft.templateId) || null
                          : null
                        return (
                          <div key={labware.labwareId} className="template-binding-row">
                            <div className="template-binding-row__heading">
                              <strong>{labware.name}</strong>
                              <span>{labware.labwareType}</span>
                            </div>
                            <select value={draft.kind} onChange={(e) => setBindingKind(labware.labwareId, e.target.value as BindingDraft['kind'])}>
                              <option value="none">No protocol input</option>
                              <option value="plate-snapshot">Use existing prepared plate</option>
                              <option value="protocol-template">Create plate from another protocol</option>
                            </select>
                            {draft.kind === 'plate-snapshot' && (
                              <select value={draft.snapshotId || ''} onChange={(e) => setBindingValue(labware.labwareId, { snapshotId: e.target.value })}>
                                <option value="">Select prepared plate</option>
                                {snapshots.map((snapshot) => (
                                  <option key={snapshot.id} value={snapshot.id}>{snapshot.label}</option>
                                ))}
                              </select>
                            )}
                            {draft.kind === 'protocol-template' && (
                              <div className="template-binding-row__stack">
                                <select value={draft.templateId || ''} onChange={(e) => setBindingValue(labware.labwareId, { templateId: e.target.value, outputId: '', resolvedSnapshotId: '' })}>
                                  <option value="">Select source protocol</option>
                                  {templates.filter((item) => item.templateId !== selectedTemplate.templateId).map((item) => (
                                    <option key={item.templateId} value={item.templateId}>{item.title}</option>
                                  ))}
                                </select>
                                <select value={draft.outputId || ''} onChange={(e) => setBindingValue(labware.labwareId, { outputId: e.target.value })} disabled={!upstreamTemplate || upstreamTemplate.outputs.length === 0}>
                                  <option value="">Select produced plate</option>
                                  {upstreamTemplate?.outputs.map((output) => (
                                    <option key={output.outputId} value={output.outputId}>{output.label}</option>
                                  ))}
                                </select>
                                <select value={draft.resolvedSnapshotId || ''} onChange={(e) => setBindingValue(labware.labwareId, { resolvedSnapshotId: e.target.value })}>
                                  <option value="">No prepared plate yet</option>
                                  {snapshots.map((snapshot) => (
                                    <option key={snapshot.id} value={snapshot.id}>{snapshot.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="template-picker-detail__block">
                  <div className="template-picker-detail__label">Create Run From Template</div>
                  <label>
                    Experiment
                    <select value={selectedExperimentId} onChange={(e) => setSelectedExperimentId(e.target.value)}>
                      <option value="">Select experiment</option>
                      {experiments.map((experiment) => (
                        <option key={experiment.experimentId} value={experiment.experimentId}>
                          {experiment.studyTitle} / {experiment.experimentTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Run Title (optional)
                    <input value={runTitle} onChange={(e) => setRunTitle(e.target.value)} placeholder={`${selectedTemplate.title} Run`} />
                  </label>
                </div>
              </>
            ) : (
              <div className="template-picker-empty">Select a template.</div>
            )}
          </div>
        </div>
        <div className="template-modal-actions">
          <button className="cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="save" onClick={() => void handleCreateRun()} disabled={busy || !selectedTemplate}>Create Run From Template</button>
          <button className="save" onClick={() => void handleLoad()} disabled={busy || !selectedTemplate}>Load Template</button>
        </div>
      </div>
    </div>
  )
}
