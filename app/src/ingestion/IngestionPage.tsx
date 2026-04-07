import { useEffect, useMemo, useState, useCallback } from 'react'
import { apiClient } from '../shared/api/client'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { SourceKindSuggestionBadge, RunMappingPanel } from './components/IngestionAiSuggestion'
import { IngestionJobDetailPanel } from './components/IngestionJobDetail'
import { IngestionJobList } from './components/IngestionJobList'
import { useAiChat } from '../shared/hooks/useAiChat'
import type { AiContext } from '../types/aiContext'
import type { CreateIngestionJobRequest, IngestionJobDetail, IngestionJobSummary, IngestionSourceKind, SourceKindSuggestion } from '../types/ingestion'

const SOURCE_KIND_OPTIONS: Array<{ value: IngestionSourceKind; label: string }> = [
  { value: 'vendor_plate_map_pdf', label: 'Vendor plate map PDF' },
  { value: 'vendor_formulation_html', label: 'Vendor formulation HTML' },
  { value: 'vendor_plate_map_spreadsheet', label: 'Vendor plate map spreadsheet' },
  { value: 'vendor_catalog_page', label: 'Vendor catalog page' },
  { value: 'instrument_plate_reader', label: 'Plate reader output' },
  { value: 'instrument_qpcr', label: 'qPCR result file' },
  { value: 'instrument_gc_ms', label: 'GC-MS data' },
  { value: 'instrument_gc_fid', label: 'GC-FID data' },
  { value: 'instrument_fluorescence_microscopy', label: 'Fluorescence microscopy imaging' },
  { value: 'other', label: 'Other' },
]

const ONTOLOGY_PREFERENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'chebi', label: 'ChEBI' },
  { value: 'ncit', label: 'NCIT' },
  { value: 'go', label: 'GO' },
  { value: 'cl', label: 'CL' },
  { value: 'uberon', label: 'Uberon' },
  { value: 'ncbitaxon', label: 'NCBI Taxonomy' },
]

