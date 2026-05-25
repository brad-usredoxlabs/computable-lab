import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiClient } from '../../shared/api/client'
import type { InstrumentApplianceJob, InstrumentExecutionReadiness } from '../../types/ai'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import { getLabwareWellIds } from '../../types/labware'
import type { Ref } from '../../types/ref'
import { channelKey, channelLabel, getPlateRailDraft, type ChannelDraft, type GroupDraft, type PlateRailDraft } from './state'

const CONTEXT_SCHEMA = 'computable-lab/context'
const MCTX_SCHEMA = 'https://computable-lab.com/schema/computable-lab/measurement-context.schema.yaml'
const ASSERTION_SCHEMA = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml'
const EVIDENCE_SCHEMA = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'

type ApplianceJobRequest = InstrumentApplianceJob['request'] & { measurementContextRef?: Ref }

interface Props {
  isOpen: boolean
  placementId: string
  labware: Labware
  rail: Record<string, PlateRailDraft>
  events: PlateEvent[]
  onClose: () => void
}

interface ChannelExecutionPlan {
  key: string
  channel: ChannelDraft
  groups: GroupDraft[]
  hasPositiveControl: boolean
  hasNegativeControl: boolean
  selected: boolean
}

interface ExecutionLogEntry {
  channel: string
  measurementId?: string
  rawDataPath?: string
  evidenceIds: string[]
}

function slug(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'plate-read'
}

function uniqueId(prefix: string, parts: string[]): string {
  return (prefix + '-' + parts.map(slug).join('-')).toUpperCase().slice(0, 96)
}

function recordRef(id: string, type: string, label?: string): Ref {
  return { kind: 'record', id, type, ...(label ? { label } : {}) }
}

function instrumentRef(): Ref {
  return recordRef('instrument/gemini-em', 'instrument', 'Gemini EM')
}

function readoutRefForChannel(channel: ChannelDraft): Ref {
  if (channel.kind === 'readout-ref') return channel.ref
  return recordRef(uniqueId('RDEF-CUSTOM', [channel.label]), 'readout-definition', channel.label)
}

function buildChannelPlans(groups: GroupDraft[]): ChannelExecutionPlan[] {
  const byKey = new Map<string, ChannelExecutionPlan>()
  for (const group of groups) {
    if (group.wells.length === 0) continue
    const key = channelKey(group.channel)
    const existing = byKey.get(key)
    if (existing) {
      existing.groups.push(group)
      existing.hasPositiveControl = existing.hasPositiveControl || group.roleType === 'positive_control'
      existing.hasNegativeControl = existing.hasNegativeControl || group.roleType === 'negative_control'
    } else {
      byKey.set(key, {
        key,
        channel: group.channel,
        groups: [group],
        hasPositiveControl: group.roleType === 'positive_control',
        hasNegativeControl: group.roleType === 'negative_control',
        selected: true,
      })
    }
  }
  return Array.from(byKey.values())
}

function blockersForPlan(plans: ChannelExecutionPlan[]): string[] {
  const blockers: string[] = []
  if (plans.length === 0) blockers.push('Assign at least one well group before reading the plate.')
  for (const plan of plans.filter((item) => item.selected)) {
    if (plan.channel.excitationNm == null || plan.channel.emissionNm == null) blockers.push(channelLabel(plan.channel) + ' needs excitation and emission wavelengths.')
  }
  if (plans.length > 0 && !plans.some((item) => item.selected)) blockers.push('Select at least one channel to execute.')
  return blockers
}

function readinessForJob(jobId: string, simulate: boolean, blockers: string[]): InstrumentExecutionReadiness {
  return {
    jobId,
    status: blockers.length > 0 ? 'blocked' : 'ready',
    executionMode: simulate ? 'simulate' : 'live',
    requiresConfirmation: !simulate,
    blockers: blockers.map((message, index) => ({ code: 'preflight_' + String(index + 1), message })),
  }
}

function buildJob(plan: ChannelExecutionPlan, index: number, labware: Labware, simulate: boolean, measurementContextId: string): InstrumentApplianceJob {
  const jobId = 'gemini-em-' + slug(measurementContextId) + '-' + String(index + 1)
  return {
    kind: 'instrument-appliance-job',
    jobId,
    adapterId: 'molecular_devices_gemini',
    operation: 'active_read',
    instrument: 'Gemini EM',
    request: {
      adapterId: 'molecular_devices_gemini',
      instrumentRef: instrumentRef() as unknown as Record<string, unknown>,
      outputPath: 'records/inbox/' + jobId + '.csv',
      parameters: { simulate, mode: 'fluorescence', wavelengthNm: plan.channel.emissionNm ?? undefined },
    },
    sourceRunFile: {
      instrument: 'Gemini EM',
      wells: getLabwareWellIds(labware).map((well) => ({ well, channelMap: { primary: plan.key } })),
      runParameters: { simulate, mode: 'fluorescence', excitationWavelengthNm: plan.channel.excitationNm, wavelengthNm: plan.channel.emissionNm },
    },
  }
}

