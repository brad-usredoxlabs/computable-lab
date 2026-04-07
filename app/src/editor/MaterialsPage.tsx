import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, type MaterialSearchItem } from '../shared/api/client'
import { MaterialDetailDrawer } from './material/MaterialDetailDrawer'
import { AliquotSplitModal } from './material/AliquotSplitModal'
import { MaterialAiCreator } from './material/MaterialAiCreator'
import { MaterialSmartSearch } from './material/MaterialSmartSearch'
import { useAiChat } from '../shared/hooks/useAiChat'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import type { AiContext } from '../types/aiContext'

const CATEGORY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'saved-stock', label: 'Saved Stocks' },
  { value: 'vendor-reagent', label: 'Vendor Reagents' },
  { value: 'prepared-material', label: 'Prepared Materials' },
  { value: 'biological-derived', label: 'Biological / Derived' },
  { value: 'concept-only', label: 'Concept Only' },
]

export function MaterialsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<MaterialSearchItem[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [splitTarget, setSplitTarget] = useState<{ id: string; name: string } | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  // AI features
  const [aiCreatorOpen, setAiCreatorOpen] = useState(false)
  const aiContext = useMemo((): AiContext => ({
    surface: 'materials',
    summary: `Materials page${search ? `, search: "${search}"` : ''}${category ? `, category: ${category}` : ''}${selectedMaterialId ? `, selected: ${selectedMaterialId}` : ''}`,
    surfaceContext: {
      searchQuery: search || null,
      category: category || null,
      selectedMaterialId,
      materialCount: items.length,
    },
  }), [search, category, selectedMaterialId, items.length])
  const aiChat = useAiChat({ aiContext })
  useRegisterAiChat(aiChat)

  async function load() {
    setLoading(true)
    try {
      const response = await apiClient.searchMaterials({
        q: search || undefined,
        category: category || undefined,
        status: status || undefined,
        limit: 200,
      })
      setItems(response.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, category, status])

  const grouped = useMemo(() => {
    const map = new Map<string, MaterialSearchItem[]>()
    for (const item of items) {
      const list = map.get(item.category) || []
      list.push(item)
      map.set(item.category, list)
    }
    return map
  }, [items])

  function openEditor(item: MaterialSearchItem) {
    const params = new URLSearchParams()
    params.set('new', '1')
    params.set('source', 'materials')
    if (item.kind === 'aliquot') params.set('prefillAliquotIds', item.recordId)
    if (item.kind === 'material-instance') params.set('prefillMaterialInstanceIds', item.recordId)
    if (item.kind === 'material-spec') params.set('prefillMaterialSpecIds', item.recordId)
    if (item.kind === 'vendor-product') params.set('prefillVendorProductIds', item.recordId)
    if (item.kind === 'material') params.set('prefillMaterialIds', item.recordId)
    navigate(`/labware-editor?${params.toString()}`)
  }

  function typeLabel(item: MaterialSearchItem): string {
    if (item.kind === 'aliquot') return 'Aliquot'
    if (item.kind === 'material-instance' && item.category === 'biological-derived') return 'Cell / Derived Material'
    if (item.kind === 'material-instance') return 'Prepared Material'
    if (item.kind === 'material-spec') return 'Saved Stock'
    if (item.kind === 'vendor-product') return 'Vendor Reagent'
    if (item.kind === 'material') return 'Concept'
    return item.kind
  }

  async function quickStatus(item: MaterialSearchItem, nextStatus: 'reserved' | 'consumed' | 'discarded') {
    setStatusBusyId(item.recordId)
    try {
      await apiClient.updateMaterialStatus(item.recordId, { status: nextStatus })
      await load()
    } finally {
      setStatusBusyId(null)
    }
  }

  return (
    <div className="formulations-page">
      <section className="formulations-hero">
        <div>
          <p className="formulations-eyebrow">Materials Workspace</p>
          <h1>Prepared materials, aliquots, cells, and derived outputs.</h1>
          <p className="formulations-hero__copy">Browse reusable lab materials, inspect lineage, update status, and jump into the event graph editor when you need to use them.</p>
        </div>
      </section>

      <section className="formulations-toolbar">
        <label className="formulations-field"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Clofibrate, passage, conditioned media..." /></label>
        <label className="formulations-field formulations-field--compact"><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="formulations-field formulations-field--compact"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="available">available</option><option value="reserved">reserved</option><option value="consumed">consumed</option><option value="expired">expired</option><option value="discarded">discarded</option></select></label>
        <button className="btn btn-primary" onClick={() => setAiCreatorOpen(true)}>Create with AI</button>
      </section>

      {search && <MaterialSmartSearch query={search} localResultCount={items.length} onAddToLibrary={async (record) => {
        const name = typeof record.name === 'string' ? record.name : typeof record.label === 'string' ? record.label : 'Imported material'
        const schemaId = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml'
        const timestamp = Date.now().toString(36)
        const random = Math.random().toString(36).substring(2, 6)
        const recordId = `mat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)}-${timestamp}-${random}`
        try {
          await apiClient.createRecord(schemaId, { kind: 'material', id: recordId, name, domain: 'other', tags: [], ...record })
          await load()
        } catch { /* silently handle */ }
      }} />}

      {loading && <div className="loading">Loading materials…</div>}

      {!loading && Array.from(grouped.entries()).map(([group, groupItems]) => (
        <section key={group} className="formulations-library">
          <div className="formulations-section-head"><div><p className="formulations-section-head__eyebrow">{group}</p><h2>{CATEGORY_OPTIONS.find((entry) => entry.value === group)?.label || group}</h2></div><div className="formulations-section-head__meta">{groupItems.length} rows</div></div>
          <div className="formulations-grid">
            {groupItems.map((item) => (
              <article key={item.recordId} className="formulation-card">
                <div className="formulation-card__head">
                  <div>
                    <h3>{item.title}</h3>
                    <div className="formulations-table__meta">{typeLabel(item)}</div>
                  </div>
                  <div className="formulation-card__availability">
                    <span className="formulations-status formulations-status--available">{typeLabel(item)}</span>
                  </div>
                </div>
                <div className="formulation-card__section">
                  <span className="formulation-card__label">Summary</span>
                  <div className="formulation-card__footer-meta">
                    <span><code>{item.recordId}</code></span>
                    <span>{item.subtitle || 'Ready to use in the editor'}</span>
                  </div>
                </div>
                <div className="formulation-card__footer">
                  <div className="formulation-card__footer-meta">
                    <span>{group === 'prepared-material' ? 'Prepared material' : group === 'biological-derived' ? 'Biological / derived' : typeLabel(item)}</span>
                  </div>
                  <div className="formulation-card__actions" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => openEditor(item)}>Use This</button>
                    <button className="btn btn-secondary" onClick={() => setSelectedMaterialId(item.recordId)}>View Lineage</button>
                    {item.kind === 'material-instance' && <button className="btn btn-secondary" onClick={() => setSplitTarget({ id: item.recordId, name: item.title })}>Split Into Aliquots</button>}
                    {item.kind !== 'material' && (
                      <>
                        <button className="btn btn-secondary" disabled={statusBusyId === item.recordId} onClick={() => quickStatus(item, 'reserved')}>Reserve</button>
                        <button className="btn btn-secondary" disabled={statusBusyId === item.recordId} onClick={() => quickStatus(item, 'consumed')}>Mark Used</button>
                        <button className="btn btn-secondary" disabled={statusBusyId === item.recordId} onClick={() => quickStatus(item, 'discarded')}>Discard</button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <MaterialDetailDrawer materialId={selectedMaterialId} onClose={() => setSelectedMaterialId(null)} onStatusChanged={load} />
      <AliquotSplitModal isOpen={Boolean(splitTarget)} materialInstanceId={splitTarget?.id || null} materialName={splitTarget?.name} onClose={() => setSplitTarget(null)} onSave={() => { setSplitTarget(null); load() }} />
      <MaterialAiCreator isOpen={aiCreatorOpen} onClose={() => setAiCreatorOpen(false)} onCreated={() => { setAiCreatorOpen(false); load() }} />
    </div>
  )
}
