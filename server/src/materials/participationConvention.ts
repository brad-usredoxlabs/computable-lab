/**
 * ROLE-AXES-1 LEG 2 — the participation/legacy-role convention interpreter.
 *
 * Every role -> arithmetic decision that formulationMath.ts / formulationCopilot.ts
 * / vendorComposition.ts / aiPlanningTools.ts used to hardcode in TypeScript is
 * DATA in config/drafting/composition-participation-convention.yaml (Brad ruling
 * 2026-10-22: "materials have identities and properties; their roles are
 * contextual, and their purposes are experimental" + the arithmetic-independence
 * consideration). This module interprets the mappings generically — it carries
 * ZERO role/vocab string literals of its own; the role names live in the YAML.
 *
 * Loader discipline (the composition-fraction-convention pattern VERBATIM):
 * loaded PER call, never process-cached. An absent (or empty) file turns the
 * convention layer OFF — LOUD: one console.warn naming the path, never a throw;
 * the arithmetic then runs on the facts the record itself declares (measure
 * mode, source state, amounts, concentrations) with the documented off-state
 * fallbacks below. A present-but-malformed file THROWS naming the path.
 *
 * Leg order (ratified): LEG 2 ships the legacy-role mapping only. The
 * participation-keyed arms section is OPTIONAL — when the config gains it (LEG
 * 2b), a declared participation's arm WINS over the legacy-role mapping and the
 * undeclared arm (null defaults) defers to it. That re-point is a DATA change:
 * zero TS change, and a revert of the participation axis keeps LEG 2 green.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Channel-contract unions (wire/record field values — the `as const`
// registration precedent; these are NOT domain policy). formulationMath.ts
// re-exports them so importers are unchanged.
// ---------------------------------------------------------------------------

export const INGREDIENT_MEASURE_MODES = ['target_concentration', 'fixed_amount', 'qs_to_final'] as const;
export type IngredientMeasureMode = typeof INGREDIENT_MEASURE_MODES[number];

export const INGREDIENT_SOURCE_STATES = ['solid', 'liquid', 'stock_solution', 'formulation', 'cells', 'other'] as const;
export type IngredientSourceState = typeof INGREDIENT_SOURCE_STATES[number];

// ---------------------------------------------------------------------------
// The convention DATA shape (config/drafting/composition-participation-convention.yaml)
// ---------------------------------------------------------------------------

export type ConventionArm = {
  /** null = "no decision from this arm": the reader defers to the legacy role mapping. */
  defaultMeasureMode: IngredientMeasureMode | null;
  defaultSourceState: IngredientSourceState | null;
  /** null = "no decision from this arm" (the participation arms' deferral —
   *  arithmetic never reads through a declared arm silently). Legacy role arms
   *  declare a concrete boolean. */
  volumeFractionFromResolvedAmount: boolean | null;
};

export type ConventionRoleArm = ConventionArm & {
  /** The ledger composition role a free-form roleType emits (the ladder). */
  emittedRole: string;
};

export interface ParticipationConvention {
  /** Participation-keyed arms (LEG 2b). Empty until the config declares them. */
  participationArms: Record<string, ConventionArm>;
  legacyRoleMapping: Record<string, ConventionRoleArm>;
  defaultArm: ConventionRoleArm;
  /** A declared source state can override the arm's default measure mode
   *  (declared facts beat the role label). Keyed on source states, not roles. */
  sourceStateMeasureModeOverrides: Record<string, IngredientMeasureMode>;
  fallbackCompositionRole: string;
  volumeFractionMeasureModes: ReadonlySet<string>;
  volumeFractionExcludedMeasureModes: ReadonlySet<string>;
  countAmountUnit: string;
  primaryConcentrationRoleOrder: readonly string[];
  promptEmission: { primaryRoleType: string; carrierRoleType: string; carrierSnapshotRole: string };
  recipeNameCarrierRoleTypes: readonly string[];
}

export const PARTICIPATION_CONVENTION_PATH = new URL(
  '../../../config/drafting/composition-participation-convention.yaml', import.meta.url,
);

/** fix1/D3 mirror (compositionFractions precedent): one warn per (path, reason)
 *  pair — the per-call load stays, the diagnostic does not spam. */
const conventionOffWarned = new Set<string>();

function warnConventionOff(path: string, reason: string): void {
  const key = `${path}\u0000${reason}`;
  if (conventionOffWarned.has(key)) return;
  conventionOffWarned.add(key);
  console.warn(`[composition-participation-convention-off] ${reason} — the participation/legacy-role convention is OFF; arithmetic runs on the facts the record declares. Convention data home: ${path}`);
}

// ---------------------------------------------------------------------------
// Loader (per call, never process-cached; LOUD off-state, loud malformed)
// ---------------------------------------------------------------------------

function requireSection(raw: Record<string, unknown>, key: string, path: string): Record<string, unknown> {
  const value = raw[key];
  if (value === undefined || value === null) {
    throw new Error(`composition-participation convention (${path}): missing required \`${key}:\` section`);
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`composition-participation convention (${path}): \`${key}\` must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string, path: string): string {
  if (typeof value !== 'string' || !value.length) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be a non-empty string`);
  }
  return value;
}

