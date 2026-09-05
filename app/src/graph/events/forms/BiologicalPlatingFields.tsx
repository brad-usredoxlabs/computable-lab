/**
 * BiologicalPlatingFields — count-first, type-aware inputs for the add-material
 * form when the selected material is biological (cell_line | organism).
 *
 * Renders, per the type's registry rule:
 *   - count per well (REQUIRED) — cells/worms/organoids/CFU
 *   - final volume per well in µL (REQUIRED)
 *   - optional counter density (per µL) → DERIVED suspension µL + top-up µL
 *   - count_estimate mechanism select (honesty layer: how the seed number was
 *     arrived at — cell_counter | hemocytometer | od600 | total_protein | ...)
 *   - condition multiselect (culture SYSTEM — anoxic, organ-on-a-chip, ...),
 *     ORTHOGONAL to type
 */
import { useMemo } from 'react'
import type { AddMaterialDetails, CountMeasuredBy, PlateEvent } from '../../../types/events'
import { computePlating } from './plating'
import { type BiologicalConditionSeed, type BiologicalTypeRule } from '../../../shared/bioTypes'
import { apiClient } from '../../../shared/api/client'
import type { Ref } from '../../../shared/ref'
import { buildVerifyPlatingReadEvent, buildVerifyPlatingEvidenceDescriptor } from './verifyPlating'

const MEASURED_BY_LABELS: Record<CountMeasuredBy, string> = {
  cell_counter: 'Automated cell counter',
  hemocytometer: 'Hemocytometer',
  od600: 'OD600 / spectrophotometer',
  total_protein: 'Total protein assay',
  hoechst_nuclei: 'Hoechst nuclear stain count',
  manual: 'Manual / rough estimate',
}

interface Props {
  details: AddMaterialDetails
  rule: BiologicalTypeRule
  onChange: (details: AddMaterialDetails) => void
  showConditionSelect?: boolean
  /** Culture conditions (term.kind: condition) from the DECLARATIVE registry —
   *  the lab's declared vocabulary, never a hardcoded TS array. */
  conditions?: BiologicalConditionSeed[]
  /** When provided, renders a "Verify plating" seam (D3): a follow-up read event
   *  whose modality comes from the type's verification rule, supports/refutes the
   *  seed estimate. */
  onVerifyPlating?: (event: PlateEvent) => void
}

export function conditionRefsOf(details: AddMaterialDetails): Ref[] {
  return Array.isArray(details.condition_refs) ? details.condition_refs : []
}

