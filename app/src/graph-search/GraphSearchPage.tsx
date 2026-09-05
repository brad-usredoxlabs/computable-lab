/**
 * Find UI — the graph search engine's human surface (spec §9, §10).
 *
 * Single-pane page: a query box at top, then result views. When results contain
 * `well` nodes they render on a plate grid (highlighted wells); all results list
 * as a table with editable selection. Rows can be selected into a `selection:`
 * handle for a follow-on AI action (spec §7 find→inspect→select→act).
 *
 * Views scoped to the active result type (spec §10): table is the default;
 * plate appears when wells are present.
 */

import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '../shared/shell'
import {
  graphSearch,
  graphPlanSearch,
  graphAiContext,
  graphContext,
  createGraphCollection,
  createGraphSelection,
  type GraphResult,
  type VesselContextResult,
} from '../shared/api/graphSearchClient'
import { GraphSearchTable } from './GraphSearchTable'
import { GraphSearchPlateView } from './GraphSearchPlateView'
import { groupByPlate } from './wellNodes'
import './GraphSearchPage.css'

export function GraphSearchPage() {
  const [queryText, setQueryText] = useState('')
  const [result, setResult] = useState<GraphResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const runFind = useCallback(async (q: Parameters<typeof graphSearch>[0]) => {
    setLoading(true)
    setError(null)
    setSelectedIds(new Set())
    try {
      const res = await graphSearch(q)
      setResult(res)
      if (res.summary.count === 0) {
        setError('No matching objects found.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const runPlaceholder = useCallback((material: string) => {
    // "wells treated with X" — direct well query with treatment expansion.
    void runFind({
      op: 'find',
      type: 'well',
      where: [{ field: 'treatment.name', operator: 'contains', value: material }],
      limit: 200,
    })
  }, [runFind])

  const runNaturalLanguage = useCallback(async (text: string) => {
    setLoading(true)
    setError(null)
    setSelectedIds(new Set())
    try {
      // Plan the NL request into a canonical query, then execute it (§16).
      const plan = await graphPlanSearch(text)
      const res = await graphSearch(plan.query)
      setResult({ ...res, explain: plan.explain })
      if (res.summary.count === 0) {
        setError('No matching objects found.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const [aiContext, setAiContext] = useState<string | null>(null)
  const [vesselContext, setVesselContext] = useState<VesselContextResult | null>(null)
  const [vesselError, setVesselError] = useState<string | null>(null)

  const runVesselContext = useCallback(async (materialRef: string) => {
    setVesselError(null)
    try {
      const ctx = await graphContext(materialRef)
      setVesselContext(ctx.count > 0 ? ctx : null)
    } catch (err) {
      setVesselError(err instanceof Error ? err.message : String(err))
    }
  }, [])
  const distinctMaterials = result ? [...new Set(result.objects
    .flatMap((o) => {
      // treatment/measurement nodes carry materialRef; well nodes carry
      // materialRefs[] (enriched from their treated_with edges).
      const refs: string[] = []
      const single = o.properties?.materialRef
      if (typeof single === 'string' && single.length > 0) refs.push(single)
      if (Array.isArray(o.properties?.materialRefs)) {
        for (const r of o.properties.materialRefs as unknown[]) if (typeof r === 'string') refs.push(r)
      }
      return refs
    })
    .filter((r): r is string => typeof r === 'string' && r.length > 0))]
    : []
  const primaryMaterial = distinctMaterials[0]

  // Auto-surface vessel contexts (tube/stock/aliquot) for the results' primary
  // material. Clears on new results; no-op when there's no material or none
  // found (vesselContext stays null → nothing renders).
  useEffect(() => {
    if (!primaryMaterial) {
      setVesselContext(null)
      setVesselError(null)
      return
    }
    void runVesselContext(primaryMaterial)
  }, [primaryMaterial, runVesselContext])

  const sendSelectionToAi = useCallback(async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setAiContext(null)
    try {
      // find → collection → selection → AI context (spec §7 end-to-end loop).
      const { handle: collection } = await createGraphCollection(ids)
      const { handle: selection } = await createGraphSelection(collection, ids)
      const ctx = await graphAiContext(selection, 'Analyze these wells')
      setAiContext(`selection:${selection} — ${ctx.nodeIds.length} wells ready for AI (${ctx.prompt})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [selectedIds])

  const plates = result ? groupByPlate(result.objects) : []

  return (
    <AppShell brand={<span className="graph-search__brand">Find</span>}>
      <div className="graph-search" data-testid="graph-search-page">
        <header className="graph-search__header">
          <h1>Find</h1>
          <p className="graph-search__hint">Search the lab graph. Wells/measurements come from event graphs; records come from the library.</p>
        </header>

        <div className="graph-search__query">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void runNaturalLanguage(queryText.trim())
            }}
            data-testid="graph-search-form"
          >
            <input
              className="graph-search__input"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder='e.g. wells treated with rotenone'
              data-testid="graph-search-input"
            />
            <button type="submit" data-testid="graph-search-submit" disabled={loading || queryText.trim().length === 0}>
              Search
            </button>
          </form>
          <div className="graph-search__examples">
            <button onClick={() => runPlaceholder('rotenone')}>wells + rotenone</button>
            <button onClick={() => runPlaceholder('oligomycin')}>wells + oligomycin</button>
          </div>
        </div>

        {loading && <div className="graph-search__status">Searching…</div>}
        {error && !result && <div className="graph-search__error" data-testid="graph-search-error">{error}</div>}

        {result && (
          <>
            <div className="graph-search__summary" data-testid="graph-search-summary">
              {result.summary.count} objects
              {result.explain ? <span className="graph-search__explain"> — {result.explain}</span> : null}
              {selectedIds.size > 0 ? <span className="graph-search__selection"> — {selectedIds.size} selected</span> : null}
            </div>

            {selectedIds.size > 0 && (
              <div className="graph-search__ai">
                <button
                  onClick={() => void sendSelectionToAi()}
                  data-testid="graph-search-send-ai"
                  disabled={loading}
                >
                  Send {selectedIds.size} selected to AI
                </button>
                {aiContext ? <span className="graph-search__ai-ctx" data-testid="graph-search-ai-context">{aiContext}</span> : null}
              </div>
            )}

            {plates.length > 0 && (
              <div className="graph-search__grid-wrap">
                <GraphSearchPlateView
                  plates={plates}
                  selectedIds={selectedIds}
                  onToggle={toggleSelect}
                />
              </div>
            )}

            {vesselContext && vesselContext.count > 0 && (
              <div className="graph-search__vessels" data-testid="graph-search-vessels">
                <div className="graph-search__vessels-title">
                  Also in tubes/stocks{primaryMaterial ? ` for ${primaryMaterial}` : ''}
                </div>
                {vesselContext.instances.map((inst) => {
                  const storage = (inst.properties?.storage ?? {}) as { location?: string; temperature_C?: number }
                  const status = typeof inst.properties?.status === 'string' ? inst.properties.status : undefined
                  return (
                    <div key={inst.id} className="graph-search__vessel" data-testid="graph-vessel-instance">
                      <span className="graph-search__vessel-name">{inst.label}</span>
                      <span className="graph-search__vessel-meta">
                        {storage.location ? ` at ${storage.location}` : ''}
                        {typeof storage.temperature_C === 'number' ? ` (${storage.temperature_C}°C)` : ''}
                        {status ? ` · ${status}` : ''}
                      </span>
                    </div>
                  )
                })}
                {vesselContext.aliquots.map((a) => (
                  <div key={a.id} className="graph-search__vessel" data-testid="graph-vessel-aliquot">
                    <span className="graph-search__vessel-name">{a.label}</span>
                    <span className="graph-search__vessel-meta">aliquot</span>
                  </div>
                ))}
              </div>
            )}
            {vesselError && <div className="graph-search__error">{vesselError}</div>}

            <GraphSearchTable
              nodes={result.objects}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
            />
          </>
        )}
      </div>
    </AppShell>
  )
}