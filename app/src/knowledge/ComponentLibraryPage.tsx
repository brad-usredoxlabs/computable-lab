import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import type { DeckPlacement } from '../graph/labware/DeckVisualizationPanel'
import { attachTemplateToRun, getStudyTree, type StudyTreeResponse } from '../shared/api/treeClient'
import { usePlatformRegistry } from '../shared/hooks/usePlatformRegistry'
import { defaultVariantForPlatform, getPlatformManifest } from '../shared/lib/platformRegistry'

type ComponentState = 'draft' | 'published' | 'deprecated'

interface TemplateItem {
  id: string
  title: string
  description: string
  state: string
  updatedAt?: string
  sourceEventGraphId?: string
  version?: string
  placements: DeckPlacement[]
}

function payloadField(record: RecordEnvelope, key: string): string {
  const value = (record.payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function toTemplateItem(record: RecordEnvelope): TemplateItem {
  const payload = record.payload as Record<string, unknown>
  const template = payload.template as Record<string, unknown> | undefined
  const insertionHints = template?.insertionHints as Record<string, unknown> | undefined
  const deck = (insertionHints?.deck as { placements?: DeckPlacement[] } | undefined)
    || (template?.deck as { placements?: DeckPlacement[] } | undefined)
  return {
    id: record.recordId,
    title: payloadField(record, 'title') || record.recordId,
    description: payloadField(record, 'description'),
    state: payloadField(record, 'state') || 'draft',
    updatedAt: record.meta?.commitSha,
    sourceEventGraphId:
      typeof insertionHints?.sourceEventGraphId === 'string'
        ? insertionHints.sourceEventGraphId
        : (typeof template?.sourceEventGraphId === 'string' ? template.sourceEventGraphId : undefined),
    version:
      typeof insertionHints?.version === 'string'
        ? insertionHints.version
        : (typeof template?.version === 'string' ? template.version : undefined),
    placements: Array.isArray(deck?.placements) ? deck.placements : [],
  }
}

export function ComponentLibraryPage() {
  const navigate = useNavigate()
  const { platforms } = usePlatformRegistry()
  const [searchParams] = useSearchParams()
  const preferredRunId = searchParams.get('runId') || ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<'all' | ComponentState>('all')
  const [components, setComponents] = useState<RecordEnvelope[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [attachRunModalOpen, setAttachRunModalOpen] = useState(false)
  const [runTree, setRunTree] = useState<StudyTreeResponse['studies']>([])
  const [runPickerBusy, setRunPickerBusy] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState('')
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)

  const loadData = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await apiClient.listComponents(stateFilter === 'all' ? undefined : stateFilter, 1000)
      setComponents(response.components || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [stateFilter])

  const templateItems = useMemo(() => {
    const list = components
      .map(toTemplateItem)
      .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase()) || item.description.toLowerCase().includes(query.toLowerCase()))
    return list
  }, [components, query])

  const selectedItems = useMemo(
    () => templateItems.filter((item) => selected.has(item.id)),
    [selected, templateItems]
  )
  const selectedSingleTemplate = selectedItems.length === 1 ? selectedItems[0] : null

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openInEditor = () => {
    if (selectedItems.length === 0) return
    const seenSlots = new Map<string, string>()
    const collisions: Array<{ slotId: string; first: string; second: string }> = []
    for (const item of selectedItems) {
      for (const placement of item.placements) {
        const current = seenSlots.get(placement.slotId)
        if (current && current !== item.id) {
          collisions.push({ slotId: placement.slotId, first: current, second: item.id })
        } else {
          seenSlots.set(placement.slotId, item.id)
        }
      }
    }
    if (collisions.length > 0) {
      const summary = collisions.slice(0, 5).map((c) => `${c.slotId}: ${c.first} vs ${c.second}`).join('\n')
      const ok = window.confirm(
        `Slot placement conflicts were found across selected templates:\n\n${summary}\n\nContinue and resolve in editor?`
      )
      if (!ok) return
    }
    const ids = selectedItems.map((item) => item.id).join(',')
    navigate(`/labware-editor?templates=${encodeURIComponent(ids)}&planning=1`)
  }

  const openAttachToRunModal = async () => {
    if (!selectedSingleTemplate) return
    setAttachError(null)
    setAttachRunModalOpen(true)
    setRunPickerBusy(true)
    try {
      const tree = await getStudyTree()
      setRunTree(tree.studies || [])
      const allRuns = tree.studies.flatMap((s) => s.experiments.flatMap((e) => e.runs))
      const preferred = preferredRunId
        ? allRuns.find((run) => run.recordId === preferredRunId)
        : undefined
      if (preferred?.recordId) setSelectedRunId(preferred.recordId)
      else if (!selectedRunId) {
        const firstRun = allRuns[0]
        if (firstRun?.recordId) setSelectedRunId(firstRun.recordId)
      }
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Failed to load runs')
    } finally {
      setRunPickerBusy(false)
    }
  }

  const handleAttachToRun = async () => {
    if (!selectedSingleTemplate || !selectedRunId) return
    setAttachBusy(true)
    setAttachError(null)
    const raw = components.find((component) => component.recordId === selectedSingleTemplate.id)
    const payload = raw?.payload as Record<string, unknown> | undefined
    const template = payload?.template as Record<string, unknown> | undefined
    const insertionHints = template?.insertionHints as Record<string, unknown> | undefined
    const deck = (insertionHints?.deck || template?.deck) as Record<string, unknown> | undefined
    const platform = typeof deck?.platform === 'string' && getPlatformManifest(platforms, deck.platform)
      ? deck.platform
      : 'manual'
    const deckVariant = typeof deck?.variant === 'string' ? deck.variant : defaultVariantForPlatform(platforms, platform)
    try {
      const result = await attachTemplateToRun(selectedRunId, {
        templateId: selectedSingleTemplate.id,
        replace: false,
        vocabId: 'liquid-handling/v1',
        platform,
        deckVariant,
      })
      setAttachRunModalOpen(false)
      navigate(`/labware-editor?id=${encodeURIComponent(result.methodEventGraphId)}&runId=${encodeURIComponent(result.runId)}&planning=1`)
    } catch (err) {
      const e = err as Error & { code?: string; existingMethodEventGraphId?: string }
      if (e.code === 'METHOD_ALREADY_ATTACHED') {
        const confirmed = window.confirm('This run already has an attached method. Replace it with the selected template?')
        if (confirmed) {
          try {
            const replaced = await attachTemplateToRun(selectedRunId, {
              templateId: selectedSingleTemplate.id,
              replace: true,
              vocabId: 'liquid-handling/v1',
              platform,
              deckVariant,
            })
            setAttachRunModalOpen(false)
            navigate(`/labware-editor?id=${encodeURIComponent(replaced.methodEventGraphId)}&runId=${encodeURIComponent(replaced.runId)}&planning=1`)
            return
          } catch (replaceErr) {
            setAttachError(replaceErr instanceof Error ? replaceErr.message : 'Failed to replace run method')
            return
          }
        }
        if (e.existingMethodEventGraphId) {
          const openExisting = window.confirm('Open the currently attached method instead?')
          if (openExisting) {
            setAttachRunModalOpen(false)
            navigate(`/labware-editor?id=${encodeURIComponent(e.existingMethodEventGraphId)}&runId=${encodeURIComponent(selectedRunId)}&planning=1`)
            return
          }
        }
      }
      setAttachError(err instanceof Error ? err.message : 'Failed to attach template to run')
    } finally {
      setAttachBusy(false)
    }
  }

  return (
    <div className="template-library-page">
      <div className="toolbar">
        <div>
          <h2>Template Library</h2>
          <p>Event-graph templates saved from timeline snapshots.</p>
          {preferredRunId && <p className="pref-run">Run target: <strong>{preferredRunId}</strong></p>}
        </div>
        <div className="actions">
          <Link to="/labware-editor" className="btn neutral">Open Event Editor</Link>
          <button className="btn" onClick={() => void loadData()} disabled={busy}>{busy ? 'Refreshing...' : 'Refresh'}</button>
          <button className="btn" onClick={() => void openAttachToRunModal()} disabled={!selectedSingleTemplate || busy}>Attach to Run</button>
          <button className="btn success" onClick={openInEditor} disabled={selected.size === 0}>Load Selected</button>
        </div>
      </div>

      <div className="filters">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search template name, id, or description"
        />
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as 'all' | ComponentState)}>
          <option value="all">All states</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="content">
        <section className="templates">
          <h3>Templates ({templateItems.length})</h3>
          <div className="list">
            {templateItems.map((item) => (
              <button key={item.id} className={`item ${selected.has(item.id) ? 'active' : ''}`} onClick={() => toggleSelected(item.id)}>
                <div className="title-row">
                  <span className="title">{item.title}</span>
                  <span className={`state state--${item.state}`}>{item.state}</span>
                </div>
                <div className="meta">{item.id}{item.version ? ` · ${item.version}` : ''}</div>
                {item.description && <div className="desc">{item.description}</div>}
                {item.sourceEventGraphId && <div className="lineage">Source: {item.sourceEventGraphId}</div>}
                {item.placements.length > 0 && (
                  <div className="placements">
                    Slots: {item.placements.map((p) => `${p.slotId}${p.labwareId ? `=${p.labwareId}` : ''}`).join(', ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
        <section className="summary">
          <h3>Selection Summary</h3>
          <div className="summary-card">
            <div><strong>{selectedItems.length}</strong> template{selectedItems.length === 1 ? '' : 's'} selected</div>
            <div>
              {selectedItems.length === 0
                ? 'Select one or more templates, then click Load Selected.'
                : selectedItems.map((item) => item.title).join(', ')}
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .template-library-page {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .toolbar h2 {
          margin: 0;
          font-size: 1.2rem;
          color: #1f2937;
        }
        .toolbar p {
          margin: 0.25rem 0 0;
          color: #6b7280;
          font-size: 0.86rem;
        }
        .pref-run {
          margin-top: 0.2rem;
          color: #1d4ed8 !important;
          font-weight: 600;
        }
        .actions {
          display: flex;
          gap: 0.45rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .filters {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 0.55rem;
        }
        .filters input,
        .filters select {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0.5rem 0.6rem;
          font-size: 0.86rem;
        }
        .content {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 0.8rem;
        }
        .templates,
        .summary {
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 10px;
          padding: 0.7rem;
          min-height: 520px;
        }
        .templates h3,
        .summary h3 {
          margin: 0 0 0.6rem;
          font-size: 0.95rem;
          color: #334155;
        }
        .list {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          max-height: 620px;
          overflow: auto;
        }
        .item {
          text-align: left;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.55rem;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .item.active {
          border-color: #1d4ed8;
          background: #eff6ff;
        }
        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }
        .title {
          font-size: 0.87rem;
          font-weight: 700;
          color: #1f2937;
        }
        .state {
          font-size: 0.7rem;
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          border: 1px solid #cbd5e1;
          text-transform: uppercase;
          color: #475569;
        }
        .state--published {
          border-color: #86efac;
          color: #166534;
          background: #f0fdf4;
        }
        .meta, .desc, .lineage, .placements {
          font-size: 0.76rem;
          color: #64748b;
        }
        .summary-card {
          border: 1px dashed #94a3b8;
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.65rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          font-size: 0.84rem;
          color: #334155;
        }
        .btn {
          border: 1px solid #1d4ed8;
          background: #1d4ed8;
          color: white;
          border-radius: 8px;
          padding: 0.45rem 0.7rem;
          font-size: 0.8rem;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn.neutral {
          border-color: #475569;
          background: #475569;
        }
        .btn.success {
          border-color: #0f766e;
          background: #0f766e;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .notice {
          border-radius: 8px;
          padding: 0.5rem 0.6rem;
          font-size: 0.82rem;
        }
        .notice.error {
          background: #fff5f5;
          border: 1px solid #ffc9c9;
          color: #c92a2a;
        }
        .notice.success {
          background: #ebfbee;
          border: 1px solid #b2f2bb;
          color: #2b8a3e;
        }
        .attach-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3000;
          padding: 1rem;
        }
        .attach-modal {
          width: min(520px, 96vw);
          border-radius: 12px;
          border: 1px solid #dbe2ea;
          background: #ffffff;
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .attach-modal h3 {
          margin: 0;
          font-size: 1rem;
          color: #1f2937;
        }
        .attach-modal p {
          margin: 0;
          font-size: 0.82rem;
          color: #475569;
        }
        .attach-modal label {
          font-size: 0.8rem;
          color: #334155;
          font-weight: 600;
        }
        .attach-modal select {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0.5rem 0.6rem;
          font-size: 0.85rem;
          width: 100%;
        }
        .attach-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.45rem;
        }
        @media (max-width: 980px) {
          .filters {
            grid-template-columns: 1fr;
          }
          .content {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {attachRunModalOpen && (
        <div className="attach-modal-backdrop" onClick={() => !attachBusy && setAttachRunModalOpen(false)}>
          <div className="attach-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Attach Template To Run</h3>
            <p>
              Template: <strong>{selectedSingleTemplate?.title || selectedSingleTemplate?.id}</strong>
            </p>
            {runPickerBusy ? (
              <div>Loading runs...</div>
            ) : (
              <>
                <label htmlFor="run-picker">Select Run</label>
                <select id="run-picker" value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)}>
                  <option value="">Select a run</option>
                  {runTree.map((study) => (
                    <optgroup key={study.recordId} label={study.title || study.recordId}>
                      {study.experiments.flatMap((experiment) => experiment.runs).map((run) => (
                        <option key={run.recordId} value={run.recordId}>
                          {run.title || run.recordId} ({run.recordId})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </>
            )}
            {attachError && <div className="notice error">{attachError}</div>}
            <div className="attach-modal-actions">
              <button className="btn neutral" onClick={() => setAttachRunModalOpen(false)} disabled={attachBusy}>Cancel</button>
              <button className="btn success" onClick={() => void handleAttachToRun()} disabled={attachBusy || !selectedRunId || runPickerBusy}>
                {attachBusy ? 'Attaching...' : 'Attach'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
