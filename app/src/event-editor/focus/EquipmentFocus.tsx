import { useEffect, useMemo, useState } from 'react'
import type { Equipment } from '../../types/equipment'
import type { InstrumentKind } from '../../types/labware'
import { INSTRUMENT_KIND_LABELS } from '../../types/labware'
import { apiClient } from '../../shared/api/client'
import { InstrumentGlyph } from '../deck/InstrumentGlyphs'
import { settingsChipText } from '../deck/EquipmentTile'

/**
 * EquipmentFocus — the zoomed-in detail pane when a first-class Equipment tile
 * is clicked/focused.
 *
 * Equipment is NOT well-addressable labware (no wells, no geometry), so the
 * standard `LabwareFocus` well-grid must NOT render. Instead this pane shows the
 * instrument's CAPABILITIES as declared data:
 *   - concrete settings on this instance (e.g. `temperature_c: 55` → "55 °C")
 *   - the linked equipment-class record (settingsDefinition labels/units/range)
 *   - what it takes for each verb it can do, from its CAPABILITY records
 *     (seat + physical-class acceptance) — never a hardcoded labware list
 * Opts out of a well grid entirely; a Close button returns to the bench.
 */

const EQUIPMENT_CLASS_KIND = 'equipment-class'
const EQUIPMENT_CAPABILITY_KIND = 'equipment-capability'

/** One verb this equipment can do, with what its seat takes — capability data. */
interface CapabilityView {
  verbLabel: string
  description: string
}

interface EquipmentClassRecord {
  id?: string
  name?: string
  settingsDefinition?: Array<{
    key: string
    label: string
    valueType?: string
    unit?: string
    min?: number
    max?: number
    enum?: string[]
    profileDefinition?: CyclingProfileDefinition
  }>
  notes?: string
}

/** Declarative cycling-program shape: initial hold + N cycles of steps. */
interface CyclingProfile {
  initial: { temperature_c: number; duration_sec: number }
  cycles: { count: number; steps: Array<{ temperature_c: number; duration_sec: number }> }
}

interface CyclingProfileDefinition {
  initial?: { temperature_c?: number; duration_sec?: number }
  cycles?: { count?: number; steps?: Array<{ temperature_c?: number; duration_sec?: number }> }
}

/** Coerce an unknown value to a populated CyclingProfile, or null if unshaped. */
export function asCyclingProfile(value: unknown): CyclingProfile | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Partial<CyclingProfile>
  const initial = v.initial
  const cycles = v.cycles
  if (
    typeof initial !== 'object' || initial === null
    || typeof cycles !== 'object' || cycles === null
    || !Array.isArray(cycles.steps))
  {
    return null
  }
  const steps = (cycles.steps as Array<Partial<{ temperature_c: number; duration_sec: number }>>).map((s) => ({
    temperature_c: s.temperature_c ?? 0,
    duration_sec: s.duration_sec ?? 0,
  }))
  return {
    initial: { temperature_c: initial.temperature_c ?? 0, duration_sec: initial.duration_sec ?? 0 },
    cycles: { count: typeof cycles.count === 'number' ? cycles.count : 1, steps },
  }
}

interface EquipmentFocusProps {
  equipment: Equipment
  locationLabel: string
  onClose: () => void
  /** Persist edited settings back to the placed equipment (reducer action). */
  onUpdateSettings?: (equipmentId: string, settings: Record<string, unknown>) => void
}

/**
 * Best-effort load the linked equipment-class record for its settings definitions.
 * The ref id may be a real record id (EQC-) or a minted CURIE; on a miss we
 * fall back to a kind-aware class search so the pane is never blank.
 */
function fetchEquipmentClass(equipment: Equipment): Promise<EquipmentClassRecord | null> {
  const ref = equipment.equipmentClassRef
  if (!ref) return Promise.resolve(null)

  if (!ref.id.includes(':')) {
    return apiClient.getRecord(ref.id)
      .then((envelope) => {
        const p = envelope.payload as Record<string, unknown>
        return (p.kind === EQUIPMENT_CLASS_KIND ? p ?? null : null) as EquipmentClassRecord | null
      })
      .catch(() => searchClassByKind(equipment.instrumentKind))
  }
  return searchClassByKind(equipment.instrumentKind)
}

/**
 * What this equipment can do and take — from its capability records (ECP-), which
 * are ordinary records: the equipment's own plus its class's. Deliberately
 * DEFENSIVE and best-effort (a client without the listings method, or a store with
 * no capability records, yields "not recorded" rather than an exception): missing
 * acceptance data must surface as a gap, never as an invented claim.
 */
