import { useEffect, useMemo, useState } from 'react'
import { apiClient, type AssayDefinition, type MaterialRefInput, type MeasurementContextRecord, type WellGroupRecord, type WellRoleAssignmentRecord } from '../../shared/api/client'
import { buildBiologyNotes, parseBiologyNotes } from '../lib/biologyMetadata'

export interface RoleAssignmentPanelProps {
  labwareId: string
  selectedWells: string[]
  activeContext: MeasurementContextRecord | null
  assignments: WellRoleAssignmentRecord[]
  wellGroups: WellGroupRecord[]
  onSaveGroup: (groupName: string, wells: string[]) => Promise<void>
  onAssignmentCreated: () => void
  title?: string
  description?: string
  emptyMessage?: string
  hideContextSummary?: boolean
}

type RoleFamily = 'sample' | 'control' | 'calibration'
type ScopeMode = 'selected' | 'group'

const ROLE_OPTIONS: Record<RoleFamily, Array<{ value: string; label: string }>> = {
  sample: [
    { value: 'sample', label: 'Sample' },
    { value: 'unknown_sample', label: 'Unknown Sample' },
  ],
  control: [
    { value: 'positive_control', label: 'Positive Control' },
    { value: 'negative_control', label: 'Negative Control' },
    { value: 'vehicle_control', label: 'Vehicle Control' },
    { value: 'blank', label: 'Blank' },
    { value: 'no_template_control', label: 'No-Template Control' },
    { value: 'housekeeping_control', label: 'Housekeeping Control' },
    { value: 'reference', label: 'Reference' },
  ],
  calibration: [
    { value: 'standard', label: 'Standard' },
    { value: 'standard_curve', label: 'Standard Curve' },
    { value: 'internal_standard', label: 'Internal Standard' },
    { value: 'external_standard', label: 'External Standard' },
    { value: 'qc_sample', label: 'QC Sample' },
    { value: 'calibrator', label: 'Calibrator' },
  ],
}

const EXPECTED_BEHAVIOR_OPTIONS = [
  { value: 'none', label: 'No explicit expectation' },
  { value: 'increase', label: 'Expected increase' },
  { value: 'decrease', label: 'Expected decrease' },
  { value: 'present', label: 'Expected present' },
  { value: 'absent', label: 'Expected absent' },
  { value: 'stable', label: 'Expected stable' },
  { value: 'range', label: 'Expected in range' },
] as const

function inferRoleFamily(roleType: string): RoleFamily {
  if (ROLE_OPTIONS.sample.some((option) => option.value === roleType)) return 'sample'
  if (ROLE_OPTIONS.calibration.some((option) => option.value === roleType)) return 'calibration'
  return 'control'
}

function toWellSubjectRef(labwareId: string, wellId: string): MaterialRefInput {
  return {
    kind: 'record',
    id: `${labwareId}#${wellId}`,
    type: 'well-selection',
    label: wellId,
  }
}

function roleSummary(assignments: WellRoleAssignmentRecord[]): Record<string, number> {
  const counts: Record<string, number> = {}
  assignments.forEach((assignment) => {
    counts[assignment.role_type] = (counts[assignment.role_type] || 0) + assignment.subject_refs.length
  })
  return counts
}

