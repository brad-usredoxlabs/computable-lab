/**
 * ROLE-AXES-1 LEG 2 — app-side mirror of the participation/legacy-role
 * convention interpreter (server twin: server/src/materials/participationConvention.ts).
 *
 * The SAME config data home (config/drafting/composition-participation-convention.yaml)
 * drives the mirrored arithmetic in app/src/editor/lib/formulationMath.ts and the
 * app mirrors here. Zero role/vocab string literals in the arithmetic files: the
 * role names live in the YAML.
 *
 * The browser bundle embeds the YAML text at build time (vite ?raw import); the
 * PARSE runs PER call (never process-cached), mirroring the server discipline.
 * A malformed embedded text THROWS naming the path. The off-state (convention
 * undefined — e.g. a caller passing no convention) runs the arithmetic on the
 * facts the record declares, with the documented channel fallbacks.
 */
import conventionRaw from '../../../../config/drafting/composition-participation-convention.yaml?raw'
import { parse as parseYaml } from 'yaml'

export const INGREDIENT_MEASURE_MODES = ['target_concentration', 'fixed_amount', 'qs_to_final'] as const
export type IngredientMeasureMode = typeof INGREDIENT_MEASURE_MODES[number]

export const INGREDIENT_SOURCE_STATES = ['solid', 'liquid', 'stock_solution', 'formulation', 'cells', 'other'] as const
export type IngredientSourceState = typeof INGREDIENT_SOURCE_STATES[number]

export type ConventionArm = {
  defaultMeasureMode: IngredientMeasureMode | null
  defaultSourceState: IngredientSourceState | null
  /** null = "no decision from this arm" (the participation arms' deferral —
   *  arithmetic never reads through a declared arm silently). Legacy role arms
   *  declare a concrete boolean. */
  volumeFractionFromResolvedAmount: boolean | null
}

export type ConventionRoleArm = ConventionArm & {
  emittedRole: string
}

export interface ParticipationConvention {
  participationArms: Record<string, ConventionArm>
  legacyRoleMapping: Record<string, ConventionRoleArm>
  defaultArm: ConventionRoleArm
  /** A declared source state can override the arm's default measure mode
   *  (declared facts beat the role label). Keyed on source states, not roles. */
  sourceStateMeasureModeOverrides: Record<string, IngredientMeasureMode>
  fallbackCompositionRole: string
  volumeFractionMeasureModes: ReadonlySet<string>
  volumeFractionExcludedMeasureModes: ReadonlySet<string>
  countAmountUnit: string
  primaryConcentrationRoleOrder: readonly string[]
  promptEmission: { primaryRoleType: string; carrierRoleType: string; carrierSnapshotRole: string }
  recipeNameCarrierRoleTypes: readonly string[]
}

export const PARTICIPATION_CONVENTION_PATH = 'config/drafting/composition-participation-convention.yaml'

function requireSection(raw: Record<string, unknown>, key: string, path: string): Record<string, unknown> {
  const value = raw[key]
  if (value === undefined || value === null) {
    throw new Error(`composition-participation convention (${path}): missing required \`${key}:\` section`)
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`composition-participation convention (${path}): \`${key}\` must be an object`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string, path: string): string {
  if (typeof value !== 'string' || !value.length) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be a non-empty string`)
  }
  return value
}

function requireStringList(value: unknown, label: string, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be a non-empty list of strings`)
  }
  return value as string[]
}

function requireBoolean(value: unknown, label: string, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be a boolean`)
  }
  return value
}

function requireNullableBoolean(value: unknown, label: string, path: string): boolean | null {
  if (value === null) return null
  return requireBoolean(value, label, path)
}

function requireNullableMeasureMode(value: unknown, label: string, path: string): IngredientMeasureMode | null {
  if (value === null) return null
  const mode = requireString(value, label, path)
  if (!(INGREDIENT_MEASURE_MODES as readonly string[]).includes(mode)) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be null or a declared ingredient measure mode`)
  }
  return mode as IngredientMeasureMode
}