async function createRecordBestEffort(schemaId: string, payload: Record<string, unknown>) {
  try {
    await apiClient.createRecord(schemaId, payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/already exists|duplicate|409|exists/i.test(message)) throw err
  }
}

async function ensureMeasurementContext(placementId: string, labware: Labware, plan: ChannelExecutionPlan): Promise<string> {
  const id = uniqueId('MCTX', [placementId, plan.channel.label])
  await createRecordBestEffort(MCTX_SCHEMA, {
    kind: 'measurement-context',
    id,
    name: plan.channel.label + ' read on ' + labware.name,
    source_ref: recordRef(placementId, 'labware', labware.name),
    instrument_ref: instrumentRef(),
    readout_def_refs: [readoutRefForChannel(plan.channel)],
    notes: channelLabel(plan.channel),
    tags: ['single-plate', 'active-read'],
  })
  return id
}

async function ensureAssertions(placementId: string, plan: ChannelExecutionPlan): Promise<Array<{ group: GroupDraft; assertionId: string; assertionPayload: Record<string, unknown>; contextId: string }>> {
  const records = []
  for (const group of plan.groups) {
    const assertionId = uniqueId('ASN', [placementId, group.name, plan.channel.label])
    const contextId = uniqueId('CTX', [placementId, group.name])
    await createRecordBestEffort(CONTEXT_SCHEMA, {
      id: contextId,
      subject_ref: recordRef(uniqueId('WG', [placementId, group.name]), 'well-group', group.name),
      properties: { role: group.roleType, expected_direction: group.expectedDirection },
      completeness: group.validation?.missingRequiredMaterialIds.length ? 'partial' : 'complete',
      missing: group.validation?.missingRequiredMaterialIds ?? [],
      layer_provenance: { observed: ['role'], model_derived: ['expected_direction'] },
      notes: group.notes,
      tags: ['single-plate', group.roleType],
    })
    const assertionPayload = {
      kind: 'assertion',
      id: assertionId,
      statement: group.name + ' is expected to be ' + group.expectedDirection.replace('_', ' ') + ' on ' + channelLabel(plan.channel) + '.',
      scope: 'single_context',
      roles: [{ role_ref: group.roleRef ?? recordRef(group.id, 'context-role', group.name), context_ref: recordRef(contextId, 'context', group.name) }],
      context_refs: [recordRef(contextId, 'context', group.name)],
      outcome: { measure: slug(plan.channel.label).replace(/-/g, '_'), target: readoutRefForChannel(plan.channel), direction: group.expectedDirection, layer: 'model_derived' },
      confidence: 3,
      evidence_refs: [],
      status: 'active',
    }
    await createRecordBestEffort(ASSERTION_SCHEMA, assertionPayload)
    records.push({ group, assertionId, assertionPayload, contextId })
  }
  return records
}

async function publishEvidence(records: Array<{ group: GroupDraft; assertionId: string; assertionPayload: Record<string, unknown>; contextId: string }>, measurementContextId: string, plan: ChannelExecutionPlan, measurementId?: string, rawDataPath?: string): Promise<string[]> {
  const ids: string[] = []
  for (const record of records) {
    const evidenceId = uniqueId('EVD', [record.assertionId, Date.now().toString(36)])
    await apiClient.createRecord(EVIDENCE_SCHEMA, {
      kind: 'evidence',
      id: evidenceId,
      supports: [recordRef(record.assertionId, 'assertion')],
      sources: [
        ...(measurementId ? [{ type: 'result', ref: recordRef(measurementId, 'measurement') }] : []),
        { type: 'context', ref: recordRef(record.contextId, 'context', record.group.name) },
        { type: 'measurement_context', ref: recordRef(measurementContextId, 'measurement-context', channelLabel(plan.channel)) },
        ...(rawDataPath ? [{ type: 'file', ref: recordRef(rawDataPath, 'file', rawDataPath) }] : []),
      ],
      quality: {
        realized_direction: 'unknown',
        predicted_direction: record.group.expectedDirection,
        qc: { has_positive_control: plan.hasPositiveControl, has_negative_control: plan.hasNegativeControl, channel_pos_neg_control_zprime: null, passed_qc: plan.hasPositiveControl && plan.hasNegativeControl },
      },
      status: 'active',
    })
    await apiClient.updateRecord(record.assertionId, { ...record.assertionPayload, evidence_refs: [recordRef(evidenceId, 'evidence')] })
    ids.push(evidenceId)
  }
  return ids
}