async function fetchEquipmentCapabilities(equipment: Equipment): Promise<CapabilityView[]> {
  const api = apiClient as unknown as {
    listRecordsByKind?: (kind: string, limit?: number) => Promise<{ records: unknown[] }>
  }
  if (typeof api.listRecordsByKind !== 'function') return []
  try {
    const { records } = await api.listRecordsByKind.call(apiClient, EQUIPMENT_CAPABILITY_KIND, 200)
    const classId = equipment.equipmentClassRef?.id
    const out: CapabilityView[] = []
    for (const entry of records) {
      // The records API returns envelopes (`{ recordId, payload }`); tolerate a
      // bare payload too so a caller that unwraps early still works.
      const payload = ((entry as { payload?: unknown }).payload ?? entry) as {
        kind?: string
        id?: string
        status?: string
        equipmentRef?: { id?: string }
        equipmentClassRef?: { id?: string }
        capabilities?: Array<{ verbRef?: { id?: string }; constraints?: Record<string, unknown>; notes?: string }>
      }
      if (payload?.kind !== EQUIPMENT_CAPABILITY_KIND || payload.status !== 'active') continue
      const applies = payload.equipmentRef?.id === equipment.equipmentId
        || (!!classId && payload.equipmentClassRef?.id === classId)
      if (!applies) continue
      for (const capability of payload.capabilities ?? []) {
        const verbId = capability.verbRef?.id
        if (!verbId) continue
        out.push({
          verbLabel: verbId.replace(/^VERB-/, '').toLowerCase().replace(/_/g, ' '),
          description: describeAcceptance(capability.constraints),
        })
      }
    }
    return out
  } catch {
    return []
  }
}

/** One line of prose from a seat's constraints. */
function describeAcceptance(constraints: Record<string, unknown> | undefined): string {
  const seat = typeof constraints?.seat === 'string' ? constraints.seat : undefined
  const accepts = constraints?.accepts as
    | { mode?: string; footprint?: string; height_class?: string[]; well_counts?: number[]; tube_size_class?: string; flask?: boolean; design_family?: string }
    | undefined
  const parts: string[] = []
  if (accepts?.mode === 'none') parts.push('takes nothing')
  else if (accepts?.mode === 'open') parts.push('anything that physically fits')
  else if (accepts?.mode === 'by_class') {
    if (accepts.tube_size_class) parts.push(accepts.tube_size_class === 'any' ? 'tubes' : `${accepts.tube_size_class} tubes`)
    if (accepts.footprint === 'sbs') parts.push('SBS-format items')
    else if (accepts.footprint && accepts.footprint !== 'any') parts.push(`${accepts.footprint} mm items`)
    if (accepts.height_class?.length) parts.push(`${accepts.height_class.join(' or ')} height`)
    if (accepts.well_counts?.length) parts.push(`${accepts.well_counts.join('/')}-well`)
    if (accepts.flask) parts.push('flasks')
    if (accepts.design_family) parts.push(`design family ${accepts.design_family}`)
  }
  if (typeof constraints?.capacity === 'number') parts.push(`up to ${constraints.capacity}`)
  const heat = constraints?.heat as { from?: string[] } | undefined
  const suffix = heat?.from?.length ? ` (heats from ${heat.from.join(' and ')})` : ''
  const seatPhrase = seat ? ` on its ${seat} seat` : ''
  if (parts.length === 0) return `not recorded${suffix}`
  return `${parts.join(', ')}${seatPhrase}${suffix}`
}

function searchClassByKind(kind: InstrumentKind): Promise<EquipmentClassRecord | null> {
  const label = INSTRUMENT_KIND_LABELS[kind]
  return apiClient
    .searchRecords(label, [EQUIPMENT_CLASS_KIND])
    .then((res) => {
      const hit = (res.results ?? [])[0]
      if (!hit?.recordId) return null
      return apiClient.getRecord(hit.recordId)
        .then((envelope) => (envelope.payload as Record<string, unknown>).kind === EQUIPMENT_CLASS_KIND
          ? envelope.payload as unknown as EquipmentClassRecord
          : null)
        .catch(() => null)
    })
    .catch(() => null)
}

/** Initial draft values for every class-declared setting key. */
function initialDraft(
  defs: NonNullable<EquipmentClassRecord['settingsDefinition']>,
  settings: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const def of defs) {
    if (def.valueType === 'profile') continue
    const v = settings[def.key]
    out[def.key] = v === undefined || v === null ? '' : String(v)
  }
  return out
}

