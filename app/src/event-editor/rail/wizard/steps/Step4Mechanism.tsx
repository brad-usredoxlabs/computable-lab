/**
 * Mechanism panel — optional graph of subject → predicate → object edges
 * that turn the recipe into something the system can later reason about.
 *
 * Skippable. Adding edges authors a `claim` per edge plus a wrapping
 * `mechanism-model` on submit; skipping authors neither.
 */

import { useEffect, useState } from 'react'
import { OntologyAxisPicker } from '../OntologyAxisPicker'
import { loadPredicates, type PredicateEntry } from '../../../../shared/api/predicateClient'
import {
  createMechanismEdge,
  type ContextRoleWizardDraft,
  type MechanismEdge,
  type MechanismEdgeObject,
  type RecipeAxis,
} from '../WizardDraft'

interface Props {
  draft: ContextRoleWizardDraft
  onChange: (patch: Partial<ContextRoleWizardDraft>) => void
}

interface PredicatesState {
  predicates: PredicateEntry[]
  families: string[]
  error: string | null
  loading: boolean
}

export function Step4Mechanism({ draft, onChange }: Props) {
  const [state, setState] = useState<PredicatesState>({
    predicates: [],
    families: [],
    error: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    loadPredicates()
      .then((data) => {
        if (cancelled) return
        const familyOrder: string[] = []
        for (const family of data.families) {
          if (!familyOrder.includes(family.name)) familyOrder.push(family.name)
        }
        setState({ predicates: data.predicates, families: familyOrder, error: null, loading: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          predicates: [],
          families: [],
          error: err instanceof Error ? err.message : 'Failed to load predicates',
          loading: false,
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = (id: string, patch: Partial<MechanismEdge>) => {
    onChange({
      mechanism: draft.mechanism.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)),
    })
  }

  const remove = (id: string) => {
    onChange({ mechanism: draft.mechanism.filter((edge) => edge.id !== id) })
  }

  const add = () => {
    onChange({ mechanism: [...draft.mechanism, createMechanismEdge()] })
  }

  return (
    <div className="cl-wizard__step">
      <h3 className="cl-wizard__step-title">Why does this group produce its signal?</h3>
      <p className="cl-wizard__step-help">
        Optional, but powerful. Add edges connecting recipe items to the outcome — future you (and the
        software) will thank you for capturing the reasoning here.
      </p>

      {state.error ? <div className="cl-wizard__error">Predicate registry: {state.error}</div> : null}

      <div className="cl-wizard__mechanism">
        {draft.mechanism.map((edge) => (
          <EdgeRow
            key={edge.id}
            edge={edge}
            draft={draft}
            predicates={state.predicates}
            families={state.families}
            onChange={(patch) => update(edge.id, patch)}
            onRemove={() => remove(edge.id)}
          />
        ))}
      </div>

      <button
        type="button"
        className="cl-wizard__secondary-btn"
        onClick={add}
        disabled={state.loading || state.error !== null}
      >
        + Add edge
      </button>
    </div>
  )
}

interface EdgeRowProps {
  edge: MechanismEdge
  draft: ContextRoleWizardDraft
  predicates: PredicateEntry[]
  families: string[]
  onChange: (patch: Partial<MechanismEdge>) => void
  onRemove: () => void
}

function EdgeRow({ edge, draft, predicates, families, onChange, onRemove }: EdgeRowProps) {
  const subjectValue = edge.subject.kind === 'recipe' ? edge.subject.itemId : '__group-outcome__'

  return (
    <div className="cl-wizard__edge-row">
      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Subject</span>
        <select
          className="cl-wizard__input"
          value={subjectValue}
          onChange={(e) => {
            const value = e.target.value
            if (value === '__group-outcome__') {
              onChange({ subject: { kind: 'group-outcome' } })
            } else {
              onChange({ subject: { kind: 'recipe', itemId: value } })
            }
          }}
        >
          {draft.recipe.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label || item.termRef?.label || item.termRef?.id || 'recipe item'}
            </option>
          ))}
          <option value="__group-outcome__">The group's outcome</option>
        </select>
      </label>

      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Predicate</span>
        <select
          className="cl-wizard__input"
          value={edge.predicate.id}
          onChange={(e) => {
            const pred = predicates.find((p) => p.id === e.target.value)
            if (!pred) {
              onChange({ predicate: { id: '', label: '', namespace: '' } })
              return
            }
            onChange({ predicate: { id: pred.id, label: pred.label, namespace: pred.namespace } })
          }}
        >
          <option value="">— pick a predicate —</option>
          {families.map((family) => (
            <optgroup key={family} label={family}>
              {predicates
                .filter((p) => p.family === family)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <ObjectPicker
        value={edge.object}
        onChange={(object) => onChange({ object })}
      />

      <button
        type="button"
        className="cl-wizard__icon-btn"
        aria-label="Remove edge"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}

interface ObjectPickerProps {
  value: MechanismEdgeObject
  onChange: (next: MechanismEdgeObject) => void
}

function ObjectPicker({ value, onChange }: ObjectPickerProps) {
  const kind = value.kind
  const [axis, setAxis] = useState<RecipeAxis>(value.kind === 'ontology' ? guessAxis(value.ref.id) : 'chemical')

  return (
    <div className="cl-wizard__edge-object">
      <label className="cl-wizard__field">
        <span className="cl-wizard__field-label">Object</span>
        <select
          className="cl-wizard__input"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as MechanismEdgeObject['kind']
            if (next === 'ontology') {
              if (value.kind !== 'ontology') {
                onChange({ kind: 'ontology', ref: { kind: 'ontology', id: '', namespace: '', label: '' }, label: '' })
              }
            } else if (next === 'free-text') {
              onChange({ kind: 'free-text', label: value.kind === 'free-text' ? value.label : '' })
            } else {
              onChange({ kind: 'group-outcome' })
            }
          }}
        >
          <option value="ontology">Ontology term</option>
          <option value="free-text">Free text</option>
          <option value="group-outcome">Group outcome</option>
        </select>
      </label>

      {value.kind === 'ontology' ? (
        <>
          <select
            className="cl-wizard__input cl-wizard__recipe-axis"
            value={axis}
            onChange={(e) => setAxis(e.target.value as RecipeAxis)}
          >
            <option value="chemical">Chemical</option>
            <option value="organism">Organism</option>
            <option value="anatomy">Anatomy</option>
            <option value="cellular-compartment">Cellular</option>
            <option value="cell-line">Cell line</option>
            <option value="other">Other</option>
          </select>
          <OntologyAxisPicker
            axis={axis}
            value={value.ref.id ? value.ref : null}
            onChange={(ref) => {
              if (!ref) {
                onChange({ kind: 'ontology', ref: { kind: 'ontology', id: '', namespace: '', label: '' }, label: '' })
              } else {
                onChange({ kind: 'ontology', ref, label: ref.label || ref.id })
              }
            }}
          />
        </>
      ) : null}

      {value.kind === 'free-text' ? (
        <input
          className="cl-wizard__input"
          placeholder="Free-text object"
          value={value.label}
          onChange={(e) => onChange({ kind: 'free-text', label: e.target.value })}
        />
      ) : null}
    </div>
  )
}

function guessAxis(curie: string): RecipeAxis {
  const prefix = curie.split(':')[0]?.toLowerCase() ?? ''
  if (prefix === 'chebi') return 'chemical'
  if (prefix === 'ncbitaxon') return 'organism'
  if (prefix === 'uberon') return 'anatomy'
  if (prefix === 'go') return 'cellular-compartment'
  if (prefix === 'cl') return 'cell-line'
  return 'other'
}