function requireStringList(value: unknown, label: string, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be a non-empty list of strings`);
  }
  return value as string[];
}

function requireBoolean(value: unknown, label: string, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be a boolean`);
  }
  return value;
}

function requireNullableBoolean(value: unknown, label: string, path: string): boolean | null {
  if (value === null) return null;
  return requireBoolean(value, label, path);
}

function requireNullableMeasureMode(value: unknown, label: string, path: string): IngredientMeasureMode | null {
  if (value === null) return null;
  const mode = requireString(value, label, path);
  if (!(INGREDIENT_MEASURE_MODES as readonly string[]).includes(mode)) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be null or a declared ingredient measure mode`);
  }
  return mode as IngredientMeasureMode;
}

function requireNullableSourceState(value: unknown, label: string, path: string): IngredientSourceState | null {
  if (value === null) return null;
  const state = requireString(value, label, path);
  if (!(INGREDIENT_SOURCE_STATES as readonly string[]).includes(state)) {
    throw new Error(`composition-participation convention (${path}): \`${label}\` must be null or a declared ingredient source state`);
  }
  return state as IngredientSourceState;
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
  };
  if (withEmittedRole) {
    (arm as ConventionRoleArm).emittedRole = requireString(raw.emittedRole, `${label}.emittedRole`, path);
  }
  return arm;
}

function parseArmMap(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  withEmittedRole: boolean,
  optional: boolean,
): Record<string, ConventionArm | ConventionRoleArm> {
  if (optional && (raw[key] === undefined || raw[key] === null)) return {};
  const section = requireSection(raw, key, path);
  const entries = Object.entries(section);
  if (entries.length === 0) {
    throw new Error(`composition-participation convention (${path}): \`${key}\` must declare at least one arm`);
  }
  const arms: Record<string, ConventionArm | ConventionRoleArm> = {};
  for (const [armKey, armRaw] of entries) {
    if (!armKey.length || armRaw === null || typeof armRaw !== 'object' || Array.isArray(armRaw)) {
      throw new Error(`composition-participation convention (${path}): \`${key}.${armKey}\` must be an object`);
    }
    arms[armKey] = parseArm(armRaw as Record<string, unknown>, `${key}.${armKey}`, path, withEmittedRole);
  }
  return arms;
}

export function loadParticipationConvention(path: URL | string = PARTICIPATION_CONVENTION_PATH): ParticipationConvention | undefined {
  const displayPath = String(path);
  if (!existsSync(path)) {
    warnConventionOff(displayPath, `convention data home not found (${displayPath})`);
    return undefined;
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`composition-participation convention unreadable (${displayPath}): ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) {
    warnConventionOff(displayPath, `convention data home (${displayPath}) is empty`);
    return undefined;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`composition-participation convention (${path}): must be an object`);
  }
  const doc = raw as Record<string, unknown>;

  const participationArms = parseArmMap(doc, 'participationArms', displayPath, false, true) as Record<string, ConventionArm>;
  const legacyRoleMapping = parseArmMap(doc, 'legacyRoleMapping', displayPath, true, false) as Record<string, ConventionRoleArm>;
  const defaultArm = parseArm(requireSection(doc, 'defaultArm', displayPath), 'defaultArm', displayPath, true) as ConventionRoleArm;

  const overridesRaw = doc.sourceStateMeasureModeOverrides;
  const sourceStateMeasureModeOverrides: Record<string, IngredientMeasureMode> = {};
  if (overridesRaw !== undefined && overridesRaw !== null) {
    if (typeof overridesRaw !== 'object' || Array.isArray(overridesRaw)) {
      throw new Error(`composition-participation convention (${displayPath}): \`sourceStateMeasureModeOverrides\` must be an object`);
    }
    for (const [state, mode] of Object.entries(overridesRaw as Record<string, unknown>)) {
      sourceStateMeasureModeOverrides[state] = requireNullableMeasureMode(mode, `sourceStateMeasureModeOverrides.${state}`, displayPath) ?? 'target_concentration';
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
      const emission = requireSection(doc, 'promptEmission', displayPath);
      return {
        primaryRoleType: requireString(emission.primaryRoleType, 'promptEmission.primaryRoleType', displayPath),
        carrierRoleType: requireString(emission.carrierRoleType, 'promptEmission.carrierRoleType', displayPath),
        carrierSnapshotRole: requireString(emission.carrierSnapshotRole, 'promptEmission.carrierSnapshotRole', displayPath),
      };
    })(),
    recipeNameCarrierRoleTypes: requireStringList(doc.recipeNameCarrierRoleTypes, 'recipeNameCarrierRoleTypes', displayPath),
  };
}