function inferSourceKindFromFile(file: File | null): IngestionSourceKind {
  if (!file) return 'other'
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'vendor_plate_map_pdf'
  if (name.endsWith('.xlsx') || name.endsWith('.xslx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'vendor_plate_map_spreadsheet'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'vendor_formulation_html'
  return 'other'
}

function resolveSourceKind(selectedFile: File | null, selectedKind: IngestionSourceKind): IngestionSourceKind {
  if (!selectedFile) return selectedKind
  if (selectedKind !== 'other') return selectedKind
  return inferSourceKindFromFile(selectedFile)
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return btoa(binary)
}

function movePreference(values: string[], index: number, offset: -1 | 1): string[] {
  const target = index + offset
  if (target < 0 || target >= values.length) return values
  const next = [...values]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export function IngestionPage() {
  const [jobs, setJobs] = useState<IngestionJobSummary[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [detail, setDetail] = useState<IngestionJobDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [sourceKind, setSourceKind] = useState<IngestionSourceKind>('vendor_plate_map_pdf')
  const [sourceUrl, setSourceUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [ontologyPreferences, setOntologyPreferences] = useState<string[]>(['chebi', 'ncit'])

  // AI source kind suggestion
  const [sourceKindSuggestion, setSourceKindSuggestion] = useState<SourceKindSuggestion | null>(null)
  const [sourceKindLoading, setSourceKindLoading] = useState(false)

  const handleFileChange = useCallback(async (file: File | null) => {
    setSelectedFile(file)
    setSourceKindSuggestion(null)
    if (!file) return
    setSourceKindLoading(true)
    try {
      const previewBytes = file.slice(0, 2048)
      const buffer = await previewBytes.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.slice(i, i + 0x8000))
      }
      const preview = btoa(binary)
      const suggestion = await apiClient.inferSourceKind({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        preview,
      })
      setSourceKindSuggestion(suggestion)
    } catch {
      // Silently fail — suggestion is optional
    } finally {
      setSourceKindLoading(false)
    }
  }, [])

  // AI panel
  const aiContext = useMemo((): AiContext => ({
    surface: 'ingestion',
    summary: `Ingestion page${selectedJobId ? `, selected job: ${selectedJobId}` : ''}`,
    surfaceContext: {
      selectedJobId,
      jobCount: jobs.length,
      sourceKind,
      detailStage: detail?.job?.payload?.stage || null,
      artifactCount: detail?.artifacts?.length || 0,
      candidateCount: detail?.candidates?.length || 0,
      issueCount: detail?.issues?.length || 0,
      bundleCount: detail?.bundles?.length || 0,
      issues: detail?.issues?.map((i) => ({
        id: i.recordId,
        type: i.payload.issue_type,
        title: i.payload.title,
        severity: i.payload.severity,
      })) || [],
    },
  }), [selectedJobId, jobs.length, sourceKind, detail?.job?.payload?.stage, detail?.artifacts?.length, detail?.candidates?.length, detail?.issues?.length, detail?.bundles?.length, detail?.issues])
  const aiChat = useAiChat({ aiContext })
  useRegisterAiChat(aiChat)

  async function loadJobs(selectJobId?: string) {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.listIngestionJobs()
      setJobs(response.items)
      const nextSelected = selectJobId ?? selectedJobId ?? response.items[0]?.id ?? null
      setSelectedJobId(nextSelected)
      if (nextSelected) {
        const jobDetail = await apiClient.getIngestionJob(nextSelected)
        setDetail(jobDetail)
      } else {
        setDetail(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ingestion jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadJobs()
  }, [])

  useEffect(() => {
    if (!runningJobId) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const [jobsResponse, jobDetail] = await Promise.all([
          apiClient.listIngestionJobs(),
          apiClient.getIngestionJob(runningJobId),
        ])
        if (cancelled) return
        setJobs(jobsResponse.items)
        setDetail(jobDetail)
        setSelectedJobId(runningJobId)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to refresh running ingestion job')
        }
      }
    }
    void poll()
    const intervalId = window.setInterval(() => { void poll() }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [runningJobId])

  async function handleSelect(jobId: string) {
    setSelectedJobId(jobId)
    setLoading(true)
    try {
      const jobDetail = await apiClient.getIngestionJob(jobId)
      setDetail(jobDetail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ingestion job')
    } finally {
      setLoading(false)
    }
  }

  const createLabel = useMemo(() => {
    if (selectedFile) return `Submit ${selectedFile.name}`
    if (sourceUrl.trim()) return 'Submit URL'
    return 'Submit Ingestion Job'
  }, [selectedFile, sourceUrl])

  const runLabel = useMemo(() => {
    if (!detail) return 'Run Extraction'
    if (detail.job.payload.source_kind === 'vendor_formulation_html') return 'Run Formulation Extraction'
    if (detail.job.payload.source_kind === 'vendor_plate_map_pdf') return 'Run Cayman Extraction'
    if (detail.job.payload.source_kind === 'vendor_plate_map_spreadsheet') return 'Run Cayman Extraction'
    return 'Run Extraction'
  }, [detail])

  async function handleSubmit() {
    if (!selectedFile && !sourceUrl.trim()) {
      setError('Select a file or enter a source URL.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const resolvedSourceKind = resolveSourceKind(selectedFile, sourceKind)
      const request: CreateIngestionJobRequest = {
        ...(name.trim() ? { name: name.trim() } : {}),
        sourceKind: resolvedSourceKind,
        adapterKind: resolvedSourceKind,
        ontologyPreferences,
        source: {
          ...(selectedFile ? {
            fileName: selectedFile.name,
            mediaType: selectedFile.type || 'application/octet-stream',
            sizeBytes: selectedFile.size,
          } : {}),
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(selectedFile ? { contentBase64: await fileToBase64(selectedFile) } : {}),
        },
      }
      const created = await apiClient.createIngestionJob(request)
      setName('')
      setSourceUrl('')
      setSelectedFile(null)
      setNote('')
      setSourceKindSuggestion(null)
      await loadJobs(created.job.recordId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ingestion job')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRunSelectedJob() {
    if (!selectedJobId) return
    setError(null)
    setRunningJobId(selectedJobId)
    void apiClient.runIngestionJob(selectedJobId, {})
      .then(async (updated) => {
        setDetail(updated)
        await loadJobs(selectedJobId)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to run ingestion job')
      })
      .finally(() => {
        setRunningJobId(null)
      })
  }

  async function handleApproveBundle(bundleId: string) {
    if (!selectedJobId) return
    setLoading(true)
    setError(null)
    try {
      const updated = await apiClient.approveIngestionBundle(selectedJobId, bundleId)
      setDetail(updated)
      await loadJobs(selectedJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve bundle')
    } finally {
      setLoading(false)
    }
  }

  async function handlePublishBundle(bundleId: string) {
    if (!selectedJobId) return
    setLoading(true)
    setError(null)
    try {
      const updated = await apiClient.publishIngestionBundle(selectedJobId, bundleId)
      setDetail(updated.detail)
      await loadJobs(selectedJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish bundle')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ingestion-page">
      <section className="ingestion-hero">
        <div>
          <p className="ingestion-eyebrow">Ingestion Dashboard</p>
          <h1>Submit vendor sources, track progress, and review candidate bundles.</h1>
          <p className="ingestion-copy">Submit screening libraries or formulation pages, review parsed variants, and publish canonical lab records after review.</p>
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="ingestion-toolbar">
        <label className="ingestion-field">
          <span>Job title</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cayman lipid library PDF" />
        </label>
        <label className="ingestion-field ingestion-field--compact">
          <span>Source kind</span>
          <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as IngestionSourceKind)}>
            {SOURCE_KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <SourceKindSuggestionBadge
            suggestion={sourceKindSuggestion}
            loading={sourceKindLoading}
            onAccept={(kind) => { setSourceKind(kind); setSourceKindSuggestion(null) }}
          />
        </label>
        <label className="ingestion-field">
          <span>Source URL</span>
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://vendor.example/formulation" />
        </label>
        <label className="ingestion-field">
          <span>Or source file</span>
          <input type="file" onChange={(e) => { void handleFileChange(e.target.files?.[0] ?? null) }} />
        </label>
        <label className="ingestion-field">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Screening library v1 PDF upload" />
        </label>
        <div className="ingestion-actions">
          <button className="btn btn-primary" onClick={() => { void handleSubmit() }} disabled={submitting}>
            {submitting ? 'Submitting...' : createLabel}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { void handleRunSelectedJob() }}
            disabled={loading || Boolean(runningJobId) || !selectedJobId || detail?.job.payload.status !== 'queued'}
          >
            {runningJobId ? 'Running…' : runLabel}
          </button>
          <button className="btn btn-secondary" onClick={() => { void loadJobs() }} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      <section className="ingestion-ontology-preferences">
        <div className="ingestion-panel__head">
          <div>
            <p className="ingestion-section__eyebrow">Ontology Preference</p>
            <h3>Preferred ontology ranking for ingestion matching</h3>
          </div>
        </div>
        <div className="ingestion-ontology-list">
          {ontologyPreferences.map((value, index) => {
            const option = ONTOLOGY_PREFERENCE_OPTIONS.find((item) => item.value === value)
            return (
              <div key={value} className="ingestion-ontology-item">
                <span className="ingestion-ontology-item__rank">{index + 1}</span>
                <div className="ingestion-ontology-item__body">
                  <strong>{option?.label ?? value.toUpperCase()}</strong>
                  <span>{value}</span>
                </div>
                <div className="ingestion-ontology-item__actions">
                  <button
                    type="button"
                    onClick={() => setOntologyPreferences((current) => movePreference(current, index, -1))}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => setOntologyPreferences((current) => movePreference(current, index, 1))}
                    disabled={index === ontologyPreferences.length - 1}
                  >
                    ↓
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="ingestion-layout">
        <aside className="ingestion-sidebar">
          <div className="ingestion-panel__head">
            <div>
              <p className="ingestion-section__eyebrow">Jobs</p>
              <h3>{jobs.length} tracked</h3>
            </div>
          </div>
          <IngestionJobList items={jobs} selectedJobId={selectedJobId} onSelect={(jobId) => { void handleSelect(jobId) }} />
        </aside>
        <main className="ingestion-main">
          <IngestionJobDetailPanel
            detail={detail}
            busy={loading}
            jobId={selectedJobId}
            onApproveBundle={(bundleId) => { void handleApproveBundle(bundleId) }}
            onPublishBundle={(bundleId) => { void handlePublishBundle(bundleId) }}
          />
          <RunMappingPanel jobId={selectedJobId} sourceKind={sourceKind} />
        </main>
      </section>

      <style>{`
        .ingestion-page { max-width: none; margin: 0; padding: 1rem; }
        .ingestion-hero { margin-bottom: 1rem; padding: 1.25rem; border-radius: 16px; background: linear-gradient(135deg, #f1f3f5, #ffffff); border: 1px solid #e9ecef; }
        .ingestion-eyebrow, .ingestion-section__eyebrow { margin: 0 0 0.25rem 0; color: #868e96; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; }
        .ingestion-copy { color: #495057; margin: 0.5rem 0 0; max-width: 860px; }
        .ingestion-toolbar { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; align-items: end; }
        .ingestion-ontology-preferences { margin-bottom: 1rem; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 1rem; }
        .ingestion-ontology-list { display: flex; flex-wrap: wrap; gap: 0.75rem; }
        .ingestion-ontology-item {
          display: grid; grid-template-columns: auto 1fr auto; gap: 0.75rem; align-items: center;
          border: 1px solid #e9ecef; border-radius: 12px; background: #fff; padding: 0.75rem 0.85rem; min-width: 220px;
        }
        .ingestion-ontology-item__rank {
          width: 1.8rem; height: 1.8rem; border-radius: 999px; background: #edf2ff; color: #364fc7;
          display: inline-flex; align-items: center; justify-content: center; font-size: 0.82rem; font-weight: 700;
        }
        .ingestion-ontology-item__body { display: flex; flex-direction: column; gap: 0.15rem; }
        .ingestion-ontology-item__body span { color: #64748b; font-size: 0.82rem; }
        .ingestion-ontology-item__actions { display: flex; flex-direction: column; gap: 0.35rem; }
        .ingestion-ontology-item__actions button {
          width: 2rem; height: 2rem; border: 1px solid #ced4da; border-radius: 8px; background: white; font-size: 0.95rem;
        }
        .ingestion-ontology-item__actions button:disabled { opacity: 0.45; }
        .ingestion-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .ingestion-field span { font-size: 0.82rem; color: #495057; }
        .ingestion-field input, .ingestion-field select { padding: 0.65rem 0.75rem; border: 1px solid #ced4da; border-radius: 10px; background: white; }
        .ingestion-actions { display: flex; gap: 0.5rem; align-items: center; }
        .ingestion-layout { display: grid; grid-template-columns: 1fr; gap: 1rem; }
        .ingestion-sidebar, .ingestion-main { background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 1rem; }
        .ingestion-sidebar { max-width: none; }
        .ingestion-sidebar .ingestion-list { max-height: 320px; overflow: auto; }
        .ingestion-panel__head, .ingestion-section__head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
        .ingestion-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .ingestion-list__item { text-align: left; border: 1px solid #e9ecef; background: #fff; border-radius: 12px; padding: 0.85rem; cursor: pointer; }
        .ingestion-list__item--selected { border-color: #339af0; box-shadow: 0 0 0 1px #339af0 inset; background: #f8fbff; }
        .ingestion-list__title { font-weight: 600; margin-bottom: 0.35rem; }
        .ingestion-list__meta { display: flex; flex-wrap: wrap; gap: 0.5rem; color: #868e96; font-size: 0.82rem; }
        .ingestion-list__meta--counts { margin-top: 0.35rem; }
        .ingestion-detail { display: flex; flex-direction: column; gap: 1rem; }
        .ingestion-section { border: 1px solid #f1f3f5; border-radius: 12px; padding: 1rem; }
        .ingestion-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
        .ingestion-stat { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.75rem; border-radius: 10px; background: #f8f9fa; }
        .ingestion-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.75rem; }
        .ingestion-card { border: 1px solid #e9ecef; border-radius: 12px; padding: 0.85rem; background: #fff; }
        .ingestion-card__head { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; }
        .ingestion-card__head h4, .ingestion-section h3 { margin: 0; }
        .ingestion-card__head p { margin: 0.25rem 0 0; color: #868e96; font-size: 0.85rem; }
        .ingestion-card__summary { margin: 0.4rem 0; color: #495057; }
        .ingestion-card__meta { display: flex; flex-wrap: wrap; gap: 0.5rem; color: #868e96; font-size: 0.82rem; }
        .ingestion-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.2rem 0.55rem; background: #edf2ff; color: #364fc7; font-size: 0.76rem; text-transform: capitalize; }
        .ingestion-badge--warning { background: #fff3bf; color: #e67700; }
        .ingestion-badge--error { background: #ffe3e3; color: #c92a2a; }
        .ingestion-empty { padding: 1rem; border: 1px dashed #ced4da; border-radius: 12px; color: #868e96; background: #fafbfc; }
        .error-banner { margin-bottom: 1rem; border: 1px solid #ffc9c9; background: #fff5f5; color: #c92a2a; border-radius: 12px; padding: 0.75rem 1rem; }
        @media (max-width: 1100px) {
          .ingestion-toolbar, .ingestion-grid { grid-template-columns: 1fr; }
        }
      `}</style>

    </div>
  )
}
