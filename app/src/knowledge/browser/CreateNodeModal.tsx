/**
 * CreateNodeModal — Modal for creating new study/experiment/run nodes.
 * Renders a projection-backed TapTab create surface when a UISpec exists,
 * falling back to a minimal title+description form otherwise.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useBrowser } from '../../shared/context/BrowserContext'
import { apiClient } from '../../shared/api/client'
import { ProjectionTapTabEditor } from '../../editor/taptab/TapTabEditor'
import { serializeDocument, isDirty } from '../../editor/taptab/recordSerializer'
import type { EditorProjectionResponse } from '../../types/uiSpec'
import type { TapTabEditorHandle } from '../../editor/taptab'

const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

export type CreateNodeType = 'study' | 'experiment' | 'run'

interface CreateNodeModalProps {
  isOpen: boolean
  onClose: () => void
  nodeType: CreateNodeType
  studyId?: string
  experimentId?: string
}

const SCHEMA_IDS: Record<CreateNodeType, string> = {
  study: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
  experiment: 'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
}

const NODE_LABELS: Record<CreateNodeType, string> = {
  study: 'Study',
  experiment: 'Experiment',
  run: 'Run',
}

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

/** Generate a record ID in the expected prefix format. */
function generateRecordId(nodeType: CreateNodeType, title: string): string {
  const prefix = nodeType === 'study' ? 'STD' : nodeType === 'experiment' ? 'EXP' : 'RUN'
  const slug = title.trim().toLowerCase().replace(/\s+/g, '-').substring(0, 20)
  return `${prefix}_0001__${slug}`
}

/** Derive shortSlug from a title string. */
function generateShortSlug(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, '-').substring(0, 30)
}

export function CreateNodeModal({
  isOpen,
  onClose,
  nodeType,
  studyId,
  experimentId,
}: CreateNodeModalProps) {
  const { refresh } = useBrowser()
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null)
  const [projectionError, setProjectionError] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({})
  const [isDirtyState, setIsDirtyState] = useState(false)
  const [loadingSpec, setLoadingSpec] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const taptabEditorRef = useRef<TapTabEditorHandle | null>(null)

  // Load draft editor projection when modal opens
  useEffect(() => {
    if (!isOpen) return

    setError(null)
    setProjection(null)
    setProjectionError(null)

    const schemaId = SCHEMA_IDS[nodeType]

    // Build initial formData with pre-populated fields
    const initial: Record<string, unknown> = {
      recordId: generateRecordId(nodeType, 'new'),
      kind: nodeType,
    }
    if (nodeType === 'study' || nodeType === 'experiment') {
      initial.state = 'draft'
    }
    if (nodeType === 'experiment' && studyId) {
      initial.studyId = studyId
    }
    if (nodeType === 'run') {
      if (experimentId) initial.experimentId = experimentId
      if (studyId) initial.studyId = studyId
      initial.status = 'planned'
    }
    setFormData(initial)
    setOriginalData(structuredClone(initial))

    // Fetch draft editor projection
    setLoadingSpec(true)
    apiClient
      .getEditorDraftProjection(schemaId)
      .then((proj) => {
        setProjection(proj)
      })
      .catch((err) => {
        console.warn('Editor draft projection unavailable; falling back.', err)
        setProjectionError(err instanceof Error ? err.message : 'Draft projection fetch failed')
      })
      .finally(() => {
        setLoadingSpec(false)
      })
  }, [isOpen, nodeType, studyId, experimentId])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Derive recordId and shortSlug from title as user types
  const handleFormChange = useCallback(
    (next: Record<string, unknown>) => {
      // Auto-generate recordId and shortSlug from title
      if (next.title && typeof next.title === 'string' && next.title !== formData.title) {
        const title = next.title as string
        next.recordId = generateRecordId(nodeType, title)
        next.shortSlug = generateShortSlug(title)
      }
      setFormData(next)
    },
    [formData.title, nodeType],
  )

  // Track dirty state from TapTab editor
  const handleEditorUpdate = useCallback(
    (serialized: Record<string, unknown>, dirty: boolean) => {
      handleFormChange(serialized)
      setIsDirtyState(dirty)
    },
    [handleFormChange],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required: title
    if (!formData.title || !(formData.title as string).trim()) {
      setError('Title is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Serialize from TapTab editor if available, otherwise use formData directly
      let payload: Record<string, unknown>
      if (taptabEditorRef.current) {
        const editor = taptabEditorRef.current.getEditor()
        if (editor) {
          const docJson = editor.getJSON()
          payload = serializeDocument(docJson, formData)
        } else {
          payload = formData
        }
      } else {
        payload = formData
      }

      await apiClient.createRecord(SCHEMA_IDS[nodeType], payload)
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const useProjectionTapTab = projection !== null && !loadingSpec

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            Create {NODE_LABELS[nodeType]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 overflow-y-auto flex-1">
            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            {loadingSpec ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full mr-3" />
                <span className="text-sm">Loading form...</span>
              </div>
            ) : useProjectionTapTab && projection ? (
              /* Projection-backed TapTab create surface */
              <div className="taptab-editor-container">
                <ProjectionTapTabEditor
                  ref={taptabEditorRef as any}
                  blocks={projection.blocks}
                  slots={projection.slots}
                  data={formData}
                  disabled={isSubmitting}
                  onUpdate={handleEditorUpdate}
                />
              </div>
            ) : (
              /* Fallback: explicit error or bare-bones title + description */
              <div className="space-y-4">
                {projectionError && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
                    <strong>Projection unavailable:</strong> {projectionError}
                  </div>
                )}
                <div>
                  <label htmlFor="node-title" className="block text-sm font-medium text-gray-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="node-title"
                    type="text"
                    value={(formData.title as string) || ''}
                    onChange={(e) => handleFormChange({ ...formData, title: e.target.value })}
                    placeholder={`Enter ${nodeType} title...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none"
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="node-description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="node-description"
                    value={(formData.description as string) || ''}
                    onChange={(e) => handleFormChange({ ...formData, description: e.target.value })}
                    placeholder="Optional description..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none resize-none"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded',
                isSubmitting
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600',
              )}
            >
              {isSubmitting ? 'Creating...' : `Create ${NODE_LABELS[nodeType]}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
