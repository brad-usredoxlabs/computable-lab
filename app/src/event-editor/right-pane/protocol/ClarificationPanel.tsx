/**
 * MATRES-PANEL — the grouped clarification panel (§7.1-§7.3).
 *
 * ONE panel container per drafting turn (the held/gap fold surface, replacing
 * the flat card list), with one slot section PER FACT via the existing
 * adapter (foldCards stays the ONE fact->request call-site — bait 2). The
 * canonical four-term utterance yields four facts with distinct
 * labels/argument positions: four DISTINCT slots in one panel, never one
 * global choice (§7.1). Answers ride `answers[fact.label]` byte-unchanged
 * (D2 — the ANSWER-BIND-1 exact-label server join; the panel never invents a
 * second key channel).
 *
 * Candidates are GROUPED referent-level x tier from the payload fields the
 * merged engine carries (resolutionEngine.ts:127-146 candidateFact:
 * tier/referentLevel/eligibility via conditional spread). Grouping CONSUMES
 * those fields (D3): a candidate with no ELIG keys renders in the
 * `unspecified-level` arm — the panel NEVER derives a level from a tier and
 * never re-reads the store (bait 13). Labels, per-selection semantics, mint
 * legality and the vendor mint-on-select disclosure come from the DATA table
 * (ClarificationPanel.panelSemantics.ts) — zero tier/level switchboards
 * (bait 3).
 *
 * Mint affordance: the picker's own mint floor row stays the slot's ONE
 * affordance (MINT-FLOOR-UI-1 law, bait 8 — the panel renders NO mint row of
 * its own). Mint legality is the table's `mintAllowed` column expressed as
 * picker scoping: a slot whose candidate arms are physical (instance/aliquot/
 * vendor-product) scopes its picker search to that layer (the shipped
 * layer-scoping law, ClarificationPicker.tsx:208-211), and the shipped
 * canMint gate (ClarificationPicker.tsx:268-269) then offers no mint floor.
 * Receiving/derivation are never panel options (P7).
 *
 * Verdict markers show the RAW payload strings (orch OQ-3 ruling): the verdict
 * enum + the deciding policy id + the role tag when the payload carries one —
 * no human-readable prose, no client table for policy ids. A display-fail
 * candidate is excluded from its group PANEL-side (the engine never drops it
 * from the payload — post-merge re-verify §2).
 *
 * Each slot keeps its OWN ClarificationPicker instance keyed per slot (the
 * request.id query-reset law, ClarificationPicker.tsx:179-182 — the clofibrate
 * cross-question defect class, bait 7).
 */
import { ClarificationPicker, requestHasPicker } from '../ai/ClarificationPicker'
import { ParameterAnswerInput } from '../ai/ParameterAnswerInput'
import { mentionTokenForOption } from '../ai/MessageLog'
import {
  PANEL_LEVEL_ORDER,
  PLANE_SEMANTICS_BY_LEVEL,
  panelLevelArmOf,
  slotPickerLayer,
  type PanelLevelArm,
} from './ClarificationPanel.panelSemantics'
import type {
  AiClarificationAnswer,
  AiClarificationOption,
  AiClarificationRequest,
} from '../../../types/ai'

export interface ClarificationPanelProps {
  /** The ONE adapter's fold output (foldCards / foldHeldBundle). */
  requests: ReadonlyArray<AiClarificationRequest>
  /** Client fold identity (OQ-1, orch-ruled): localMacro.intentId + fold
   *  epoch. A new fold REPLACES the panel — staleness impossible by
   *  construction; no server turnId (a wire change ELIG did not declare). */
  turnKey: string
  disabled: boolean
  onPick: (answer: AiClarificationAnswer, request: AiClarificationRequest) => void
}

/** One level x tier bucket of a slot's candidates. */
interface CandidateGroup {
  arm: PanelLevelArm
  tier?: number
  options: AiClarificationOption[]
}

/** Bucket a slot's options by (level arm x tier) from the payload fields.
 *  Tier is read verbatim off the option (never inferred); an option with no
 *  tier key buckets tier-less. Order: table arm order, then tier ascending. */
function groupsOf(request: AiClarificationRequest): CandidateGroup[] {
  const buckets = new Map<string, CandidateGroup>()
  for (const option of request.options) {
    const arm = panelLevelArmOf(option.level)
    const tier = option.tier
    const key = tier !== undefined ? `${arm}\u0000${tier}` : arm
    const existing = buckets.get(key)
    if (existing) {
      existing.options.push(option)
      continue
    }
    buckets.set(key, tier !== undefined ? { arm, tier, options: [option] } : { arm, options: [option] })
  }
  return [...buckets.values()].sort((a, b) => {
    const armDiff = PANEL_LEVEL_ORDER.indexOf(a.arm) - PANEL_LEVEL_ORDER.indexOf(b.arm)
    if (armDiff !== 0) return armDiff
    return (a.tier ?? Number.MAX_SAFE_INTEGER) - (b.tier ?? Number.MAX_SAFE_INTEGER)
  })
}

/** §7.2: a display-fail candidate is excluded from its group PANEL-side.
 *  suppress/bind verdicts are NEVER re-interpreted — they render as markers. */
function isDisplayFail(option: AiClarificationOption): boolean {
  return option.eligibility?.display === 'fail'
}