export function BiologicalPlatingFields({ details, rule, onChange, showConditionSelect = true, conditions = [], onVerifyPlating }: Props) {
  const countField = rule.fields.find((f) => f.key === 'count')
  const volumeField = rule.fields.find((f) => f.key === 'volume')
  const densityField = rule.fields.find((f) => f.key === 'counterDensity')
  const cfuField = rule.fields.find((f) => f.key === 'cfu')
  const od600Field = rule.fields.find((f) => f.key === 'od600')

  const conditionRefs = conditionRefsOf(details)
  const finalVolumeUl = typeof details.volume?.value === 'number' ? details.volume.value : undefined
  const counterDensityUl = typeof details.counter_density?.value === 'number' ? details.counter_density.value : undefined
  const measuredBy: CountMeasuredBy = details.count_estimate?.measuredBy ?? ((rule.verification?.method as CountMeasuredBy) || ('manual' as CountMeasuredBy))

  const plating = useMemo(() => computePlating({
    count: typeof details.count === 'number' ? details.count : undefined,
    densityPerUl: counterDensityUl,
    finalVolumeUl,
  }), [details.count, counterDensityUl, finalVolumeUl])

  const setCount = (value: string) => {
    const num = value === '' ? undefined : Number(value)
    onChange({
      ...details,
      count: Number.isFinite(num as number) ? (num as number) : undefined,
    })
  }

  const setVolume = (value: string) => {
    const num = value === '' ? undefined : Number(value)
    onChange({
      ...details,
      volume: Number.isFinite(num as number) && num !== undefined ? { value: num, unit: 'uL' } : undefined,
    })
  }

  const setCounterDensity = (value: string) => {
    const num = value === '' ? undefined : Number(value)
    onChange({
      ...details,
      counter_density: Number.isFinite(num as number) && num !== undefined
        ? { value: num, unit: 'cells/uL', basis: 'count_per_volume' }
        : undefined,
    })
  }

  const setMeasuredBy = (val: CountMeasuredBy) => {
    onChange({
      ...details,
      count_estimate: { measuredBy: val, isEstimate: true },
    })
  }

  const toggleCondition = (seed: BiologicalConditionSeed) => {
    const current = conditionRefsOf(details)
    const exists = current.some((r) => r.id === seed.id)
    const next = exists
      ? current.filter((r) => r.id !== seed.id)
      : [...current, { kind: 'record' as const, type: 'term' as const, id: seed.id, label: seed.label }]
    onChange({ ...details, condition_refs: next.length ? next : undefined })
  }

  return (
    <div className="bio-plating-fields">
      <div className="form-row">
        <div className="form-field">
          <label>{countField?.label ?? 'Count per well'} *</label>
          <input
            data-testid="bio-count"
            type="number"
            min="0"
            step="any"
            value={typeof details.count === 'number' ? details.count : ''}
            onChange={(e) => setCount(e.target.value)}
            placeholder="e.g. 50000"
          />
        </div>
        <div className="form-field">
          <label>{volumeField?.label ?? 'Final volume (µL)'} *</label>
          <input
            data-testid="bio-volume"
            type="number"
            min="0"
            step="any"
            value={typeof finalVolumeUl === 'number' ? finalVolumeUl : ''}
            onChange={(e) => setVolume(e.target.value)}
            placeholder="µL"
          />
        </div>
      </div>

      {(cfuField || od600Field) && (
        <div className="form-row">
          {cfuField && (
            <div className="form-field">
              <label>{cfuField.label}</label>
              <input
                type="number"
                min="0"
                step="any"
                value={cfuField.required && typeof details.count === 'number' ? details.count : ''}
                placeholder={cfuField.label}
                disabled={!cfuField.required}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
          )}
          {od600Field && (
            <div className="form-field">
              <label>{od600Field.label}</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder={od600Field.label}
                disabled
              />
            </div>
          )}
        </div>
      )}

      {densityField && (
        <div className="form-field">
          <label>{densityField.label}</label>
          <input
            data-testid="bio-density"
            type="number"
            min="0"
            step="any"
            value={typeof counterDensityUl === 'number' ? counterDensityUl : ''}
            onChange={(e) => setCounterDensity(e.target.value)}
            placeholder="optional — per µL"
          />
        </div>
      )}

      {plating.suspensionUl !== undefined && (
        <p className="form-hint bio-plating-derived">
          ↳ suspension ≈ <strong>{plating.suspensionUl.toFixed(1)} µL</strong>
          {plating.topUpUl !== undefined && (
            <> · top-up ≈ <strong>{(plating.topUpUl).toFixed(1)} µL</strong>
              {plating.topUpUl < 0 ? ' (⚠ density under-estimate — exceeds final volume)' : ''}
            </>
          )}
        </p>
      )}

      <div className="form-field">
        <label>Seed count measured by</label>
        <select data-testid="bio-measuredby" value={measuredBy} onChange={(e) => setMeasuredBy(e.target.value as CountMeasuredBy)}>
          {(Object.keys(MEASURED_BY_LABELS) as CountMeasuredBy[]).map((mb) => (
            <option key={mb} value={mb}>{MEASURED_BY_LABELS[mb]}</option>
          ))}
        </select>
        <p className="form-hint">
          A biological seed count is an <strong>estimate</strong>, not a verified fact — a later
          read (Hoechst / total protein / OD600) supports or refutes it.
        </p>
      </div>

      {onVerifyPlating && rule.verification && (
        <button
          type="button"
          data-testid="bio-verify-plating"
          className="bio-verify-plating"
          onClick={() => {
            const materialLabel = typeof details.biological_type === 'object' && details.biological_type
              ? (details.biological_type as { label?: string }).label
              : undefined
            const evt = buildVerifyPlatingReadEvent({ details, rule, materialLabel })
            onVerifyPlating(evt)
            // Record the read as EVIDENCE supporting/refuting the seed estimate.
            void apiClient.createVerifyPlatingEvidence(
              buildVerifyPlatingEvidenceDescriptor(details, rule, evt.eventId),
            ).catch(() => { /* best-effort; the read event is already staged */ })
          }}
        >
          ⚗ Verify plating (add follow-up read · {rule.verification.readModality ?? 'read'})
        </button>
      )}

      {showConditionSelect && (
        <div className="form-field">
          <label>Culture conditions <span className="form-hint" style={{ display: 'inline' }}>(orthogonal to type)</span></label>
          <div className="bio-condition-chips">
            {conditions.map((c) => {
              const selected = conditionRefs.some((r) => r.id === c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`bio-condition-${c.id}`}
                  className={`bio-condition-chip${selected ? ' bio-condition-chip--selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => toggleCondition(c)}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        .bio-plating-fields { display: flex; flex-direction: column; gap: 0.75rem; }
        .bio-condition-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .bio-condition-chip {
          border: 1px solid #cbd5e1; background: #fff; color: #334155;
          border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.72rem;
          font-weight: 600; cursor: pointer;
        }
        .bio-condition-chip--selected { background: #e0f2fe; border-color: #38bdf8; color: #0369a1; }
        .bio-verify-plating {
          align-self: flex-start; border: 1px solid #cbd5e1; background: #fff;
          color: #334155; border-radius: 8px; padding: 0.4rem 0.8rem;
          font-size: 0.75rem; font-weight: 600; cursor: pointer;
        }
        .bio-verify-plating:hover { border-color: #94a3b8; background: #f8fafc; }
        .bio-plating-derived { color: #475569; }
      `}</style>
    </div>
  )
}