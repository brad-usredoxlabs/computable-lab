import { AXIS_LABELS, AXIS_OPTIONS, OntologyAxisPicker } from '../OntologyAxisPicker'
import {
  createRecipeItem,
  type ContextRoleWizardDraft,
  type RecipeAxis,
  type RecipeItem,
} from '../WizardDraft'

interface Props {
  draft: ContextRoleWizardDraft
  onChange: (patch: Partial<ContextRoleWizardDraft>) => void
}

export function Step3Recipe({ draft, onChange }: Props) {
  const update = (id: string, patch: Partial<RecipeItem>) => {
    onChange({
      recipe: draft.recipe.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })
  }

  const remove = (id: string) => {
    onChange({ recipe: draft.recipe.filter((item) => item.id !== id) })
  }

  const add = () => {
    onChange({ recipe: [...draft.recipe, createRecipeItem()] })
  }

  return (
    <div className="cl-wizard__step">
      <h3 className="cl-wizard__step-title">What's required to create this group?</h3>
      <p className="cl-wizard__step-help">
        List the <em>concepts</em> required, not specific concentrations or stocks. For each item, pick the
        ontology axis and search for the term. Need cells, media, and a perturbation? That's three rows.
      </p>

      <div className="cl-wizard__recipe">
        {draft.recipe.map((item) => (
          <div key={item.id} className="cl-wizard__recipe-row">
            <select
              className="cl-wizard__input cl-wizard__recipe-axis"
              value={item.axis}
              onChange={(e) => update(item.id, { axis: e.target.value as RecipeAxis, termRef: null })}
            >
              {AXIS_OPTIONS.map((axis) => (
                <option key={axis} value={axis}>
                  {AXIS_LABELS[axis]}
                </option>
              ))}
            </select>
            <OntologyAxisPicker
              axis={item.axis}
              value={item.termRef}
              onChange={(ref) =>
                update(item.id, {
                  termRef: ref,
                  label: ref ? ref.label || ref.id : item.label,
                })
              }
            />
            <input
              className="cl-wizard__input cl-wizard__recipe-label"
              placeholder="Label (optional)"
              value={item.label}
              onChange={(e) => update(item.id, { label: e.target.value })}
            />
            <button
              type="button"
              className="cl-wizard__icon-btn"
              aria-label="Remove row"
              onClick={() => remove(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="cl-wizard__secondary-btn" onClick={add}>
        + Add required element
      </button>
    </div>
  )
}
