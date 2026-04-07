/**
 * RecordPreviewPanel — Right pane showing preview of selected record.
 * 
 * Displays record metadata, content summary, and action buttons.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBrowser } from '../../shared/context/BrowserContext'
import { apiClient } from '../../shared/api/client'
import { SectionedForm } from '../../shared/forms/SectionedForm'
import type { IndexEntry } from '../../types/tree'
import type { RecordEnvelope } from '../../types/kernel'
import type { UISpec } from '../../types/uiSpec'

// Simple cn utility
const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

interface RecordPreviewPanelProps {
  className?: string
}

// Icons
const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ExternalLinkIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)

const FolderIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

/**
 * Extract a readable schema name from schemaId.
 */
function getSchemaDisplayName(schemaId: string): string {
  const match = schemaId.match(/([^/]+)\.schema\.yaml$/)
  if (match) {
    return match[1]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  return schemaId
}

/**
 * Format a date string for display.
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/**
 * Get color class for status badge.
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'filed':
      return 'bg-green-100 text-green-700'
    case 'inbox':
      return 'bg-amber-100 text-amber-700'
    case 'draft':
      return 'bg-gray-100 text-gray-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

/**
 * Get color class for kind badge.
 */
function getKindColor(kind?: string): string {
  switch (kind) {
    case 'event-graph':
      return 'bg-purple-100 text-purple-700'
    case 'plate':
      return 'bg-pink-100 text-pink-700'
    case 'study':
      return 'bg-blue-100 text-blue-700'
    case 'experiment':
      return 'bg-amber-100 text-amber-700'
    case 'run':
      return 'bg-green-100 text-green-700'
    case 'context':
      return 'bg-cyan-100 text-cyan-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

/**
 * Empty state when no record is selected.
 */
function EmptyPreviewState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
      <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm text-center">
        Select a record to view details
      </p>
    </div>
  )
}

/**
 * Loading state while fetching record.
 */
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
      <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full mb-4" />
      <p className="text-sm">Loading record...</p>
    </div>
  )
}

/**
 * Main preview panel component.
 */
