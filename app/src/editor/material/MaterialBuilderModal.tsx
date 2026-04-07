/**
 * MaterialBuilderModal — Decorate an OLS ontology selection into a saved material record.
 *
 * Matches the CreateNodeModal pattern exactly: same Tailwind classes, same layout,
 * same button styling. Portal-rendered from MaterialPicker so it feels like a
 * proper app-level modal, not an inline form.
 */

import { useState, useEffect, useRef } from 'react'
import { RefBadge } from '../../shared/ref'
import type { OntologyRef, RecordRef } from '../../shared/ref'
import { useOLSSearch } from '../../shared/hooks/useOLSSearch'
import { olsResultToRef, lookupOLSTerm, type OLSSearchResult } from '../../shared/api/olsClient'
import { apiClient } from '../../shared/api/client'
import { formatMolecularWeightResolutionNote, formatResolvedMolecularWeightValue } from '../lib/molecularWeight'
import {
  MATERIAL_DOMAINS,
  MATERIAL_OLS_ONTOLOGIES,
  MATERIAL_SCHEMA_ID,
  generateMaterialId,
  inferDomainFromNamespace,
  type MaterialDomain,
} from '../../types/material'
import { MaterialDuplicateWarning } from './MaterialDuplicateWarning'

// Simple cn utility (same as CreateNodeModal)
const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

function dedupeSynonyms(values: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(trimmed)
  }
  return deduped
}

interface MaterialBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  primaryRef?: OntologyRef | null
  initialName?: string
  onSave: (ref: RecordRef) => void
}

function CloseIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function SpinnerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'mat-modal-spin 1s linear infinite' }}>
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

