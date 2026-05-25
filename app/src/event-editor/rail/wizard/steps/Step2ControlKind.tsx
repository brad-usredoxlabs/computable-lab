import type { ContextRoleWizardDraft, ControlKind } from '../WizardDraft'

interface Props {
  draft: ContextRoleWizardDraft
  onChange: (patch: Partial<ContextRoleWizardDraft>) => void
}

interface CardOption {
  value: ControlKind
  title: string
  description: string
}

const OPTIONS: CardOption[] = [
  {
    value: 'biological',
    title: 'Biological control',
    description:
      'Tests whether the biology produces the signal. Example: HepG2 + clofibrate should drive ROS up.',
  },
  {
    value: 'instrument',
    title: 'Instrument control',
    description:
      'Tests whether the dye/reader is working. Example: CellROX + hydrogen peroxide should fluoresce regardless of cell biology.',
  },
  {
    value: 'sample',
    title: 'Sample',
    description: 'Wells you want to measure — no expected outcome enforced.',
  },
  {
    value: 'blank',
    title: 'Blank / no-cells',
    description: 'Background or no-cell wells used to subtract noise.',
  },
]

export function Step2ControlKind({ draft, onChange }: Props) {
  return (
    <div className="cl-wizard__step">
      <h3 className="cl-wizard__step-title">Is this a biological or an instrument control?</h3>
      <p className="cl-wizard__step-help">
        The distinction matters when we check the plate after the read. Pick the one that most fits.
      </p>

      <div className="cl-wizard__cards">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`cl-wizard__card ${draft.controlKind === opt.value ? 'cl-wizard__card--selected' : ''}`}
            onClick={() => onChange({ controlKind: opt.value })}
          >
            <span className="cl-wizard__card-title">{opt.title}</span>
            <span className="cl-wizard__card-help">{opt.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