/** Per-candidate verdict markers: the RAW payload strings (orch OQ-3):
 *  `<class>:<verdict enum> <deciding policy id>` per non-pass verdict, plus
 *  the role tag when the payload carries one. No prose, no policy table. */
function verdictMarkers(option: AiClarificationOption): string[] {
  const eligibility = option.eligibility
  if (!eligibility) return []
  const markers: string[] = []
  for (const verdictClass of ['display', 'suppress', 'bind'] as const) {
    const state = eligibility[verdictClass]
    if (state === 'pass') continue
    const policyId = eligibility.policyIds?.[verdictClass]
    markers.push(`${verdictClass}:${state}${policyId !== undefined ? ` ${policyId}` : ''}`)
  }
  if (eligibility.bindRole !== undefined) markers.push(`bindRole:${eligibility.bindRole}`)
  if (eligibility.displayRole !== undefined) markers.push(`displayRole:${eligibility.displayRole}`)
  return markers
}

export function ClarificationPanel({ requests, turnKey, disabled, onPick }: ClarificationPanelProps) {
  if (requests.length === 0) return null

  const pickOption = (request: AiClarificationRequest, option: AiClarificationOption) => {
    onPick({
      requestId: request.id,
      optionId: option.id,
      label: option.label,
      ...(option.ref ? { ref: option.ref } : {}),
      // W28-OPTIONBIND-1 posture preserved: a ref-bearing candidate answers
      // with the binding idiom via the SAME mentionTokenForOption builder the
      // pre-panel card used; a ref-less option keeps the plain-label value.
      ...(option.ref
        ? (() => {
            const token = mentionTokenForOption(request, option)
            return token ? { mentionToken: token } : {}
          })()
        : {}),
    }, request)
  }

  return (
    <div
      className="protocol-localization-thread__held-clarifications"
      data-testid="pl-clarification-panel"
      data-panel-turn={turnKey}
    >
      <p className="pl-held-clarifications-title">
        Answer the unresolved facts — one panel for this drafting turn ({requests.length} slot{requests.length === 1 ? '' : 's'})
      </p>
      {requests.map((request) => {
        const groups = groupsOf(request)
        const pickerLayer = slotPickerLayer(groups.map((g) => g.arm))
        // The slot identity from the wire fact's actionLocation (the adapter's
        // generic read — never inferred from the label or the candidates).
        const slotIdentity = request.slot
        return (
          <section
            key={`${turnKey}:${request.id}`}
            className="pl-held-clarification-card"
            data-testid="pl-clarification-card"
          >
            <div className="pl-held-clarification-head">
              <span className="pl-held-clarification-menu">{request.menuProvider}</span>
              {slotIdentity !== undefined ? (
                <span className="pl-held-clarification-slot" data-testid="pl-clarification-slot">{slotIdentity}</span>
              ) : null}
              <span className="pl-held-clarification-label">{request.prompt}</span>
            </div>
            {groups.map((group) => {
              const semantics = PLANE_SEMANTICS_BY_LEVEL[group.arm]
              const visible = group.options.filter((o) => !isDisplayFail(o))
              if (visible.length === 0) return null
              return (
                <div
                  key={`${group.arm}\u0000${group.tier ?? ''}`}
                  className="pl-candidate-group"
                  data-testid={`pl-candidate-group-${group.arm}${group.tier !== undefined ? `-tier-${group.tier}` : ''}`}
                >
                  <p className="pl-candidate-group__header">
                    {semantics.groupLabel}{group.tier !== undefined ? ` \u00b7 tier ${group.tier}` : ''}
                  </p>
                  <p className="pl-candidate-group__semantics">{semantics.selectionSemantics}</p>
                  {semantics.mintDisclosure !== undefined ? (
                    <p className="pl-candidate-group__disclosure">{semantics.mintDisclosure}</p>
                  ) : null}
                  <div className="pl-held-clarification-options">
                    {visible.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="pl-held-clarification-option"
                        disabled={disabled}
                        data-testid={`pl-clarification-option-${request.id}`}
                        onClick={() => pickOption(request, option)}
                      >
                        <span>{option.label}</span>
                        {typeof option.ref?.id === 'string' && option.ref.id.trim() ? (
                          <span className="pl-held-clarification-option__ref">{option.ref.id}</span>
                        ) : null}
                        {verdictMarkers(option).map((marker) => (
                          <span key={marker} className="pl-candidate-marker">{marker}</span>
                        ))}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {requestHasPicker(request) ? (
              <ClarificationPicker
                request={{
                  ...request,
                  // §7.3 mint-legality scoping via the table column
                  // (conditional spread — exactOptionalPropertyTypes).
                  ...(pickerLayer !== undefined ? { materialLayer: pickerLayer } : {}),
                }}
                onPick={onPick}
              />
            ) : (
              // The picker-less 'choice' surface (GAPCARD-1) is unchanged:
              // typed answers ride onPick into answers[<fact label>].
              <ParameterAnswerInput
                requestId={request.id}
                placeholder="Type your answer…"
                disabled={disabled}
                onAnswer={(answer) => onPick({
                  requestId: request.id,
                  label: answer.label,
                  value: answer.value,
                }, request)}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}