function requireNullableSourceState(value: unknown, label: string, path: string): IngredientSourceState | null {
  if (value === null) return null
  const state = requireString(value, label, path)
  if (!(INGREDIENT_SOURCE_STATES as readonly string[]).includes(state)) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be null or a declared ingredient source state`)
  }
  return state as IngredientSourceState
}

function parseArm(raw: Record<string, unknown>, label: string, path: string, withEmittedRole: boolean): ConventionArm | ConventionRoleArm {
  const arm: ConventionArm | ConventionRoleArm = {
    defaultMeasureMode: requireNullableMeasureMode(raw.defaultMeasureMode, `${label}.defaultMeasureMode`, path),
    defaultSourceState: requireNullableSourceState(raw.defaultSourceState, `${label}.defaultSourceState`, path),
    // Participation arms may declare `null` (defer to the legacy-role mapping);
    // legacy role arms must declare a concrete boolean.
    volumeFractionFromResolvedAmount: withEmittedRole
      ? requireBoolean(raw.volumeFractionFromResolvedAmount, `${label}.volumeFractionFromResolvedAmount`, path)
      : requireNullableBoolean(raw.volumeFractionFromResolvedAmount, `${label}.volumeFractionFromResolvedAmount`, path),
  }
  if (withEmittedRole) {
    (arm as ConventionRoleArm).emittedRole = requireString(raw.emittedRole, `${label}.emittedRole`, path)
  }
  return arm
}

function parseArmMap(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  withEmittedRole: boolean,
  optional: boolean,
): Record<string, ConventionArm | ConventionRoleArm> {
  if (optional && (raw[key] === undefined || raw[key] === null)) return {}
  const section = requireSection(raw, key, path)
  const entries = Object.entries(section)
  if (entries.length === 0) {
    throw new Error(`composition-participation convention (${path}): \`${key}\` must declare at least one arm`)
  }
  const arms: Record<string, ConventionArm | ConventionRoleArm> = {}
  for (const [armKey, armRaw] of entries) {
    if (!armKey.length || armRaw === null || typeof armRaw !== 'object' || Array.isArray(armRaw)) {
      throw new Error(`composition-participation convention (${path}): \`${key}.${armKey}\` must be an object`)
    }
    arms[armKey] = parseArm(armRaw as Record<string, unknown>, `${key}.${armKey}`, path, withEmittedRole)
  }
  return arms
}

/**
 * Parse the embedded convention text PER call (never process-cached). An empty
 * embedded text turns the convention layer OFF — LOUD (one console.warn naming
 * the path). A malformed one THROWS naming the path.
 */
export function loadParticipationConvention(rawText: string = conventionRaw): ParticipationConvention | undefined {
  const displayPath = PARTICIPATION_CONVENTION_PATH
  if (!rawText.trim()) {
    warnConventionOff(displayPath, `convention data home (${displayPath}) is empty`)
    return undefined
  }
  let raw: unknown
  try {
    raw = parseYaml(rawText)
  } catch (error) {
    throw new Error(`composition-participation convention unreadable (${displayPath}): ${error instanceof Error ? error.message : String(error)}`)
  }
  if (raw === undefined || raw === null) {
    warnConventionOff(displayPath, `convention data home (${displayPath}) is empty`)
    return undefined
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`composition-participation convention (${displayPath}): must be an object`)
  }
  const doc = raw as Record<string, unknown>

  const participationArms = parseArmMap(doc, 'participationArms', displayPath, false, true) as Record<string, ConventionArm>
  const legacyRoleMapping = parseArmMap(doc, 'legacyRoleMapping', displayPath, true, false) as Record<string, ConventionRoleArm>
  const defaultArm = parseArm(requireSection(doc, 'defaultArm', displayPath), 'defaultArm', displayPath, true) as ConventionRoleArm

  const overridesRaw = doc.sourceStateMeasureModeOverrides
  const sourceStateMeasureModeOverrides: Record<string, IngredientMeasureMode> = {}
  if (overridesRaw !== undefined && overridesRaw !== null) {
    if (typeof overridesRaw !== 'object' || Array.isArray(overridesRaw)) {
      throw new Error(`composition-participation convention (${displayPath}): \`sourceStateMeasureModeOverrides\` must be an object`)
    }
    for (const [state, mode] of Object.entries(overridesRaw as Record<string, unknown>)) {
      sourceStateMeasureModeOverrides[state] = requireNullableMeasureMode(mode, `sourceStateMeasureModeOverrides.${state}`, displayPath) ?? 'target_concentration'
    }
  }

  return {
    participationArms,
    legacyRoleMapping,
    defaultArm,
    sourceStateMeasureModeOverrides,
    fallbackCompositionRole: requireString(doc.fallbackCompositionRole, 'fallbackCompositionRole', displayPath),
    volumeFractionMeasureModes: new Set(requireStringList(doc.volumeFractionMeasureModes, 'volumeFractionMeasureModes', displayPath)),
    volumeFractionExcludedMeasureModes: new Set(requireStringList(doc.volumeFractionExcludedMeasureModes, 'volumeFractionExcludedMeasureModes', displayPath)),
    countAmountUnit: requireString(doc.countAmountUnit, 'countAmountUnit', displayPath),
    primaryConcentrationRoleOrder: requireStringList(doc.primaryConcentrationRoleOrder, 'primaryConcentrationRoleOrder', displayPath),
    promptEmission: (() => {
      const emission = requireSection(doc, 'promptEmission', displayPath)
      return {
        primaryRoleType: requireString(emission.primaryRoleType, 'promptEmission.primaryRoleType', displayPath),
        carrierRoleType: requireString(emission.carrierRoleType, 'promptEmission.carrierRoleType', displayPath),
        carrierSnapshotRole: requireString(emission.carrierSnapshotRole, 'promptEmission.carrierSnapshotRole', displayPath),
      }
    })(),
    recipeNameCarrierRoleTypes: requireStringList(doc.recipeNameCarrierRoleTypes, 'recipeNameCarrierRoleTypes', displayPath),
  }
}

