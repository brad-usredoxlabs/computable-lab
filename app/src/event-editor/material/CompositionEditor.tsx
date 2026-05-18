import { useCallback } from 'react'
import type { CompositionEntryValue, CompositionRole, ConcentrationValue } from '../../types/material'
import { SolventPicker, type PickedSolvent } from './SolventPicker'

/**
 * Row-based composition editor for mixtures (cell media, buffers,
 * stocks made by combining multiple components).
 *
 * Each row holds:
 *   • componentRef — the material being mixed in (record OR ontology)
 *   • role         — one of the schema-defined CompositionRole values
 *   • concentration (optional) — the per-component contribution
 *
 * Reuses `SolventPicker` for the component slot because it already
 * does local-DB + ChEBI search for an arbitrary material. The picker's
 * name is historical; the data shape it returns is exactly what we
 * want here.
 *
 * Emits `CompositionEntryValue[]` so the parent form can pass it
 * straight to `createFormulation({ outputSpec: { composition: … } })`.
 */

const ROLE_OPTIONS: { value: CompositionRole; label: string }[] = [
  { value: 'solute', label: 'solute' },
  { value: 'solvent', label: 'solvent' },
  { value: 'buffer_component', label: 'buffer' },
  { value: 'additive', label: 'additive' },
  { value: 'activity_source', label: 'activity' },
  { value: 'cells', label: 'cells' },
  { value: 'other', label: 'other' },
]

const CONCENTRATION_UNITS = ['mM', 'µM', 'nM', 'M', 'mg/mL', 'µg/mL', '% w/v', '% v/v', 'X', 'U/mL']

export interface CompositionDraftEntry {
  /** Stable key for React; we make our own because component refs can change. */
  rowId: string
  component: PickedSolvent | null
  role: CompositionRole
  concentrationValue: string
  concentrationUnit: string
}

export interface CompositionEditorProps {
  rows: CompositionDraftEntry[]
  onChange: (rows: CompositionDraftEntry[]) => void
}

export function CompositionEditor({ rows, onChange }: CompositionEditorProps) {
  const updateRow = useCallback((rowId: string, patch: Partial<CompositionDraftEntry>) => {
    onChange(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }, [rows, onChange])

  const removeRow = useCallback((rowId: string) => {
    onChange(rows.filter((r) => r.rowId !== rowId))
  }, [rows, onChange])

  const addRow = useCallback(() => {
    onChange([...rows, makeEmptyRow()])
  }, [rows, onChange])

  return (
    <div className="add-material-composition">
      <div className="add-material-field-label">Composition</div>
      <div className="add-material-field-hint">
        Each row is one component. Pick the material (local DB or ChEBI),
        set its role, and optionally its concentration. Cell media usually
        wants 3-5 rows: base medium + serum + supplements.
      </div>

      <ul className="add-material-composition-rows">
        {rows.map((row) => (
          <li key={row.rowId} className="add-material-composition-row">
            <div className="add-material-composition-component">
              <SolventPicker
                picked={row.component}
                onChange={(component) => updateRow(row.rowId, { component })}
              />
            </div>
            <div className="add-material-composition-row-bottom">
              <label className="add-material-field" style={{ flex: 1 }}>
                <span className="add-material-field-label">Role</span>
                <select
                  className="add-material-input"
                  value={row.role}
                  onChange={(e) => updateRow(row.rowId, { role: e.target.value as CompositionRole })}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="add-material-field" style={{ flex: 1 }}>
                <span className="add-material-field-label">Concentration</span>
                <input
                  type="number"
                  className="add-material-input"
                  value={row.concentrationValue}
                  min="0"
                  step="any"
                  onChange={(e) => updateRow(row.rowId, { concentrationValue: e.target.value })}
                  placeholder="optional"
                />
              </label>
              <label className="add-material-field" style={{ flex: 1 }}>
                <span className="add-material-field-label">Unit</span>
                <select
                  className="add-material-input"
                  value={row.concentrationUnit}
                  onChange={(e) => updateRow(row.rowId, { concentrationUnit: e.target.value })}
                >
                  {CONCENTRATION_UNITS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="add-material-btn"
                onClick={() => removeRow(row.rowId)}
                style={{ alignSelf: 'flex-end' }}
                aria-label="Remove component"
              >Remove</button>
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="add-material-btn" onClick={addRow}>
        + Add component
      </button>
    </div>
  )
}

export function makeEmptyRow(role: CompositionRole = 'additive'): CompositionDraftEntry {
  return {
    rowId: `row-${Math.random().toString(36).slice(2, 10)}`,
    component: null,
    role,
    concentrationValue: '',
    concentrationUnit: 'mM',
  }
}

/**
 * Translate the draft entries into the schema-shaped
 * `CompositionEntryValue[]` that `createFormulation` accepts. Drops
 * rows that don't have a component picked (the user added a row but
 * never filled it in).
 */
export function compositionFromRows(rows: CompositionDraftEntry[]): CompositionEntryValue[] {
  return rows
    .filter((r) => r.component !== null)
    .map((r) => {
      const concentrationNum = Number(r.concentrationValue)
      const concentration: ConcentrationValue | undefined =
        Number.isFinite(concentrationNum) && concentrationNum > 0
          ? { value: concentrationNum, unit: r.concentrationUnit }
          : undefined
      const component = r.component!
      const componentRef = component.kind === 'record'
        ? { kind: 'record' as const, id: component.recordId, label: component.label }
        : { kind: 'ontology' as const, id: component.id, label: component.label, namespace: component.namespace, uri: component.uri }
      return {
        componentRef,
        role: r.role,
        ...(concentration ? { concentration } : {}),
      }
    })
}
