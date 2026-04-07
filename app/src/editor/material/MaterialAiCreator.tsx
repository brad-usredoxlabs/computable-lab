/**
 * MaterialAiCreator — AI-assisted material creation panel.
 *
 * User describes a material in natural language and AI proposes
 * a structured record with editable fields for review before saving.
 */

import { useState } from 'react'
import { apiClient, type MaterialDraftResponse } from '../../shared/api/client'
import { MaterialDuplicateWarning } from './MaterialDuplicateWarning'

interface MaterialAiCreatorProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

export function MaterialAiCreator({ isOpen, onClose, onCreated }: MaterialAiCreatorProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<MaterialDraftResponse | null>(null)

  // Editable fields from draft
  const [editName, setEditName] = useState('')
  const [editDomain, setEditDomain] = useState('other')
  const [editKind, setEditKind] = useState('material')
  const [editConcentrationValue, setEditConcentrationValue] = useState('')
  const [editConcentrationUnit, setEditConcentrationUnit] = useState('mM')
  const [saving, setSaving] = useState(false)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setDraft(null)
    try {
      const result = await apiClient.draftMaterialFromText({ prompt: prompt.trim() })
      setDraft(result)
      setEditName(result.proposed.name)
      setEditDomain(result.proposed.domain)
      setEditKind(result.proposed.kind)
      if (result.proposed.concentration) {
        setEditConcentrationValue(String(result.proposed.concentration.value))
        setEditConcentrationUnit(result.proposed.concentration.unit)
      } else {
        setEditConcentrationValue('')
        setEditConcentrationUnit('mM')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate material draft')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!editName.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const schemaId = editKind === 'vendor-product'
        ? 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml'
        : editKind === 'material-spec'
        ? 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml'
        : 'https://computable-lab.com/schema/computable-lab/material.schema.yaml'

      const timestamp = Date.now().toString(36)
      const random = Math.random().toString(36).substring(2, 6)
      const recordId = `mat-${editName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)}-${timestamp}-${random}`

      const payload: Record<string, unknown> = {
        kind: editKind,
        id: recordId,
        name: editName.trim(),
        domain: editDomain,
        tags: [],
      }

      if (editConcentrationValue && Number.isFinite(Number(editConcentrationValue))) {
        payload.concentration = {
          value: Number(editConcentrationValue),
          unit: editConcentrationUnit,
        }
      }

      await apiClient.createRecord(schemaId, payload)
      onCreated()
      handleReset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create material')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setPrompt('')
    setDraft(null)
    setError(null)
    setEditName('')
    setEditDomain('other')
    setEditKind('material')
    setEditConcentrationValue('')
    setEditConcentrationUnit('mM')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleReset} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col text-xs">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Create with AI</h2>
            <p className="text-[10px] text-gray-500">Describe a material in natural language</p>
          </div>
          <button type="button" onClick={handleReset} className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto">
          {error && <div className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Describe the material</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "10 mM stock of clofibrate in DMSO, from Sigma"'
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
              rows={3}
              disabled={loading}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className={`mt-1.5 px-3 py-1 text-xs font-medium rounded ${loading || !prompt.trim() ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
            >
              {loading ? 'Analyzing...' : 'Generate Draft'}
            </button>
          </div>

          {draft && (
            <>
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-gray-900">Proposed Material</h3>
                  <span className="inline-block px-1.5 py-px bg-blue-50 text-blue-700 text-[10px] rounded border border-blue-200">
                    {Math.round(draft.confidence * 100)}% confidence
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
                    />
                    <MaterialDuplicateWarning name={editName} onUseExisting={(_recordId) => { handleReset(); onCreated() }} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">Kind</label>
                      <select value={editKind} onChange={(e) => setEditKind(e.target.value)} className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded bg-white">
                        <option value="material">Concept</option>
                        <option value="material-spec">Saved Stock</option>
                        <option value="vendor-product">Vendor Product</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">Domain</label>
                      <select value={editDomain} onChange={(e) => setEditDomain(e.target.value)} className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded bg-white">
                        <option value="chemical">Chemical</option>
                        <option value="biological">Biological</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Concentration</label>
                    <div className="grid grid-cols-[1fr,80px] gap-1">
                      <input
                        type="number"
                        value={editConcentrationValue}
                        onChange={(e) => setEditConcentrationValue(e.target.value)}
                        placeholder="Value"
                        className="w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-200 focus:border-blue-500 outline-none"
                      />
                      <select value={editConcentrationUnit} onChange={(e) => setEditConcentrationUnit(e.target.value)} className="px-1 py-0.5 text-xs border border-gray-300 rounded bg-white">
                        <option value="mM">mM</option>
                        <option value="µM">µM</option>
                        <option value="nM">nM</option>
                        <option value="M">M</option>
                        <option value="mg/mL">mg/mL</option>
                        <option value="%">%</option>
                      </select>
                    </div>
                  </div>

                  {draft.unresolvedFields.length > 0 && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      Unresolved fields: {draft.unresolvedFields.join(', ')}
                    </div>
                  )}

                  {draft.ontologyMatches.length > 0 && (
                    <div className="rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">
                      <div className="font-medium mb-1">Ontology Matches</div>
                      {draft.ontologyMatches.map((m) => (
                        <div key={m.id} className="text-[10px]">{m.label} ({m.namespace}:{m.id})</div>
                      ))}
                    </div>
                  )}

                  {draft.vendorMatches.length > 0 && (
                    <div className="rounded border border-purple-200 bg-purple-50 p-2 text-xs text-purple-800">
                      <div className="font-medium mb-1">Vendor Matches</div>
                      {draft.vendorMatches.map((m, i) => (
                        <div key={i} className="text-[10px]">{m.vendor}{m.catalogNumber ? ` — ${m.catalogNumber}` : ''}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-1.5 pt-1 border-t border-gray-200">
                <button type="button" onClick={handleReset} className="px-2 py-0.5 text-xs text-gray-700 hover:text-gray-900">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !editName.trim()}
                  className={`px-2.5 py-0.5 text-xs font-medium rounded ${saving || !editName.trim() ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                >
                  {saving ? 'Creating...' : 'Create Material'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
