import { parseConcentration, toStoredConcentration, type Concentration } from './concentration.js';

type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

export type CompositionRole =
  | 'solute'
  | 'solvent'
  | 'buffer_component'
  | 'additive'
  | 'activity_source'
  | 'cells'
  | 'other';

export type ConcentrationRange = {
  min?: number;
  max?: number;
  unit: string;
  basis?: Concentration['basis'];
};

export type ParsedCompositionEntry = {
  componentRef: RefShape;
  role: CompositionRole;
  concentration?: Concentration;
  concentrationRange?: ConcentrationRange;
  source?: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function concentrationRangeValue(value: unknown): ConcentrationRange | undefined {
  const obj = asObject(value);
  if (!obj) return undefined;
  const unit = stringValue(obj.unit);
  if (!unit) return undefined;
  const min = typeof obj.min === 'number' && Number.isFinite(obj.min) ? obj.min : undefined;
  const max = typeof obj.max === 'number' && Number.isFinite(obj.max) ? obj.max : undefined;
  if (min === undefined && max === undefined) return undefined;
  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    unit,
    ...(stringValue(obj.basis) ? { basis: stringValue(obj.basis)! as Concentration['basis'] } : {}),
  };
}

function toStoredConcentrationRange(value: unknown): Record<string, unknown> | undefined {
  const range = concentrationRangeValue(value);
  if (!range) return undefined;
  return {
    ...(range.min !== undefined ? { min: range.min } : {}),
    ...(range.max !== undefined ? { max: range.max } : {}),
    unit: range.unit,
    ...(range.basis ? { basis: range.basis } : {}),
  };
}

function refValue(value: unknown): RefShape | null {
  const obj = asObject(value);
  if (!obj) return null;
  const kind = obj.kind === 'ontology' ? 'ontology' : obj.kind === 'record' ? 'record' : null;
  const id = stringValue(obj.id);
  if (!kind || !id) return null;
  return {
    kind,
    id,
    ...(stringValue(obj.type) ? { type: stringValue(obj.type)! } : {}),
    ...(stringValue(obj.label) ? { label: stringValue(obj.label)! } : {}),
    ...(stringValue(obj.namespace) ? { namespace: stringValue(obj.namespace)! } : {}),
    ...(stringValue(obj.uri) ? { uri: stringValue(obj.uri)! } : {}),
  };
}

export function parseStoredCompositionEntries(value: unknown): ParsedCompositionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const obj = asObject(entry);
    if (!obj) return [];
    const componentRef = refValue(obj.component_ref);
    const role = stringValue(obj.role) as CompositionRole | undefined;
    if (!componentRef || !role) return [];
    const concentration = parseConcentration(obj.concentration);
    const concentrationRange = concentrationRangeValue(obj.concentration_range);
    return [{
      componentRef,
      role,
      ...(concentration ? { concentration } : {}),
      ...(concentrationRange ? { concentrationRange } : {}),
      ...(stringValue(obj.source) ? { source: stringValue(obj.source)! } : {}),
    }];
  });
}

export function toStoredCompositionEntries(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((entry) => {
    const obj = asObject(entry);
    if (!obj) return [];
    const componentRef = refValue(obj.componentRef) ?? refValue(obj.component_ref);
    const role = stringValue(obj.role) as CompositionRole | undefined;
    if (!componentRef || !role) return [];
    const concentration = toStoredConcentration(obj.concentration);
    const concentrationRange = toStoredConcentrationRange(obj.concentrationRange ?? obj.concentration_range);
    return [{
      component_ref: componentRef,
      role,
      ...(concentration ? { concentration } : {}),
      ...(concentrationRange ? { concentration_range: concentrationRange } : {}),
      ...(stringValue(obj.source) ? { source: stringValue(obj.source)! } : {}),
    }];
  });
  return entries.length > 0 ? entries : undefined;
}

export function deriveSimpleStoredComposition(args: {
  materialRef?: RefShape | null;
  materialLabel?: string;
  concentration?: Concentration;
  solventRef?: RefShape | null;
  solventLabel?: string;
}): Record<string, unknown>[] | undefined {
  const entries: Record<string, unknown>[] = [];
  if (args.materialRef?.id || args.materialLabel) {
    entries.push({
      component_ref: args.materialRef ?? {
        kind: 'record',
        id: args.materialLabel ?? 'material',
        label: args.materialLabel ?? 'material',
      },
      role: 'solute',
      ...(args.concentration ? { concentration: toStoredConcentration(args.concentration) } : {}),
      source: 'derived from output concentration',
    });
  }
  if (args.solventRef?.id || args.solventLabel) {
    entries.push({
      component_ref: args.solventRef ?? {
        kind: 'record',
        id: args.solventLabel ?? 'solvent',
        label: args.solventLabel ?? 'solvent',
      },
      role: 'solvent',
      source: 'declared solvent',
    });
  }
  return entries.length > 0 ? entries : undefined;
}

export function primaryParsedCompositionEntries(...values: unknown[]): ParsedCompositionEntry[] {
  for (const value of values) {
    const entries = parseStoredCompositionEntries(value);
    if (entries.length > 0) return entries;
  }
  return [];
}