export function ReadPlateModal({ isOpen, placementId, labware, rail, onClose }: Props) {
  const draft = getPlateRailDraft(rail, placementId)
  const initialPlans = useMemo(() => buildChannelPlans(draft.knowledge.groups), [draft.knowledge.groups])
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(initialPlans.map((plan) => plan.key)))
  const [simulate, setSimulate] = useState(true)
  const [confirmLive, setConfirmLive] = useState(false)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const plans = initialPlans.map((plan) => ({ ...plan, selected: selectedKeys.has(plan.key) }))
  const selectedPlans = plans.filter((plan) => plan.selected)
  const blockers = blockersForPlan(plans)
  const liveBlocked = !simulate && !confirmLive
  const canRun = blockers.length === 0 && !liveBlocked && !running
  if (!isOpen) return null

  const execute = async () => {
    setRunning(true)
    setError(null)
    setLogs([])
    try {
      const nextLogs: ExecutionLogEntry[] = []
      for (const [index, plan] of selectedPlans.entries()) {
        const measurementContextId = await ensureMeasurementContext(placementId, labware, plan)
        const assertions = await ensureAssertions(placementId, plan)
        const job = buildJob(plan, index, labware, simulate, measurementContextId)
        job.request = { ...job.request, measurementContextRef: recordRef(measurementContextId, 'measurement-context', channelLabel(plan.channel)) } as ApplianceJobRequest
        job.executionReadiness = readinessForJob(job.jobId, simulate, blockers)
        const result = await apiClient.executeInstrumentApplianceJob(job, { confirmLiveExecution: !simulate })
        const evidenceIds = await publishEvidence(assertions, measurementContextId, plan, result.measurementId, result.rawDataPath)
        nextLogs.push({ channel: channelLabel(plan.channel), measurementId: result.measurementId, rawDataPath: result.rawDataPath, evidenceIds })
        setLogs([...nextLogs])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return createPortal(
    <div className="add-material-scrim" role="presentation" onMouseDown={(e) => e.stopPropagation()} onClick={onClose}>
      <div className="add-material-dialog read-plate-dialog" role="dialog" aria-modal="true" aria-label="Read plate" onClick={(e) => e.stopPropagation()}>
        <header className="add-material-header">
          <div className="add-material-title">Read plate <span className="add-material-target">full plate v1</span></div>
          <button type="button" className="add-material-close" aria-label="Close" onClick={onClose}>x</button>
        </header>
        <div className="add-material-body read-plate-body">
          <div className="read-plate-grid">
            <label className="plate-rail__field"><span className="plate-rail__field-label">Instrument</span><input className="plate-rail__input" value={draft.readout.instrumentLabel || 'Gemini EM'} readOnly /></label>
            <label className="plate-rail__field"><span className="plate-rail__field-label">Execution</span><select className="plate-rail__input" value={simulate ? 'simulate' : 'live'} onChange={(e) => setSimulate(e.target.value === 'simulate')}><option value="simulate">Simulated Gemini read</option><option value="live">Live Gemini EM</option></select></label>
          </div>
          {plans.length === 0 ? <p className="plate-rail__section-help">No channels are defined yet.</p> : null}
          {plans.map((plan) => (
            <label key={plan.key} className="read-plate-channel">
              <input type="checkbox" checked={selectedKeys.has(plan.key)} onChange={(e) => { const next = new Set(selectedKeys); if (e.target.checked) next.add(plan.key); else next.delete(plan.key); setSelectedKeys(next) }} />
              <span><strong>{channelLabel(plan.channel)}</strong><small>{plan.groups.length} anchored group{plan.groups.length === 1 ? '' : 's'} · {plan.hasPositiveControl ? 'positive control set' : 'missing positive control'} · {plan.hasNegativeControl ? 'negative control set' : 'missing negative control'}</small></span>
            </label>
          ))}
          {!simulate ? <label className="read-plate-confirm"><input type="checkbox" checked={confirmLive} onChange={(e) => setConfirmLive(e.target.checked)} /><span>I confirm this will fire the live Gemini EM plate reader.</span></label> : null}
          {blockers.length > 0 || liveBlocked ? <div className="context-role-warning" role="status">{[...blockers, ...(liveBlocked ? ['Live execution requires explicit confirmation.'] : [])].map((blocker) => <div key={blocker}>{blocker}</div>)}</div> : null}
          {error ? <div className="context-role-warning" role="alert">{error}</div> : null}
          {logs.length > 0 ? <div className="read-plate-results">{logs.map((log) => <article key={log.channel} className="plate-rail__channel-summary"><strong>{log.channel}</strong><span>Measurement: {log.measurementId ?? 'unknown'}</span><span>Raw data: {log.rawDataPath ?? 'unknown'}</span><span>Evidence: {log.evidenceIds.join(', ')}</span></article>)}</div> : null}
        </div>
        <footer className="add-material-footer read-plate-footer"><button type="button" className="plate-rail__secondary-btn" onClick={onClose} disabled={running}>Close</button><button type="button" className="plate-rail__primary-btn" onClick={execute} disabled={!canRun}>{running ? 'Reading...' : 'Execute read'}</button></footer>
      </div>
    </div>,
    document.body,
  )
}
