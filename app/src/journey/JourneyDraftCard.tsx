/**
 * JourneyDraftCard — L2-JOURNEY-DOC-1 (unit u2ui): an AI-authored journey
 * intent document rendered as an explicitly UNVALIDATED DRAFT.
 *
 * Rendering contract + DOM proof only; the card is intentionally unmounted at
 * this revision — the chat mount is the journey-compiler leg. The view below
 * is a narrow projection of the fields the card draws from
 * schema/workflow/journey-document.schema.yaml: the card consumes the shape,
 * it does not validate or re-declare it (no enums, no journey_id / revision /
 * request_anchor — none of those are drawn).
 *
 * NON-ACTIONABLE BY CONSTRUCTION: the render branch structurally contains no
 * accept/execute control — no <button>, no role="button", no onClick, no
 * disabled / aria-disabled accept affordance. That copies the shipped
 * precedent ChainProposalCard.tsx:241-243, where non-acceptability is a
 * structural property of the branch, not a disabled attribute. The only
 * interactive element is the <details> disclosure around the diagnostics, so
 * their collapsed default never hides a refusal.
 *
 * Fixed section order: objective, completion contract, parameters, steps,
 * alternatives, assumptions, unresolved questions, diagnostics.
 *
 * While a parameter's status is unresolved its value is ABSENT
 * (journey-document.schema.yaml:50): the card shows the status plus an
 * explicit "not yet resolved" affordance and never fabricates a value or unit.
 */

export interface JourneyDraftParameterView {
  name: string
  provenance: string
  status: string
  /** Resolved value; absent (never `undefined`) while status is unresolved. */
  value?: string
}

export interface JourneyDraftStepView {
  id: string
  capabilityRef: string
  /** Rendered as the string it is — no enum re-declaration. */
  interactionMode: string
}

export interface JourneyDraftView {
  objective: string
  completionContract: string[]
  parameters: JourneyDraftParameterView[]
  steps: JourneyDraftStepView[]
  alternatives: string[]
  assumptions: string[]
  unresolvedQuestions: string[]
}

export interface JourneyDraftCardProps {
  view: JourneyDraftView
  diagnostics: readonly string[]
}

// Section headings are the only new string constants in this module; declared once.
const SECTION_HEADINGS = {
  objective: 'Objective',
  completionContract: 'Completion contract',
  parameters: 'Parameters',
  steps: 'Steps',
  alternatives: 'Alternatives',
  assumptions: 'Assumptions',
  unresolvedQuestions: 'Unresolved questions',
  diagnostics: 'Diagnostics',
} as const

export function JourneyDraftCard({ view, diagnostics }: JourneyDraftCardProps): JSX.Element {
  return (
    <section className="journey-draft-card" aria-label="Journey draft">
      <p className="journey-draft-card__banner" data-testid="journey-draft-unvalidated">
        UNVALIDATED DRAFT — AI-authored. Not validated, not linted, not actionable: nothing here
        can be accepted or executed.
      </p>

      <h2 data-testid="journey-draft-heading-objective">{SECTION_HEADINGS.objective}</h2>
      <p className="journey-draft-card__objective" data-testid="journey-draft-objective">
        {view.objective}
      </p>

      <h2 data-testid="journey-draft-heading-completionContract">
        {SECTION_HEADINGS.completionContract}
      </h2>
      <ul className="journey-draft-card__list" data-testid="journey-draft-contract">
        {view.completionContract.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h2 data-testid="journey-draft-heading-parameters">{SECTION_HEADINGS.parameters}</h2>
      <ul className="journey-draft-card__list" data-testid="journey-draft-parameters">
        {view.parameters.map((p) => (
          <li
            key={p.name}
            className="journey-draft-card__parameter"
            data-testid={`journey-draft-parameter-${p.name}`}
          >
            <span className="journey-draft-card__parameter-name">{p.name}</span>{' '}
            <span className="journey-draft-card__parameter-status">{p.status}</span>{' '}
            <span className="journey-draft-card__parameter-provenance">
              provenance: {p.provenance}
            </span>{' '}
            {p.status === 'resolved' ? (
              <span className="journey-draft-card__parameter-value">{p.value}</span>
            ) : (
              <span className="journey-draft-card__parameter-unresolved">not yet resolved</span>
            )}
          </li>
        ))}
      </ul>

      <h2 data-testid="journey-draft-heading-steps">{SECTION_HEADINGS.steps}</h2>
      <ol className="journey-draft-card__list" data-testid="journey-draft-steps">
        {view.steps.map((s) => (
          <li key={s.id} className="journey-draft-card__step" data-testid={`journey-draft-step-${s.id}`}>
            <span className="journey-draft-card__step-ref">{s.capabilityRef}</span>{' '}
            <span className="journey-draft-card__step-mode">{s.interactionMode}</span>
          </li>
        ))}
      </ol>

      <h2 data-testid="journey-draft-heading-alternatives">{SECTION_HEADINGS.alternatives}</h2>
      <ul className="journey-draft-card__list" data-testid="journey-draft-alternatives">
        {view.alternatives.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h2 data-testid="journey-draft-heading-assumptions">{SECTION_HEADINGS.assumptions}</h2>
      <ul className="journey-draft-card__list" data-testid="journey-draft-assumptions">
        {view.assumptions.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h2 data-testid="journey-draft-heading-unresolvedQuestions">
        {SECTION_HEADINGS.unresolvedQuestions}
      </h2>
      <ul className="journey-draft-card__list" data-testid="journey-draft-questions">
        {view.unresolvedQuestions.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <details className="journey-draft-card__diagnostics" data-testid="journey-draft-diagnostics">
        <summary>
          {SECTION_HEADINGS.diagnostics} ({diagnostics.length})
        </summary>
        <ul className="journey-draft-card__list">
          {diagnostics.map((d, i) => (
            <li key={i} className="journey-draft-card__diagnostic" data-testid="journey-draft-diagnostic">
              {d}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
