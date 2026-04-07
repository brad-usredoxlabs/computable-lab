/**
 * RecordBrowser - Simple GitHub-style file browser
 * Left: Collapsible file tree
 * Right: Record preview
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { attachTemplateToRun, getStudyTree, getInbox, getRecordsForRun, searchRecords } from '../shared/api/treeClient'
import { apiClient } from '../shared/api/client'
import { SectionedForm } from '../shared/forms/SectionedForm'
import { usePlatformRegistry } from '../shared/hooks/usePlatformRegistry'
import { allowedPlatformsForVocab, defaultVariantForPlatform, platformLabel, type MethodVocabId } from '../shared/lib/platformRegistry'
import type { StudyTreeNode, IndexEntry } from '../types/tree'
import type { UISpec } from '../types/uiSpec'
import type { JsonSchema } from '../types/kernel'
import type { RecordEnvelope } from '../types/kernel'

// Helper: Generate URL-safe slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

// Helper: Generate next numeric ID
function generateNumericId(existingIds: string[], prefix: string): string {
  const nums = existingIds
    .filter(id => id.startsWith(prefix))
    .map(id => {
      const match = id.match(new RegExp(`^${prefix}_(\\d+)`))
      return match ? parseInt(match[1]) : 0
    })
    .filter(n => !isNaN(n) && n > 0)
  
  const maxNum = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}_${String(maxNum + 1).padStart(4, '0')}`
}

export default function RecordBrowser() {
  const navigate = useNavigate()
  const { platforms } = usePlatformRegistry()
  
  // Data
  const [studies, setStudies] = useState<StudyTreeNode[]>([])
  const [inbox, setInbox] = useState<IndexEntry[]>([])
  const [runRecords, setRunRecords] = useState<Map<string, IndexEntry[]>>(new Map())
  
  // UI state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<IndexEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
  // UISpec for preview panel
  const [previewUiSpec, setPreviewUiSpec] = useState<UISpec | null>(null)
  const [previewSchema, setPreviewSchema] = useState<JsonSchema | null>(null)
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown> | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // UISpec for create modal
  const [createUiSpec, setCreateUiSpec] = useState<UISpec | null>(null)
  const [createSchema, setCreateSchema] = useState<JsonSchema | null>(null)
  const [loadingCreateSpec, setLoadingCreateSpec] = useState(false)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState<{
    type: 'study' | 'experiment' | 'run'
    parentStudyId?: string
    parentExperimentId?: string
  } | null>(null)
  const [createForm, setCreateForm] = useState<Record<string, unknown>>({ title: '' })
  const [isCreating, setIsCreating] = useState(false)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, unknown>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [methodModalOpen, setMethodModalOpen] = useState(false)
  const [methodWizardStep, setMethodWizardStep] = useState<1 | 2 | 3>(1)
  const [methodAttachMode, setMethodAttachMode] = useState<'attach' | 'replace'>('attach')
  const [methodTemplates, setMethodTemplates] = useState<RecordEnvelope[]>([])
  const [methodTemplatesBusy, setMethodTemplatesBusy] = useState(false)
  const [selectedMethodTemplateId, setSelectedMethodTemplateId] = useState('')
  const [methodAttachBusy, setMethodAttachBusy] = useState(false)
  const [methodAttachError, setMethodAttachError] = useState<string | null>(null)
  const [methodVocabId, setMethodVocabId] = useState<MethodVocabId>('liquid-handling/v1')
  const [methodPlatform, setMethodPlatform] = useState('manual')

  // Cancel editing when selection changes
  useEffect(() => {
    setIsEditing(false)
    setEditData({})
    setSaveError(null)
  }, [selected])

  // Refresh tree data
  const refreshTree = async () => {
    const [tree, inboxData] = await Promise.all([getStudyTree(), getInbox()])
    setStudies(tree.studies)
    setInbox(inboxData.records)
  }

  // Get all existing IDs for numeric ID generation
  const getAllExistingIds = (): string[] => {
    const ids: string[] = []
    for (const study of studies) {
      ids.push(study.recordId)
      for (const exp of study.experiments) {
        ids.push(exp.recordId)
        for (const run of exp.runs) {
          ids.push(run.recordId)
        }
      }
    }
    return ids
  }

  // Handle create record
  const handleCreate = async () => {
    if (!showCreateModal) return
    const title = (createForm.title as string || '').trim()
    if (!title) {
      alert('Title is required')
      return
    }

    const { type } = showCreateModal
    const studyId = createForm.studyId as string | undefined
    const experimentId = createForm.experimentId as string | undefined

    // Validate parent requirements
    if (type === 'experiment' && !studyId) {
      alert('Parent study is required')
      return
    }
    if (type === 'run' && (!studyId || !experimentId)) {
      alert('Parent study and experiment are required')
      return
    }

    setIsCreating(true)
    try {
      // Finalize the recordId and shortSlug from the title
      const prefix = type === 'study' ? 'STD' : type === 'experiment' ? 'EXP' : 'RUN'
      const numericId = generateNumericId(getAllExistingIds(), prefix)
      const slug = generateSlug(title)
      const recordId = `${numericId}__${slug}`

      const payload: Record<string, unknown> = {
        ...createForm,
        recordId,
        shortSlug: slug,
      }

      const schemaId = `https://computable-lab.com/schema/computable-lab/${type}.schema.yaml`
      await apiClient.createRecord(schemaId, payload)
      await refreshTree()

      if (type === 'experiment' && studyId) {
        setExpanded(prev => new Set(prev).add(studyId))
        setSelected(recordId)
      } else if (type === 'run' && studyId && experimentId) {
        setExpanded(prev => new Set(prev).add(studyId).add(experimentId))
        setSelected(recordId)
      } else if (type === 'study') {
        setSelected(recordId)
      }

      setShowCreateModal(null)
      setCreateForm({ title: '' })
    } catch (err) {
      console.error('Failed to create record:', err)
      alert(`Failed to create ${type}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCreating(false)
    }
  }

  // Handle entering edit mode
  const startEditing = () => {
    if (!previewPayload) return
    setEditData({ ...previewPayload })
    setSaveError(null)
    setIsEditing(true)
  }

  // Handle saving edits
  const handleSave = async () => {
    if (!selected || !editData.title || !(editData.title as string).trim()) {
      setSaveError('Title is required')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      await apiClient.updateRecord(selected, editData)
      // Refresh preview payload
      setPreviewPayload({ ...editData })
      setIsEditing(false)
      // Refresh the tree to show updated title
      await refreshTree()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle canceling edit
  const cancelEditing = () => {
    setIsEditing(false)
    setEditData({})
    setSaveError(null)
  }

  // Load initial data
  useEffect(() => {
    Promise.all([getStudyTree(), getInbox()])
      .then(([tree, inboxData]) => {
        setStudies(tree.studies)
        setInbox(inboxData.records)
        setIsLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setIsLoading(false)
      })
  }, [])

  // Fetch UISpec + full record when a study/experiment/run is selected
  useEffect(() => {
    if (!selected || selected === '_inbox') {
      setPreviewUiSpec(null)
      setPreviewSchema(null)
      setPreviewPayload(null)
      return
    }

    // Determine the schemaId from tree data
    let schemaId: string | null = null
    for (const study of studies) {
      if (study.recordId === selected) {
        schemaId = 'https://computable-lab.com/schema/computable-lab/study.schema.yaml'
        break
      }
      for (const exp of study.experiments) {
        if (exp.recordId === selected) {
          schemaId = 'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml'
          break
        }
        for (const run of exp.runs) {
          if (run.recordId === selected) {
            schemaId = 'https://computable-lab.com/schema/computable-lab/run.schema.yaml'
            break
          }
        }
        if (schemaId) break
      }
      if (schemaId) break
    }

    if (!schemaId) {
      // It's a child record (event-graph, etc.) — try fetching via the combined endpoint
      setLoadingPreview(true)
      apiClient.getRecordWithUI(selected)
        .then(({ record, uiSpec, schema }) => {
          setPreviewPayload(record.payload)
          setPreviewUiSpec(uiSpec)
          setPreviewSchema(schema as JsonSchema | null)
        })
        .catch(() => {
          setPreviewUiSpec(null)
          setPreviewSchema(null)
          // Fall back to just the record
          apiClient.getRecord(selected)
            .then(rec => setPreviewPayload(rec.payload))
            .catch(() => setPreviewPayload(null))
        })
        .finally(() => setLoadingPreview(false))
      return
    }

    // Build fallback payload from tree data
    const treeData = getSelectedData()
    const fallbackPayload: Record<string, unknown> = { recordId: selected }
    if (treeData?.data) {
      const d = treeData.data as Record<string, unknown>
      if (d.title) fallbackPayload.title = d.title
      if (d.kind) fallbackPayload.kind = d.kind
      if (d.path) fallbackPayload.path = d.path
      // Copy any links (studyId, experimentId)
      const links = d.links as Record<string, unknown> | undefined
      if (links) Object.assign(fallbackPayload, links)
    }

    setLoadingPreview(true)
    Promise.all([
      apiClient.getRecord(selected).catch(() => null),
      apiClient.getUiSpec(schemaId).catch(() => null),
      apiClient.getSchema(schemaId).then(s => s?.schema || null).catch(() => null),
    ]).then(([record, uiSpec, schema]) => {
      setPreviewPayload(record?.payload || fallbackPayload)
      setPreviewUiSpec(uiSpec)
      setPreviewSchema(schema)
    }).finally(() => setLoadingPreview(false))
  }, [selected, studies])

  // Fetch UISpec + schema when create modal opens
  useEffect(() => {
    if (!showCreateModal) {
      setCreateUiSpec(null)
      setCreateSchema(null)
      return
    }

    const schemaId = `https://computable-lab.com/schema/computable-lab/${showCreateModal.type}.schema.yaml`

    // Build initial form data
    const prefix = showCreateModal.type === 'study' ? 'STD' : showCreateModal.type === 'experiment' ? 'EXP' : 'RUN'
    const numericId = generateNumericId(getAllExistingIds(), prefix)
    const initial: Record<string, unknown> = {
      kind: showCreateModal.type,
      recordId: `${numericId}__new`,
    }
    if (showCreateModal.type === 'study' || showCreateModal.type === 'experiment') {
      initial.state = 'draft'
    }
    if (showCreateModal.type === 'experiment' && showCreateModal.parentStudyId) {
      initial.studyId = showCreateModal.parentStudyId
    }
    if (showCreateModal.type === 'run') {
      initial.status = 'planned'
      if (showCreateModal.parentStudyId) initial.studyId = showCreateModal.parentStudyId
      if (showCreateModal.parentExperimentId) initial.experimentId = showCreateModal.parentExperimentId
    }
    setCreateForm(initial)

    setLoadingCreateSpec(true)
    Promise.all([
      apiClient.getUiSpec(schemaId).catch(() => null),
      apiClient.getSchema(schemaId).then(s => s?.schema || null).catch(() => null),
    ]).then(([uiSpec, schema]) => {
      setCreateUiSpec(uiSpec)
      setCreateSchema(schema)
    }).finally(() => setLoadingCreateSpec(false))
  }, [showCreateModal])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    
    setIsSearching(true)
    const timer = setTimeout(() => {
      searchRecords(searchQuery, { limit: 20 })
        .then(res => {
          setSearchResults(res.records)
          setIsSearching(false)
        })
        .catch(err => {
          console.error('Search failed:', err)
          setSearchResults([])
          setIsSearching(false)
        })
    }, 300)
    
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const allowed = allowedPlatformsForVocab(platforms, methodVocabId)
    const allowedIds = allowed.map((platform) => platform.id)
    if (!allowedIds.includes(methodPlatform)) {
      setMethodPlatform(allowedIds[0] || 'manual')
    }
  }, [methodPlatform, methodVocabId, platforms])

  // Handle search result selection
  const selectSearchResult = (result: IndexEntry) => {
    // Expand parents to make record visible
    if (result.links) {
      const toExpand = new Set(expanded)
      if (result.links.studyId) toExpand.add(result.links.studyId)
      if (result.links.experimentId) toExpand.add(result.links.experimentId)
      if (result.links.runId) {
        toExpand.add(result.links.runId)
        // Load run records if needed
        loadRun(result.links.runId)
      }
      setExpanded(toExpand)
    }
    
    // Select the record
    setSelected(result.recordId)
    
    // Clear search
    setSearchQuery('')
    setSearchResults([])
  }

  // Load run records when expanded
  const loadRun = async (runId: string) => {
    if (runRecords.has(runId)) return
    const data = await getRecordsForRun(runId)
    setRunRecords(prev => new Map(prev).set(runId, data.records))
  }

  // Toggle expand/collapse
  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        // Check if it's a run and load records
        for (const study of studies) {
          for (const exp of study.experiments) {
            for (const run of exp.runs) {
              if (run.recordId === id) {
                loadRun(id)
              }
            }
          }
        }
      }
      return next
    })
  }

  // Find selected record data
  const getSelectedData = () => {
    if (!selected) return null
    
    // Check studies
    for (const study of studies) {
      if (study.recordId === selected) {
        return { type: 'study', data: study }
      }
      for (const exp of study.experiments) {
        if (exp.recordId === selected) {
          return { type: 'experiment', data: { ...exp, links: { studyId: study.recordId } } }
        }
        for (const run of exp.runs) {
          if (run.recordId === selected) {
            return { type: 'run', data: { ...run, links: { studyId: study.recordId, experimentId: exp.recordId } } }
          }
          const records: IndexEntry[] = runRecords.get(run.recordId) || []
          for (const record of records) {
            if (record.recordId === selected) {
              return { type: 'record', data: record as any }
            }
          }
        }
      }
    }
    
    // Check inbox
    if (selected === '_inbox') {
      return { type: 'inbox', data: { recordId: '_inbox', title: 'Inbox', count: inbox.length } }
    }
    for (const record of inbox) {
      if (record.recordId === selected) {
        return { type: 'record', data: record }
      }
    }
    
    return null
  }

  if (isLoading) {
    return <div style={{ padding: '20px' }}>Loading...</div>
  }

  if (error) {
    return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>
  }

  const selectedData = getSelectedData()
  const runPayload = selectedData?.type === 'run' && previewPayload
    ? previewPayload as Record<string, unknown>
    : null
  const runMethodEventGraphId = typeof runPayload?.methodEventGraphId === 'string' ? runPayload.methodEventGraphId : null
  const runMethodPlatform = typeof runPayload?.methodPlatform === 'string' ? runPayload.methodPlatform : null
  const runMethodVocabId = typeof runPayload?.methodVocabId === 'string' ? runPayload.methodVocabId : null
  const runMethodTemplateId = (
    runPayload?.methodTemplateRef
    && typeof runPayload.methodTemplateRef === 'object'
    && typeof (runPayload.methodTemplateRef as Record<string, unknown>).id === 'string'
  )
    ? (runPayload.methodTemplateRef as Record<string, unknown>).id as string
    : null

  const openMethodWizard = async (mode: 'attach' | 'replace') => {
    if (selectedData?.type !== 'run') return
    setMethodAttachMode(mode)
    setMethodWizardStep(1)
    setMethodVocabId('liquid-handling/v1')
    setMethodPlatform('manual')
    setSelectedMethodTemplateId('')
    setMethodAttachError(null)
    setMethodModalOpen(true)
    setMethodTemplatesBusy(true)
    try {
      const response = await apiClient.listComponents(undefined, 500)
      const templates = (response.components || []).filter((component) => {
        const payload = component.payload as Record<string, unknown>
        const tags = Array.isArray(payload.tags) ? payload.tags : []
        return tags.includes('template') || tags.includes('event_graph_template')
      })
      setMethodTemplates(templates)
      if (templates[0]?.recordId) {
        setSelectedMethodTemplateId(templates[0].recordId)
      }
    } catch (err) {
      setMethodAttachError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setMethodTemplatesBusy(false)
    }
  }

  const submitMethodAttach = async () => {
    if (selectedData?.type !== 'run') return
    setMethodAttachBusy(true)
    setMethodAttachError(null)
    try {
      const result = await attachTemplateToRun(selectedData.data.recordId, {
        ...(selectedMethodTemplateId ? { templateId: selectedMethodTemplateId } : {}),
        replace: methodAttachMode === 'replace',
        vocabId: methodVocabId,
        platform: methodPlatform,
        deckVariant: defaultVariantForPlatform(platforms, methodPlatform),
      })
      setMethodModalOpen(false)
      navigate(`/labware-editor?id=${encodeURIComponent(result.methodEventGraphId)}&runId=${encodeURIComponent(result.runId)}&planning=1`)
    } catch (err) {
      const e = err as Error & { code?: string; existingMethodEventGraphId?: string }
      if (e.code === 'METHOD_ALREADY_ATTACHED' && e.existingMethodEventGraphId) {
        const openExisting = window.confirm('This run already has a method attached. Open existing method?')
        if (openExisting) {
          setMethodModalOpen(false)
          navigate(`/labware-editor?id=${encodeURIComponent(e.existingMethodEventGraphId)}&runId=${encodeURIComponent(selectedData.data.recordId)}&planning=1`)
          return
        }
      }
      setMethodAttachError(err instanceof Error ? err.message : 'Failed to attach method')
    } finally {
      setMethodAttachBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {/* Left sidebar - File tree */}
      <div style={{
        width: '300px',
        borderRight: '1px solid #ddd',
        overflow: 'auto',
        backgroundColor: '#fafafa'
      }}>
        {/* Search bar */}
        <div style={{ padding: '8px', borderBottom: '1px solid #ddd', position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search records..."
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
          {isSearching && (
            <div style={{
              position: 'absolute',
              right: '16px',
              top: '14px',
              fontSize: '12px',
              color: '#999'
            }}>
              Searching...
            </div>
          )}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              left: '8px',
              right: '8px',
              top: '40px',
              maxHeight: '300px',
              overflow: 'auto',
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              zIndex: 1000
            }}>
              {searchResults.map(result => (
                <div
                  key={result.recordId}
                  onClick={() => selectSearchResult(result)}
                  style={{
                    padding: '8px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    fontSize: '12px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white'
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: '2px' }}>
                    {result.title || result.recordId}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {result.kind && (
                      <span style={{
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        padding: '1px 4px',
                        borderRadius: '2px',
                        marginRight: '6px'
                      }}>
                        {result.kind}
                      </span>
                    )}
                    {result.path}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Studies */}
        {studies.map(study => (
          <div key={study.recordId} className="tree-node">
            <div
              onClick={() => toggle(study.recordId)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                backgroundColor: selected === study.recordId ? '#e3f2fd' : 'transparent',
                borderLeft: selected === study.recordId ? '3px solid #2196f3' : '3px solid transparent',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ marginRight: '0px' }}>
                {expanded.has(study.recordId) ? '▼' : '▶'}
              </span>
              <span style={{ flex: 1 }}>{study.title || study.recordId}</span>
              <a
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(study.recordId)
                }}
                style={{
                  fontSize: '11px',
                  color: '#2196f3',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  padding: '2px 4px'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
              >
                open
              </a>
            </div>
            
            {expanded.has(study.recordId) && study.experiments.map(exp => (
              <div key={exp.recordId} className="tree-node">
                <div
                  onClick={() => toggle(exp.recordId)}
                  style={{
                    padding: '6px 12px 6px 32px',
                    cursor: 'pointer',
                    backgroundColor: selected === exp.recordId ? '#e3f2fd' : 'transparent',
                    borderLeft: selected === exp.recordId ? '3px solid #2196f3' : '3px solid transparent',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span style={{ marginRight: '0px' }}>
                    {expanded.has(exp.recordId) ? '▼' : '▶'}
                  </span>
                  <span style={{ flex: 1 }}>{exp.title || exp.recordId}</span>
                  <a
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(exp.recordId)
                    }}
                    style={{
                      fontSize: '11px',
                      color: '#2196f3',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      padding: '2px 4px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                  >
                    open
                  </a>
                </div>
                
                {expanded.has(exp.recordId) && exp.runs.map(run => (
                  <div key={run.recordId} className="tree-node">
                    <div
                      onClick={() => toggle(run.recordId)}
                      style={{
                        padding: '6px 12px 6px 52px',
                        cursor: 'pointer',
                        backgroundColor: selected === run.recordId ? '#e3f2fd' : 'transparent',
                        borderLeft: selected === run.recordId ? '3px solid #2196f3' : '3px solid transparent',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ marginRight: '0px' }}>
                        {expanded.has(run.recordId) ? '▼' : '▶'}
                      </span>
                      <span style={{ flex: 1 }}>{run.title || run.recordId}</span>
                      <a
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(run.recordId)
                        }}
                        style={{
                          fontSize: '11px',
                          color: '#2196f3',
                          cursor: 'pointer',
                          textDecoration: 'none',
                          padding: '2px 4px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        open
                      </a>
                    </div>
                    
                    {expanded.has(run.recordId) && (runRecords.get(run.recordId) || []).map(record => (
                      <div
                        key={record.recordId}
                        onClick={() => {
                          // If it's an event graph, navigate to editor instead of just selecting
                          if (record.kind === 'event-graph') {
                            navigate(`/labware-editor?id=${encodeURIComponent(record.recordId)}`)
                          } else {
                            setSelected(record.recordId)
                          }
                        }}
                        style={{
                          padding: '6px 12px 6px 72px',
                          cursor: 'pointer',
                          backgroundColor: selected === record.recordId ? '#e3f2fd' : 'transparent',
                          borderLeft: selected === record.recordId ? '3px solid #2196f3' : '3px solid transparent',
                          fontSize: '12px',
                          color: '#666',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {/* Add icon for event graphs */}
                        {record.kind === 'event-graph' && <span style={{ fontSize: '14px' }}>🧪</span>}
                        <span style={{ flex: 1 }}>{record.title || record.recordId}</span>
                        {record.kind && (
                          <span style={{ 
                            fontSize: '11px', 
                            color: record.kind === 'event-graph' ? '#7950f2' : '#999',
                            backgroundColor: record.kind === 'event-graph' ? '#e5dbff' : '#eee',
                            padding: '2px 6px',
                            borderRadius: '3px'
                          }}>
                            {record.kind}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        
        {/* New Study Button */}
        <div style={{ padding: '8px', borderTop: '1px solid #ddd', marginTop: '8px' }}>
          <button
            onClick={() => setShowCreateModal({ type: 'study' })}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            + New Study
          </button>
        </div>

        {/* Inbox */}
        <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
          <div
            onClick={() => toggle('_inbox')}
            onDoubleClick={() => setSelected('_inbox')}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              backgroundColor: selected === '_inbox' ? '#e3f2fd' : 'transparent',
              borderLeft: selected === '_inbox' ? '3px solid #2196f3' : '3px solid transparent',
              fontSize: '14px',
              fontWeight: 600,
              color: '#ff9800'
            }}
          >
            <span style={{ marginRight: '6px' }}>
              {expanded.has('_inbox') ? '▼' : '▶'}
            </span>
            _inbox ({inbox.length})
          </div>
          
          {expanded.has('_inbox') && inbox.map(record => (
            <div
              key={record.recordId}
              onClick={() => setSelected(record.recordId)}
              style={{
                padding: '6px 12px 6px 32px',
                cursor: 'pointer',
                backgroundColor: selected === record.recordId ? '#e3f2fd' : 'transparent',
                borderLeft: selected === record.recordId ? '3px solid #2196f3' : '3px solid transparent',
                fontSize: '12px',
                color: '#666'
              }}
            >
              {record.title || record.recordId}
              {record.kind && (
                <span style={{ 
                  marginLeft: '8px', 
                  fontSize: '11px', 
                  color: '#999',
                  backgroundColor: '#eee',
                  padding: '2px 6px',
                  borderRadius: '3px'
                }}>
                  {record.kind}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - Record preview / edit */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', backgroundColor: 'white' }}>
        {!selectedData ? (
          <div style={{ color: '#999', padding: '40px', textAlign: 'center' }}>
            <p>Select a record to view its details</p>
          </div>
        ) : (
          <div>
            {/* Header with inline actions */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 4px 0', lineHeight: 1.3 }}>
                  {selectedData.data.title || selectedData.data.recordId}
                </h1>
                <div style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <code style={{ backgroundColor: '#f5f5f5', padding: '1px 5px', borderRadius: '3px', fontSize: '11px' }}>
                    {selectedData.data.recordId}
                  </code>
                  <span style={{ textTransform: 'capitalize' }}>{selectedData.type}</span>
                </div>
              </div>
              {/* Edit / Save / Cancel buttons */}
              <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      style={{
                        padding: '5px 14px',
                        backgroundColor: isSaving ? '#ccc' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={isSaving}
                      style={{
                        padding: '5px 14px',
                        backgroundColor: 'white',
                        color: '#666',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : previewUiSpec?.form?.sections?.length && previewPayload && ['study', 'experiment', 'run'].includes(selectedData.type) ? (
                  <button
                    onClick={startEditing}
                    style={{
                      padding: '5px 14px',
                      backgroundColor: 'white',
                      color: '#2563eb',
                      border: '1px solid #2563eb',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            </div>

            {/* Save error */}
            {saveError && (
              <div style={{ padding: '8px 12px', marginBottom: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#b91c1c', fontSize: '13px' }}>
                {saveError}
              </div>
            )}

            {/* Content */}
            <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
              {selectedData.type === 'run' && selectedData.data.recordCounts && (
                <div style={{ marginBottom: '12px', fontSize: '12px', color: '#666' }}>
                  {selectedData.data.recordCounts.eventGraphs > 0 && <span style={{ marginRight: '12px' }}>Event Graphs: {selectedData.data.recordCounts.eventGraphs}</span>}
                  {selectedData.data.recordCounts.plates > 0 && <span style={{ marginRight: '12px' }}>Plates: {selectedData.data.recordCounts.plates}</span>}
                  {selectedData.data.recordCounts.contexts > 0 && <span style={{ marginRight: '12px' }}>Contexts: {selectedData.data.recordCounts.contexts}</span>}
                  {selectedData.data.recordCounts.materials > 0 && <span>Materials: {selectedData.data.recordCounts.materials}</span>}
                </div>
              )}
              {selectedData.type === 'run' && (
                <div style={{
                  marginBottom: '14px',
                  border: '1px solid #dbe2ea',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>Method</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          void openMethodWizard('attach')
                        }}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#0f766e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Attach
                      </button>
                      <button
                        onClick={() => void openMethodWizard('replace')}
                        disabled={!runMethodEventGraphId}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: runMethodEventGraphId ? 'pointer' : 'not-allowed',
                          opacity: runMethodEventGraphId ? 1 : 0.5,
                          fontSize: '12px',
                        }}
                      >
                        Replace
                      </button>
                      <button
                        onClick={() => {
                          const runId = selectedData.data.recordId
                          const targetId = runMethodEventGraphId
                          if (targetId) {
                            navigate(`/labware-editor?id=${encodeURIComponent(targetId)}&runId=${encodeURIComponent(runId)}&planning=1`)
                          } else {
                            const params = new URLSearchParams()
                            params.set('runId', runId)
                            const studyId = selectedData.data.links?.studyId
                            const experimentId = selectedData.data.links?.experimentId
                            if (studyId) params.set('studyId', studyId)
                            if (experimentId) params.set('experimentId', experimentId)
                            navigate(`/labware-editor?${params.toString()}`)
                          }
                        }}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#1d4ed8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: '7px', fontSize: '12px', color: '#475569' }}>
                    {runMethodEventGraphId ? (
                      <>
                        <div>Event Graph: <code>{runMethodEventGraphId}</code></div>
                        {runMethodPlatform && <div>Platform lock: <strong>{runMethodPlatform}</strong></div>}
                        {runMethodVocabId && <div>Vocabulary lock: <strong>{runMethodVocabId}</strong></div>}
                        {runMethodTemplateId && <div>Template: <code>{runMethodTemplateId}</code></div>}
                      </>
                    ) : (
                      <div>No method attached to this run yet.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Record Data — SectionedForm (edit or read-only) or JSON fallback */}
              {loadingPreview ? (
                <div style={{ color: '#999', padding: '20px', textAlign: 'center', fontSize: '13px' }}>Loading...</div>
              ) : isEditing && previewUiSpec?.form?.sections?.length ? (
                <SectionedForm
                  uiSpec={previewUiSpec}
                  schema={previewSchema as Record<string, unknown> | null}
                  formData={editData}
                  onChange={setEditData}
                  disabled={isSaving}
                />
              ) : previewUiSpec?.form?.sections?.length && previewPayload ? (
                <SectionedForm
                  uiSpec={previewUiSpec}
                  schema={previewSchema as Record<string, unknown> | null}
                  formData={previewPayload}
                  readOnly
                />
              ) : (
                <pre style={{
                  backgroundColor: '#f8f8f8',
                  padding: '10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  border: '1px solid #eee',
                }}>
                  {JSON.stringify(previewPayload || selectedData.data, null, 2)}
                </pre>
              )}

              {/* Context-aware action buttons (hidden during edit) */}
              {!isEditing && (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedData.type === 'record' && (
                    <button
                      onClick={() => {
                        if (selectedData.data.kind === 'event-graph') {
                          navigate(`/labware-editor?id=${encodeURIComponent(selectedData.data.recordId)}`)
                        } else {
                          navigate(`/records/${encodeURIComponent(selectedData.data.recordId)}`)
                        }
                      }}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Open
                    </button>
                  )}

                  {selectedData.type === 'study' && (
                    <button
                      onClick={() => {
                        setShowCreateModal({ type: 'experiment', parentStudyId: selectedData.data.recordId })
                      }}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      + Experiment
                    </button>
                  )}

                  {selectedData.type === 'experiment' && (
                    <button
                      onClick={() => {
                        setShowCreateModal({
                          type: 'run',
                          parentStudyId: selectedData.data.links?.studyId,
                          parentExperimentId: selectedData.data.recordId
                        })
                      }}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      + Run
                    </button>
                  )}

                  {selectedData.type === 'run' && (
                    <>
                      <button
                        onClick={() => {
                          void openMethodWizard('attach')
                        }}
                        style={{
                          padding: '5px 12px',
                          backgroundColor: '#0f766e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        Attach Method
                      </button>
                      <button
                        onClick={() => {
                          const runId = selectedData.data.recordId
                          const targetId = runMethodEventGraphId
                          if (targetId) {
                            navigate(`/labware-editor?id=${encodeURIComponent(targetId)}&runId=${encodeURIComponent(runId)}&planning=1`)
                            return
                          }
                          const studyId = selectedData.data.links?.studyId
                          const experimentId = selectedData.data.links?.experimentId
                          const params = new URLSearchParams()
                          params.set('runId', runId)
                          if (studyId) params.set('studyId', studyId)
                          if (experimentId) params.set('experimentId', experimentId)
                          navigate(`/labware-editor?${params.toString()}`)
                        }}
                        style={{
                          padding: '5px 12px',
                          backgroundColor: '#7c3aed',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        Open Method
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }} onClick={() => !isCreating && setShowCreateModal(null)}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>
              Create {showCreateModal.type}
            </h2>

            <div style={{ flex: 1, overflow: 'auto', marginBottom: '16px' }}>
              {loadingCreateSpec ? (
                <div style={{ color: '#999', padding: '20px', textAlign: 'center' }}>Loading form...</div>
              ) : createUiSpec?.form?.sections?.length ? (
                <SectionedForm
                  uiSpec={createUiSpec}
                  schema={createSchema as Record<string, unknown> | null}
                  formData={createForm}
                  onChange={(next) => {
                    // Auto-derive recordId and shortSlug from title
                    if (next.title && typeof next.title === 'string' && next.title !== createForm.title) {
                      const prefix = showCreateModal.type === 'study' ? 'STD' : showCreateModal.type === 'experiment' ? 'EXP' : 'RUN'
                      const numericId = generateNumericId(getAllExistingIds(), prefix)
                      const slug = generateSlug(next.title)
                      next.recordId = `${numericId}__${slug}`
                      next.shortSlug = slug
                    }
                    setCreateForm(next)
                  }}
                  disabled={isCreating}
                />
              ) : (
                /* Fallback: bare-bones title input */
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
                    Title*
                  </label>
                  <input
                    type="text"
                    value={(createForm.title as string) || ''}
                    onChange={(e) => setCreateForm({...createForm, title: e.target.value})}
                    placeholder="Enter title..."
                    autoFocus
                    disabled={isCreating}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: isCreating ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isCreating ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                {isCreating ? 'Creating...' : `Create ${showCreateModal.type}`}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(null)
                  setCreateForm({ title: '' })
                }}
                disabled={isCreating}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#666',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: isCreating ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {methodModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2100,
          }}
          onClick={() => !methodAttachBusy && setMethodModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              width: '560px',
              maxWidth: '94vw',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0 }}>{methodAttachMode === 'replace' ? 'Replace Run Method' : 'Attach Method To Run'}</h3>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Step {methodWizardStep} of 3
              {methodWizardStep === 1 && ': choose vocabulary'}
              {methodWizardStep === 2 && ': choose platform'}
              {methodWizardStep === 3 && ': choose template (optional)'}
            </div>
            {methodWizardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    checked={methodVocabId === 'liquid-handling/v1'}
                    onChange={() => setMethodVocabId('liquid-handling/v1')}
                  />
                  Liquid Handling
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    checked={methodVocabId === 'animal-handling/v1'}
                    onChange={() => setMethodVocabId('animal-handling/v1')}
                  />
                  Cell/Animal Handling
                </label>
              </div>
            )}
            {methodWizardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: '#334155' }}>Platform</label>
                <select
                  value={methodPlatform}
                  onChange={(e) => setMethodPlatform(e.target.value)}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                >
                  {allowedPlatformsForVocab(platforms, methodVocabId).map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platformLabel(platforms, platform.id)}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Deck variant will be locked to: <strong>{defaultVariantForPlatform(platforms, methodPlatform)}</strong>
                </div>
              </div>
            )}
            {methodWizardStep === 3 && (
              <>
                {methodTemplatesBusy ? (
                  <div style={{ fontSize: '13px', color: '#64748b' }}>Loading templates...</div>
                ) : (
                  <select
                    value={selectedMethodTemplateId}
                    onChange={(e) => setSelectedMethodTemplateId(e.target.value)}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '13px',
                    }}
                  >
                    <option value="">Start blank method (no template)</option>
                    {methodTemplates.map((template) => {
                      const payload = template.payload as Record<string, unknown>
                      return (
                        <option key={template.recordId} value={template.recordId}>
                          {(typeof payload.title === 'string' ? payload.title : template.recordId)} ({template.recordId})
                        </option>
                      )
                    })}
                  </select>
                )}
              </>
            )}
            {methodAttachError && (
              <div style={{ fontSize: '12px', color: '#b91c1c' }}>{methodAttachError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setMethodModalOpen(false)}
                disabled={methodAttachBusy}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: methodAttachBusy ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              {methodWizardStep > 1 && (
                <button
                  onClick={() => setMethodWizardStep((step) => (step > 1 ? (step - 1) as 1 | 2 | 3 : step))}
                  disabled={methodAttachBusy}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: methodAttachBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Back
                </button>
              )}
              {methodWizardStep < 3 ? (
                <button
                  onClick={() => setMethodWizardStep((step) => (step < 3 ? (step + 1) as 1 | 2 | 3 : step))}
                  disabled={methodAttachBusy}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: methodAttachBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              ) : (
              <button
                onClick={() => void submitMethodAttach()}
                disabled={methodAttachBusy || methodTemplatesBusy}
                style={{
                  padding: '6px 12px',
                  backgroundColor: methodAttachMode === 'replace' ? '#f59e0b' : '#0f766e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: methodAttachBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {methodAttachBusy ? 'Saving...' : methodAttachMode === 'replace' ? 'Replace Method' : 'Attach Method'}
              </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
