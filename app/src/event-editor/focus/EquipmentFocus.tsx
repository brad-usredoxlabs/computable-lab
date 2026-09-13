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
 *   - what labware types it accepts (acceptsLabware — only those may be placed
 *     onto it)
 * Opts out of a well grid entirely; a Close button returns to the bench.
 */

const EQUIPMENT_CLASS_KIND = 'equipment-class'

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
  }>
  acceptsLabware?: string[]
  notes?: string
}

interface EquipmentFocusProps {
  equipment: Equipment
  locationLabel: string
  onClose: () => void
  /** Persist edited settings back to the placed equipment (reducer action). */
  onUpdateSettings?: (equipmentId: string, settings: Record<string, unknown>) => void
}

/** Best-effort load the linked equipment-class record for settings/accepts.
 *  The ref id may be a real record id (EQC-) or a minted CURIE; on a miss we
 *  fall back to a kind-aware class search so the pane is never blank. */
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
    const v = settings[def.key]
    out[def.key] = v === undefined || v === null ? '' : String(v)
  }
  return out
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

export function EquipmentFocus({ equipment, locationLabel, onClose, onUpdateSettings }: EquipmentFocusProps) {
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
  const accepts = cls?.acceptsLabware ?? []
  const chip = settingsChipText(equipment)

  // Editable draft: a working copy of the settings for the class-defined keys.
  // Number values are edited as strings (HTML number inputs), converted on save.
  const [draft, setDraft] = useState<Record<string, string>>(
    () => initialDraft(cls?.settingsDefinition ?? [], settings),
  )
  const [savedFlash, setSavedFlash] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  // Memoize the class settings definitions so the effect below does not
  // re-fire on every render (a fresh array each render would loop forever).
  const defs = useMemo(() => cls?.settingsDefinition ?? [], [cls])

  // Reset the draft when the equipment or its class definition changes.
  useEffect(() => setDraft(initialDraft(defs, equipment.settings ?? {})),
    [equipment, defs])

  const setSetting = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSavedFlash(false)
  }

  const handleSave = () => {
    if (!onUpdateSettings) return
    const compiled: Record<string, unknown> = { ...settings }
    for (const def of defs) {
      const raw = draft[def.key] ?? ''
      if (def.valueType === 'number' || def.valueType === 'duration_sec') {
        const n = Number(raw)
        if (Number.isNaN(n) || raw.trim() === '') {
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
                    {renderSettingControl(def, draft[def.key] ?? defaultValue(def, settings), setSetting)}
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
            <h4 className="focus__equipment-section-title">Accepts labware</h4>
            {accepts.length === 0 ? (
              <div className="focus__equipment-empty">
                This instrument accepts no plate/tube labware placed onto it.
              </div>
            ) : (
              <ul className="focus__equipment-accepts-list">
                {accepts.map((t) => <li key={t}>{t}</li>)}
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