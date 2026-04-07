import { useEffect, useMemo, useState } from 'react'
import type { OntologyRef, RecordRef } from '../../shared/ref'
import { apiClient, type VendorSearchResult } from '../../shared/api/client'
import {
  CONCENTRATION_UNITS,
  MATERIAL_SCHEMA_ID,
  VENDOR_PRODUCT_SCHEMA_ID,
  parseCompositionDrafts,
  parseVendorDocuments,
  formatConcentration,
  generateMaterialId,
  generateVendorProductId,
  inferDomainFromNamespace,
  type CompositionDraftValue,
  type VendorDocumentValue,
  withInferredConcentrationBasis,
} from '../../types/material'

interface VendorProductBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  ontologyRef: OntologyRef | null
  initialSearchResult?: VendorSearchResult | null
  onSave: (ref: RecordRef) => void
}

function stableOntologyMaterialId(ref: OntologyRef): string {
  const seed = `${ref.namespace}-${ref.id}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28)
  return seed ? `MAT-${seed}` : generateMaterialId(ref.label || ref.id)
}

function selectSuggestedDraft(drafts: CompositionDraftValue[]): CompositionDraftValue | null {
  if (drafts.length === 0) return null
  return [...drafts]
    .filter((draft) => draft.status !== 'rejected')
    .sort((left, right) => {
      const leftConfidence = typeof left.overallConfidence === 'number' ? left.overallConfidence : -1
      const rightConfidence = typeof right.overallConfidence === 'number' ? right.overallConfidence : -1
      if (rightConfidence !== leftConfidence) return rightConfidence - leftConfidence
      return right.items.length - left.items.length
    })[0] || null
}

function summarizeDraft(draft: CompositionDraftValue | null): string | null {
  if (!draft || draft.items.length === 0) return null
  return draft.items
    .map((item) => item.concentration
      ? `${item.componentName} @ ${formatConcentration(item.concentration)}`
      : item.componentName)
    .join(', ')
}

function primaryDraftConcentration(draft: CompositionDraftValue | null) {
  if (!draft) return undefined
  for (const role of ['solute', 'activity_source', 'cells', 'other'] as const) {
    const match = draft.items.find((item) => item.role === role && item.concentration)
    if (match?.concentration) return match.concentration
  }
  return draft.items.find((item) => item.concentration)?.concentration
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const tail = parsed.pathname.split('/').filter(Boolean).pop() || 'vendor-page'
    return /\.[a-z0-9]+$/i.test(tail) ? tail : `${tail}.html`
  } catch {
    return 'vendor-page.html'
  }
}

export function VendorProductBuilderModal({ isOpen, onClose, ontologyRef, initialSearchResult = null, onSave }: VendorProductBuilderModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<VendorSearchResult[]>([])
  const [searchStatus, setSearchStatus] = useState<Array<{ vendor: 'thermo' | 'sigma'; success: boolean; error?: string }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [vendor, setVendor] = useState('')
  const [catalogNumber, setCatalogNumber] = useState('')
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [packageSize, setPackageSize] = useState('')
  const [formulation, setFormulation] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [description, setDescription] = useState('')
  const [declaredConcentration, setDeclaredConcentration] = useState<NonNullable<VendorSearchResult['declaredConcentration']> | undefined>(undefined)
  const [compositionSourceText, setCompositionSourceText] = useState('')
  const [vendorProductId, setVendorProductId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [htmlSourceUrl, setHtmlSourceUrl] = useState('')
  const [vendorDocuments, setVendorDocuments] = useState<VendorDocumentValue[]>([])
  const [compositionDrafts, setCompositionDrafts] = useState<CompositionDraftValue[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState('')
  const [isExtractingDocument, setIsExtractingDocument] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const initialQuery = initialSearchResult?.name || ontologyRef?.label || ''
    setSearchQuery(initialQuery)
    setSearchResults([])
    setSearchStatus([])
    setSearchLoading(false)
    setSearchError(null)
    setVendor(initialSearchResult?.vendor === 'thermo' ? 'Thermo Fisher' : initialSearchResult?.vendor === 'sigma' ? 'Sigma-Aldrich' : '')
    setCatalogNumber(initialSearchResult?.catalogNumber || '')
    setName(initialSearchResult?.name || ontologyRef?.label || '')
    setGrade(initialSearchResult?.grade || '')
    setPackageSize('')
    setFormulation(initialSearchResult?.formulation || '')
    setProductUrl(initialSearchResult?.productUrl || '')
    setDescription(initialSearchResult?.description || '')
    setDeclaredConcentration(withInferredConcentrationBasis(initialSearchResult?.declaredConcentration))
    setCompositionSourceText(initialSearchResult?.compositionSourceText || initialSearchResult?.formulation || '')
    setVendorProductId('')
    setSelectedFile(null)
    setHtmlSourceUrl(initialSearchResult?.productUrl || '')
    setVendorDocuments([])
    setCompositionDrafts([])
    setSelectedDraftId('')
    setIsExtractingDocument(false)
    setDocumentError(null)
    setError(null)
  }, [initialSearchResult, isOpen, ontologyRef])

  const materialId = useMemo(() => {
    if (ontologyRef) return stableOntologyMaterialId(ontologyRef)
    return generateMaterialId(name || 'material')
  }, [name, ontologyRef])

  const availableDrafts = useMemo(() => (
    [...compositionDrafts]
      .filter((draft) => draft.status !== 'rejected')
      .sort((left, right) => {
        const leftConfidence = typeof left.overallConfidence === 'number' ? left.overallConfidence : -1
        const rightConfidence = typeof right.overallConfidence === 'number' ? right.overallConfidence : -1
        if (rightConfidence !== leftConfidence) return rightConfidence - leftConfidence
        return right.items.length - left.items.length
      })
  ), [compositionDrafts])
  const suggestedDraft = useMemo(() => selectSuggestedDraft(availableDrafts), [availableDrafts])
  const selectedDraft = useMemo(() => {
    if (selectedDraftId) {
      const explicit = availableDrafts.find((draft) => draft.id === selectedDraftId)
      if (explicit) return explicit
    }
    return suggestedDraft
  }, [availableDrafts, selectedDraftId, suggestedDraft])
  const suggestedDraftSummary = useMemo(() => summarizeDraft(selectedDraft), [selectedDraft])

  useEffect(() => {
    if (!availableDrafts.length) {
      setSelectedDraftId('')
      return
    }
    if (selectedDraftId && availableDrafts.some((draft) => draft.id === selectedDraftId)) return
    setSelectedDraftId(availableDrafts[0]?.id || '')
  }, [availableDrafts, selectedDraftId])

  useEffect(() => {
    if (!isOpen || searchQuery.trim().length < 2) {
      setSearchResults([])
      setSearchStatus([])
      setSearchLoading(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const response = await apiClient.searchVendorProducts({ q: searchQuery.trim(), vendors: ['thermo', 'sigma'], limit: 10 })
        if (cancelled) return
        setSearchResults(response.items)
        setSearchStatus(response.vendors)
      } catch (err) {
        if (cancelled) return
        setSearchResults([])
        setSearchStatus([])
        setSearchError(err instanceof Error ? err.message : 'Vendor search failed')
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, searchQuery])

  if (!isOpen) return null
  const activeRef = ontologyRef

  function applySearchResult(result: VendorSearchResult) {
    setVendor(result.vendor === 'thermo' ? 'Thermo Fisher' : 'Sigma-Aldrich')
    setCatalogNumber(result.catalogNumber)
    setName(result.name)
    setGrade(result.grade || '')
    setFormulation(result.formulation || '')
    setProductUrl(result.productUrl || '')
    setDescription(result.description || '')
    setDeclaredConcentration(withInferredConcentrationBasis(result.declaredConcentration))
    setCompositionSourceText(result.compositionSourceText || result.formulation || '')
  }

  async function ensureMaterialRecord(): Promise<{ kind: 'record'; id: string; type: 'material'; label: string }> {
    const existingMaterial = await apiClient.getRecord(materialId).catch(() => null)
    if (existingMaterial) {
      return {
        kind: 'record' as const,
        id: materialId,
        type: 'material',
        label: activeRef?.label || name.trim(),
      }
    }
    await apiClient.createRecord(MATERIAL_SCHEMA_ID, {
      kind: 'material',
      id: materialId,
      name: activeRef?.label || name.trim(),
      domain: activeRef ? inferDomainFromNamespace(activeRef.namespace) : 'chemical',
      ...(activeRef ? {
        class: [{
          kind: activeRef.kind,
          id: activeRef.id,
          namespace: activeRef.namespace,
          label: activeRef.label,
          ...(activeRef.uri ? { uri: activeRef.uri } : {}),
        }],
      } : {}),
    })
    return {
      kind: 'record' as const,
      id: materialId,
      type: 'material',
      label: activeRef?.label || name.trim(),
    }
  }

  function buildVendorProductPayload(
    resolvedVendorProductId: string,
    materialRef: { kind: 'record'; id: string; type: 'material'; label: string },
    existingPayload?: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const manualDeclaredComposition = declaredConcentration
      ? [{
          component_ref: materialRef,
          role: 'solute',
          concentration: declaredConcentration,
          source: 'vendor declaration',
        }]
      : undefined
    const manualProvenance = manualDeclaredComposition
      ? {
          source_type: initialSearchResult ? 'vendor_search' : 'manual',
          vendor: vendor.trim(),
          ...(productUrl.trim() ? { source_url: productUrl.trim() } : {}),
          ...(compositionSourceText.trim() ? { source_text: compositionSourceText.trim() } : {}),
          captured_at: new Date().toISOString(),
        }
      : undefined

    return {
      kind: 'vendor-product',
      id: resolvedVendorProductId,
      name: name.trim(),
      vendor: vendor.trim(),
      catalog_number: catalogNumber.trim(),
      material_ref: materialRef,
      ...(grade.trim() ? { grade: grade.trim() } : {}),
      ...(packageSize.trim() ? { package_size: packageSize.trim() } : {}),
      ...(formulation.trim() ? { formulation: formulation.trim() } : {}),
      ...(productUrl.trim() ? { product_url: productUrl.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(manualDeclaredComposition
        ? { declared_composition: manualDeclaredComposition }
        : existingPayload?.declared_composition
          ? { declared_composition: existingPayload.declared_composition }
          : {}),
      ...(manualProvenance
        ? { composition_provenance: manualProvenance }
        : existingPayload?.composition_provenance
          ? { composition_provenance: existingPayload.composition_provenance }
          : {}),
      ...(Array.isArray(existingPayload?.documents)
        ? { documents: existingPayload.documents }
        : {}),
      ...(Array.isArray(existingPayload?.composition_drafts)
        ? { composition_drafts: existingPayload.composition_drafts }
        : {}),
    }
  }

  async function upsertVendorProductRecord() {
    if (!vendor.trim() || !catalogNumber.trim() || !name.trim()) {
      throw new Error('Vendor, catalog number, and product name are required')
    }
    const materialRef = await ensureMaterialRecord()
    const resolvedVendorProductId = vendorProductId || generateVendorProductId(vendor, catalogNumber)
    if (!vendorProductId) setVendorProductId(resolvedVendorProductId)
    const existingRecord = await apiClient.getRecord(resolvedVendorProductId).catch(() => null)
    const existingPayload = existingRecord?.payload as Record<string, unknown> | undefined
    const payload = buildVendorProductPayload(resolvedVendorProductId, materialRef, existingPayload)
    if (existingRecord) {
      await apiClient.updateRecord(resolvedVendorProductId, payload)
    } else {
      await apiClient.createRecord(VENDOR_PRODUCT_SCHEMA_ID, payload)
    }
    return { vendorProductId: resolvedVendorProductId }
  }

  async function refreshVendorExtractionState(resolvedVendorProductId: string) {
    const updatedRecord = await apiClient.getRecord(resolvedVendorProductId)
    const payload = updatedRecord.payload as Record<string, unknown>
    setVendorDocuments(parseVendorDocuments(payload.documents))
    setCompositionDrafts(parseCompositionDrafts(payload.composition_drafts))
  }

  function applySuggestedDraft() {
    if (!selectedDraft) return
    const summary = suggestedDraftSummary || ''
    if (summary) {
      setFormulation((current) => current.trim() ? current : summary)
      setCompositionSourceText(summary)
    }
    const concentration = primaryDraftConcentration(selectedDraft)
    if (concentration) {
      setDeclaredConcentration(withInferredConcentrationBasis(concentration))
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!vendor.trim() || !catalogNumber.trim() || !name.trim()) {
      setError('Vendor, catalog number, and product name are required')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const persisted = await upsertVendorProductRecord()
      onSave({ kind: 'record', id: persisted.vendorProductId, type: 'vendor-product', label: name.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor product')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col text-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">Add Vendor Product</h2>
            <p className="text-xs text-gray-500 mt-1">Search Thermo and Sigma for a product{activeRef ? ` linked to ${activeRef.label}` : ''}, then save a local vendor reagent record.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr,1fr] gap-0 min-h-0 overflow-hidden">
          <div className="p-4 border-r border-gray-200 overflow-y-auto">
            <div className="space-y-3">
              <label className="formulations-field">
                <span>Search vendor catalogs</span>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="DMSO, Clofibrate, PBS..." />
              </label>
              {searchLoading && <div className="text-xs text-gray-500">Searching Thermo and Sigma…</div>}
              {searchError && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-red-700 text-xs">{searchError}</div>}
              {searchStatus.length > 0 && (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {searchStatus.map((entry) => (
                    <span key={entry.vendor} className={`px-2 py-1 rounded-full border ${entry.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                      {entry.vendor}: {entry.success ? 'ok' : entry.error || 'unavailable'}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {searchResults.length === 0 && !searchLoading ? (
                  <div className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg p-3">
                    No live vendor matches yet. You can still enter vendor details manually.
                  </div>
                ) : searchResults.map((result, index) => (
                  <button
                    key={`${result.vendor}-${result.catalogNumber}-${index}`}
                    type="button"
                    className="w-full text-left border rounded-lg p-3 hover:bg-slate-50"
                    onClick={() => applySearchResult(result)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">{result.name}</div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${result.vendor === 'thermo' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                        {result.vendor === 'thermo' ? 'Thermo' : 'Sigma'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">Catalog: {result.catalogNumber}</div>
                    {result.declaredConcentration && (
                      <div className="text-xs text-emerald-700 mt-1">
                        Declared concentration: {formatConcentration(result.declaredConcentration)}
                      </div>
                    )}
                    {result.description && <div className="text-xs text-slate-500 mt-1">{result.description}</div>}
                    {result.productUrl && <div className="text-[11px] text-sky-700 mt-1 break-all">{result.productUrl}</div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <form onSubmit={handleSave} className="p-4 space-y-3 overflow-y-auto">
            {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-red-700 text-xs">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <label className="formulations-field">
                <span>Vendor</span>
                <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Sigma-Aldrich, Thermo Fisher" />
              </label>
              <label className="formulations-field">
                <span>Catalog number</span>
                <input value={catalogNumber} onChange={(e) => setCatalogNumber(e.target.value)} placeholder="D8418" />
              </label>
            </div>
            <label className="formulations-field">
              <span>Product name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dimethyl sulfoxide" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="formulations-field">
                <span>Grade</span>
                <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Cell culture grade" />
              </label>
              <label className="formulations-field">
                <span>Package size</span>
                <input value={packageSize} onChange={(e) => setPackageSize(e.target.value)} placeholder="100 mL" />
              </label>
            </div>
            <label className="formulations-field">
              <span>Vendor formulation / purity</span>
              <input value={formulation} onChange={(e) => setFormulation(e.target.value)} placeholder="99.9%" />
            </label>
            <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Get formulation from vendor PDF</div>
                  <div className="text-xs text-gray-500">Attach a product sheet or formulation sheet and extract a manufacturer suggestion in-place.</div>
                </div>
                <div className="text-[11px] text-gray-500">{vendorProductId || 'unsaved vendor product'}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".pdf,.txt,.csv,.tsv,.md,image/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs"
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!selectedFile || isExtractingDocument}
                  onClick={async () => {
                    if (!selectedFile) return
                    setDocumentError(null)
                    setIsExtractingDocument(true)
                    try {
                      const persisted = await upsertVendorProductRecord()
                      const contentBase64 = await fileToBase64(selectedFile)
                      await apiClient.extractVendorProductDocument(persisted.vendorProductId, {
                        fileName: selectedFile.name,
                        mediaType: selectedFile.type || 'application/octet-stream',
                        contentBase64,
                        documentKind: selectedFile.name.toLowerCase().endsWith('.pdf') ? 'formulation_sheet' : 'other',
                      })
                      await refreshVendorExtractionState(persisted.vendorProductId)
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
              <div className="border-t border-gray-200 pt-3 space-y-2">
                <div className="text-sm font-medium text-gray-900">Get formulation from HTML URL</div>
                <div className="text-xs text-gray-500">
                  Paste a vendor technical article or formulation page URL and extract the composition directly from the HTML table.
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1"
                    type="url"
                    value={htmlSourceUrl}
                    onChange={(e) => setHtmlSourceUrl(e.target.value)}
                    placeholder="https://www.sigmaaldrich.com/.../media-formulations-rpmi-1640"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!htmlSourceUrl.trim() || isExtractingDocument}
                    onClick={async () => {
                      const trimmedUrl = htmlSourceUrl.trim()
                      if (!trimmedUrl) return
                      setDocumentError(null)
                      setIsExtractingDocument(true)
                      try {
                        const persisted = await upsertVendorProductRecord()
                        await apiClient.extractVendorProductDocument(persisted.vendorProductId, {
                          fileName: fileNameFromUrl(trimmedUrl),
                          mediaType: 'text/html',
                          sourceUrl: trimmedUrl,
                          documentKind: 'formulation_sheet',
                          title: `${name.trim() || 'Vendor product'} formulation page`,
                          note: 'Imported from vendor HTML URL',
                        })
                        await refreshVendorExtractionState(persisted.vendorProductId)
                      } catch (err) {
                        setDocumentError(err instanceof Error ? err.message : 'Failed to extract vendor HTML')
                      } finally {
                        setIsExtractingDocument(false)
                      }
                    }}
                  >
                    {isExtractingDocument ? 'Extracting…' : 'Fetch + Extract'}
                  </button>
                </div>
              </div>
              {documentError && <div className="text-xs text-red-700">{documentError}</div>}
              {selectedDraft && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-amber-900">
                        {availableDrafts.length > 1 ? 'Extracted manufacturer formulations' : 'Suggested manufacturer formulation'}
                      </div>
                      <div className="text-xs text-amber-800">
                        {selectedDraft.extractionMethod}
                        {typeof selectedDraft.overallConfidence === 'number' ? ` · confidence ${selectedDraft.overallConfidence}` : ''}
                      </div>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={applySuggestedDraft}>
                      Apply Selected Variant
                    </button>
                  </div>
                  {availableDrafts.length > 1 && (
                    <div className="space-y-2">
                      {availableDrafts.map((draft) => {
                        const active = draft.id === selectedDraft.id
                        const draftSummary = summarizeDraft(draft)
                        return (
                          <button
                            key={draft.id}
                            type="button"
                            className={`w-full rounded border p-2 text-left ${active ? 'border-amber-400 bg-white shadow-sm' : 'border-amber-100 bg-amber-50 hover:bg-white'}`}
                            onClick={() => setSelectedDraftId(draft.id)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-gray-900">
                                {draft.notes?.replace(/^Variant:\s*/i, '').replace(/\.\s*Parsed from HTML section.*$/i, '') || `Variant ${draft.id}`}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {draft.items.length} item{draft.items.length === 1 ? '' : 's'}
                                {typeof draft.overallConfidence === 'number' ? ` · ${draft.overallConfidence}` : ''}
                              </div>
                            </div>
                            {draftSummary && <div className="mt-1 text-xs text-gray-600">{draftSummary}</div>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {suggestedDraftSummary && <div className="text-xs text-gray-700">{suggestedDraftSummary}</div>}
                  {selectedDraft.notes && <div className="text-xs text-amber-900">{selectedDraft.notes}</div>}
                  {selectedDraft.items.map((item, index) => (
                    <div key={`${selectedDraft.id}-${index}`} className="rounded border border-amber-100 bg-white p-2 text-xs">
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
              )}
              {vendorDocuments.length > 0 && (
                <div className="space-y-2">
                  {vendorDocuments.map((document) => (
                    <div key={document.id} className="rounded border border-gray-200 bg-white p-2 text-xs">
                      <div className="font-medium text-gray-900">{document.title || document.fileRef.fileName}</div>
                      <div className="text-gray-600 mt-1">
                        {document.documentKind || 'other'} · {document.fileRef.mediaType}
                        {document.fileRef.pageCount ? ` · ${document.fileRef.pageCount} page${document.fileRef.pageCount === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-[1fr,140px] gap-3">
              <label className="formulations-field">
                <span>Declared concentration</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={declaredConcentration?.value ?? ''}
                  placeholder="Optional"
                  onChange={(e) => {
                    const next = e.target.value
                    if (!next) {
                      setDeclaredConcentration(undefined)
                      return
                    }
                    const numeric = Number(next)
                    if (!Number.isFinite(numeric) || numeric <= 0) return
                    setDeclaredConcentration(withInferredConcentrationBasis({
                      value: numeric,
                      unit: declaredConcentration?.unit || 'mM',
                    }))
                  }}
                />
              </label>
              <label className="formulations-field">
                <span>Unit</span>
                <select
                  value={declaredConcentration?.unit || 'mM'}
                  onChange={(e) => {
                    if (!declaredConcentration) return
                    setDeclaredConcentration(withInferredConcentrationBasis({
                      ...declaredConcentration,
                      unit: e.target.value,
                    }))
                  }}
                >
                  {CONCENTRATION_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="formulations-field">
              <span>Composition source text</span>
              <input
                value={compositionSourceText}
                onChange={(e) => setCompositionSourceText(e.target.value)}
                placeholder="Captured from vendor result text"
              />
            </label>
            <label className="formulations-field">
              <span>Product URL</span>
              <input value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://..." />
            </label>
            <label className="formulations-field">
              <span>Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Optional notes or vendor description" />
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Vendor Product'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
