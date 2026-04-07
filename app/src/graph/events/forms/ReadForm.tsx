/**
 * ReadForm - Form for read event type.
 * 
 * Uses RefPicker for assay selection with OBI ontology search.
 */

import type { EventDetails, ReadDetails } from '../../../types/events'
import { WellsSelector } from '../EventEditor'
import { RefPicker, type Ref } from '../../../shared/ref'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

/**
 * Convert assay_ref (string or Ref) to Ref or null
 */
function parseRef(ref: string | Ref | undefined): Ref | null {
  if (!ref) return null
  
  // Already a Ref object
  if (typeof ref === 'object' && 'kind' in ref) {
    return ref as Ref
  }
  
  // Legacy string format - try to parse as CURIE or plain text
  if (typeof ref === 'string') {
    // Check if it looks like a CURIE
    if (ref.includes(':')) {
      const colonIndex = ref.indexOf(':')
      const namespace = ref.substring(0, colonIndex)
      const knownNamespaces = ['OBI', 'BAO', 'CHEBI', 'CL', 'GO']
      if (knownNamespaces.includes(namespace.toUpperCase())) {
        return {
          kind: 'ontology',
          id: ref,
          namespace: namespace.toUpperCase(),
          label: ref,
        }
      }
    }
    
    // Plain text - treat as record ref
    return {
      kind: 'record',
      id: ref,
      type: 'assay',
      label: ref,
    }
  }
  
  return null
}

/**
 * Convert Ref to storage format
 */
function refToStorage(ref: Ref | null): Ref | string | undefined {
  if (!ref) return undefined
  return ref
}

export function ReadForm({ details, onChange }: FormProps) {
  const d = details as ReadDetails & { assay_ref?: string | Ref }
  
  // Parse assay_ref to Ref
  const assayRef = parseRef(d.assay_ref)

  return (
    <div className="event-form read-form">
      <WellsSelector
        label="Wells to Read"
        value={d.wells || []}
        onChange={(wells) => onChange({ ...d, wells })}
      />

      <div className="form-field">
        <RefPicker
          value={assayRef}
          onChange={(ref) => onChange({ ...d, assay_ref: refToStorage(ref) as string | undefined })}
          olsOntologies={['obi']}
          label="Assay"
          placeholder="Search assays (OBI) or enter name..."
        />
        <p className="form-hint">
          e.g., CellTiter-Glo, Alamar Blue, absorbance assay
        </p>
      </div>

      <div className="form-field">
        <label>Instrument</label>
        <input
          type="text"
          value={d.instrument || ''}
          onChange={(e) => onChange({ ...d, instrument: e.target.value || undefined })}
          placeholder="e.g., Plate Reader, Microscope"
        />
      </div>

      <style>{`
        .form-hint {
          font-size: 0.75rem;
          color: #666;
          margin-top: 0.25rem;
        }
      `}</style>
    </div>
  )
}
