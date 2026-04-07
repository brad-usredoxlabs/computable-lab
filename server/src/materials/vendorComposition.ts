import { parseConcentration, type Concentration } from './concentration.js';

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function declaredCompositionEntries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

export function extractPrimaryDeclaredConcentration(value: unknown): Concentration | undefined {
  const entries = declaredCompositionEntries(value);
  for (const preferredRole of ['solute', 'activity_source', 'cells', 'other']) {
    for (const entry of entries) {
      const role = typeof entry.role === 'string' ? entry.role.trim() : '';
      if (role && role !== preferredRole) continue;
      const concentration = parseConcentration(entry.concentration);
      if (concentration) return concentration;
    }
  }
  for (const entry of entries) {
    const concentration = parseConcentration(entry.concentration);
    if (concentration) return concentration;
  }
  return undefined;
}
