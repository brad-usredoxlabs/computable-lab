import { GROUP_ROLE_OPTIONS, type GroupRole } from '../../state'
import type { ContextRoleWizardDraft } from '../WizardDraft'

interface Props {
  draft: ContextRoleWizardDraft
  onChange: (patch: Partial<ContextRoleWizardDraft>) => void
}

export function Step1Identity({ draft, onChange }: Props) {
  return (
    <div className="cl-wizard__step">
      <h3 className="cl-wizard__step-title">Which group is this?</h3>
      <p className="cl-wizard__step-help">
        Pick the kind of group the wells you've selected play in this experiment. Name it however you'd
        describe it out loud.
      </p>

      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Group kind</span>
        <select
          className="cl-wizard__input"
          value={draft.identity.roleType}
          onChange={(e) =>
            onChange({ identity: { ...draft.identity, roleType: e.target.value as GroupRole } })
          }
        >
          {GROUP_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Name</span>
        <input
          className="cl-wizard__input"
          autoFocus
          value={draft.identity.name}
          onChange={(e) => onChange({ identity: { ...draft.identity, name: e.target.value } })}
          placeholder="e.g. ROS positive control"
        />
      </label>
    </div>
  )
}
