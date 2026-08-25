/**
 * ProtocolPlanningView — the "Protocol Planning" (localization) mode of the
 * run workspace. Adapts a universal vendor protocol to THIS lab's instruments
 * and labware before execution.
 *
 * - Loads the run's attached protocol steps (falling back to a non-deletable
 *   `main` step) and renders step chips.
 * - Shows the lab inventory (instruments + materials) for role binding.
 * - "Localize for this lab" creates a local-protocol (specializeForExperiment)
 *   inheriting the universal protocol; the adaptation table PATCHes additive
 *   `overrides` (bindings/substitutions) onto it.
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { apiClient } from '../../shared/api/client'
import { ensureDefaultSteps, isStepDeletable, type PlannedStep } from './defaultPlannedSteps'
import { LabInventoryPanel } from './LabInventoryPanel'
import { EMPTY_ADAPTATION, serializeOverrides, upsertBinding, type AdaptationDraft } from './adaptation'
import { StepDetailPane } from './StepDetailPane'
import { useProtocolSelection } from '../../event-editor/protocol/ProtocolSelectionContext'
import './ProtocolPlanningView.css'

interface ProtocolPlanningViewProps {
  runId: string
}

interface RawStep {
  stepId?: string
  ordinal?: number
  label?: string
  kind?: string
  description?: string
}

function toPlannedStep(s: RawStep, index: number): PlannedStep {
  return {
    stepId: typeof s.stepId === 'string' ? s.stepId : `step-${index + 1}`,
    ordinal: typeof s.ordinal === 'number' ? s.ordinal : index + 1,
    label: typeof s.label === 'string' && s.label.length > 0 ? s.label : `Step ${index + 1}`,
    kind: typeof s.kind === 'string' ? s.kind : 'other',
    ...(typeof s.description === 'string' ? { description: s.description } : {}),
  }
}

export function ProtocolPlanningView({ runId }: ProtocolPlanningViewProps): JSX.Element {
  const [steps, setSteps] = useState<PlannedStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Phase D: which step's long-form detail is shown + the protocol's full text.
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [humanStepsText, setHumanStepsText] = useState<string | null>(null)

  // Run context for localization: the run's study/experiment + its attached
  // universal protocol (via the run record's localProtocolRef, if linked).
  const [studyId, setStudyId] = useState<string | undefined>(undefined)
  const [experimentId, setExperimentId] = useState<string | undefined>(undefined)
  const [universalProtocolId, setUniversalProtocolId] = useState<string | undefined>(undefined)

  // Localization state (Phase C).
  const [localProtocolId, setLocalProtocolId] = useState<string | null>(null)
  const [localizing, setLocalizing] = useState(false)
  const [adaptation, setAdaptation] = useState<AdaptationDraft>(EMPTY_ADAPTATION)
  const [localizeMsg, setLocalizeMsg] = useState<string | null>(null)

  // Phase D: connect to the per-step preview layering so selecting a step here
  // also drives the deck's past/current ghosting. Optional — degrades to local
  // detail-pane-only when the provider isn't mounted.
  const protocolSelection = useProtocolSelection()

  // Point 4 — soft-first deck bootstrap: labware the lab owns, and the subset
  // the user would like placed on the deck BEFORE events bind (so the
  // visualization is correct: plates, cryoking tubes, custom jig, etc.). Soft =
  // not a hard prerequisite; just a visual "load first" callout.
  interface AvailableLabware { recordId: string; label: string }
  const [deckLabware, setDeckLabware] = useState<AvailableLabware[]>([])
  const [deckPicked, setDeckPicked] = useState<Set<string>>(new Set())
  const [deckLabwareLoading, setDeckLabwareLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadLabware() {
      setDeckLabwareLoading(true)
      try {
        const res = await Promise.resolve(apiClient.listRecordsByKind('labware', 100)).catch(() => null)
        if (cancelled) return
        setDeckLabware((res?.records ?? []).map((env) => {
          const p = (env?.payload ?? {}) as Record<string, unknown>
          const label = typeof p.name === 'string' && p.name.trim()
            ? p.name
            : typeof p.display_name === 'string' && p.display_name.trim()
              ? p.display_name
              : typeof p.title === 'string' && p.title.trim()
                ? p.title
                : env?.recordId ?? ''
          return { recordId: env?.recordId ?? '', label }
        }).filter((l) => l.recordId))
      } finally {
        if (!cancelled) setDeckLabwareLoading(false)
      }
    }
    void loadLabware()
    return () => { cancelled = true }
  }, [])

  const toggleDeckLabware = (recordId: string) => {
    setDeckPicked((prev) => {
      const next = new Set(prev)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
  }

  const handleStepSelect = useCallback(
    (step: PlannedStep) => {
      setSelectedStepId(step.stepId)
      protocolSelection?.setCurrentStepId(step.stepId)
    },
    [protocolSelection],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)

      // Resolve the run's study/experiment + attached protocol id. The run does
      // NOT carry the protocol id directly — follow run → plannedRunRef (PLR)
      // → protocolRef to get the global protocol whose steps we show.
      let protocolId: string | null = null
      try {
        const runEnv = await apiClient.getRecord(runId).catch(() => null)
        const runPayload = (runEnv?.payload ?? runEnv) as Record<string, unknown> | null
        if (!cancelled) {
          setStudyId(
            typeof runPayload?.studyId === 'string'
              ? runPayload.studyId
              : typeof (runPayload?.links as Record<string, unknown> | undefined)?.studyId === 'string'
                ? ((runPayload?.links as Record<string, unknown>).studyId as string)
                : undefined,
          )
          setExperimentId(
            typeof runPayload?.experimentId === 'string'
              ? runPayload.experimentId
              : typeof (runPayload?.links as Record<string, unknown> | undefined)?.experimentId === 'string'
                ? ((runPayload?.links as Record<string, unknown>).experimentId as string)
                : undefined,
          )
        }
        const plannedRunRef = runPayload?.plannedRunRef as
          | { id?: string; kind?: string; type?: string }
          | undefined
        if (plannedRunRef?.id) {
          const plrEnv = await apiClient.getRecord(plannedRunRef.id).catch(() => null)
          const plrPayload = (plrEnv?.payload ?? plrEnv) as Record<string, unknown> | null
          const protoRef = (plrPayload?.protocolRef ?? plrPayload?.sourceRef) as
            | { id?: string; type?: string }
            | undefined
          if (typeof protoRef?.id === 'string') {
            protocolId = protoRef.id
            if (!cancelled) setUniversalProtocolId(protoRef.id)
          }
        }
      } catch {
        // ignore run/planned-run resolution errors — fall through to default
      }

      // If we could not resolve a protocol through the chain, try the run id
      // directly (some endpoints accept it); otherwise fall back to `main`.
      const fetchProtocol = async (id: string) => {
        const res = await fetch(`/api/protocols/${encodeURIComponent(id)}/steps`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { steps?: RawStep[] }
        const raw = Array.isArray(data.steps) ? data.steps : []
        return { raw, data }
      }

      try {
        let raw: RawStep[] = []
        let data: { steps?: RawStep[]; humanStepsText?: unknown } = {}
        if (protocolId) {
          try {
            ;({ raw, data } = await fetchProtocol(protocolId))
          } catch {
            // protocol resolved but steps endpoint failed — fall through
          }
          // The long-form human text lives on the protocol record, not the
          // steps payload — fetch it so the StepDetailPane has selectable text.
          if (!cancelled && typeof data.humanStepsText !== 'string') {
            const protoEnv = await apiClient.getRecord(protocolId).catch(() => null)
            const protoPayload = (protoEnv?.payload ?? protoEnv) as Record<string, unknown> | null
            if (!cancelled && typeof protoPayload?.humanStepsText === 'string') {
              setHumanStepsText(protoPayload.humanStepsText as string)
            }
          }
        } else {
          try {
            ;({ raw, data } = await fetchProtocol(runId))
          } catch {
            // no protocol attached — valid: show the guaranteed `main` step
          }
        }

        if (!cancelled) {
          setSteps(ensureDefaultSteps(raw.map(toPlannedStep)))
          if (typeof data.humanStepsText === 'string') {
            setHumanStepsText(data.humanStepsText)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setSteps(ensureDefaultSteps([]))
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [runId])

  const createLocalProtocol = useCallback(async () => {
    if (!universalProtocolId || !studyId || localizing) return
    setLocalizing(true)
    setLocalizeMsg(null)
    try {
      const res = await apiClient.specializeProtocolForExperiment({
        protocolId: universalProtocolId,
        studyId,
        // Drops the experimentId when the run is experiment-less (run-centric
        // model). The client contract allows experimentId but the server
        // handler requires it; for experiment-less runs we pass studyId.
        experimentId: experimentId ?? studyId,
        title: undefined,
      })
      const localRecordId = res.record.recordId
      setLocalProtocolId(localRecordId)
      setAdaptation(EMPTY_ADAPTATION)
      setLocalizeMsg(`Created local protocol ${localRecordId}`)
    } catch (err) {
      setLocalizeMsg(err instanceof Error ? `Localization failed: ${err.message}` : 'Localization failed')
    } finally {
      setLocalizing(false)
    }
  }, [universalProtocolId, studyId, experimentId, localizing])

  const saveAdaptation = useCallback(async () => {
    if (!localProtocolId || !studyId) return
    try {
      const payload = (await apiClient.getRecord(localProtocolId).catch(() => null))?.payload ?? {}
      const base = payload as Record<string, unknown>
      await apiClient.updateRecord(localProtocolId, {
        ...base,
        overrides: serializeOverrides(adaptation),
      })
      setLocalizeMsg('Adaptations saved.')
    } catch (err) {
      setLocalizeMsg(err instanceof Error ? `Failed to save adaptations: ${err.message}` : 'Failed to save')
    }
  }, [localProtocolId, studyId, adaptation])

  const roleCount = adaptation.bindings.length + adaptation.substitutions.length

  return (
    <div className="protocol-planning-view" data-testid="protocol-planning-view">
      <header className="protocol-planning-view__header">
        <h2 className="protocol-planning-view__title">Protocol Planning</h2>
        <p className="protocol-planning-view__sub">
          Adapt this protocol to your lab&apos;s instruments and labware.
        </p>
      </header>

      <div className="protocol-planning-view__grid">
        <section className="protocol-planning-view__steps" data-testid="protocol-steps-chips">
          <h3 className="protocol-planning-view__section-title">Steps</h3>

          {/* Point 4 — soft-first deck bootstrap: place the labware this run
              uses onto the deck BEFORE events bind, so the visualization is
              correct from step 1. Soft = recommended, not a hard gate. */}
          <section className="protocol-planning-view__deck-bootstrap" data-testid="deck-bootstrap">
            <h4 className="protocol-planning-view__section-title">
              Step 0 — Load labware onto deck
            </h4>
            <p className="protocol-planning-view__hint">
              Start by placing the labwares you&apos;ll use (plates, cryoking tubes,
              custom jig…) so the run&apos;s event graph is visualized on the right
              deck. Pick from the lab inventory below.
            </p>
            {deckLabwareLoading ? (
              <p className="protocol-planning-view__hint">Loading labware…</p>
            ) : deckLabware.length === 0 ? (
              <p className="protocol-planning-view__hint">No labware records — add labware in the Lab tab.</p>
            ) : (
              <div className="protocol-planning-view__deck-list">
                {deckLabware.map((lw) => (
                  <label key={lw.recordId} className="protocol-planning-view__deck-item">
                    <input
                      type="checkbox"
                      checked={deckPicked.has(lw.recordId)}
                      onChange={() => toggleDeckLabware(lw.recordId)}
                      data-testid={`deck-labware-${lw.recordId}`}
                    />
                    <span>{lw.label}</span>
                    <code className="protocol-planning-view__deck-id">{lw.recordId}</code>
                  </label>
                ))}
              </div>
            )}
            {deckPicked.size > 0 ? (
              <p className="protocol-planning-view__hint" data-testid="deck-picked-count">
                {deckPicked.size} labware placed on deck (view the Design tab to arrange them).
              </p>
            ) : null}
          </section>

          {loading ? (
            <p className="protocol-planning-view__hint">Loading steps…</p>
          ) : steps.length === 0 ? (
            <p className="protocol-planning-view__hint">No steps.</p>
          ) : (
            <ol className="protocol-planning-view__chips">
              {steps.map((s) => {
                const deletable = isStepDeletable(s, steps.length)
                return (
                  <li key={s.stepId} className="protocol-planning-view__chip-row">
                    <button
                      type="button"
                      className={`protocol-planning-view__chip ${
                        selectedStepId === s.stepId ? 'protocol-planning-view__chip--active' : ''
                      }`}
                      onClick={() => handleStepSelect(s)}
                    >
                      <span className="protocol-planning-view__chip-num" aria-hidden>
                        {s.ordinal}.
                      </span>
                      <span className="protocol-planning-view__chip-label">{s.label}</span>
                      {!deletable ? (
                        <span className="protocol-planning-view__chip-lock" title="This step cannot be deleted">
                          locked
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}

          {selectedStepId && humanStepsText ? (
            <div className="protocol-planning-view__detail">
              <StepDetailPane
                runId={runId}
                stepId={selectedStepId}
                stepLabel={steps.find((s) => s.stepId === selectedStepId)?.label ?? selectedStepId}
                text={humanStepsText}
              />
            </div>
          ) : null}

          {error ? <p className="protocol-planning-view__error">Note: {error}</p> : null}

          <div className="protocol-planning-view__localize">
            <button
              type="button"
              className="protocol-planning-view__btn"
              onClick={() => void createLocalProtocol()}
              disabled={localizing || !universalProtocolId || !studyId}
            >
              {localizing ? 'Localizing…' : 'Localize for this lab'}
            </button>
            {localProtocolId ? (
              <div className="protocol-planning-view__adapt" data-testid="adaptation-editor">
                <h4 className="protocol-planning-view__section-title">Adaptations</h4>
                <p className="protocol-planning-view__hint">
                  {roleCount} role{roleCount === 1 ? '' : 's'} bound ({localProtocolId})
                </p>
                <ul className="protocol-planning-view__adapt-list">
                  {adaptation.bindings.map((b) => (
                    <li key={b.role} className="protocol-planning-view__adapt-row">
                      <span className="protocol-planning-view__adapt-role">{b.role}</span>
                      <span className="protocol-planning-view__adapt-ref">{b.ref.id}</span>
                    </li>
                  ))}
                </ul>
                <form
                  className="protocol-planning-view__bind-form"
                  data-testid="bind-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const role = String(fd.get('role') ?? '').trim()
                    const id = String(fd.get('recordId') ?? '').trim()
                    if (!role || !id) return
                    setAdaptation((prev) =>
                      upsertBinding(prev, role, { kind: 'record', id, type: 'equipment' }),
                    )
                    e.currentTarget.reset()
                  }}
                >
                  <input name="role" placeholder="role (e.g. plate_reader)" aria-label="role" />
                  <input name="recordId" placeholder="concrete record id" aria-label="record id" />
                  <button type="submit" className="protocol-planning-view__btn">
                    Bind
                  </button>
                </form>
                <button
                  type="button"
                  className="protocol-planning-view__btn"
                  onClick={() => void saveAdaptation()}
                  disabled={roleCount === 0}
                >
                  Save adaptations
                </button>
              </div>
            ) : null}
            {localizeMsg ? <p className="protocol-planning-view__msg">{localizeMsg}</p> : null}
          </div>
        </section>

        <aside className="protocol-planning-view__inventory">
          <LabInventoryPanel studyId={studyId} />
        </aside>
      </div>
    </div>
  )
}