export function MaterialBuilderModal({
  isOpen,
  onClose,
  primaryRef,
  initialName,
  onSave,
}: MaterialBuilderModalProps) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState<MaterialDomain>('other')
  const [materialId, setMaterialId] = useState('')
  const [molecularWeight, setMolecularWeight] = useState('')
  const [molecularFormula, setMolecularFormula] = useState('')
  const [casNumber, setCasNumber] = useState('')
  const [solubility, setSolubility] = useState('')
  const [molecularWeightNote, setMolecularWeightNote] = useState<string | null>(null)
  const [additionalRefs, setAdditionalRefs] = useState<OntologyRef[]>([])
  const [refQuery, setRefQuery] = useState('')
  const [showRefDropdown, setShowRefDropdown] = useState(false)
  const [synonyms, setSynonyms] = useState<string[]>([])
  const [definition, setDefinition] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const refInputRef = useRef<HTMLInputElement>(null)
  const refListRef = useRef<HTMLUListElement>(null)

  // OLS search for additional refs
  const {
    results: refSearchResults,
    loading: refSearchLoading,
  } = useOLSSearch({
    query: refQuery,
    ontologies: MATERIAL_OLS_ONTOLOGIES,
    enabled: refQuery.length >= 2,
    minQueryLength: 2,
    maxResults: 8,
  })

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const seededName = primaryRef?.label || initialName || ''
      setName(seededName)
      setDomain(primaryRef ? inferDomainFromNamespace(primaryRef.namespace) : 'other')
      setMaterialId(generateMaterialId(seededName || 'material'))
      setMolecularWeight('')
      setMolecularFormula('')
      setCasNumber('')
      setSolubility('')
      setMolecularWeightNote(null)
      setAdditionalRefs([])
      setRefQuery('')
      setShowRefDropdown(false)
      setSynonyms([])
      setDefinition(null)
      setError(null)
      setTimeout(() => nameRef.current?.focus(), 100)

      // Fetch synonyms + definition from OLS for the primary ref
      if (primaryRef?.uri) {
        lookupOLSTerm(primaryRef.uri).then((term) => {
          if (term?.synonyms?.length) {
            setSynonyms(dedupeSynonyms(term.synonyms))
          }
          if (term?.description?.length) {
            setDefinition(term.description[0])
          }
        })
      }
    }
  }, [initialName, isOpen, primaryRef])

  useEffect(() => {
    if (!isOpen || !primaryRef || inferDomainFromNamespace(primaryRef.namespace) !== 'chemical') return
    if (molecularWeight.trim()) return
    let cancelled = false
    setMolecularWeightNote('Looking up molecular weight…')
    apiClient.resolveOntologyMolecularWeight({
      namespace: primaryRef.namespace,
      id: primaryRef.id,
      label: primaryRef.label,
      uri: primaryRef.uri,
    }).then((result) => {
      if (cancelled) return
      setMolecularWeightNote(formatMolecularWeightResolutionNote(result))
      if (result.resolved && result.molecularWeight) {
        setMolecularWeight(formatResolvedMolecularWeightValue(result.molecularWeight.value))
      }
    }).catch(() => {
      if (!cancelled) setMolecularWeightNote('Could not resolve molecular weight automatically.')
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, molecularWeight, primaryRef])

  const showChemicalFields = domain === 'chemical'

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Click-outside for ref dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        refInputRef.current && !refInputRef.current.contains(target) &&
        refListRef.current && !refListRef.current.contains(target)
      ) {
        setShowRefDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleRegenerateId() {
    setMaterialId(generateMaterialId(name))
  }

  function handleAddRef(result: OLSSearchResult) {
    const ref = olsResultToRef(result) as OntologyRef
    if (!additionalRefs.some(r => r.id === ref.id)) {
      setAdditionalRefs(prev => [...prev, ref])
    }
    setRefQuery('')
    setShowRefDropdown(false)
  }

  function handleRemoveRef(index: number) {
    setAdditionalRefs(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const classRefs = [primaryRef, ...additionalRefs]
        .filter((r): r is OntologyRef => Boolean(r))
        .map(r => ({
        kind: r.kind,
        id: r.id,
        namespace: r.namespace,
        label: r.label,
        uri: r.uri,
      }))

      const payload: Record<string, unknown> = {
        kind: 'material',
        id: materialId,
        name: name.trim(),
        domain,
        ...(Number.isFinite(Number(molecularWeight)) && Number(molecularWeight) > 0
          ? { molecular_weight: { value: Number(molecularWeight), unit: 'g/mol' } }
          : {}),
        ...(classRefs.length > 0 ? { class: classRefs } : {}),
        ...(showChemicalFields && (molecularFormula.trim() || casNumber.trim() || solubility.trim())
          ? {
              chemical_properties: {
                ...(molecularFormula.trim() ? { molecular_formula: molecularFormula.trim() } : {}),
                ...(casNumber.trim() ? { cas_number: casNumber.trim() } : {}),
                ...(solubility.trim() ? { solubility: solubility.trim() } : {}),
              },
            }
          : {}),
        definition: definition ?? undefined,
        synonyms: synonyms.length > 0 ? dedupeSynonyms(synonyms) : undefined,
        tags: [],
      }

      await apiClient.createRecord(MATERIAL_SCHEMA_ID, payload)

      onSave({
        kind: 'record',
        id: materialId,
        type: 'material',
        label: name.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create material')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 max-h-[90vh] flex flex-col text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 leading-tight">
              Create Material
            </h2>
            <p className="text-[10px] text-gray-500">
              Save as a reusable material record
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-2 space-y-2 overflow-y-auto">
          {/* Error */}
          {error && (
            <div className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          {primaryRef && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Ontology Term
              </label>
              <RefBadge value={primaryRef} showExternalLink />
            </div>
          )}

          {/* Definition (fetched from OLS, read-only) */}
          {definition && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Definition
              </label>
              <p className="text-[11px] text-gray-600 leading-snug bg-gray-50 rounded border border-gray-200 px-1.5 py-1 m-0">
                {definition}
              </p>
            </div>
          )}

          {/* Synonyms (fetched from OLS, read-only) */}
          {synonyms.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                Synonyms
              </label>
              <div className="flex flex-wrap gap-1">
                {synonyms.map((s) => (
                  <span
                    key={s}
                    className="inline-block px-1.5 py-px bg-amber-50 text-amber-800 text-[10px] rounded border border-amber-200"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label htmlFor="mat-name" className="block text-xs font-medium text-gray-700 mb-0.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              id="mat-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Material name..."
              className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
              disabled={isSubmitting}
            />
            <MaterialDuplicateWarning name={name} />
          </div>

          {/* Domain */}
          <div>
            <label htmlFor="mat-domain" className="block text-xs font-medium text-gray-700 mb-0.5">
              Domain
            </label>
            <select
              id="mat-domain"
              value={domain}
              onChange={e => setDomain(e.target.value as MaterialDomain)}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none bg-white"
              disabled={isSubmitting}
            >
              {MATERIAL_DOMAINS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {showChemicalFields && (
            <>
              <div>
                <label htmlFor="mat-mw" className="block text-xs font-medium text-gray-700 mb-0.5">
                  Molecular Weight
                </label>
                <div className="grid grid-cols-[1fr,72px] gap-1">
                  <input
                    id="mat-mw"
                    type="number"
                    min="0"
                    step="any"
                    value={molecularWeight}
                    onChange={e => setMolecularWeight(e.target.value)}
                    placeholder="270.24"
                    className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
                    disabled={isSubmitting}
                  />
                  <input
                    value="g/mol"
                    readOnly
                    tabIndex={-1}
                    className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded bg-gray-50 text-gray-500"
                  />
                </div>
                {molecularWeightNote && (
                  <p className="mt-1 text-[11px] text-gray-500">{molecularWeightNote}</p>
                )}
              </div>

              <div>
                <label htmlFor="mat-formula" className="block text-xs font-medium text-gray-700 mb-0.5">
                  Molecular Formula
                </label>
                <input
                  id="mat-formula"
                  type="text"
                  value={molecularFormula}
                  onChange={e => setMolecularFormula(e.target.value)}
                  placeholder="C15H10O5"
                  className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label htmlFor="mat-cas" className="block text-xs font-medium text-gray-700 mb-0.5">
                  CAS Number
                </label>
                <input
                  id="mat-cas"
                  type="text"
                  value={casNumber}
                  onChange={e => setCasNumber(e.target.value)}
                  placeholder="520-36-5"
                  className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label htmlFor="mat-solubility" className="block text-xs font-medium text-gray-700 mb-0.5">
                  Solubility
                </label>
                <textarea
                  id="mat-solubility"
                  value={solubility}
                  onChange={e => setSolubility(e.target.value)}
                  placeholder="Soluble in DMSO; sparingly soluble in water"
                  className="w-full px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>
            </>
          )}

          {/* Material ID */}
          <div>
            <label htmlFor="mat-id" className="block text-xs font-medium text-gray-700 mb-0.5">
              Material ID
            </label>
            <div className="flex gap-1">
              <input
                id="mat-id"
                type="text"
                value={materialId}
                onChange={e => setMaterialId(e.target.value)}
                className="flex-1 px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none font-mono"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={handleRegenerateId}
                className="px-1.5 py-0.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-500"
                title="Regenerate ID"
                disabled={isSubmitting}
              >
                <RefreshIcon />
              </button>
            </div>
          </div>

          {/* Additional Ontology Refs */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Additional Ontology Refs
            </label>

            {additionalRefs.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {additionalRefs.map((ref, i) => (
                  <RefBadge
                    key={ref.id}
                    value={ref}
                    size="sm"
                    onRemove={() => handleRemoveRef(i)}
                  />
                ))}
              </div>
            )}

            <div className="relative">
              <input
                ref={refInputRef}
                type="text"
                value={refQuery}
                onChange={e => {
                  setRefQuery(e.target.value)
                  setShowRefDropdown(true)
                }}
                onFocus={() => { if (refQuery.length >= 2) setShowRefDropdown(true) }}
                placeholder="Search ontologies to add..."
                className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
                disabled={isSubmitting}
              />

              {showRefDropdown && refQuery.length >= 2 && (
                <ul
                  ref={refListRef}
                  className="absolute z-50 mt-0.5 w-full bg-white border border-gray-200 rounded shadow-lg max-h-36 overflow-y-auto py-0.5"
                >
                  {refSearchLoading && refSearchResults.length === 0 && (
                    <li className="px-2 py-1 text-gray-400 text-xs flex items-center gap-1.5">
                      <SpinnerIcon size={12} />
                      Searching...
                    </li>
                  )}
                  {!refSearchLoading && refSearchResults.length === 0 && (
                    <li className="px-2 py-1 text-gray-400 text-xs">
                      No results
                    </li>
                  )}
                  {refSearchResults.map(result => (
                    <li
                      key={result.obo_id}
                      onClick={() => handleAddRef(result)}
                      className="px-2 py-1 cursor-pointer hover:bg-blue-50 text-xs"
                    >
                      <div className="font-semibold text-blue-800">{result.label}</div>
                      <span className="inline-block px-1 py-px bg-green-50 text-green-800 text-[10px] font-mono rounded border border-green-200 mr-1">
                        {result.obo_id}
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase">
                        {result.ontology_name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-0.5 text-xs text-gray-700 hover:text-gray-900"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className={cn(
                'px-2.5 py-0.5 text-xs font-medium rounded',
                isSubmitting || !name.trim()
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              )}
            >
              {isSubmitting ? 'Creating...' : 'Create Material'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes mat-modal-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
