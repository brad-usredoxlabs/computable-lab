import { useCallback, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { AiAnalysisPanel } from './AiAnalysisPanel'
import { SourceKindSuggestionBadge } from './IngestionAiSuggestion'
import type {
  AnalyzeIngestionDraftSpec,
  AnalyzeIngestionResponse,
  CreateIngestionJobRequest,
  IngestionSourceKind,
  SourceKindSuggestion,
} from '../../types/ingestion'

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

const ONTOLOGY_OPTIONS: Array<{ value: string; label: string }> = [
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
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'vendor_plate_map_spreadsheet'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'vendor_formulation_html'
  return 'other'
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000))
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

export interface UploadResult {
  createdJobId: string
  autoRun: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (result: UploadResult) => void
}

export function IngestionUploadModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [sourceKind, setSourceKind] = useState<IngestionSourceKind>('vendor_plate_map_pdf')
  const [sourceUrl, setSourceUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [ontologyPreferences, setOntologyPreferences] = useState<string[]>(['chebi', 'ncit'])

  const [aiAssist, setAiAssist] = useState(false)
  const [aiIntent, setAiIntent] = useState('')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<AnalyzeIngestionResponse | null>(null)

  const [kindSuggestion, setKindSuggestion] = useState<SourceKindSuggestion | null>(null)
  const [kindLoading, setKindLoading] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setName('')
    setSourceKind('vendor_plate_map_pdf')
    setSourceUrl('')
    setSelectedFile(null)
    setNote('')
    setOntologyPreferences(['chebi', 'ncit'])
    setAiAssist(false)
    setAiIntent('')
    setAiAnalysis(null)
    setKindSuggestion(null)
    setError(null)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [onClose, reset])

  const handleFile = useCallback(async (file: File | null) => {
    setSelectedFile(file)
    setKindSuggestion(null)
    setAiAnalysis(null)
    if (!file) return
    const inferred = inferSourceKindFromFile(file)
    if (inferred !== 'other') setSourceKind(inferred)

    setKindLoading(true)
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
      setKindSuggestion(suggestion)
    } catch {
      // Suggestion is optional.
    } finally {
      setKindLoading(false)
    }
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!selectedFile || !aiIntent.trim()) {
      setError('Upload a file and describe what you want extracted.')
      return
    }
    setAiAnalyzing(true)
    setError(null)
    try {
      const result = await apiClient.analyzeIngestion(selectedFile, aiIntent.trim())
      setAiAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file')
    } finally {
      setAiAnalyzing(false)
    }
  }, [selectedFile, aiIntent])

  const handleReAnalyze = useCallback(async (answers: string[]) => {
    if (!selectedFile || !aiIntent.trim()) return
    setAiAnalyzing(true)
    setError(null)
    try {
      const enhanced = `${aiIntent.trim()}\n\nUser answers:\n${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      const result = await apiClient.analyzeIngestion(selectedFile, enhanced)
      setAiAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-analyze')
    } finally {
      setAiAnalyzing(false)
    }
  }, [selectedFile, aiIntent])

  const submitClassic = useCallback(async () => {
    if (!selectedFile && !sourceUrl.trim()) {
      setError('Select a file or enter a source URL.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const request: CreateIngestionJobRequest = {
        ...(name.trim() ? { name: name.trim() } : {}),
        sourceKind,
        adapterKind: sourceKind,
        ontologyPreferences,
        source: {
          ...(selectedFile ? {
            fileName: selectedFile.name,
            mediaType: selectedFile.type || 'application/octet-stream',
            sizeBytes: selectedFile.size,
            contentBase64: await fileToBase64(selectedFile),
          } : {}),
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }
      const created = await apiClient.createIngestionJob(request)
      onCreated({ createdJobId: created.job.recordId, autoRun: false })
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ingestion job')
    } finally {
      setSubmitting(false)
    }
  }, [selectedFile, sourceUrl, name, sourceKind, ontologyPreferences, note, onCreated, reset])

  const submitAiAssisted = useCallback(async (spec: AnalyzeIngestionDraftSpec) => {
    if (!selectedFile) {
      setError('No file selected')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const request: CreateIngestionJobRequest = {
        ...(name.trim() ? { name: name.trim() } : {}),
        sourceKind: 'other',
        adapterKind: 'ai_assisted',
        ontologyPreferences,
        source: {
          fileName: selectedFile.name,
          mediaType: selectedFile.type || 'application/octet-stream',
          sizeBytes: selectedFile.size,
          contentBase64: await fileToBase64(selectedFile),
          note: `AI-assisted extraction. Intent: ${aiIntent}`,
        },
      }
      const created = await apiClient.createIngestionJob(request)
      try {
        await apiClient.createRecord(
          'https://computable-lab.com/schema/computable-lab/extraction-spec.schema.yaml',
          {
            id: `${created.job.recordId}-spec`,
            job_ref: { kind: 'record', id: created.job.recordId, type: 'ingestion-job' },
            spec,
            source_intent: aiIntent,
          },
        )
      } catch (specErr) {
        console.warn('Failed to attach extraction spec:', specErr)
      }
      await apiClient.runIngestionJob(created.job.recordId, {})
      onCreated({ createdJobId: created.job.recordId, autoRun: true })
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create AI-assisted job')
    } finally {
      setSubmitting(false)
    }
  }, [selectedFile, name, ontologyPreferences, aiIntent, onCreated, reset])

  if (!open) return null

  return (
    <div className="iupload-backdrop" onClick={handleClose}>
      <div className="iupload-modal" onClick={(e) => e.stopPropagation()}>
        <header className="iupload-modal__head">
          <h2>New ingestion job</h2>
          <button type="button" className="iupload-modal__close" onClick={handleClose} aria-label="Close">×</button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div className="iupload-modal__body">
          <label className="ingestion-field">
            <span>Job title</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cayman lipid library PDF" />
          </label>

          <label className="ingestion-field">
            <span>Source file</span>
            <input type="file" onChange={(e) => { void handleFile(e.target.files?.[0] ?? null) }} />
            {selectedFile && <span className="iupload-file-name">{selectedFile.name}</span>}
          </label>

          <label className="ingestion-field">
            <span>Or source URL</span>
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://vendor.example/page" />
          </label>

          <label className="iupload-toggle">
            <input type="checkbox" checked={aiAssist} onChange={(e) => setAiAssist(e.target.checked)} />
            <span>Use AI-assisted extraction (describe intent, let the compiler plan the extraction spec)</span>
          </label>

          {!aiAssist && (
            <label className="ingestion-field">
              <span>Source kind</span>
              <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as IngestionSourceKind)}>
                {SOURCE_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <SourceKindSuggestionBadge
                suggestion={kindSuggestion}
                loading={kindLoading}
                onAccept={(kind) => { setSourceKind(kind); setKindSuggestion(null) }}
              />
            </label>
          )}

          {aiAssist && (
            <label className="ingestion-field">
              <span>Intent</span>
              <textarea
                rows={3}
                value={aiIntent}
                onChange={(e) => setAiIntent(e.target.value)}
                placeholder="e.g., Extract materials and their concentrations from this Cayman plate map PDF"
              />
            </label>
          )}

          <label className="ingestion-field">
            <span>Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Screening library v1" />
          </label>

          <div className="iupload-ontology">
            <span className="iupload-ontology__label">Ontology preference</span>
            <div className="iupload-ontology__list">
              {ontologyPreferences.map((value, index) => {
                const option = ONTOLOGY_OPTIONS.find((o) => o.value === value)
                return (
                  <div key={value} className="iupload-ontology__item">
                    <span className="iupload-ontology__rank">{index + 1}</span>
                    <span>{option?.label ?? value.toUpperCase()}</span>
                    <div className="iupload-ontology__actions">
                      <button
                        type="button"
                        onClick={() => setOntologyPreferences((c) => movePreference(c, index, -1))}
                        disabled={index === 0}
                      >↑</button>
                      <button
                        type="button"
                        onClick={() => setOntologyPreferences((c) => movePreference(c, index, 1))}
                        disabled={index === ontologyPreferences.length - 1}
                      >↓</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {aiAssist && aiAnalysis && (
            <AiAnalysisPanel
              analysis={aiAnalysis}
              onReAnalyze={handleReAnalyze}
              onConfirmAndRun={submitAiAssisted}
              isRunning={submitting}
            />
          )}
        </div>

        <footer className="iupload-modal__foot">
          <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancel</button>
          {aiAssist ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { void handleAnalyze() }}
              disabled={aiAnalyzing || !selectedFile || !aiIntent.trim()}
            >
              {aiAnalyzing ? 'Analyzing…' : aiAnalysis ? 'Re-analyze' : 'Analyze'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { void submitClassic() }}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit job'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
