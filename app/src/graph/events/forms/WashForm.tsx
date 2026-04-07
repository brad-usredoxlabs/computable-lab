/**
 * WashForm - Form for wash event type.
 * 
 * Uses RefPicker for buffer selection with ChEBI ontology search.
 */

import type { EventDetails, WashDetails } from '../../../types/events'
import { WellsSelector, VolumeInput } from '../EventEditor'
import { RefPicker, type Ref } from '../../../shared/ref'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

/**
 * Convert buffer_ref (string or Ref) to Ref or null
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
      const knownNamespaces = ['CHEBI', 'CL', 'UBERON', 'GO', 'OBI', 'UO', 'NCBITaxon']
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
      type: 'material',
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

export function WashForm({ details, onChange }: FormProps) {
  const d = details as WashDetails & { buffer_ref?: string | Ref }
  
  // Parse buffer_ref to Ref
  const bufferRef = parseRef(d.buffer_ref)

  return (
    <div className="event-form wash-form">
      <WellsSelector
        label="Wells to Wash"
        value={d.wells || []}
        onChange={(wells) => onChange({ ...d, wells })}
      />

      <div className="form-field">
        <RefPicker
          value={bufferRef}
          onChange={(ref) => onChange({ ...d, buffer_ref: refToStorage(ref) as string | undefined })}
          olsOntologies={['chebi']}
          label="Wash Buffer"
          placeholder="Search buffers (ChEBI) or enter name..."
        />
        <p className="form-hint">
          e.g., PBS, PBST, Tris buffer
        </p>
      </div>

      <VolumeInput
        label="Volume per Wash"
        value={d.volume}
        onChange={(volume) => onChange({ ...d, volume })}
      />

      <div className="form-field">
        <label>Number of Cycles</label>
        <input
          type="number"
          value={d.cycles ?? ''}
          onChange={(e) => {
            const num = parseInt(e.target.value)
            onChange({ ...d, cycles: isNaN(num) ? undefined : num })
          }}
          placeholder="e.g., 3"
          min="1"
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