/** Initial structured draft for every profile-declared setting key. */
function initialProfileDrafts(
  defs: NonNullable<EquipmentClassRecord['settingsDefinition']>,
  settings: Record<string, unknown>,
): Record<string, CyclingProfile> {
  const out: Record<string, CyclingProfile> = {}
  for (const def of defs) {
    if (def.valueType !== 'profile') continue
    const existing = asCyclingProfile(settings[def.key])
    out[def.key] = existing ?? defaultProfile(def.profileDefinition)
  }
  return out
}

/** A cycling program seeded from the class's profileDefinition, or a minimal
 *  valid one (a single 30 s hold) when the class declares none. */
function defaultProfile(def: CyclingProfileDefinition | undefined): CyclingProfile {
  const d = def ?? {}
  const initial = d.initial ?? {}
  const cycles = d.cycles ?? {}
  const steps = (cycles.steps ?? []).length > 0
    ? (cycles.steps as Array<{ temperature_c?: number; duration_sec?: number }>).map((s) => ({
        temperature_c: s.temperature_c ?? 95,
        duration_sec: s.duration_sec ?? 30,
      }))
    : [{ temperature_c: 95, duration_sec: 30 }]
  return {
    initial: { temperature_c: initial.temperature_c ?? 95, duration_sec: initial.duration_sec ?? 30 },
    cycles: { count: typeof cycles.count === 'number' ? cycles.count : 1, steps },
  }
}

/** Fallback when a declared key has no current value. */
function defaultValue(def: { key: string; valueType?: string; enum?: string[] }, settings: Record<string, unknown>): string {
  const v = settings[def.key]
  if (v !== undefined && v !== null) return String(v)
  if (def.enum && def.enum.length > 0) return String(def.enum[0])
  return ''
}

/** Render the right control for a settingsDefinition valueType. */
function renderSettingControl(
  def: { key: string; valueType?: string; enum?: string[] },
  value: string,
  onChange: (key: string, value: string) => void,
) {
  const testId = `equipment-setting-input-${def.key}`
  if (def.valueType === 'boolean') {
    return (
      <input
        type="checkbox"
        data-testid={testId}
        checked={value === 'true'}
        onChange={(e) => onChange(def.key, String(e.target.checked))}
      />
    )
  }
  if (def.valueType === 'enum' && def.enum) {
    return (
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(def.key, e.target.value)}
      >
        {def.enum.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }
  return (
    <input
      type={def.valueType === 'number' || def.valueType === 'duration_sec' ? 'number' : 'text'}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(def.key, e.target.value)}
    />
  )
}

/**
 * CyclingProgramEditor — edits a multi-step thermal cycling program:
 * an initial hold (`temperature_c` × `duration_sec`), a positive cycle count,
 * and a repeatable list of per-cycle steps (each `temperature_c` ×
 * `duration_sec`). Mutations are reported up via `onProfile`, which the parent
 * stores in the profile draft. Uses seconds for durations to match the schema.
 */
interface ProfileEditorProps {
  defKey: string
  profile: CyclingProfile
  onProfile: (p: CyclingProfile) => void
}

