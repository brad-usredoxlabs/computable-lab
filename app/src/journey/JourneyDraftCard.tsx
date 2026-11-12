/**
 * JourneyDraftCard — L2-JOURNEY-DOC-1 (unit u2ui): an AI-authored journey
 * intent document rendered as an explicitly UNVALIDATED DRAFT.
 *
 * Scope of THIS unit: rendering contract + DOM proof only; the card is
 * intentionally unmounted at this revision — the chat mount is the
 * journey-compiler leg. It consumes a narrow view projection of
 * schema/workflow/journey-document.schema.yaml (it does not validate or
 * re-declare the schema: no enums, no journey_id/revision/request_anchor —
 * the card draws none of those fields).
 *
 * NON-ACTIONABLE BY CONSTRUCTION: the render branch structurally contains no
 * accept/execute control — no <button>, no role="button", no onClick, no
 * disabled or aria-disabled accept affordance, no committing tabIndex. This
 * copies the shipped precedent ChainProposalCard.tsx:241-243, where a blocked
 * card's non-acceptability is a structural property of the branch, not a
 * disabled attribute. The only interactive element is the <details>
 * disclosure around the diagnostics, so their collapsed default never hides a
 * refusal.
 *
 * Fixed section order (documented here and asserted by the test):
 * objective, completion contract, parameters, steps, alternatives,
 * assumptions, unresolved questions, diagnostics.
 *
 * Parameter rows render status verbatim. While a parameter's status is
 * unresolved, the schema (journey-document.schema.yaml:50) says its value is
 * ABSENT — the view omits `value` in that case and the card shows an
 * explicit "not yet resolved" affordance; it never renders a fabricated or
 * empty-string value and never guesses a unit.
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

// Section headings are the only new string constants in this module; they are
// declared once and shared between the headings and the h2 testids.
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

function listSection(
  headingKey: keyof typeof SECTION_HEADINGS,
  items: string[],
  listTestid: string,
): JSX.Element {
  return (
    <div>
      <h2 data-testid={`journey-draft-heading-${headingKey}`}>{SECTION_HEADINGS[headingKey]}</h2>
      {items.length === 0 ? (
        <p className="journey-draft-card__empty" data-testid={listTestid}>
          (none)
        </p>
      ) : (
        <ul className="journey-draft-card__list" data-testid={listTestid}>
          {items.map((item, i) => (
            <li key={i} className="journey-draft-card__item">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function JourneyDraftCard({ view, diagnostics }: JourneyDraftCardProps): JSX.Element {
  return (
    <section className="journey-draft-card" aria-label="Journey draft">
      <p
        className="journey-draft-card__banner"
        data-testid="journey-draft-unvalidated"
      >
        UNVALIDATED DRAFT — AI-authored. Not validated, not linted, not actionable: nothing here
        can be accepted or executed.
      </p>

      <h2 data-testid="journey-draft-heading-objective">{SECTION_HEADINGS.objective}</h2>
      <p className="journey-draft-card__objective" data-testid="journey-draft-objective">
        {view.objective}
      </p>

      {listSection('completionContract', view.completionContract, 'journey-draft-contract')}

      <h2 data-testid="journey-draft-heading-parameters">{SECTION_HEADINGS.parameters}</h2>
      {view.parameters.length === 0 ? (
        <p className="journey-draft-card__empty" data-testid="journey-draft-parameters">
          (none)
        </p>
      ) : (
        <ul className="journey-draft-card__list" data-testid="journey-draft-parameters">
          {view.parameters.map((p) => (
            <li
              key={p.name}
              className="journey-draft-card__parameter"
              data-testid={`journey-draft-parameter-${p.name}`}
            >
              <span className="journey-draft-card__parameter-name">{p.name}</span>
              <span className="journey-draft-card__parameter-status">{p.status}</span>
              <span className="journey-draft-card__parameter-provenance">provenance: {p.provenance}</span>
              {p.status === 'resolved' ? (
                <span className="journey-draft-card__parameter-value">{p.value}</span>
              ) : (
                <span className="journey-draft-card__parameter-unresolved">not yet resolved</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 data-testid="journey-draft-heading-steps">{SECTION_HEADINGS.steps}</h2>
      {view.steps.length === 0 ? (
        <p className="journey-draft-card__empty" data-testid="journey-draft-steps">
          (none)
        </p>
      ) : (
        <ol className="journey-draft-card__list" data-testid="journey-draft-steps">
          {view.steps.map((s) => (
            <li key={s.id} className="journey-draft-card__step" data-testid={`journey-draft-step-${s.id}`}>
              <span className="journey-draft-card__step-ref">{s.capabilityRef}</span>
              <span className="journey-draft-card__step-mode">{s.interactionMode}</span>
            </li>
          ))}
        </ol>
      )}

      {listSection('alternatives', view.alternatives, 'journey-draft-alternatives')}
      {listSection('assumptions', view.assumptions, 'journey-draft-assumptions')}
      {listSection('unresolvedQuestions', view.unresolvedQuestions, 'journey-draft-questions')}

      <details className="journey-draft-card__diagnostics" data-testid="journey-draft-diagnostics">
        <summary>
          {SECTION_HEADINGS.diagnostics} ({diagnostics.length})
        </summary>
        {diagnostics.length === 0 ? (
          <p className="journey-draft-card__empty">(none)</p>
        ) : (
          <ul className="journey-draft-card__list">
            {diagnostics.map((d, i) => (
              <li key={i} className="journey-draft-card__diagnostic" data-testid="journey-draft-diagnostic">
                {d}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  )
}
