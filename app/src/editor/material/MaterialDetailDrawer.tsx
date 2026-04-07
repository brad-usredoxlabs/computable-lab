import { useEffect, useState } from 'react'
import { apiClient, type MaterialLineageResponse } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import {
  formatConcentration,
  getPrimaryDeclaredConcentration,
  parseCompositionDrafts,
  parseCompositionEntries,
  parseCompositionProvenance,
  parseVendorDocuments,
} from '../../types/material'
import { MaterialCompositionReview } from './MaterialCompositionReview'

interface Props {
  materialId: string | null
  onClose: () => void
  onStatusChanged?: () => void
}

function display(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  return typeof value === 'string' ? value : value === null || value === undefined ? '—' : JSON.stringify(value)
}

function lineageStep(title: string, body: string, tone: 'blue' | 'emerald' | 'violet' | 'slate' = 'slate', current = false) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
  }
  return (
    <div className="relative pl-8">
      <div className="absolute left-[9px] top-0 h-full w-px bg-gray-200" />
      <div className={`absolute left-0 top-2 h-5 w-5 rounded-full border-2 ${current ? 'border-gray-900 bg-white' : 'border-white bg-gray-400'}`} />
      <div className={`rounded border p-2 ${tones[tone]}`}>
        <div className="text-[11px] uppercase tracking-wide opacity-70">{title}</div>
        <div className="text-xs font-medium mt-1">{body}</div>
      </div>
    </div>
  )
}

