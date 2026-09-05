/**
 * Find (graph search) — the master search endpoint.
 *
 * A proper computable-lab workspace page: normal top bar (GlobalNavbar +
 * tab strip) and a right pane. The left pane is the scrollable search surface
 * (natural-language query → plate/table results selectable for follow-on AI
 * actions); the right pane hosts selection/AI + vessel-context detail.
 *
 * Supports the master-search flow: both the GlobalSearchBar (top bar) and the
 * SplashSearch route their query here as `?q=<text>`, and this page runs it on
 * mount (in addition to the local input).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
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
  const [searchParams] = useSearchParams()
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

  const distinctMaterials = useMemo(() => result ? [...new Set(result.objects
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
    : [], [result])

  // Auto-surface vessel contexts for ALL distinct materials in the results.
  useEffect(() => {
    if (distinctMaterials.length === 0) {
      setVesselContext(null)
      setVesselError(null)
      return
    }
    let cancelled = false
    const results: VesselContextResult[] = []
    const fetchAll = async () => {
      setVesselError(null)
      try {
        for (const ref of distinctMaterials) {
          const ctx = await graphContext(ref)
          if (cancelled) return
          if (ctx.count > 0) results.push(ctx)
        }
        if (!cancelled) setVesselContext(results.length > 0
          ? {
              instances: results.flatMap((r) => r.instances),
              aliquots: results.flatMap((r) => r.aliquots),
              count: results.reduce((n, r) => n + r.count, 0),
            }
          : null)
      } catch (err) {
        if (!cancelled) setVesselError(err instanceof Error ? err.message : String(err))
      }
    }
    void fetchAll()
    return () => { cancelled = true }
  }, [distinctMaterials, result])

  // Master-search flow: a `?q=` query param (from the GlobalSearchBar or
  // SplashSearch) auto-runs the search on mount.
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && q.trim().length > 0) {
      setQueryText(q)
      void runNaturalLanguage(q.trim())
    }
  }, [searchParams, runNaturalLanguage])

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

  const plates = useMemo(() => (result ? groupByPlate(result.objects) : []), [result])

  // ---- Right pane (selection & AI + vessel context detail) ----
  const rightPane = (
    <div className="graph-search__right" data-testid="graph-search-right">
      <div className="graph-search__right-title">Selection</div>
      {selectedIds.size > 0 ? (
        <>
          <div className="graph-search__right-count">{selectedIds.size} selected</div>
          <div className="graph-search__ai">
            <button
              onClick={() => void sendSelectionToAi()}
              data-testid="graph-search-send-ai"
              disabled={loading}
            >
              Send {selectedIds.size} to AI
            </button>
          </div>
          {aiContext ? <div className="graph-search__ai-ctx" data-testid="graph-search-ai-context">{aiContext}</div> : null}
        </>
      ) : (
        <div className="graph-search__right-empty">Select wells/cells in the results to act on them.</div>
      )}

      {vesselContext && vesselContext.count > 0 && (
        <div className="graph-search__vessels" data-testid="graph-search-vessels">
          <div className="graph-search__vessels-title">Also in tubes/stocks</div>
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

      <div className="graph-search__right-title">Details</div>
      {result?.explain ? (
        <div className="graph-search__right-explain" data-testid="graph-search-summary">{result.summary.count} objects — {result.explain}</div>
      ) : (
        <div className="graph-search__right-empty">Run a search to see an interpretation.</div>
      )}
    </div>
  )

  // ---- Left pane (query + results, scrollable) ----
  const leftPane = (
    <div className="graph-search" data-testid="graph-search-page">
      <header className="graph-search__header">
        <h1>Find</h1>
        <p className="graph-search__hint">Search the lab graph — wells, measurements, materials, stocks. Natural language or structured.</p>
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
          <button onClick={() => runPlaceholder('clofibrate')}>wells + clofibrate</button>
        </div>
      </div>

      {loading && <div className="graph-search__status">Searching…</div>}
      {error && !result && <div className="graph-search__error" data-testid="graph-search-error">{error}</div>}

      {result && (
        <div className="graph-search__results">
          {plates.length > 0 && (
            <div className="graph-search__grid-wrap">
              <GraphSearchPlateView
                plates={plates}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
              />
            </div>
          )}

          <GraphSearchTable
            nodes={result.objects}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
          />
        </div>
      )}
    </div>
  )

  return (
    <AppShell
      brand="Find"
      topbarTabs={<WorkspaceTabStrip />}
      layout="workspace"
      leftPane={leftPane}
      rightPane={rightPane}
    />
  )
}