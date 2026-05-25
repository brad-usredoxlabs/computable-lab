import type { WellId } from '../../../../types/plate'
import {
  deriveClaimDrafts,
  deriveMechanismModelDraft,
  deriveRoleDefinition,
  slugify,
  type ContextRoleWizardDraft,
} from '../WizardDraft'

interface Props {
  draft: ContextRoleWizardDraft
  selectedWells: WellId[]
  saving: boolean
  saveError: string | null
}

export function Step6Review({ draft, selectedWells, saving, saveError }: Props) {
  const role = deriveRoleDefinition(draft)
  const slugBase = slugify(draft.identity.name) || 'group'
  const claims = deriveClaimDrafts(draft, slugBase)
  const mechanism = deriveMechanismModelDraft(draft, claims, slugBase)

  const ungroundedRecipe = draft.recipe.filter((item) => !item.termRef && item.label.trim().length > 0)

  return (
    <div className="cl-wizard__step">
      <h3 className="cl-wizard__step-title">Save and assign</h3>
      <p className="cl-wizard__step-help">
        Here's what we'll save. The new group will land in the Groups dropdown and the{' '}
        <strong>{selectedWells.length}</strong> selected well{selectedWells.length === 1 ? '' : 's'} will be assigned to it.
      </p>

      <section className="cl-wizard__review-section">
        <h4>Group</h4>
        <ul className="cl-wizard__review-list">
          <li>
            <strong>Name:</strong> {role.name}
          </li>
          <li>
            <strong>Kind:</strong> {role.roleType}
          </li>
          <li>
            <strong>Control type:</strong> {draft.controlKind ?? 'unspecified'}
          </li>
          <li>
            <strong>Record id:</strong> {role.id}
          </li>
        </ul>
      </section>

      <section className="cl-wizard__review-section">
        <h4>Recipe ({role.requiredMaterials.length})</h4>
        <ul className="cl-wizard__review-list">
          {role.requiredMaterials.map((req) => (
            <li key={req.id}>
              {req.label}
              {req.materialRef ? (
                <span className="cl-wizard__pill">{req.materialRef.label || req.materialRef.id}</span>
              ) : (
                <span className="cl-wizard__pill cl-wizard__pill--warn">ungrounded</span>
              )}
            </li>
          ))}
        </ul>
        {ungroundedRecipe.length > 0 ? (
          <p className="cl-wizard__hint">
            {ungroundedRecipe.length} recipe row{ungroundedRecipe.length === 1 ? '' : 's'} have no ontology
            term yet — you can edit later.
          </p>
        ) : null}
      </section>

      {claims.length > 0 ? (
        <section className="cl-wizard__review-section">
          <h4>Knowledge claims ({claims.length})</h4>
          <ul className="cl-wizard__review-list">
            {claims.map((claim) => (
              <li key={claim.id}>
                <code>{claim.id}</code> — {String(claim.payload.statement)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mechanism ? (
        <section className="cl-wizard__review-section">
          <h4>Mechanism model</h4>
          <ul className="cl-wizard__review-list">
            <li>
              <code>{mechanism.id}</code> — wraps {claims.length} claim{claims.length === 1 ? '' : 's'}.
            </li>
          </ul>
        </section>
      ) : null}

      <section className="cl-wizard__review-section">
        <h4>Readout</h4>
        <ul className="cl-wizard__review-list">
          <li>
            <strong>Indicator:</strong> {role.channel.label}
          </li>
          <li>
            <strong>Channel kind:</strong> {role.channel.kind}
            {role.channel.kind === 'readout-ref' ? ` · ${role.channel.ref.id}` : ''}
          </li>
          {draft.readout.method === 'fluorescence' ? (
            <li>
              <strong>Ex/Em:</strong> {draft.readout.excitationNm ?? '–'} / {draft.readout.emissionNm ?? '–'} nm
            </li>
          ) : (
            <li>
              <strong>Read method:</strong> {draft.readout.method}
            </li>
          )}
          <li>
            <strong>Expected direction:</strong> {role.expectedDirection}
          </li>
        </ul>
      </section>

      {saveError ? (
        <div className="cl-wizard__error" role="status">
          {saveError}
        </div>
      ) : null}
      {saving ? <div className="cl-wizard__hint">Saving…</div> : null}
    </div>
  )
}
