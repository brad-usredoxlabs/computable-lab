/**
 * LabwareMappingPanel — for each labware type mentioned in the protocol
 * candidate, lets the user select a concrete labware record from the
 * library and assign a deck slot.
 *
 * Also provides source/destination mapping for transfer actions.
 */

import { useMemo } from 'react'
import type { AiProtocolCandidateSummary } from '../../types/ai'
import './protocolBuilder.css'

export interface LabwareMapping {
  /** Role label from the candidate (e.g. "96-well block"). */
  roleLabel: string
  /** Concrete labware record selected from the library. */
  labwareRecordId: string
  /** Deck slot assignment (e.g. "A1", "A2", ...). */
  deckSlot: string
}

export interface LabwareMappingPanelProps {
  candidate: AiProtocolCandidateSummary
  /** Available labware records the user can pick from. */
  availableLabware: Array<{ id: string; label: string; type: string }>
  /** Current mappings. */
  mappings: LabwareMapping[]
  /** Called when a mapping changes. */
  onMappingChange: (mapping: LabwareMapping) => void
}

/** Derive the distinct labware roles needed from the candidate. */
function extractLabwareRoles(candidate: AiProtocolCandidateSummary): string[] {
  const seen = new Set<string>()
  // From explicit labware items
  for (const l of candidate.labware ?? []) {
    seen.add(l.label)
  }
  // From steps referencing labware
  for (const step of candidate.steps ?? []) {
    for (const lw of step.labware ?? []) {
      seen.add(lw)
    }
  }
  return [...seen]
}

/** Infer a labware type hint from the role label for filtering. */
function inferTypeHint(label: string): string {
  const lower = label.toLowerCase()
  if (lower.includes('reservoir')) return 'reservoir'
  if (lower.includes('deep well') || lower.includes('deepwell')) return 'deepwell'
  if (lower.includes('384')) return 'plate'
  if (lower.includes('96')) return 'plate'
  if (lower.includes('tube')) return 'tube'
  if (lower.includes('tip')) return 'tiprack'
  return ''
}

export function LabwareMappingPanel({
  candidate,
  availableLabware,
  mappings,
  onMappingChange,
}: LabwareMappingPanelProps) {
  const roles = useMemo(() => extractLabwareRoles(candidate), [candidate])

  if (roles.length === 0) {
    return (
      <div className="labware-mapping-panel labware-mapping-panel--empty">
        <p className="labware-mapping-panel__empty-text">
          No labware roles detected in the protocol.
        </p>
      </div>
    )
  }

  // Deck slots: standard single-plate deck has slots A1-D4 (16 total).
  // Show a reasonable subset for the dropdown.
  const deckSlots = useMemo(() => {
    const rows = 'ABCDEFGH'
    const cols = '1234'
    const slots: string[] = []
    for (const r of rows) {
      for (const c of cols) {
        slots.push(`${r}${c}`)
      }
    }
    return slots
  }, [])

  return (
    <div className="labware-mapping-panel" data-testid="labware-mapping-panel">
      <h3 className="labware-mapping-panel__title">Labware Mapping</h3>
      <p className="labware-mapping-panel__hint">
        Select a concrete labware record and deck slot for each role in the protocol.
      </p>

      <div className="labware-mapping-panel__roles">
        {roles.map((role) => {
          const typeHint = inferTypeHint(role)
          const currentMapping = mappings.find((m) => m.roleLabel === role)
          // Filter available labware: match type hint if possible.
          const filteredLabware = typeHint
            ? availableLabware.filter((l) =>
                l.type.toLowerCase().includes(typeHint) || l.label.toLowerCase().includes(typeHint),
              )
            : availableLabware

          return (
            <div
              key={role}
              className="labware-mapping-panel__role"
              data-testid={`labware-mapping-role-${role.replace(/\s+/g, '-')}`}
            >
              <label className="labware-mapping-panel__role-label">
                <span className="labware-mapping-panel__role-name">{role}</span>
                {typeHint ? (
                  <span className="labware-mapping-panel__type-hint">{typeHint}</span>
                ) : null}
              </label>

              <div className="labware-mapping-panel__controls">
                <select
                  className="labware-mapping-panel__select"
                  value={currentMapping?.labwareRecordId ?? ''}
                  onChange={(e) => {
                    onMappingChange({
                      roleLabel: role,
                      labwareRecordId: e.target.value,
                      deckSlot: currentMapping?.deckSlot ?? '',
                    })
                  }}
                  data-testid={`labware-mapping-record-select-${role.replace(/\s+/g, '-')}`}
                >
                  <option value="">Select labware…</option>
                  {filteredLabware.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label} ({l.type})
                    </option>
                  ))}
                  {filteredLabware.length === 0 && (
                    <option disabled>No matching labware found</option>
                  )}
                </select>

                <select
                  className="labware-mapping-panel__select labware-mapping-panel__select--slot"
                  value={currentMapping?.deckSlot ?? ''}
                  onChange={(e) => {
                    onMappingChange({
                      roleLabel: role,
                      labwareRecordId: currentMapping?.labwareRecordId ?? '',
                      deckSlot: e.target.value,
                    })
                  }}
                  data-testid={`labware-mapping-slot-select-${role.replace(/\s+/g, '-')}`}
                >
                  <option value="">Slot…</option>
                  {deckSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>

      {/* Source/destination mapping for transfer steps */}
      {hasTransferSteps(candidate) ? (
        <div className="labware-mapping-panel__transfers">
          <h4 className="labware-mapping-panel__transfers-title">Transfer Mapping</h4>
          <p className="labware-mapping-panel__hint">
            Confirm which labware serves as source and destination for transfer steps.
          </p>
          {renderTransferHints(candidate, mappings)}
        </div>
      ) : null}
    </div>
  )
}

function hasTransferSteps(candidate: AiProtocolCandidateSummary): boolean {
  for (const step of candidate.steps ?? []) {
    if (step.text.toLowerCase().includes('transfer') ||
        step.text.toLowerCase().includes('pipette') ||
        step.text.toLowerCase().includes('move')) {
      return true
    }
  }
  return false
}

function renderTransferHints(
  candidate: AiProtocolCandidateSummary,
  _mappings: LabwareMapping[],
): JSX.Element[] {
  const elements: JSX.Element[] = []
  const seen = new Set<string>()

  for (const step of candidate.steps ?? []) {
    const lower = step.text.toLowerCase()
    if (!lower.includes('transfer') && !lower.includes('pipette') && !lower.includes('move')) {
      continue
    }

    const key = `transfer-${step.stepNumber ?? step.text.slice(0, 20)}`
    if (seen.has(key)) continue
    seen.add(key)

    elements.push(
      <div key={key} className="labware-mapping-panel__transfer-hint">
        <span className="labware-mapping-panel__transfer-step">
          {step.stepNumber != null ? `Step ${step.stepNumber}`: 'Step'}: {step.text.slice(0, 120)}
        </span>
        {step.labware?.length ? (
          <div className="labware-mapping-panel__transfer-labware">
            <span className="labware-mapping-panel__inline-label">Labware:</span>
            {step.labware.join(', ')}
          </div>
        ) : null}
      </div>,
    )
  }

  return elements
}