export function MaterialDetailDrawer({ materialId, onClose, onStatusChanged }: Props) {
  const [record, setRecord] = useState<RecordEnvelope | null>(null)
  const [lineage, setLineage] = useState<MaterialLineageResponse | null>(null)
  const [status, setStatus] = useState('available')
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isExtractingDocument, setIsExtractingDocument] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!materialId) return
      setLoading(true)
      try {
        const [materialRecord, materialLineage] = await Promise.all([
          apiClient.getMaterial(materialId),
          apiClient.getMaterialLineage(materialId),
        ])
        if (cancelled) return
        setRecord(materialRecord)
        setLineage(materialLineage)
        const nextStatus = typeof materialRecord.payload.status === 'string' ? materialRecord.payload.status : 'available'
        setStatus(nextStatus)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [materialId])

  if (!materialId) return null

  const payload = (record?.payload || {}) as Record<string, unknown>
  const declaredComposition = parseCompositionEntries(payload.declared_composition)
  const compositionProvenance = parseCompositionProvenance(payload.composition_provenance)
  const vendorDocuments = parseVendorDocuments(payload.documents)
  const compositionDrafts = parseCompositionDrafts(payload.composition_drafts)
  const primaryDeclaredConcentration = getPrimaryDeclaredConcentration(payload.declared_composition)
  const currentTitle = display(payload, 'name')
  const derivationOutputs = lineage?.derivation?.outputs.filter((item) => item.recordId !== materialId) || []

  async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 overflow-y-auto p-4 text-sm">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Material Detail</div>
            <h2 className="text-lg font-semibold text-gray-900">{display(payload, 'name')}</h2>
            <div className="text-xs text-gray-500 mt-1">{materialId}</div>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>

        {loading && <div className="text-sm text-gray-500">Loading material…</div>}

        {!loading && (
          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">Metadata</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">Kind</span><div>{display(payload, 'kind')}</div></div>
                <div><span className="text-gray-500">Status</span><div>{display(payload, 'status')}</div></div>
                <div><span className="text-gray-500">Prepared On</span><div>{display(payload, 'prepared_on')}</div></div>
                <div><span className="text-gray-500">Material Ref</span><div>{display(payload, 'material_ref')}</div></div>
                <div><span className="text-gray-500">Material Spec Ref</span><div>{display(payload, 'material_spec_ref')}</div></div>
                <div><span className="text-gray-500">Vendor Product Ref</span><div>{display(payload, 'vendor_product_ref')}</div></div>
              </div>
            </section>

            {(declaredComposition.length > 0 || compositionProvenance || primaryDeclaredConcentration) && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Declared Composition</h3>
                {primaryDeclaredConcentration && (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                    Primary declared concentration: {formatConcentration(primaryDeclaredConcentration)}
                  </div>
                )}
                {declaredComposition.length > 0 && (
                  <div className="space-y-2">
                    {declaredComposition.map((entry, index) => (
                      <div key={`${entry.componentRef.id}-${index}`} className="rounded border border-gray-200 bg-gray-50 p-2 text-xs">
                        <div className="font-medium text-gray-900">{entry.componentRef.label || entry.componentRef.id}</div>
                        <div className="text-gray-600 mt-1">
                          {entry.role}
                          {entry.concentration ? ` · ${formatConcentration(entry.concentration)}` : ''}
                          {entry.source ? ` · ${entry.source}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {compositionProvenance && (
                  <div className="rounded border border-gray-200 bg-white p-2 text-xs space-y-1">
                    <div><span className="text-gray-500">Source</span><div>{compositionProvenance.sourceType || '—'}</div></div>
                    <div><span className="text-gray-500">Vendor</span><div>{compositionProvenance.vendor || '—'}</div></div>
                    <div><span className="text-gray-500">Source URL</span><div>{compositionProvenance.sourceUrl || '—'}</div></div>
                    <div><span className="text-gray-500">Captured Text</span><div>{compositionProvenance.sourceText || '—'}</div></div>
                    <div><span className="text-gray-500">Captured At</span><div>{compositionProvenance.capturedAt || '—'}</div></div>
                  </div>
                )}
                <MaterialCompositionReview materialId={materialId} hasComposition={declaredComposition.length > 0} />
              </section>
            )}

            {payload.kind === 'vendor-product' && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Vendor Documents</h3>
                <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.txt,.csv,.tsv,.md,image/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="text-xs"
                    />
                    <button
                      className="btn btn-primary"
                      disabled={!selectedFile || isExtractingDocument}
                      onClick={async () => {
                        if (!selectedFile) return
                        setIsExtractingDocument(true)
                        setDocumentError(null)
                        try {
                          const contentBase64 = await fileToBase64(selectedFile)
                          await apiClient.extractVendorProductDocument(materialId, {
                            fileName: selectedFile.name,
                            mediaType: selectedFile.type || 'application/octet-stream',
                            contentBase64,
                            documentKind: selectedFile.name.toLowerCase().endsWith('.pdf') ? 'formulation_sheet' : 'other',
                          })
                          const updated = await apiClient.getMaterial(materialId)
                          setRecord(updated)
                          setSelectedFile(null)
                        } catch (err) {
                          setDocumentError(err instanceof Error ? err.message : 'Failed to extract vendor document')
                        } finally {
                          setIsExtractingDocument(false)
                        }
                      }}
                    >
                      {isExtractingDocument ? 'Extracting…' : 'Attach + Extract'}
                    </button>
                  </div>
                  {documentError && <div className="text-xs text-red-700">{documentError}</div>}
                  {vendorDocuments.length === 0 ? (
                    <div className="text-xs text-gray-500">No linked vendor documents yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {vendorDocuments.map((document) => (
                        <div key={document.id} className="rounded border border-gray-200 bg-white p-2 text-xs">
                          <div className="font-medium text-gray-900">{document.title || document.fileRef.fileName}</div>
                          <div className="text-gray-600 mt-1">
                            {document.documentKind || 'other'} · {document.fileRef.mediaType}
                            {document.fileRef.pageCount ? ` · ${document.fileRef.pageCount} page${document.fileRef.pageCount === 1 ? '' : 's'}` : ''}
                          </div>
                          {document.extraction?.method && (
                            <div className="text-gray-500 mt-1">
                              {document.extraction.method}
                              {document.extraction.ocrAvailable === false ? ' · OCR unavailable' : ''}
                            </div>
                          )}
                          {document.extraction?.textExcerpt && (
                            <div className="text-gray-500 mt-1 whitespace-pre-wrap">{document.extraction.textExcerpt}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {compositionDrafts.length === 0 ? (
                    <div className="text-xs text-gray-500">No extraction drafts yet.</div>
                  ) : compositionDrafts.map((draft) => (
                    <div key={draft.id} className="rounded border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
                      <div className="font-medium text-amber-900">
                        Draft {draft.id} · {draft.extractionMethod} · {draft.status}
                        {typeof draft.overallConfidence === 'number' ? ` · confidence ${draft.overallConfidence}` : ''}
                      </div>
                      {draft.items.map((item, index) => (
                        <div key={`${draft.id}-${index}`} className="rounded border border-amber-100 bg-white p-2">
                          <div className="font-medium text-gray-900">{item.componentName}</div>
                          <div className="text-gray-600 mt-1">
                            {item.role}
                            {item.concentration ? ` · ${formatConcentration(item.concentration)}` : ''}
                            {typeof item.confidence === 'number' ? ` · ${item.confidence}` : ''}
                            {item.sourcePage ? ` · page ${item.sourcePage}` : ''}
                          </div>
                          {item.sourceText && <div className="text-gray-500 mt-1 whitespace-pre-wrap">{item.sourceText}</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">Status</h3>
              <div className="flex items-center gap-2">
                <select className="border rounded px-2 py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="available">available</option>
                  <option value="reserved">reserved</option>
                  <option value="consumed">consumed</option>
                  <option value="expired">expired</option>
                  <option value="discarded">discarded</option>
                </select>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await apiClient.updateMaterialStatus(materialId, { status })
                    onStatusChanged?.()
                    const updated = await apiClient.getMaterial(materialId)
                    setRecord(updated)
                  }}
                >
                  Update Status
                </button>
                <button className="btn btn-secondary" onClick={async () => { await apiClient.updateMaterialStatus(materialId, { status: 'consumed' }); onStatusChanged?.(); const updated = await apiClient.getMaterial(materialId); setRecord(updated); setStatus('consumed') }}>Mark Used</button>
                <button className="btn btn-secondary" onClick={async () => { await apiClient.updateMaterialStatus(materialId, { status: 'discarded' }); onStatusChanged?.(); const updated = await apiClient.getMaterial(materialId); setRecord(updated); setStatus('discarded') }}>Discard</button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">Lineage</h3>
              <div className="space-y-3">
                {lineage?.parent
                  ? lineageStep('Source Batch', `${lineage.parent.title} (${lineage.parent.recordId})`, 'blue')
                  : lineageStep('Source Batch', 'No recorded parent batch', 'slate')}
                {lineage?.derivation?.inputs?.length
                  ? lineageStep(
                      'Derivation Inputs',
                      lineage.derivation.inputs.map((input) => `${input.title} (${input.recordId})`).join(', '),
                      'violet',
                    )
                  : null}
                {lineage?.derivation
                  ? lineageStep('Derivation Step', `${lineage.derivation.derivationType || 'derivation'} · ${lineage.derivation.recordId}`, 'violet')
                  : null}
                {lineageStep('Current Material', `${currentTitle} (${materialId})`, 'emerald', true)}
                {lineage?.children?.length
                  ? lineageStep('Child Aliquots / Outputs', lineage.children.map((child) => `${child.title} (${child.recordId})`).join(', '), 'emerald')
                  : null}
                {derivationOutputs.length
                  ? lineageStep('Other Derivation Outputs', derivationOutputs.map((item) => `${item.title} (${item.recordId})`).join(', '), 'blue')
                  : null}
              </div>
              {lineage?.derivation ? (
                <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs space-y-1">
                  <div><span className="text-gray-500">Derivation</span><div>{lineage.derivation.recordId}</div></div>
                  <div><span className="text-gray-500">Type</span><div>{lineage.derivation.derivationType || '—'}</div></div>
                  <div><span className="text-gray-500">Inputs</span><div>{lineage.derivation.inputs.map((input) => input.title).join(', ') || '—'}</div></div>
                </div>
              ) : null}
            </section>

            {(Boolean(payload.biological_state) || Boolean(payload.derived_state)) && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Specialized State</h3>
                {Boolean(payload.biological_state) && <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto">{JSON.stringify(payload.biological_state, null, 2)}</pre>}
                {Boolean(payload.derived_state) && <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto">{JSON.stringify(payload.derived_state, null, 2)}</pre>}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