export function ProfileEditor({ defKey, profile, onProfile }: ProfileEditorProps) {
  const clone = () => ({
    initial: { ...profile.initial },
    cycles: { count: profile.cycles.count, steps: profile.cycles.steps.map((s) => ({ ...s })) },
  })

  const setInitial = (field: 'temperature_c' | 'duration_sec', value: number) => {
    onProfile({ ...clone(), initial: { ...profile.initial, [field]: value } })
  }
  const setCount = (count: number) => {
    onProfile({ ...clone(), cycles: { ...profile.cycles, count } })
  }
  const setStep = (idx: number, field: 'temperature_c' | 'duration_sec', value: number) => {
    const steps = profile.cycles.steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    onProfile({ ...clone(), cycles: { ...profile.cycles, steps } })
  }
  const addStep = () => {
    const steps = [...profile.cycles.steps, { temperature_c: 60, duration_sec: 30 }]
    onProfile({ ...clone(), cycles: { ...profile.cycles, steps } })
  }
  const removeStep = (idx: number) => {
    const steps = profile.cycles.steps.filter((_, i) => i !== idx)
    onProfile({ ...clone(), cycles: { ...profile.cycles, steps } })
  }

  const num = (testId: string) =>
    `equipment-profile-${defKey}-${testId}`

  return (
    <div className="focus__profile-editor" data-testid={`equipment-profile-editor-${defKey}`}>
      <div className="focus__profile-row">
        <span className="focus__profile-label">Initial hold</span>
        <input type="number" data-testid={num('initial-temperature_c')} value={profile.initial.temperature_c}
          onChange={(e) => setInitial('temperature_c', Number(e.target.value))} /> °C
        <input type="number" data-testid={num('initial-duration_sec')} value={profile.initial.duration_sec}
          onChange={(e) => setInitial('duration_sec', Number(e.target.value))} /> s
      </div>
      <div className="focus__profile-row">
        <span className="focus__profile-label">Cycles</span>
        <input type="number" data-testid={num('cycle-count')} value={profile.cycles.count}
          onChange={(e) => setCount(Number(e.target.value))} />
      </div>
      <div className="focus__profile-steps">
        {profile.cycles.steps.map((step, i) => (
          <div key={i} className="focus__profile-step-row" data-testid={`${num('step')}-${i}`}>
            <input type="number" data-testid={num(`step-${i}-temperature_c`)} value={step.temperature_c}
              onChange={(e) => setStep(i, 'temperature_c', Number(e.target.value))} /> °C
            <input type="number" data-testid={num(`step-${i}-duration_sec`)} value={step.duration_sec}
              onChange={(e) => setStep(i, 'duration_sec', Number(e.target.value))} /> s
            <button type="button" className="focus__btn--ghost" onClick={() => removeStep(i)}>−</button>
          </div>
        ))}
        <button type="button" className="focus__btn--ghost" data-testid={num('add-step')} onClick={addStep}>＋ step</button>
      </div>
    </div>
  )
}