// ---------------------------------------------------------------------------
// Generic decision helpers. A declared participation's arm (when the config
// declares participation arms) wins; the legacy-role mapping is the loud-off
// fallback; the undeclared participation arm carries null defaults and defers,
// so arithmetic never reads through it silently.
// ---------------------------------------------------------------------------

/** The emitted ledger composition role for a free-form roleType (the ladder). */
export function emittedRoleFor(conv: ParticipationConvention | undefined, roleType: string | undefined): string {
  const declared = roleType?.trim() ?? '';
  if (!conv) return declared || 'other';
  const arm = conv.legacyRoleMapping[declared];
  return arm ? arm.emittedRole : conv.defaultArm.emittedRole;
}

/** The default measure mode an arm supplies (undefined = defer to the caller's
 *  declared facts). A declared participation arm wins; a declared source state
 *  can override the role arm (declared facts beat the role label); the
 *  legacy-role mapping is the loud-off fallback. */
export function defaultMeasureModeFor(
  conv: ParticipationConvention | undefined,
  roleType: string | undefined,
  participation?: string,
  sourceState?: string,
): IngredientMeasureMode | undefined {
  if (!conv) return undefined;
  if (participation) {
    const arm = conv.participationArms[participation];
    if (arm && arm.defaultMeasureMode !== null) return arm.defaultMeasureMode;
  }
  const arm = conv.legacyRoleMapping[roleType?.trim() ?? ''];
  const effectiveState = sourceState ?? arm?.defaultSourceState ?? conv.defaultArm.defaultSourceState;
  if (effectiveState !== null) {
    const override = conv.sourceStateMeasureModeOverrides[effectiveState];
    if (override !== undefined) return override;
  }
  return (arm ?? conv.defaultArm).defaultMeasureMode ?? undefined;
}

export function defaultSourceStateFor(
  conv: ParticipationConvention | undefined,
  roleType: string | undefined,
  participation?: string,
): IngredientSourceState | undefined {
  if (!conv) return undefined;
  if (participation) {
    const arm = conv.participationArms[participation];
    if (arm && arm.defaultSourceState !== null) return arm.defaultSourceState;
  }
  const arm = conv.legacyRoleMapping[roleType?.trim() ?? ''];
  return (arm ?? conv.defaultArm).defaultSourceState ?? undefined;
}

/**
 * May a concentration-less composition entry carry a SYNTHESIZED volume
 * fraction computed from the ingredient's resolved amount? Keyed on the
 * declared measure mode (amounts/units), never on the role label:
 *  - an excluded mode (the explicit fixed-amount mode) never fills the final;
 *  - an included mode (the bring-to-final mode) always does;
 *  - otherwise the arm's own posture decides (participation wins when declared;
 *    the legacy role mapping is the loud-off fallback).
 * Off-state: the channel-contract modes only.
 */
export function maySynthesizeVolumeFraction(
  conv: ParticipationConvention | undefined,
  facts: { measureMode: string | undefined; role: string; participation?: string },
): boolean {
  const mode = facts.measureMode;
  if (conv) {
    if (mode !== undefined && conv.volumeFractionExcludedMeasureModes.has(mode)) return false;
    if (mode !== undefined && conv.volumeFractionMeasureModes.has(mode)) return true;
    if (facts.participation) {
      const arm = conv.participationArms[facts.participation];
      // A null-defaulted participation arm (the honest gap arm) DEFERS to the
      // legacy-role mapping — arithmetic never reads through it silently.
      if (arm && arm.volumeFractionFromResolvedAmount !== null) return arm.volumeFractionFromResolvedAmount;
    }
    const arm = conv.legacyRoleMapping[facts.role];
    return (arm ?? conv.defaultArm).volumeFractionFromResolvedAmount ?? false;
  }
  // Off-state channel fallback: the bring-to-final mode fills the final volume;
  // every other mode is measured by its own declared contribution.
  return mode === 'qs_to_final';
}

/** The display unit for a resolved count amount (config; off-state derives it
 *  from the declared count unit — no literal). */
export function countAmountUnitFor(conv: ParticipationConvention | undefined, countConcentrationUnit: string): string {
  if (conv) return conv.countAmountUnit;
  const derived = countConcentrationUnit.split('/')[0]?.trim();
  return derived || 'other';
}

/**
 * The composition role a solid-target entry falls back to when the inferred
 * base composition carries none. Off-state: the ledger's honest gap role (the
 * never-guess arm — with the convention off there is no mapping to consult).
 */
export function fallbackCompositionRoleFor(conv: ParticipationConvention | undefined): string {
  return conv?.fallbackCompositionRole ?? 'other';
}

/**
 * The preference order for picking the primary declared concentration of a
 * declared composition (the secondary P-read sites: vendorComposition,
 * aiPlanningTools, the app mirror). Off-state: NO preference pass — the reader
 * takes the first concentration-bearing entry it finds (the documented
 * loud-off consequence: the preference simply does not fire).
 */
export function primaryConcentrationRoleOrderFor(conv: ParticipationConvention | undefined): readonly string[] {
  return conv ? conv.primaryConcentrationRoleOrder : [];
}