export function RoleAssignmentPanel({
  labwareId,
  selectedWells,
  activeContext,
  assignments,
  wellGroups,
  onSaveGroup,
  onAssignmentCreated,
  title = 'Assign Biological Meaning',
  description,
  emptyMessage = 'Select or create a measurement context first',
  hideContextSummary = false,
}: RoleAssignmentPanelProps) {
  const [scopeMode, setScopeMode] = useState<ScopeMode>('selected')
  const [groupName, setGroupName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [roleFamily, setRoleFamily] = useState<RoleFamily>('control')
  const [roleType, setRoleType] = useState('positive_control')
  const [expectedBehavior, setExpectedBehavior] = useState<'increase' | 'decrease' | 'present' | 'absent' | 'range' | 'stable' | 'none'>('none')
  const [biologicalIntent, setBiologicalIntent] = useState('')
  const [targetRefId, setTargetRefId] = useState('')
  const [standardLevel, setStandardLevel] = useState('')
  const [nominalValue, setNominalValue] = useState('')
  const [nominalUnit, setNominalUnit] = useState('uM')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assays, setAssays] = useState<AssayDefinition[]>([])

  useEffect(() => {
    void apiClient.listSemanticsAssays().then((response) => setAssays(response.items)).catch(() => {
      // Keep panel usable even if assay definitions fail to load.
    })
  }, [])

  const selectedGroup = useMemo(() => wellGroups.find((group) => group.id === groupId) || null, [wellGroups, groupId])
  const effectiveWells = scopeMode === 'group' ? (selectedGroup?.well_ids || []) : selectedWells
  const activeReadout = activeContext?.readout_def_refs[0]
  const activeAssay = useMemo(() => assays.find((item) => item.id === activeContext?.assay_def_ref?.id) || null, [assays, activeContext])
  const qPcrTargets = activeAssay?.panel_targets || []
  const selectedTarget = qPcrTargets.find((target) => target.name === targetRefId) || null

  const roleOptions = ROLE_OPTIONS[roleFamily]
  const roleCounts = useMemo(() => roleSummary(assignments), [assignments])

  const saveCurrentSelectionAsGroup = async () => {
    if (!groupName.trim() || selectedWells.length === 0) return
    setSavingGroup(true)
    setError(null)
    try {
      await onSaveGroup(groupName.trim(), selectedWells)
      setGroupName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save well group')
    } finally {
      setSavingGroup(false)
    }
  }

  const handleCreate = async () => {
    if (!activeContext) {
      setError('Select or create a measurement context first')
      return
    }
    if (effectiveWells.length === 0) {
      setError(scopeMode === 'group' ? 'Choose a saved well group' : 'Select wells to assign')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiClient.createWellRoleAssignment({
        measurementContextRef: { kind: 'record', id: activeContext.id, type: 'measurement-context', label: activeContext.name },
        subjectRefs: effectiveWells.map((wellId) => toWellSubjectRef(labwareId, wellId)),
        roleFamily,
        roleType,
        readoutDefRef: selectedTarget?.readout_def_ref || activeReadout,
        targetRef: selectedTarget?.target_ref,
        expectedBehavior,
        calibration: roleFamily === 'calibration' ? {
          standardLevel: standardLevel.trim() || undefined,
          nominalValue: nominalValue.trim() ? Number(nominalValue) : undefined,
          nominalUnit: nominalUnit.trim() || undefined,
        } : undefined,
        notes: buildBiologyNotes({
          biologicalIntent,
          freeformNotes: notes,
        }),
      })
      setNotes('')
      setBiologicalIntent('')
      setStandardLevel('')
      setNominalValue('')
      onAssignmentCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role assignment')
    } finally {
      setSaving(false)
    }
  }

  if (!activeContext) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-600">
            {description || (
              <>
                Roles are scoped to <span className="font-medium text-slate-800">{activeContext.name}</span>, not globally to the wells.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {Object.entries(roleCounts).slice(0, 4).map(([role, count]) => (
            <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {count} {role.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {!hideContextSummary ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div><span className="font-medium">Assay:</span> {activeContext.assay_def_ref?.label || 'Custom measurement'}</div>
          <div><span className="font-medium">Instrument:</span> {activeContext.instrument_ref.label || activeContext.instrument_ref.id}</div>
          <div><span className="font-medium">Readouts:</span> {activeContext.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')}</div>
          {typeof activeContext.measurement_count === 'number' ? <div><span className="font-medium">Linked reads:</span> {activeContext.measurement_count}</div> : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-700">Assignment Scope</div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setScopeMode('selected')} className={`rounded-md px-2.5 py-1 text-xs font-medium ${scopeMode === 'selected' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              Selected Wells ({selectedWells.length})
            </button>
            <button type="button" onClick={() => setScopeMode('group')} className={`rounded-md px-2.5 py-1 text-xs font-medium ${scopeMode === 'group' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              Saved Group
            </button>
          </div>

          {scopeMode === 'selected' ? (
            <div className="mt-3">
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                {selectedWells.length > 0 ? selectedWells.join(', ') : 'No wells selected'}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Save selection as group" className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <button type="button" onClick={() => void saveCurrentSelectionAsGroup()} disabled={savingGroup} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {savingGroup ? 'Saving…' : 'Save Group'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Choose a well group</option>
                {wellGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name} ({group.well_ids.join(', ')})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-700">Biological Role</div>
          <div className="mt-2 grid gap-2">
            <select value={roleFamily} onChange={(e) => {
              const nextFamily = e.target.value as RoleFamily
              setRoleFamily(nextFamily)
              setRoleType(ROLE_OPTIONS[nextFamily][0].value)
            }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="control">Controls</option>
              <option value="sample">Samples</option>
              <option value="calibration">Standards / Calibration</option>
            </select>
            <select value={roleType} onChange={(e) => {
              const nextRoleType = e.target.value
              setRoleType(nextRoleType)
              setRoleFamily(inferRoleFamily(nextRoleType))
            }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select value={expectedBehavior} onChange={(e) => setExpectedBehavior(e.target.value as typeof expectedBehavior)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {EXPECTED_BEHAVIOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label className="text-xs font-medium text-slate-700">
              Control / Intent
              <input
                value={biologicalIntent}
                onChange={(e) => setBiologicalIntent(e.target.value)}
                placeholder="What is this a control or treatment for? e.g. ROS induction"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <p className="-mt-1 text-[11px] text-slate-500">
              Example: <span className="font-medium text-slate-700">Positive Control</span> for <span className="font-medium text-slate-700">ROS induction</span>.
            </p>
          </div>
        </div>
      </div>

      {qPcrTargets.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-700">qPCR Target</div>
          <select value={targetRefId} onChange={(e) => setTargetRefId(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Use primary readout</option>
            {qPcrTargets.map((target) => (
              <option key={target.name} value={target.name}>
                {target.name} · {target.readout_def_ref.label || target.readout_def_ref.id} · {target.panel_role.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {roleFamily === 'calibration' ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3 rounded-md border border-slate-200 p-3">
          <label className="text-xs font-medium text-slate-700">
            Standard Level
            <input value={standardLevel} onChange={(e) => setStandardLevel(e.target.value)} placeholder="e.g. Std 1" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Nominal Value
            <input value={nominalValue} onChange={(e) => setNominalValue(e.target.value)} placeholder="e.g. 10" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Unit
            <input value={nominalUnit} onChange={(e) => setNominalUnit(e.target.value)} placeholder="uM" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        </div>
      ) : null}

      <label className="mt-3 block text-xs font-medium text-slate-700">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional note about this biology assignment" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </label>

      {assignments.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div className="font-medium text-slate-800">Assigned Biological Meaning</div>
          <div className="mt-2 space-y-1">
            {assignments.slice(0, 6).map((assignment) => {
              const parsedNotes = parseBiologyNotes(assignment.notes)
              return (
                <div key={assignment.id}>
                  <span className="font-medium">{assignment.role_type.replace(/_/g, ' ')}</span>
                  {parsedNotes.biologicalIntent ? ` · ${parsedNotes.biologicalIntent}` : ''}
                  {' · '}
                  {assignment.subject_refs.map((ref) => ref.label || ref.id).join(', ')}
                  {assignment.calibration?.standard_level ? ` · ${assignment.calibration.standard_level}` : ''}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => void handleCreate()} disabled={saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {saving ? 'Saving...' : 'Assign Biological Meaning'}
        </button>
      </div>
    </div>
  )
}
