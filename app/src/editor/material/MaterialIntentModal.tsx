import type { OntologyRef } from '../../shared/ref'

interface MaterialIntentModalProps {
  isOpen: boolean
  ontologyRef: OntologyRef | null
  onClose: () => void
  onCreateFormulation: () => void
  onAddVendorProduct: () => void
  onCreatePreparedMaterial: () => void
  onCreateBiologicalMaterial: () => void
  onCreateDerivedMaterial: () => void
  onCreateLocalConcept: () => void
  onUseBareConcept: () => void
}

export function MaterialIntentModal({
  isOpen,
  ontologyRef,
  onClose,
  onCreateFormulation,
  onAddVendorProduct,
  onCreatePreparedMaterial,
  onCreateBiologicalMaterial,
  onCreateDerivedMaterial,
  onCreateLocalConcept,
  onUseBareConcept,
}: MaterialIntentModalProps) {
  if (!isOpen || !ontologyRef) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col text-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">Make This Material Addable</h2>
            <p className="text-xs text-gray-500 mt-1">{ontologyRef.label} is an ontology concept. Choose how you want to use it in the lab.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
        <div className="p-4 space-y-3">
          <button type="button" className="w-full text-left border border-blue-200 bg-blue-50 rounded-lg p-3 hover:bg-blue-100" onClick={onCreateFormulation}>
            <div className="font-semibold text-blue-900">Create Saved Formulation</div>
            <div className="text-xs text-blue-800 mt-1">Recommended. Open a reusable recipe card for a stock or prepared formulation.</div>
          </button>
          <button type="button" className="w-full text-left border border-emerald-200 bg-emerald-50 rounded-lg p-3 hover:bg-emerald-100" onClick={onAddVendorProduct}>
            <div className="font-semibold text-emerald-900">Add Vendor Product</div>
            <div className="text-xs text-emerald-800 mt-1">Create a searchable vendor reagent linked to this material concept.</div>
          </button>
          <button type="button" className="w-full text-left border border-cyan-200 bg-cyan-50 rounded-lg p-3 hover:bg-cyan-100" onClick={onCreatePreparedMaterial}>
            <div className="font-semibold text-cyan-900">Create Prepared Material</div>
            <div className="text-xs text-cyan-800 mt-1">Create a concrete stock, bottle, or prepared source that your lab can use directly.</div>
          </button>
          <button type="button" className="w-full text-left border border-violet-200 bg-violet-50 rounded-lg p-3 hover:bg-violet-100" onClick={onCreateBiologicalMaterial}>
            <div className="font-semibold text-violet-900">Create Biological Material</div>
            <div className="text-xs text-violet-800 mt-1">Use this for cells or other biological materials with state like passage number.</div>
          </button>
          <button type="button" className="w-full text-left border border-fuchsia-200 bg-fuchsia-50 rounded-lg p-3 hover:bg-fuchsia-100" onClick={onCreateDerivedMaterial}>
            <div className="font-semibold text-fuchsia-900">Create Derived Material</div>
            <div className="text-xs text-fuchsia-800 mt-1">Use this for conditioned media, harvested outputs, or collected supernatants.</div>
          </button>
          <button type="button" className="w-full text-left border border-slate-200 bg-slate-50 rounded-lg p-3 hover:bg-slate-100" onClick={onCreateLocalConcept}>
            <div className="font-semibold text-slate-900">Create Local Concept</div>
            <div className="text-xs text-slate-700 mt-1">Use this when your lab needs its own material concept record first.</div>
          </button>
          <button type="button" className="w-full text-left border border-amber-200 bg-amber-50 rounded-lg p-3 hover:bg-amber-100" onClick={onUseBareConcept}>
            <div className="font-semibold text-amber-900">Use Bare Concept Anyway</div>
            <div className="text-xs text-amber-800 mt-1">Fallback only. This adds the ontology concept directly without a reusable formulation or vendor product.</div>
          </button>
        </div>
      </div>
    </div>
  )
}
