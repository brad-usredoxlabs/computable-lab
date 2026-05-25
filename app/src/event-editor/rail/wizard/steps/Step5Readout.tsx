import type { Ref } from '../../../../types/ref'
import type { OutcomeDirection } from '../../state'
import { OntologyAxisPicker } from '../OntologyAxisPicker'
import type { ContextRoleWizardDraft, ReadoutMethod, WizardReadout } from '../WizardDraft'

interface Props {
  draft: ContextRoleWizardDraft
  onChange: (patch: Partial<ContextRoleWizardDraft>) => void
}

interface ReadoutPreset {
  id: string
  label: string
  excitationNm: number
  emissionNm: number
  ref: Ref
}

const READOUT_PRESETS: ReadoutPreset[] = [
  {
    id: 'RDEF-PLATE-FAR_RED-ROS',
    label: 'Far-Red Fluorescence (CellROX) 640/665',
    excitationNm: 640,
    emissionNm: 665,
    ref: {
      kind: 'record',
      id: 'RDEF-PLATE-FAR_RED-ROS',
      type: 'readout-definition',
      label: 'Far-Red Fluorescence',
    },
  },
  {
    id: 'RDEF-PLATE-FITC-MMP',
    label: 'FITC Fluorescence (MMP) 485/535',
    excitationNm: 485,
    emissionNm: 535,
    ref: {
      kind: 'record',
      id: 'RDEF-PLATE-FITC-MMP',
      type: 'readout-definition',
      label: 'FITC Fluorescence',
    },
  },
  {
    id: 'RDEF-PLATE-NADH-AF',
    label: 'NADH Autofluorescence 340/460',
    excitationNm: 340,
    emissionNm: 460,
    ref: {
      kind: 'record',
      id: 'RDEF-PLATE-NADH-AF',
      type: 'readout-definition',
      label: 'NADH Autofluorescence',
    },
  },
]

const DIRECTION_OPTIONS: { value: OutcomeDirection; label: string }[] = [
  { value: 'increased', label: 'Increased' },
  { value: 'decreased', label: 'Decreased' },
  { value: 'no_change', label: 'No change' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'unknown', label: 'Unknown' },
]

export function Step5Readout({ draft, onChange }: Props) {
  const set = (patch: Partial<WizardReadout>) => {
    onChange({ readout: { ...draft.readout, ...patch } })
  }

  const applyPreset = (presetId: string) => {
    const preset = READOUT_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    set({
      channelRef: preset.ref,
      indicatorLabel: draft.readout.indicatorLabel || preset.ref.label || preset.id,
      excitationNm: preset.excitationNm,
      emissionNm: preset.emissionNm,
      method: 'fluorescence',
    })
  }

  return (
    <div className="cl-wizard__step">
      <h3 className="cl-wizard__step-title">How is this group measured?</h3>
      <p className="cl-wizard__step-help">
        Pick the indicator, the read method, and what you expect the numbers to do compared to the vehicle
        baseline.
      </p>

      <div className="cl-wizard__field">
        <span className="cl-wizard__field-label">Indicator (optional ontology link)</span>
        <OntologyAxisPicker
          axis="chemical"
          value={draft.readout.indicatorRef}
          onChange={(ref) =>
            set({
              indicatorRef: ref,
              indicatorLabel: ref ? ref.label || ref.id : draft.readout.indicatorLabel,
            })
          }
          buttonLabel={draft.readout.indicatorRef ? undefined : 'Search CHEBI for the indicator'}
        />
        <input
          className="cl-wizard__input"
          placeholder="Indicator label"
          value={draft.readout.indicatorLabel}
          onChange={(e) => set({ indicatorLabel: e.target.value })}
        />
      </div>

      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Read method</span>
        <select
          className="cl-wizard__input"
          value={draft.readout.method}
          onChange={(e) => set({ method: e.target.value as ReadoutMethod })}
        >
          <option value="fluorescence">Fluorescence</option>
          <option value="absorbance">Absorbance</option>
          <option value="luminescence">Luminescence</option>
        </select>
      </label>

      {draft.readout.method === 'fluorescence' ? (
        <>
          <div className="cl-wizard__preset-row">
            <span className="cl-wizard__field-label">Channel preset</span>
            {READOUT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`cl-wizard__chip ${draft.readout.channelRef?.id === preset.id ? 'cl-wizard__chip--selected' : ''}`}
                onClick={() => applyPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              className={`cl-wizard__chip ${draft.readout.channelRef === null ? 'cl-wizard__chip--selected' : ''}`}
              onClick={() => set({ channelRef: null })}
            >
              Custom
            </button>
          </div>
          <div className="cl-wizard__row">
            <label className="cl-wizard__field">
              <span className="cl-wizard__field-label">Ex (nm)</span>
              <input
                type="number"
                className="cl-wizard__input"
                value={draft.readout.excitationNm ?? ''}
                onChange={(e) => set({ excitationNm: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
            <label className="cl-wizard__field">
              <span className="cl-wizard__field-label">Em (nm)</span>
              <input
                type="number"
                className="cl-wizard__input"
                value={draft.readout.emissionNm ?? ''}
                onChange={(e) => set({ emissionNm: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
          </div>
        </>
      ) : null}

      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Expected direction (vs vehicle baseline)</span>
        <select
          className="cl-wizard__input"
          value={draft.readout.expectedDirection}
          onChange={(e) => set({ expectedDirection: e.target.value as OutcomeDirection })}
        >
          {DIRECTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Notes (optional)</span>
        <textarea
          className="cl-wizard__input"
          rows={2}
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>
    </div>
  )
}