const conventionOffWarned = new Set<string>()

function warnConventionOff(path: string, reason: string): void {
  const key = `${path}\u0000${reason}`
  if (conventionOffWarned.has(key)) return
  conventionOffWarned.add(key)
  console.warn(`[composition-participation-convention-off] ${reason} — the participation/legacy-role convention is OFF; arithmetic runs on the facts the record declares. Convention data home: ${path}`)
}

// ---------------------------------------------------------------------------
// Generic decision helpers (server twin semantics — see
// server/src/materials/participationConvention.ts for the full contract).
// ---------------------------------------------------------------------------

export function emittedRoleFor(conv: ParticipationConvention | undefined, roleType: string | undefined): string {
  const declared = roleType?.trim() ?? ''
  if (!conv) return declared || 'other'
  const arm = conv.legacyRoleMapping[declared]
  return arm ? arm.emittedRole : conv.defaultArm.emittedRole
}

export function defaultMeasureModeFor(
  conv: ParticipationConvention | undefined,
  roleType: string | undefined,
  participation?: string,
  sourceState?: string,
): IngredientMeasureMode | undefined {
  if (!conv) return undefined
  if (participation) {
    const arm = conv.participationArms[participation]
    if (arm && arm.defaultMeasureMode !== null) return arm.defaultMeasureMode
  }
  const arm = conv.legacyRoleMapping[roleType?.trim() ?? '']
  const effectiveState = sourceState ?? arm?.defaultSourceState ?? conv.defaultArm.defaultSourceState
  if (effectiveState !== null) {
    const override = conv.sourceStateMeasureModeOverrides[effectiveState]
    if (override !== undefined) return override
  }
  return (arm ?? conv.defaultArm).defaultMeasureMode ?? undefined
}

export function defaultSourceStateFor(
  conv: ParticipationConvention | undefined,
  roleType: string | undefined,
  participation?: string,
): IngredientSourceState | undefined {
  if (!conv) return undefined
  if (participation) {
    const arm = conv.participationArms[participation]
    if (arm && arm.defaultSourceState !== null) return arm.defaultSourceState
  }
  const arm = conv.legacyRoleMapping[roleType?.trim() ?? '']
  return (arm ?? conv.defaultArm).defaultSourceState ?? undefined
}

export function maySynthesizeVolumeFraction(
  conv: ParticipationConvention | undefined,
  facts: { measureMode: string | undefined; role: string; participation?: string },
): boolean {
  const mode = facts.measureMode
  if (conv) {
    if (mode !== undefined && conv.volumeFractionExcludedMeasureModes.has(mode)) return false
    if (mode !== undefined && conv.volumeFractionMeasureModes.has(mode)) return true
    if (facts.participation) {
      const arm = conv.participationArms[facts.participation]
      // A null-defaulted participation arm (the honest gap arm) DEFERS to the
      // legacy-role mapping — arithmetic never reads through it silently.
      if (arm && arm.volumeFractionFromResolvedAmount !== null) return arm.volumeFractionFromResolvedAmount
    }
    const arm = conv.legacyRoleMapping[facts.role]
    return (arm ?? conv.defaultArm).volumeFractionFromResolvedAmount ?? false
  }
  return mode === 'qs_to_final'
}

export function countAmountUnitFor(conv: ParticipationConvention | undefined, countConcentrationUnit: string): string {
  if (conv) return conv.countAmountUnit
  const derived = countConcentrationUnit.split('/')[0]?.trim()
  return derived || 'other'
}

export function fallbackCompositionRoleFor(conv: ParticipationConvention | undefined): string {
  return conv?.fallbackCompositionRole ?? 'other'
}

export function primaryConcentrationRoleOrderFor(conv: ParticipationConvention | undefined): readonly string[] {
  return conv ? conv.primaryConcentrationRoleOrder : []
}