export function EquipmentFocus({ equipment, locationLabel, onClose, onUpdateSettings }: EquipmentFocusProps) {
  const [capabilities, setCapabilities] = useState<CapabilityView[]>([])
  useEffect(() => {
    let cancelled = false
    void fetchEquipmentCapabilities(equipment).then((rows) => {
      if (!cancelled) setCapabilities(rows)
    })
    return () => {
      cancelled = true
    }
  }, [equipment])
  const [cls, setCls] = useState<EquipmentClassRecord | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetchEquipmentClass(equipment).then((c) => {
      if (!cancelled) setCls(c)
    })
    return () => {
      cancelled = true
    }
  }, [equipment])

  const settings = equipment.settings ?? {}
  const capabilityViews = capabilities
  const chip = settingsChipText(equipment)

  // Editable draft: a working copy of the settings for the class-defined keys.
  // Scalar values (number/enum/boolean/string) are edited as strings; `profile`
  // values are edited as structured CyclingProfile drafts.
  const [draft, setDraft] = useState<Record<string, string>>(
    () => initialDraft(cls?.settingsDefinition ?? [], settings),
  )
  const [profileDrafts, setProfileDrafts] = useState<Record<string, CyclingProfile>>(
    () => initialProfileDrafts(cls?.settingsDefinition ?? [], settings),
  )
  const [savedFlash, setSavedFlash] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  // Memoize the class settings definitions so the effect below does not
  // re-fire on every render (a fresh array each render would loop forever).
  const defs = useMemo(() => cls?.settingsDefinition ?? [], [cls])

  // Reset the drafts when the equipment or its class definition changes.
  useEffect(() => setDraft(initialDraft(defs, equipment.settings ?? {})),
    [equipment, defs])
  useEffect(() => setProfileDrafts(initialProfileDrafts(defs, equipment.settings ?? {})),
    [equipment, defs])

  const setSetting = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSavedFlash(false)
  }

  const setProfile = (key: string, profile: CyclingProfile) => {
    setProfileDrafts((prev) => ({ ...prev, [key]: profile }))
    setSavedFlash(false)
  }

  const handleSave = () => {
    if (!onUpdateSettings) return
    const compiled: Record<string, unknown> = { ...settings }
    for (const def of defs) {
      if (def.valueType === 'profile') {
        compiled[def.key] = profileDrafts[def.key] ?? asCyclingProfile(settings[def.key])
        continue
      }
      const raw = draft[def.key] ?? ''
      if (def.valueType === 'number' || def.valueType === 'duration_sec') {
        // Empty draft → leave the existing value (or omit when none yet). Only
        // validate a genuinely typed (non-empty) input.
        if (raw.trim() === '') continue
        const n = Number(raw)
        if (Number.isNaN(n)) {
          setDraftError(`“${def.label}” must be a number.`)
          return
        }
        compiled[def.key] = n
      } else if (def.valueType === 'boolean') {
        compiled[def.key] = raw === 'true'
      } else {
        compiled[def.key] = raw
      }
    }
    setDraftError(null)
    onUpdateSettings(equipment.equipmentId, compiled)
    setSavedFlash(true)
  }

  return (
    <div className="focus focus--instrument" data-testid="focus-equipment">
      <div className="focus__canvas" onClick={(e) => e.stopPropagation()}>
        <header className="focus__header">
          <span className="focus__icon" aria-hidden>⚙️</span>
          <div className="focus__title-block">
            <div className="focus__name">{equipment.name}</div>
            <div className="focus__meta">
              {INSTRUMENT_KIND_LABELS[equipment.instrumentKind]} · {locationLabel} · equipment
            </div>
          </div>
          <button
            type="button"
            className="focus__btn"
            onClick={() => onClose()}
            title="Close (Esc)"
          >Close</button>
        </header>
        <div className="focus__body focus__body--instrument">
          <div className="focus__instrument-hero" aria-hidden>
            <InstrumentGlyph kind={equipment.instrumentKind} color="#ff922b" />
          </div>
          <div className="focus__equipment-kind" data-testid="focus-equipment-kind">
            {INSTRUMENT_KIND_LABELS[equipment.instrumentKind]}
          </div>
          {equipment.recordId ? (
            <div className="focus__instrument-id" data-testid="focus-equipment-record">
              Equipment record: {equipment.recordId}
            </div>
          ) : null}
          {equipment.equipmentClassRef ? (
            <div className="focus__instrument-id">
              Class: {eqClassLabel(cls, equipment)}
            </div>
          ) : null}

          <div className="focus__equipment-section" data-testid="focus-equipment-settings">
            <h4 className="focus__equipment-section-title">Settings</h4>
            {defs.length === 0 ? (
              <div className="focus__equipment-empty">No settings configured for this {INSTRUMENT_KIND_LABELS[equipment.instrumentKind].toLowerCase()}.</div>
            ) : (
              <div className="focus__equipment-settings-list">
                {defs.map((def) => (
                  <div key={def.key} className="focus__equipment-setting">
                    <span className="focus__equipment-setting-label">{def.label}</span>
                    {def.valueType === 'profile' ? (
                      <ProfileEditor
                        defKey={def.key}
                        profile={profileDrafts[def.key] ?? asCyclingProfile(settings[def.key]) ?? defaultProfile(def.profileDefinition)}
                        onProfile={(p) => setProfile(def.key, p)}
                      />
                    ) : renderSettingControl(def, draft[def.key] ?? defaultValue(def, settings), setSetting)}
                    {def.unit ? (
                      <span className="focus__equipment-setting-unit">{def.unit}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {chip ? (
              <div className="focus__equipment-chip" data-testid="focus-equipment-chip">{chip}</div>
            ) : null}
            {draftError ? (
              <div className="focus__equipment-error" role="alert">{draftError}</div>
            ) : null}
            {onUpdateSettings ? (
              <button
                type="button"
                className="focus__btn"
                data-testid="equipment-settings-save"
                onClick={handleSave}
              >{savedFlash ? 'Saved' : 'Save settings'}</button>
            ) : null}
          </div>

          <div className="focus__equipment-section" data-testid="focus-equipment-accepts">
            <h4 className="focus__equipment-section-title">What it takes</h4>
            {capabilityViews.length === 0 ? (
              <div className="focus__equipment-empty">
                Not recorded — no capability data for this equipment yet. What it can
                take is declared in its equipment-capability record (seat + physical
                class), so nothing here is assumed.
              </div>
            ) : (
              <ul className="focus__equipment-accepts-list">
                {capabilityViews.map((view) => (
                  <li key={view.verbLabel}>
                    <strong>{view.verbLabel}</strong> — {view.description}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {cls?.notes ? (
            <div className="focus__instrument-notes">{cls.notes}</div>
          ) : null}
          <div className="focus__instrument-hint">
            {INSTRUMENT_KIND_LABELS[equipment.instrumentKind]} is bench equipment, not well-addressable
            labware — there are no wells to inspect. Its capability (settings + accepted labware)
            is declared data on the linked equipment-class record.
          </div>
        </div>
      </div>
    </div>
  )
}

function eqClassLabel(cls: EquipmentClassRecord | null, equipment: Equipment): string {
  const name = cls?.name
  if (name) return `${name} (${equipment.equipmentClassRef?.id})`
  return equipment.equipmentClassRef?.id ?? 'unknown'
}