export function RecordPreviewPanel({ className }: RecordPreviewPanelProps) {
  const navigate = useNavigate()
  const { 
    selectedRecordId, 
    setSelectedRecordId, 
    studies, 
    fileToRun
  } = useBrowser()
  
  const [record, setRecord] = useState<Record<string, unknown> | null>(null)
  const [indexEntry, setIndexEntry] = useState<IndexEntry | null>(null)
  const [uiSpec, setUiSpec] = useState<UISpec | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFileDialog, setShowFileDialog] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [filing, setFiling] = useState(false)

  // Fetch record when selection changes
  useEffect(() => {
    if (!selectedRecordId) {
      setRecord(null)
      setIndexEntry(null)
      setUiSpec(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    apiClient.getRecord(selectedRecordId)
      .then(async (data: RecordEnvelope) => {
        setRecord(data as unknown as Record<string, unknown>)
        // Extract index-like info from the record
        if (data) {
          const payload = data.payload as Record<string, unknown>
          const meta = (data as unknown as Record<string, unknown>).meta as Record<string, unknown> | undefined
          setIndexEntry({
            recordId: data.recordId,
            schemaId: data.schemaId,
            kind: payload?.kind as string | undefined,
            title: (payload?.title || payload?.name) as string | undefined,
            status: (payload?.status || 'draft') as 'inbox' | 'filed' | 'draft',
            links: payload?.links as IndexEntry['links'],
            createdAt: payload?.createdAt as string | undefined,
            updatedAt: payload?.updatedAt as string | undefined,
            path: meta?.path as string || '',
          })
          // Fetch UISpec for compact preview
          try {
            const spec = await apiClient.getUiSpec(data.schemaId)
            setUiSpec(spec)
          } catch {
            setUiSpec(null)
          }
        }
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load record')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [selectedRecordId])

  // Handle opening record in appropriate editor
  const handleOpen = () => {
    if (!indexEntry) return

    const schemaName = indexEntry.schemaId.toLowerCase()
    const kind = indexEntry.kind?.toLowerCase()
    
    if (schemaName.includes('event-graph') || kind === 'event-graph') {
      // Open in labware editor with query param
      navigate(`/labware-editor?id=${encodeURIComponent(indexEntry.recordId)}`)
    } else {
      // Open in record viewer
      navigate(`/records/${encodeURIComponent(indexEntry.recordId)}`)
    }
  }

  // Handle editing record
  const handleEdit = () => {
    if (!indexEntry) return
    navigate(`/records/${encodeURIComponent(indexEntry.recordId)}/edit`)
  }

  // Handle filing to run
  const handleFile = async () => {
    if (!indexEntry || !selectedRunId) return
    
    setFiling(true)
    try {
      const success = await fileToRun(indexEntry.recordId, selectedRunId)
      if (success) {
        setShowFileDialog(false)
        setSelectedRunId(null)
      }
    } finally {
      setFiling(false)
    }
  }

  // Empty state
  if (!selectedRecordId) {
    return (
      <div className={cn('bg-white', className)}>
        <EmptyPreviewState />
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className={cn('bg-white', className)}>
        <LoadingState />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('bg-white p-4', className)}>
        <div className="text-red-500 text-sm">
          <p className="font-medium">Error loading record</p>
          <p className="mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedRecordId(null)}
          className="mt-4 text-sm text-gray-500 hover:text-gray-700"
        >
          Close
        </button>
      </div>
    )
  }

  if (!indexEntry) {
    return (
      <div className={cn('bg-white', className)}>
        <EmptyPreviewState />
      </div>
    )
  }

  const isInbox = indexEntry.status === 'inbox'

  return (
    <div className={cn('bg-white flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-semibold text-gray-900 truncate">
            {indexEntry.title || indexEntry.recordId}
          </h3>
          <p className="text-xs text-gray-500 mt-1 truncate font-mono">
            {indexEntry.recordId}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedRecordId(null)}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
          title="Close preview"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-gray-100">
        {indexEntry.kind && (
          <span className={cn('text-xs px-2 py-0.5 rounded', getKindColor(indexEntry.kind))}>
            {indexEntry.kind}
          </span>
        )}
        <span className={cn('text-xs px-2 py-0.5 rounded', getStatusColor(indexEntry.status))}>
          {indexEntry.status}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
          {getSchemaDisplayName(indexEntry.schemaId)}
        </span>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 space-y-2 text-sm border-b border-gray-100">
        <div className="flex justify-between">
          <span className="text-gray-500">Created</span>
          <span className="text-gray-700">{formatDate(indexEntry.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Updated</span>
          <span className="text-gray-700">{formatDate(indexEntry.updatedAt)}</span>
        </div>
        {indexEntry.links?.studyId && (
          <div className="flex justify-between">
            <span className="text-gray-500">Study</span>
            <span className="text-gray-700 font-mono text-xs">{indexEntry.links.studyId}</span>
          </div>
        )}
        {indexEntry.links?.experimentId && (
          <div className="flex justify-between">
            <span className="text-gray-500">Experiment</span>
            <span className="text-gray-700 font-mono text-xs">{indexEntry.links.experimentId}</span>
          </div>
        )}
        {indexEntry.links?.runId && (
          <div className="flex justify-between">
            <span className="text-gray-500">Run</span>
            <span className="text-gray-700 font-mono text-xs">{indexEntry.links.runId}</span>
          </div>
        )}
      </div>

      {/* Content preview (scrollable) */}
      <div className="flex-1 overflow-y-auto p-4">
        {record && uiSpec?.form?.sections?.length ? (
          <SectionedForm
            uiSpec={uiSpec}
            formData={(record as Record<string, unknown>).payload as Record<string, unknown>}
            readOnly
            compact
          />
        ) : record ? (
          <div className="text-xs font-mono bg-gray-50 p-3 rounded overflow-x-auto">
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify((record as Record<string, unknown>).payload, null, 2)?.slice(0, 1000)}
              {JSON.stringify((record as Record<string, unknown>).payload)?.length > 1000 && '...'}
            </pre>
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleOpen}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded hover:bg-blue-600 transition-colors"
          >
            <ExternalLinkIcon />
            Open
          </button>
          <button
            type="button"
            onClick={handleEdit}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition-colors"
          >
            <EditIcon />
            Edit
          </button>
        </div>

        {/* File to run - only show for inbox records */}
        {isInbox && (
          <div className="pt-2 border-t border-gray-100">
            {!showFileDialog ? (
              <button
                type="button"
                onClick={() => setShowFileDialog(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium rounded hover:bg-amber-100 transition-colors"
              >
                <FolderIcon />
                File to Run...
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  Select destination run:
                </label>
                <select
                  value={selectedRunId || ''}
                  onChange={e => setSelectedRunId(e.target.value || null)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                >
                  <option value="">Choose a run...</option>
                  {studies.map(study => (
                    <optgroup key={study.recordId} label={study.title}>
                      {study.experiments.map(exp => (
                        <optgroup key={exp.recordId} label={`  └ ${exp.title}`}>
                          {exp.runs.map(run => (
                            <option key={run.recordId} value={run.recordId}>
                              &nbsp;&nbsp;&nbsp;&nbsp;• {run.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFileDialog(false)
                      setSelectedRunId(null)
                    }}
                    className="flex-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFile}
                    disabled={!selectedRunId || filing}
                    className={cn(
                      'flex-1 px-3 py-1.5 text-sm font-medium rounded',
                      selectedRunId && !filing
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    )}
                  >
                    {filing ? 'Filing...' : 'File'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
