type ConcentrationBasis =
  | 'molar'
  | 'mass_per_volume'
  | 'activity_per_volume'
  | 'count_per_volume'
  | 'volume_fraction'
  | 'mass_fraction';

export type Concentration = {
  value: number;
  unit: string;
  basis?: ConcentrationBasis;
};

const UNIT_TO_BASIS: Record<string, ConcentrationBasis> = {
  M: 'molar',
  mM: 'molar',
  uM: 'molar',
  nM: 'molar',
  pM: 'molar',
  fM: 'molar',
  'g/L': 'mass_per_volume',
  'mg/mL': 'mass_per_volume',
  'ug/mL': 'mass_per_volume',
  'ng/mL': 'mass_per_volume',
  'U/mL': 'activity_per_volume',
  'U/uL': 'activity_per_volume',
  'cells/mL': 'count_per_volume',
  'cells/uL': 'count_per_volume',
  '% v/v': 'volume_fraction',
  '% w/v': 'mass_fraction',
};

const LEGACY_UNIT_ALIASES: Record<string, string> = {
  'µM': 'uM',
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeConcentrationUnit(unit: string): string {
  const trimmed = unit.trim();
  return LEGACY_UNIT_ALIASES[trimmed] ?? trimmed;
}

export function inferConcentrationBasis(unit: string): ConcentrationBasis | undefined {
  return UNIT_TO_BASIS[normalizeConcentrationUnit(unit)];
}

export function parseConcentration(value: unknown): Concentration | undefined {
  const obj = asObject(value);
  if (!obj) return undefined;
  if (typeof obj.value !== 'number' || !Number.isFinite(obj.value) || obj.value <= 0) return undefined;
  if (typeof obj.unit !== 'string' || obj.unit.trim().length === 0) return undefined;
  const unit = normalizeConcentrationUnit(obj.unit);
  const basis = typeof obj.basis === 'string' ? obj.basis.trim() as ConcentrationBasis : inferConcentrationBasis(unit);
  if (basis && inferConcentrationBasis(unit) && inferConcentrationBasis(unit) !== basis) return undefined;
  return {
    value: obj.value,
    unit,
    ...(basis ? { basis } : {}),
  };
}

export function toStoredConcentration(value: unknown): Record<string, unknown> | undefined {
  const concentration = parseConcentration(value);
  if (!concentration) return undefined;
  return concentration.basis
    ? { value: concentration.value, unit: concentration.unit, basis: concentration.basis }
    : { value: concentration.value, unit: concentration.unit };
}
